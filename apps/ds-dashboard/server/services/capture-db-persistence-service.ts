import path from 'node:path';
import fs from 'node:fs';

import type { ComponentRepository } from '../db/component-repository.js';
import type { ComponentCatalogEntry } from '../db/component-repository.js';

type CapturePayloadObject = Record<string, unknown>;

type CaptureTargetPayload = {
  slug?: unknown;
  node_id?: unknown;
  doc_path?: unknown;
};

type CaptureRowPayload = {
  slug?: unknown;
  node_id?: unknown;
  doc_path?: unknown;
  local_image_path?: unknown;
  screenshot_url?: unknown;
  variants_count?: unknown;
  captured_at?: unknown;
  image_sha256?: unknown;
  image_bytes?: unknown;
  image_content_type?: unknown;
  image_width?: unknown;
  image_height?: unknown;
  node_width?: unknown;
  node_height?: unknown;
  variants?: unknown;
};

export interface PersistCapturePayloadOptions {
  payload: unknown;
  componentRepo: ComponentRepository;
  systemId: string;
  repoRoot: string;
  nowIso?: () => string;
}

export interface PersistCapturePayloadResult {
  attempted: number;
  upserted: number;
  skipped: number;
}

export interface PersistRegistryEntriesOptions {
  entries: ComponentCatalogEntry[];
  componentRepo: ComponentRepository;
  systemId: string;
}

export interface PersistRegistryEntriesResult {
  attempted: number;
  upserted: number;
}

function asRecord(value: unknown): CapturePayloadObject | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as CapturePayloadObject)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function validateCapturePayloadShape(payloadObj: CapturePayloadObject): void {
  const errors: string[] = [];
  const targetsRaw = payloadObj.targets;
  const capturedRaw = payloadObj.captured;

  if (targetsRaw !== undefined && !Array.isArray(targetsRaw)) {
    errors.push('`targets` must be an array when present.');
  }
  if (capturedRaw !== undefined && !Array.isArray(capturedRaw)) {
    errors.push('`captured` must be an array when present.');
  }

  if (Array.isArray(targetsRaw)) {
    for (let i = 0; i < targetsRaw.length; i += 1) {
      const entry = asRecord(targetsRaw[i]);
      if (!entry) {
        errors.push(`targets[${i}] must be an object.`);
        continue;
      }
      if (entry.slug !== undefined && typeof entry.slug !== 'string') {
        errors.push(`targets[${i}].slug must be a string when present.`);
      }
      if (entry.node_id !== undefined && typeof entry.node_id !== 'string') {
        errors.push(`targets[${i}].node_id must be a string when present.`);
      }
      if (entry.doc_path !== undefined && typeof entry.doc_path !== 'string') {
        errors.push(`targets[${i}].doc_path must be a string when present.`);
      }
    }
  }

  if (Array.isArray(capturedRaw)) {
    for (let i = 0; i < capturedRaw.length; i += 1) {
      const entry = asRecord(capturedRaw[i]);
      if (!entry) {
        errors.push(`captured[${i}] must be an object.`);
        continue;
      }
      if (entry.slug !== undefined && typeof entry.slug !== 'string') {
        errors.push(`captured[${i}].slug must be a string when present.`);
      }
      if (entry.node_id !== undefined && typeof entry.node_id !== 'string') {
        errors.push(`captured[${i}].node_id must be a string when present.`);
      }
      if (entry.doc_path !== undefined && typeof entry.doc_path !== 'string') {
        errors.push(`captured[${i}].doc_path must be a string when present.`);
      }
      if (entry.local_image_path !== undefined && typeof entry.local_image_path !== 'string') {
        errors.push(`captured[${i}].local_image_path must be a string when present.`);
      }
      if (entry.screenshot_url !== undefined && typeof entry.screenshot_url !== 'string') {
        errors.push(`captured[${i}].screenshot_url must be a string when present.`);
      }
      if (entry.captured_at !== undefined && typeof entry.captured_at !== 'string') {
        errors.push(`captured[${i}].captured_at must be a string when present.`);
      }
      if (entry.image_sha256 !== undefined && typeof entry.image_sha256 !== 'string') {
        errors.push(`captured[${i}].image_sha256 must be a string when present.`);
      }
      if (
        entry.variants_count !== undefined &&
        !Number.isFinite(Number(entry.variants_count))
      ) {
        errors.push(`captured[${i}].variants_count must be a finite number when present.`);
      }
      if (entry.image_bytes !== undefined && !Number.isFinite(Number(entry.image_bytes))) {
        errors.push(`captured[${i}].image_bytes must be a finite number when present.`);
      }
      if (entry.image_width !== undefined && !Number.isFinite(Number(entry.image_width))) {
        errors.push(`captured[${i}].image_width must be a finite number when present.`);
      }
      if (entry.image_height !== undefined && !Number.isFinite(Number(entry.image_height))) {
        errors.push(`captured[${i}].image_height must be a finite number when present.`);
      }
      if (entry.node_width !== undefined && !Number.isFinite(Number(entry.node_width))) {
        errors.push(`captured[${i}].node_width must be a finite number when present.`);
      }
      if (entry.node_height !== undefined && !Number.isFinite(Number(entry.node_height))) {
        errors.push(`captured[${i}].node_height must be a finite number when present.`);
      }
      if (entry.variants !== undefined && !Array.isArray(entry.variants)) {
        errors.push(`captured[${i}].variants must be an array when present.`);
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(`Invalid capture payload shape: ${errors.join(' ')}`);
  }
}

function firstNonEmptyString(...values: unknown[]): string {
  for (const value of values) {
    const normalized = String(value || '').trim();
    if (normalized) return normalized;
  }
  return '';
}

function resolveCanonicalPath(rawPath: string): string {
  const resolved = path.resolve(rawPath);
  try {
    return fs.realpathSync(resolved);
  } catch {
    let cursor = resolved;
    const suffix: string[] = [];
    while (true) {
      const parent = path.dirname(cursor);
      if (!parent || parent === cursor) {
        return resolved;
      }
      suffix.unshift(path.basename(cursor));
      cursor = parent;
      if (fs.existsSync(cursor)) {
        try {
          const realExistingRoot = fs.realpathSync(cursor);
          return path.join(realExistingRoot, ...suffix);
        } catch {
          return resolved;
        }
      }
    }
  }
}

function toRepoRelativePath(
  repoRoot: string,
  value: unknown,
  fieldName: string,
): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) {
    throw new Error(
      `[capture-db-persistence] Invalid ${fieldName}: expected a local repo path, received URL "${raw}".`,
    );
  }
  const absolute = path.isAbsolute(raw) ? raw : path.resolve(repoRoot, raw);
  const realRepoRoot = resolveCanonicalPath(repoRoot);
  const realAbsolute = resolveCanonicalPath(absolute);
  const relative = path.relative(realRepoRoot, realAbsolute);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(
      `[capture-db-persistence] Invalid ${fieldName}: path "${raw}" is outside repo root "${repoRoot}".`,
    );
  }
  return relative.split(path.sep).join('/');
}

