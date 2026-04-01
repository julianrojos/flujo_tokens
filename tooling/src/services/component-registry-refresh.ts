/**
 * Component Registry Refresh (DB-native)
 *
 * Syncs component metadata into SQLite and updates overview.md.
 * No JSON registry artifact is used as storage.
 */

import * as path from 'node:path';
import * as fs from 'node:fs';

import type { ComponentRegistryEntry as DbComponentRegistryEntry } from '../../../apps/ds-dashboard/server/db/component-repository.js';
import { bootstrapDatabase } from '../../../apps/ds-dashboard/server/db/db-service.js';
import { ComponentRepository } from '../../../apps/ds-dashboard/server/db/component-repository.js';
import { PROJECT_ROOT } from '../utils/system-context.js';
import { requireNonEmptyPathOption } from '../utils/path-guards.js';
import { buildComponentRegistry } from './component-registry-build.js';
import { syncComponentOverview } from './component-registry-overview-sync.js';
import { captureFileSnapshot, restoreFileSnapshot } from './file-snapshot.js';
import { persistRegistryEntriesToDb } from './capture-db-persistence.js';
import {
  DEFAULT_COMPONENT_REGISTRY_PATH,
} from './component-registry-constants.js';
import type {
  ComponentOverviewListState,
  ComponentRegistryEntry,
  SyncIndicesResult,
} from '../types/component-registry.js';

function inferSystemId(candidates: string[]): string {
  for (const value of candidates) {
    const normalized = String(value || '').trim();
    if (!normalized) continue;
    const match = normalized.match(/[\\/]design-systems[\\/]([^\\/]+)/i);
    if (match && match[1]) return match[1];
  }
  return 'sys-01';
}

function normalizeDocStatus(
  status: ComponentRegistryEntry['doc']['status'],
): 'draft' | 'ready' | 'needs-review' {
  if (status === 'ready' || status === 'needs-review') return status;
  return 'draft';
}

function normalizeComponentStatus(
  entry: ComponentRegistryEntry,
): DbComponentRegistryEntry['status'] {
  if (entry.ready_for_publish) return 'ready';
  if (entry.doc.status === 'needs-review') return 'needs-review';
  if (entry.pipeline_stage === 'missing-spec') return 'missing';
  return 'draft';
}

function toDbEntries(entries: ComponentRegistryEntry[]): DbComponentRegistryEntry[] {
  return entries.map((entry) => {
    const next: DbComponentRegistryEntry = {
      slug: entry.slug,
      name: entry.display_name,
      status: normalizeComponentStatus(entry),
      docType: 'component',
      figma: {
        fileUrl: entry.figma.file_url || undefined,
        componentSetNodeId: entry.figma.component_set_node_id || undefined,
      },
    };

    if (entry.spec.exists) {
      next.specs = [
        {
          markdownPath: entry.paths.doc,
          docStatus: entry.doc.exists ? normalizeDocStatus(entry.doc.status) : 'draft',
          coverage: entry.doc.exists ? 100 : 0,
        },
      ];
    } else {
      next.specs = [];
    }

    return next;
  });
}

type ComparableRegistryEntry = {
  slug: string;
  name: string;
  status: string;
  docType: string;
  figmaFileUrl: string;
  figmaComponentSetNodeId: string;
  specs: Array<{
    markdownPath: string;
    docStatus: 'draft' | 'ready' | 'needs-review';
    coverage: number;
  }>;
};

/**
 * Normalize spec metadata into a stable comparable representation.
 */
function toComparableSpec(
  spec: {
    markdownPath?: unknown;
    docStatus?: unknown;
    coverage?: unknown;
  },
): ComparableRegistryEntry['specs'][number] {
  return {
    markdownPath: String(spec.markdownPath || '').trim(),
    docStatus: (spec.docStatus === 'ready' || spec.docStatus === 'needs-review'
      ? spec.docStatus
      : 'draft') as 'draft' | 'ready' | 'needs-review',
    coverage: Number.isFinite(Number(spec.coverage)) ? Number(spec.coverage) : 0,
  };
}

