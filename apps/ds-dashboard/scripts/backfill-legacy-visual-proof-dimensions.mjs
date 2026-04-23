#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

import postgres from 'postgres';

const DEFAULT_LEGACY_EXPORT_SCALE = 2;

function resolveDashboardDbUrl(env = process.env) {
  const testDbUrl = String(env.TEST_DATABASE_URL || '').trim();
  const dbUrl = String(env.DATABASE_URL || '').trim();
  const preferTestUrl = String(env.NODE_ENV || '').trim() === 'test';
  const defaultLocalTestDbUrl = 'postgres://ds:local@localhost:5432/ds_dashboard';
  if (testDbUrl) return testDbUrl;
  if (dbUrl) return dbUrl;
  if (preferTestUrl) return defaultLocalTestDbUrl;
  if (String(env.NODE_ENV || '').trim() === 'production') {
    throw new Error(
      'DATABASE_URL environment variable is required in production. Set DATABASE_URL or TEST_DATABASE_URL before running the backfill.',
    );
  }
  return defaultLocalTestDbUrl;
}

function toPositiveInteger(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
}

function extractImageDimensions(buffer, extension) {
  const ext = String(extension || '').toLowerCase();

  if (ext === '.png' || ext === 'png') {
    if (buffer.length < 24) return { width: null, height: null };
    const signature = buffer.subarray(0, 8);
    const expected = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    if (!signature.equals(expected)) return { width: null, height: null };
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    if (width > 0 && height > 0) return { width, height };
    return { width: null, height: null };
  }

  if (ext === '.jpg' || ext === '.jpeg' || ext === 'jpg' || ext === 'jpeg') {
    if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
      return { width: null, height: null };
    }

    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }

      const marker = buffer[offset + 1];
      if (marker === 0xd8 || marker === 0xd9) {
        offset += 2;
        continue;
      }

      const segmentLength = buffer.readUInt16BE(offset + 2);
      if (segmentLength < 2) break;

      const isSof =
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf);

      if (isSof && offset + 8 < buffer.length) {
        const height = buffer.readUInt16BE(offset + 5);
        const width = buffer.readUInt16BE(offset + 7);
        if (width > 0 && height > 0) return { width, height };
        break;
      }

      offset += 2 + segmentLength;
    }
  }

  return { width: null, height: null };
}

function resolveImageDimensions(repoRoot, imagePath, legacyExportScale) {
  const raw = String(imagePath || '').trim();
  if (!raw) return { width: null, height: null };

  const absolutePath = path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(repoRoot, raw);
  try {
    const buffer = fs.readFileSync(absolutePath);
    const { width, height } = extractImageDimensions(buffer, path.extname(absolutePath));
    if (!width || !height) return { width: null, height: null };
    const scale = Number(legacyExportScale);
    if (!Number.isFinite(scale) || scale <= 0) return { width: null, height: null };
    return {
      width: toPositiveInteger(width / scale),
      height: toPositiveInteger(height / scale),
    };
  } catch {
    return { width: null, height: null };
  }
}

function parseVariantsJson(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function stringifyVariants(variants) {
  return JSON.stringify(variants);
}

function parseLegacyExportScale(argv) {
  const flagIndex = argv.indexOf('--legacy-scale');
  if (flagIndex >= 0 && flagIndex + 1 < argv.length) {
    const parsed = Number(argv[flagIndex + 1]);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return DEFAULT_LEGACY_EXPORT_SCALE;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const legacyExportScale = parseLegacyExportScale(process.argv);
  const repoRoot = path.resolve(process.cwd(), '..', '..');
  const dbUrl = resolveDashboardDbUrl(process.env);
  const sql = postgres(dbUrl, { max: 5, idle_timeout: 30, connect_timeout: 10 });

  try {
    const rows = await sql`
      SELECT pv.id, c.slug, c.ds_id, pv.image_path, pv.image_width, pv.image_height, pv.variants_json
      FROM component_visual_proofs pv
      JOIN components c ON c.id = pv.component_id
      WHERE pv.image_path IS NOT NULL
        AND (
          pv.image_width IS NULL
          OR pv.image_height IS NULL
          OR pv.variants_json IS NOT NULL
        )
      ORDER BY c.ds_id, c.slug, pv.id
    `;

    let scanned = 0;
    let updated = 0;
    let skipped = 0;
    const sampleUpdates = [];

    for (const row of rows) {
      scanned += 1;
      const next = {};
      let mainChanged = false;
      let variantsChanged = false;

      if (row.image_width == null || row.image_height == null) {
        const dims = resolveImageDimensions(repoRoot, row.image_path, legacyExportScale);
        if (dims.width && dims.height) {
          next.image_width = row.image_width == null ? dims.width : row.image_width;
          next.image_height = row.image_height == null ? dims.height : row.image_height;
          mainChanged = true;
        }
      }

      const variants = parseVariantsJson(row.variants_json);
      if (variants.length > 0) {
        const nextVariants = variants.map((variant) => {
          if (!variant || typeof variant !== 'object') return variant;
          const current = { ...variant };
          if (current.image_width == null || current.image_height == null) {
            const dims = resolveImageDimensions(repoRoot, current.image_path, legacyExportScale);
            if (dims.width && dims.height) {
              if (current.image_width == null) current.image_width = dims.width;
              if (current.image_height == null) current.image_height = dims.height;
              variantsChanged = true;
            }
          }
          return current;
        });
        if (variantsChanged) {
          next.variants_json = stringifyVariants(nextVariants);
        }
      }

      if (!mainChanged && !variantsChanged) {
        skipped += 1;
        continue;
      }

      if (!dryRun) {
        await sql`
          UPDATE component_visual_proofs
          SET
            image_width = COALESCE(${next.image_width ?? null}, image_width),
            image_height = COALESCE(${next.image_height ?? null}, image_height),
            variants_json = COALESCE(${next.variants_json ?? null}, variants_json)
          WHERE id = ${row.id}
        `;
      }

      updated += 1;
      if (sampleUpdates.length < 10) {
        sampleUpdates.push({
          slug: row.slug,
          ds_id: row.ds_id,
          image_path: row.image_path,
          image_width: next.image_width ?? row.image_width ?? null,
          image_height: next.image_height ?? row.image_height ?? null,
        });
      }
    }

    console.log(
      JSON.stringify(
        {
          dryRun,
          repoRoot,
          scanned,
          updated,
          skipped,
          sampleUpdates,
        },
        null,
        2,
      ),
    );
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