function toRepoRelativePathOrEmpty(
  repoRoot: string,
  value: unknown,
  fieldName: string,
): string {
  try {
    return toRepoRelativePath(repoRoot, value, fieldName);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(message);
    return '';
  }
}

function toFiniteNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toNonNegativeInteger(
  value: unknown,
  fieldName: string,
  max: number,
): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0 || parsed > max) {
    throw new Error(
      `[capture-db-persistence] Invalid ${fieldName}: expected integer in [0, ${max}], received "${String(
        value,
      )}".`,
    );
  }
  return parsed;
}

function toPositiveInteger(
  value: unknown,
  fieldName: string,
  max: number,
): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0 || parsed > max) {
    throw new Error(
      `[capture-db-persistence] Invalid ${fieldName}: expected integer in [1, ${max}], received "${String(
        value,
      )}".`,
    );
  }
  return parsed;
}

function toIsoString(value: unknown): string | undefined {
  const normalized = String(value || '').trim();
  if (!normalized) return undefined;
  const date = new Date(normalized);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

function toUnixEpochSeconds(isoDate: string | undefined): number | undefined {
  const normalized = String(isoDate || '').trim();
  if (!normalized) return undefined;
  const epochMs = new Date(normalized).getTime();
  if (!Number.isFinite(epochMs)) return undefined;
  return Math.floor(epochMs / 1000);
}

function toVariantRows(value: unknown, repoRoot: string): Array<{
  name: string;
  node_id?: string | null;
  screenshot_url?: string | null;
  image_path?: string | null;
  captured_at?: string | null;
  image_sha256?: string | null;
  image_bytes?: number | null;
  image_content_type?: string | null;
  image_width?: number | null;
  image_height?: number | null;
  node_width?: number | null;
  node_height?: number | null;
}> | undefined {
  if (!Array.isArray(value)) return undefined;
  const isRecord = (entry: Record<string, unknown> | null): entry is Record<string, unknown> =>
    entry !== null;
  const rows = value
    .map((entry) => asRecord(entry))
    .filter(isRecord)
    .map((entry) => {
      const name = firstNonEmptyString(entry.name) || 'Variant';
      const imageBytes = toFiniteNumber(entry.image_bytes);
      const imageWidth = toFiniteNumber(entry.image_width);
      const imageHeight = toFiniteNumber(entry.image_height);
      const nodeWidth = toFiniteNumber(entry.node_width);
      const nodeHeight = toFiniteNumber(entry.node_height);
      return {
        name,
        node_id: firstNonEmptyString(entry.node_id) || null,
        screenshot_url: firstNonEmptyString(entry.screenshot_url) || null,
        image_path: (() => {
          const variantImagePathRaw = firstNonEmptyString(entry.image_path);
          if (!variantImagePathRaw) return null;
          const normalized = toRepoRelativePathOrEmpty(
            repoRoot,
            variantImagePathRaw,
            'captured[].variants[].image_path',
          );
          return normalized || null;
        })(),
        captured_at: toIsoString(entry.captured_at) || null,
        image_sha256: firstNonEmptyString(entry.image_sha256) || null,
        image_bytes:
          imageBytes === undefined
            ? null
            : toNonNegativeInteger(
                imageBytes,
                'captured[].variants[].image_bytes',
                2_147_483_647,
              ) ?? null,
        image_content_type: firstNonEmptyString(entry.image_content_type) || null,
        image_width:
          nodeWidth === undefined
            ? imageWidth === undefined
              ? null
              : toPositiveInteger(
                  imageWidth,
                  'captured[].variants[].image_width',
                  100_000,
                ) ?? null
            : toPositiveInteger(
                nodeWidth,
                'captured[].variants[].node_width',
                100_000,
              ) ?? null,
        image_height:
          nodeHeight === undefined
            ? imageHeight === undefined
              ? null
              : toPositiveInteger(
                  imageHeight,
                  'captured[].variants[].image_height',
                  100_000,
                ) ?? null
            : toPositiveInteger(
                nodeHeight,
                'captured[].variants[].node_height',
                100_000,
              ) ?? null,
      };
    })
    .filter(Boolean) as Array<{
      name: string;
      node_id?: string | null;
      screenshot_url?: string | null;
      image_path?: string | null;
      captured_at?: string | null;
      image_sha256?: string | null;
      image_bytes?: number | null;
      image_content_type?: string | null;
      image_width?: number | null;
      image_height?: number | null;
      node_width?: number | null;
      node_height?: number | null;
    }>;
  return rows.length > 0 ? rows : undefined;
}

function slugToDisplayName(slug: string): string {
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ') || slug;
}

function buildFigmaFileUrl(source: CapturePayloadObject | null): string {
  if (!source) return '';
  const fileKey = String(source.file_key || '').trim();
  if (fileKey) {
    return `https://www.figma.com/design/${encodeURIComponent(fileKey)}`;
  }
  return String(source.figma_url || '').trim();
}

export async function persistCapturePayloadToComponentRepo(
  options: PersistCapturePayloadOptions,
): Promise<PersistCapturePayloadResult> {
  const {
    payload,
    componentRepo,
    systemId,
    repoRoot,
    nowIso = () => new Date().toISOString(),
  } = options;

  const root = path.resolve(repoRoot);
  const payloadObj = asRecord(payload);
  if (!payloadObj) return { attempted: 0, upserted: 0, skipped: 0 };
  validateCapturePayloadShape(payloadObj);

  const targets = asArray(payloadObj.targets).map((entry) => asRecord(entry)).filter(Boolean) as CaptureTargetPayload[];
  const targetBySlug = new Map<string, CaptureTargetPayload>();
  for (const target of targets) {
    const slug = firstNonEmptyString(target.slug);
    if (!slug || targetBySlug.has(slug)) continue;
    targetBySlug.set(slug, target);
  }

  const source = asRecord(payloadObj.source);
  const figmaFileUrl = buildFigmaFileUrl(source);
  const capturedRows = asArray(payloadObj.captured).map((entry) => asRecord(entry)).filter(Boolean) as CaptureRowPayload[];
  const existingRows =
    typeof componentRepo.getAll === 'function'
      ? await componentRepo.getAll(systemId)
      : [];
  const existingBySlug = new Map(
    existingRows.map((entry) => [entry.slug, entry]),
  );

  let attempted = 0;
  let skipped = 0;
  const entriesBySlug = new Map<string, ComponentCatalogEntry>();

  for (const row of capturedRows) {
    const slug = firstNonEmptyString(row.slug);
    if (!slug) {
      skipped += 1;
      console.warn('[capture-db-persistence] Skipping capture row without slug.');
      continue;
    }
    attempted += 1;

    const imagePath = toRepoRelativePathOrEmpty(root, row.local_image_path, 'captured[].local_image_path');
    if (!imagePath) {
      skipped += 1;
      console.warn(
        `[capture-db-persistence] Skipping "${slug}" because captured[].local_image_path is missing or invalid.`,
      );
      continue;
    }

    const target = targetBySlug.get(slug);
    const existing = existingBySlug.get(slug) || null;
    const existingSpec = existing?.specs?.[0];
    const nodeId = firstNonEmptyString(row.node_id, target?.node_id, existing?.figmaComponentSetNodeId);
    const docPathRaw = firstNonEmptyString(
      row.doc_path,
      target?.doc_path,
      existingSpec?.docPath,
    );
    const docPath =
      (docPathRaw
        ? toRepoRelativePathOrEmpty(root, docPathRaw, 'captured[].doc_path')
        : '') || existingSpec?.docPath || '';
    const screenshotUrl = firstNonEmptyString(row.screenshot_url);
    const variantsCountFromPayload = toNonNegativeInteger(
      row.variants_count,
      'captured[].variants_count',
      10_000,
    );
    const imageBytes = toNonNegativeInteger(
      row.image_bytes,
      'captured[].image_bytes',
      2_147_483_647,
    );
    const imageWidth = toPositiveInteger(row.image_width, 'captured[].image_width', 100_000);
    const imageHeight = toPositiveInteger(row.image_height, 'captured[].image_height', 100_000);
    const nodeWidth = toPositiveInteger(row.node_width, 'captured[].node_width', 100_000);
    const nodeHeight = toPositiveInteger(row.node_height, 'captured[].node_height', 100_000);
    const variants = toVariantRows(row.variants, root);
    const capturedAt = toIsoString(row.captured_at) || nowIso();
    const capturedAtEpoch = toUnixEpochSeconds(capturedAt);

    const entry: ComponentCatalogEntry = {
      slug,
      name: existing?.name || slugToDisplayName(slug),
      status: 'draft',
      docType: 'component',
      figma: {
        fileUrl: figmaFileUrl || existing?.figmaFileUrl || '',
        componentSetNodeId: nodeId || existing?.figmaComponentSetNodeId || '',
      },
      visualProofs: [
        {
          imagePath,
          screenshotUrl: screenshotUrl || undefined,
          capturedAt,
          capturedAtEpoch,
          nodeId: nodeId || undefined,
          imageSha256: firstNonEmptyString(row.image_sha256) || undefined,
          imageBytes,
          imageContentType: firstNonEmptyString(row.image_content_type) || undefined,
          imageWidth: nodeWidth ?? imageWidth,
          imageHeight: nodeHeight ?? imageHeight,
          variantsCount: variantsCountFromPayload ?? variants?.length ?? 0,
          variants,
        },
      ],
    };

    if (docPath) {
      entry.specs = [
        {
          docPath,
          docStatus: existingSpec?.docStatus ?? 'draft',
          coverage: existingSpec?.coverage ?? 0,
        },
      ];
    }

    entriesBySlug.set(slug, entry);
  }

  if (entriesBySlug.size === 0) {
    return { attempted, upserted: 0, skipped };
  }

  const upserted = await componentRepo.upsertFromRegistry(
    systemId,
    Array.from(entriesBySlug.values()),
  );
  return { attempted, upserted, skipped };
}

export async function persistRegistryEntriesToComponentRepo(
  options: PersistRegistryEntriesOptions,
): Promise<PersistRegistryEntriesResult> {
  const { entries, componentRepo, systemId } = options;
  if (!Array.isArray(entries)) {
    throw new Error(
      '[capture-db-persistence] Invalid catalog entries payload: expected an array.',
    );
  }
  const normalized = entries;
  const upserted = await componentRepo.upsertFromRegistry(systemId, normalized);
  await componentRepo.markMissingComponents(
    systemId,
    normalized.map((entry) => entry.slug),
  );
  return { attempted: normalized.length, upserted };
}
