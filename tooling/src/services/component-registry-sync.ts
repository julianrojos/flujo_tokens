/**
 * Component Registry Sync (DB-native)
 *
 * Computes expected registry from docs/spec/proof sources and compares/syncs
 * against the SQLite-backed component registry state.
 */

import * as path from 'node:path';
import * as fs from 'node:fs';

import { bootstrapDatabase } from '../../../apps/ds-dashboard/server/db/db-service.js';
import { ComponentRepository } from '../../../apps/ds-dashboard/server/db/component-repository.js';
import {
  DEFAULT_COMPONENT_DOCS_DIR,
  DEFAULT_COMPONENT_SPECS_DIR,
  DEFAULT_VISUAL_PROOFS_DIR,
} from './component-registry-constants.js';
import { buildComponentRegistry } from './component-registry-build.js';
import { normalizeSortKey, stableHash } from './component-registry-utils.js';
import { syncDocumentationState } from './component-registry-refresh.js';
import type {
  ComponentRegistry,
  ComponentRegistryEntry,
  ReadRegistryOptions,
  ReadRegistryResult,
  CompareRegistryResult,
  SyncRegistryOptions,
  SyncRegistryResult,
  PipelineStage,
} from '../types/component-registry.js';
import { PROJECT_ROOT } from '../utils/system-context.js';

function inferSystemId(candidates: string[]): string {
  for (const value of candidates) {
    const normalized = String(value || '').trim();
    if (!normalized) continue;
    const match = normalized.match(/[\\/]design-systems[\\/]([^\\/]+)/i);
    if (match && match[1]) return match[1];
  }
  return 'sys-01';
}

function resolveDbPath(dbPath?: string): string {
  const candidate = String(dbPath || '').trim();
  if (candidate && candidate.toLowerCase().endsWith('.db')) {
    return path.resolve(candidate);
  }
  const envPath = String(process.env.DS_DASHBOARD_DB_PATH || '').trim();
  if (envPath) return path.resolve(envPath);
  return path.join(PROJECT_ROOT, 'apps', 'ds-dashboard', 'server', 'db', 'ds-dashboard.db');
}

function toStage(entry: {
  hasSpec: boolean;
  hasDoc: boolean;
  hasVisualProof: boolean;
}): PipelineStage {
  if (!entry.hasSpec) return 'missing-spec';
  if (!entry.hasDoc) return 'spec';
  if (!entry.hasVisualProof) return 'markdown';
  return 'visual-proof';
}

function toDocStatus(value: string | undefined): 'draft' | 'ready' | 'needs-review' {
  if (value === 'ready' || value === 'needs-review') return value;
  return 'draft';
}

function resolveProjectPath(rawPath: string): string {
  const normalized = String(rawPath || '').trim();
  if (!normalized) return '';
  return path.isAbsolute(normalized)
    ? path.resolve(normalized)
    : path.resolve(PROJECT_ROOT, normalized);
}

function fileExists(filePath: string): boolean {
  const normalized = String(filePath || '').trim();
  if (!normalized) return false;
  try {
    return fs.existsSync(normalized);
  } catch {
    return false;
  }
}

function deriveSpecPathFromDocPath(docPath: string, slug: string, systemId: string): string {
  const normalizedDocPath = String(docPath || '').trim();
  if (normalizedDocPath) {
    const unixPath = normalizedDocPath.split(path.sep).join('/');
    const marker = '/docs/components/';
    const markerIndex = unixPath.lastIndexOf(marker);
    if (markerIndex >= 0) {
      const base = unixPath.slice(0, markerIndex);
      return `${base}/docs/_spec/components/${slug}.yml`;
    }
  }
  return `design-systems/${systemId}/docs/_spec/components/${slug}.yml`;
}

function summarize(components: ComponentRegistryEntry[]): ComponentRegistry['summary'] {
  const by_pipeline_stage: Record<PipelineStage, number> = {
    'missing-spec': 0,
    spec: 0,
    markdown: 0,
    'visual-proof': 0,
  };
  for (const component of components) {
    const stage = component.pipeline_stage;
    by_pipeline_stage[stage] = (by_pipeline_stage[stage] || 0) + 1;
  }
  return {
    total_components: components.length,
    with_spec: components.filter((component) => component.spec.exists).length,
    with_doc: components.filter((component) => component.doc.exists).length,
    with_visual_proof: components.filter((component) => component.visual_proof.exists).length,
    ready_for_publish: components.filter((component) => component.ready_for_publish).length,
    by_pipeline_stage,
  };
}