/**
 * Normalize registry entry fields into a stable comparable representation.
 */
function toComparableEntry(input: {
  slug: unknown;
  name: unknown;
  status: unknown;
  docType: unknown;
  figmaFileUrl: unknown;
  figmaComponentSetNodeId: unknown;
  specs?: Array<{
    markdownPath?: unknown;
    docStatus?: unknown;
    coverage?: unknown;
  }>;
}): ComparableRegistryEntry {
  return {
    slug: String(input.slug || '').trim(),
    name: String(input.name || '').trim(),
    status: String(input.status || '').trim(),
    docType: String(input.docType || '').trim(),
    figmaFileUrl: String(input.figmaFileUrl || '').trim(),
    figmaComponentSetNodeId: String(input.figmaComponentSetNodeId || '').trim(),
    specs: Array.isArray(input.specs)
      ? input.specs
        .map((spec) => toComparableSpec(spec))
        .sort((a, b) => a.markdownPath.localeCompare(b.markdownPath, 'en', { sensitivity: 'base' }))
      : [],
  };
}

function toComparableTargetEntries(entries: DbComponentRegistryEntry[]): ComparableRegistryEntry[] {
  return entries
    .map((entry) =>
      toComparableEntry({
        slug: entry.slug,
        name: entry.name,
        status: entry.status,
        docType: entry.docType,
        figmaFileUrl: entry.figma?.fileUrl,
        figmaComponentSetNodeId: entry.figma?.componentSetNodeId,
        specs: entry.specs,
      }),
    )
    .sort((a, b) => a.slug.localeCompare(b.slug, 'en', { sensitivity: 'base' }));
}

function toComparableCurrentEntries(dbPath: string, systemId: string): ComparableRegistryEntry[] {
  if (!fs.existsSync(dbPath)) return [];
  const db = bootstrapDatabase({ dbPath });
  try {
    const repo = new ComponentRepository(db);
    return repo
      .getAll(systemId)
      .filter((entry) => entry.status !== 'missing')
      .map((entry) =>
        toComparableEntry({
          slug: entry.slug,
          name: entry.name,
          status: entry.status,
          docType: entry.docType,
          figmaFileUrl: entry.figmaFileUrl,
          figmaComponentSetNodeId: entry.figmaComponentSetNodeId,
          specs: entry.specs,
        }),
      )
      .sort((a, b) => a.slug.localeCompare(b.slug, 'en', { sensitivity: 'base' }));
  } finally {
    db.close();
  }
}

function hasRegistryDrift(options: {
  dbPath: string;
  systemId: string;
  nextEntries: DbComponentRegistryEntry[];
}): boolean {
  const { dbPath, systemId, nextEntries } = options;
  const current = toComparableCurrentEntries(dbPath, systemId);
  const next = toComparableTargetEntries(nextEntries);
  return JSON.stringify(current) !== JSON.stringify(next);
}

function isDesignSystemImported(options: {
  dbPath: string;
  systemId: string;
}): boolean {
  const { dbPath, systemId } = options;
  if (!fs.existsSync(dbPath)) return false;
  const db = bootstrapDatabase({ dbPath });
  try {
    const row = db
      .prepare('SELECT figma_file_id FROM design_systems WHERE id = ?')
      .get(systemId) as { figma_file_id?: string | null } | undefined;
    return String(row?.figma_file_id || '').trim().length > 0;
  } finally {
    db.close();
  }
}

function resolveOverviewListState(options: {
  dbPath: string;
  systemId: string;
  componentCount: number;
}): ComponentOverviewListState {
  const { dbPath, systemId, componentCount } = options;
  if (componentCount > 0) return 'ready';
  return isDesignSystemImported({ dbPath, systemId }) ? 'empty' : 'not-imported';
}

function persistRegistryToDb(options: {
  projectRoot: string;
  systemId: string;
  entries: ComponentRegistryEntry[];
  dryRun: boolean;
  dbPath?: string;
}): { upserted: number; changed: boolean; written: boolean; dbPath: string } {
  const { projectRoot, systemId, entries, dryRun } = options;
  const dbEntries = toDbEntries(entries);
  const dbPath = String(options.dbPath || '').trim()
    ? path.resolve(String(options.dbPath))
    : path.join(
      path.resolve(projectRoot),
      'apps',
      'ds-dashboard',
      'server',
      'db',
      'ds-dashboard.db',
    );
  const changed = hasRegistryDrift({
    dbPath,
    systemId,
    nextEntries: dbEntries,
  });
  if (dryRun) {
    return {
      upserted: dbEntries.length,
      changed,
      written: false,
      dbPath,
    };
  }

  if (!changed) {
    return {
      upserted: 0,
      changed: false,
      written: false,
      dbPath,
    };
  }

  const result = persistRegistryEntriesToDb({
    projectRoot,
    systemId,
    entries: dbEntries,
    dbPath,
  });
  return {
    upserted: result.upserted,
    changed,
    written: changed,
    dbPath,
  };
}

function summarizeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Sync documentation indices atomically (DB registry + overview).
 */
export function syncDocumentationState(
  options: {
    dbPath?: string;
    overviewPath?: string;
    specsDir?: string;
    docsDir?: string;
    proofsDir?: string;
    dryRun?: boolean;
    systemId?: string;
    projectRoot?: string;
  } = {},
): SyncIndicesResult {
  const {
    dbPath = DEFAULT_COMPONENT_REGISTRY_PATH,
    overviewPath,
    specsDir,
    docsDir,
    proofsDir,
    dryRun = false,
    systemId,
    projectRoot = PROJECT_ROOT,
  } = options;
  const resolvedOverviewPath = path.resolve(requireNonEmptyPathOption(overviewPath, 'overviewPath'));
  const resolvedSpecsDir = path.resolve(requireNonEmptyPathOption(specsDir, 'specsDir'));
  const resolvedDocsDir = path.resolve(requireNonEmptyPathOption(docsDir, 'docsDir'));
  const resolvedProofsDir = path.resolve(
    String(proofsDir || path.join(path.dirname(resolvedDocsDir), '_generated', 'visual-proofs')),
  );

  const resolvedSystemId =
    String(systemId || '').trim() ||
    inferSystemId([resolvedDocsDir, resolvedSpecsDir, resolvedProofsDir]);
  const resolvedDbPath = path.resolve(String(dbPath));

  const overviewSnapshot = captureFileSnapshot(resolvedOverviewPath);
  try {
    const registry = buildComponentRegistry({
      specsDir: resolvedSpecsDir,
      docsDir: resolvedDocsDir,
      proofsDir: resolvedProofsDir,
      includeVisualProofFiles: false,
    });
    const overviewListState = resolveOverviewListState({
      dbPath: resolvedDbPath,
      systemId: resolvedSystemId,
      componentCount: registry.components.length,
    });

    const overview = syncComponentOverview({
      overviewPath: resolvedOverviewPath,
      dryRun,
      registry,
      listState: overviewListState,
    });

    const dbSync = persistRegistryToDb({
      projectRoot,
      systemId: resolvedSystemId,
      entries: registry.components,
      dryRun,
      dbPath: resolvedDbPath,
    });

    const registryResult = {
      ok: true,
      dryRun,
      changed: dbSync.changed,
      written: dbSync.written,
      registryDbPath: dbSync.dbPath,
      schemaVersion: registry.schema_version,
      summary: registry.summary,
      fingerprint: registry.fingerprint_sha256,
    };

    return {
      ok: true,
      dryRun,
      atomic: true,
      changed: Boolean(registryResult.changed || overview.changed),
      written: Boolean(registryResult.written || overview.written),
      registry: registryResult,
      overview,
    };
  } catch (error) {
    if (!dryRun) {
      restoreFileSnapshot(resolvedOverviewPath, overviewSnapshot);
    }
    throw new Error(
      'Documentation index refresh failed.\n' +
      `Rollback applied: ${dryRun ? 'no (dry-run)' : 'yes'}.\n` +
      `Reason: ${summarizeError(error)}`,
    );
  }
}