function buildCurrentRegistryFromDb(
  systemId: string,
  dbPath: string,
  options: { specsDir?: string; docsDir?: string } = {},
): ComponentRegistry {
  const { specsDir, docsDir } = options;
  const db = bootstrapDatabase({ dbPath });
  try {
    const repo = new ComponentRepository(db);
    const rows = repo.getAll(systemId);

    const components: ComponentRegistryEntry[] = rows
      .map((row) => {
        const spec = row.specs?.[0];
        const proof = row.visualProofs?.[0];
        const docPath = spec?.markdownPath || (
          docsDir ? path.resolve(docsDir, `${row.slug}.md`) : `design-systems/${systemId}/docs/components/${row.slug}.md`
        );
        const specPath = specsDir
          ? path.resolve(specsDir, `${row.slug}.yml`)
          : deriveSpecPathFromDocPath(docPath, row.slug, systemId);
        const hasSpec = fileExists(resolveProjectPath(specPath));
        const hasDoc = fileExists(resolveProjectPath(docPath));
        const hasVisualProof = Boolean(proof?.imagePath || proof?.screenshotUrl);
        const visualProofPath = proof?.imagePath ? path.resolve(PROJECT_ROOT, proof.imagePath) : '';

        const entry: ComponentRegistryEntry = {
          slug: row.slug,
          display_name: row.name || row.slug,
          paths: {
            spec: specPath,
            doc: docPath,
            visual_proof: proof?.imagePath || '',
          },
          figma: {
            file_url: row.figmaFileUrl || '',
            component_set_node_id: row.figmaComponentSetNodeId || '',
          },
          spec: {
            exists: hasSpec,
            status: hasSpec ? 'draft' : 'missing',
            name: '',
            componentSetNodeId: row.figmaComponentSetNodeId || null,
          },
          doc: {
            exists: hasDoc,
            status: toDocStatus(spec?.docStatus),
            title: '',
            figmaFileUrl: row.figmaFileUrl || null,
            componentSetNodeId: row.figmaComponentSetNodeId || null,
          },
          visual_proof: {
            exists: hasVisualProof,
            screenshot_url: proof?.screenshotUrl || null,
            image_path: visualProofPath || null,
            node_id: proof?.nodeId || null,
            captured_at: proof?.capturedAt || null,
            image_sha256: proof?.imageSha256 || null,
            image_bytes: Number.isFinite(Number(proof?.imageBytes))
              ? Number(proof?.imageBytes)
              : null,
            image_content_type: proof?.imageContentType || null,
            image_width: Number.isFinite(Number(proof?.imageWidth))
              ? Number(proof?.imageWidth)
              : null,
            image_height: Number.isFinite(Number(proof?.imageHeight))
              ? Number(proof?.imageHeight)
              : null,
            variants_count: Number.isFinite(Number(proof?.variantsCount))
              ? Number(proof?.variantsCount)
              : 0,
            variants: Array.isArray(proof?.variants)
              ? proof.variants.map((variant) => ({
                name: String(variant?.name || '').trim() || 'Variant',
                node_id: variant?.node_id ?? null,
                screenshot_url: variant?.screenshot_url ?? null,
                image_path: variant?.image_path ?? null,
                captured_at: variant?.captured_at ?? null,
                image_sha256: variant?.image_sha256 ?? null,
                image_bytes: Number.isFinite(Number(variant?.image_bytes))
                  ? Number(variant?.image_bytes)
                  : null,
                image_content_type: variant?.image_content_type ?? null,
                image_width: Number.isFinite(Number(variant?.image_width))
                  ? Number(variant?.image_width)
                  : null,
                image_height: Number.isFinite(Number(variant?.image_height))
                  ? Number(variant?.image_height)
                  : null,
              }))
              : [],
          },
          pipeline_stage: toStage({ hasSpec, hasDoc, hasVisualProof }),
          ready_for_publish: hasSpec && hasDoc && hasVisualProof,
          fingerprint_sha256: '',
        };
        entry.fingerprint_sha256 = stableHash(entry);
        return entry;
      })
      .sort((a, b) => {
        const bySlug = a.slug.localeCompare(b.slug, 'en', { sensitivity: 'base' });
        if (bySlug !== 0) return bySlug;
        return normalizeSortKey(a.display_name).localeCompare(normalizeSortKey(b.display_name), 'en', { sensitivity: 'base' });
      });

    const registryCore: Omit<ComponentRegistry, 'fingerprint_sha256'> = {
      schema_version: 1,
      components,
      summary: summarize(components),
    };

    return {
      ...registryCore,
      fingerprint_sha256: stableHash(registryCore),
    };
  } finally {
    db.close();
  }
}

/**
 * Read component registry from DB (path argument kept for call compatibility).
 */
export function readComponentRegistry(
  dbPath: string = '',
  options: ReadRegistryOptions & {
    dbPath?: string;
    systemId?: string;
    specsDir?: string;
    docsDir?: string;
  } = {},
): ReadRegistryResult {
  const { allowMissing = false } = options;
  const resolvedDbPath = resolveDbPath(options.dbPath || dbPath);
  const systemId = String(options.systemId || '').trim() || inferSystemId([resolvedDbPath]);
  const registry = buildCurrentRegistryFromDb(systemId, resolvedDbPath, {
    specsDir: options.specsDir,
    docsDir: options.docsDir,
  });
  const exists = registry.summary.total_components > 0;

  if (!exists && !allowMissing) {
    throw new Error(`Component registry is empty in DB for system ${systemId}.`);
  }

  return {
    exists,
    registry: exists ? registry : null,
    validation: { ok: true, errors: [] },
  };
}

/**
 * Build expected component registry from source files.
 */
export function buildExpectedComponentRegistry(
  options: {
    specsDir?: string;
    docsDir?: string;
    proofsDir?: string;
  } = {},
): ComponentRegistry {
  const {
    specsDir = DEFAULT_COMPONENT_SPECS_DIR,
    docsDir = DEFAULT_COMPONENT_DOCS_DIR,
    proofsDir = DEFAULT_VISUAL_PROOFS_DIR,
  } = options;

  return buildComponentRegistry({
    specsDir,
    docsDir,
    proofsDir,
    includeVisualProofFiles: false,
  });
}

/**
 * Compare DB-backed registry with expected state from sources.
 */
export function compareComponentRegistryToSources(
  options: {
    dbPath?: string;
    systemId?: string;
    specsDir?: string;
    docsDir?: string;
    proofsDir?: string;
  } = {},
): CompareRegistryResult {
  const {
    dbPath,
    systemId,
    specsDir = DEFAULT_COMPONENT_SPECS_DIR,
    docsDir = DEFAULT_COMPONENT_DOCS_DIR,
    proofsDir = DEFAULT_VISUAL_PROOFS_DIR,
  } = options;

  const expected = buildExpectedComponentRegistry({ specsDir, docsDir, proofsDir });
  const resolvedDbPath = resolveDbPath(dbPath);
  const resolvedSystemId =
    String(systemId || '').trim() ||
    inferSystemId([specsDir, docsDir, proofsDir, resolvedDbPath]);
  const currentResult = readComponentRegistry(resolvedDbPath, {
    allowMissing: true,
    systemId: resolvedSystemId,
    specsDir,
    docsDir,
  });
  const current = currentResult.registry;

  const normalizeRegistry = (registry: ComponentRegistry | null): string => {
    if (!registry) return '';
    const normalized = {
      schema_version: registry.schema_version,
      components: registry.components
        .map((item) => ({
          slug: item.slug,
          display_name: item.display_name,
          spec: {
            exists: item.spec.exists,
          },
          doc: {
            exists: item.doc.exists,
          },
          figma: {
            file_url: item.figma.file_url || null,
            component_set_node_id: item.figma.component_set_node_id || null,
          },
          visual_proof: {
            exists: item.visual_proof.exists,
            screenshot_url: item.visual_proof.screenshot_url || null,
            image_path: item.visual_proof.image_path || null,
            variants_count: item.visual_proof.variants_count || 0,
          },
          pipeline_stage: item.pipeline_stage,
          ready_for_publish: item.ready_for_publish,
        }))
        .sort((a, b) => a.slug.localeCompare(b.slug, 'en', { sensitivity: 'base' })),
      summary: registry.summary,
    };
    return `${JSON.stringify(normalized, null, 2)}\n`;
  };

  const expectedJson = normalizeRegistry(expected);
  const currentJson = normalizeRegistry(current);

  return {
    exists: currentResult.exists,
    matches: currentResult.exists && currentJson === expectedJson,
    expected,
    current,
    expectedJson,
    currentJson,
  };
}

/**
 * Sync component registry from source files into DB + overview markdown.
 */
export function syncComponentRegistry(
  options: SyncRegistryOptions & {
    dbPath?: string;
    systemId?: string;
    specsDir?: string;
    docsDir?: string;
    proofsDir?: string;
  } = {},
): SyncRegistryResult {
  const {
    dbPath,
    systemId,
    specsDir = DEFAULT_COMPONENT_SPECS_DIR,
    docsDir = DEFAULT_COMPONENT_DOCS_DIR,
    proofsDir = DEFAULT_VISUAL_PROOFS_DIR,
    dryRun = false,
  } = options;

  const resolvedSystemId =
    String(systemId || '').trim() ||
    inferSystemId([specsDir, docsDir, proofsDir]);
  const sync = syncDocumentationState({
    dbPath,
    specsDir,
    docsDir,
    proofsDir,
    dryRun,
    systemId: resolvedSystemId,
  });

  return {
    ok: sync.ok,
    dryRun,
    changed: sync.changed,
    written: sync.written,
    registryDbPath: sync.registry.registryDbPath,
    schemaVersion: sync.registry.schemaVersion,
    summary: sync.registry.summary,
    fingerprint: sync.registry.fingerprint,
  };
}
