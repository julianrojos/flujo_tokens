/**
 * Component Registry Refresh (DB-native)
 *
 * Syncs component metadata into PostgreSQL and updates overview.md.
 * No JSON registry artifact is used as storage.
 */

import * as path from 'node:path';
import * as fs from 'node:fs';

import type { ComponentRegistryEntry as DbComponentRegistryEntry } from '../../../apps/ds-dashboard/server/db/component-repository.js';
import {
  bootstrapDatabase,
  resolveDashboardDbUrl,
} from '../../../apps/ds-dashboard/server/db/pg-db-service.js';
import { ComponentRepository } from '../../../apps/ds-dashboard/server/db/component-repository.js';
import { PROJECT_ROOT } from '../utils/system-context.js';
import { requireNonEmptyPathOption } from '../utils/path-guards.js';
import { buildComponentRegistry } from './component-registry-build.js';
import { syncComponentOverview } from './component-registry-overview-sync.js';
import { captureFileSnapshot, restoreFileSnapshot } from './file-snapshot.js';
import { persistRegistryEntriesToDb } from './capture-db-persistence.js';
import { DEFAULT_COMPONENT_REGISTRY_PATH } from './component-registry-constants.js';
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

function toDbEntries(
  entries: ComponentRegistryEntry[],
): DbComponentRegistryEntry[] {
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
          docStatus: entry.doc.exists
            ? normalizeDocStatus(entry.doc.status)
            : 'draft',
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
function toComparableSpec(spec: {
  markdownPath?: unknown;
  docStatus?: unknown;
  coverage?: unknown;
}): ComparableRegistryEntry['specs'][number] {
  return {
    markdownPath: String(spec.markdownPath || '').trim(),
    docStatus: (spec.docStatus === 'ready' || spec.docStatus === 'needs-review'
      ? spec.docStatus
      : 'draft') as 'draft' | 'ready' | 'needs-review',
    coverage: Number.isFinite(Number(spec.coverage))
      ? Number(spec.coverage)
      : 0,
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
          .sort((a, b) =>
            a.markdownPath.localeCompare(b.markdownPath, 'en', {
              sensitivity: 'base',
            }),
          )
      : [],
  };
}

function toComparableTargetEntries(
  entries: DbComponentRegistryEntry[],
): ComparableRegistryEntry[] {
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
    .sort((a, b) =>
      a.slug.localeCompare(b.slug, 'en', { sensitivity: 'base' }),
    );
}

async function toComparableCurrentEntries(
  databaseUrl: string,
  systemId: string,
): Promise<ComparableRegistryEntry[]> {
  const db = await bootstrapDatabase(databaseUrl);
  try {
    const repo = new ComponentRepository(db);
    return (await repo.getAll(systemId))
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
      .sort((a, b) =>
        a.slug.localeCompare(b.slug, 'en', { sensitivity: 'base' }),
      );
  } finally {
    await db.end();
  }
}

async function hasRegistryDrift(options: {
  databaseUrl: string;
  systemId: string;
  nextEntries: DbComponentRegistryEntry[];
}): Promise<boolean> {
  const { databaseUrl, systemId, nextEntries } = options;
  const current = await toComparableCurrentEntries(databaseUrl, systemId);
  const next = toComparableTargetEntries(nextEntries);
  return JSON.stringify(current) !== JSON.stringify(next);
}

async function isDesignSystemImported(options: {
  databaseUrl: string;
  systemId: string;
}): Promise<boolean> {
  const { databaseUrl, systemId } = options;
  const db = await bootstrapDatabase(databaseUrl);
  try {
    const [row] =
      await db`SELECT figma_file_id FROM design_systems WHERE id = ${systemId}`;
    return String(row?.figma_file_id || '').trim().length > 0;
  } finally {
    await db.end();
  }
}

async function resolveOverviewListState(options: {
  databaseUrl: string;
  systemId: string;
  componentCount: number;
}): Promise<ComponentOverviewListState> {
  const { databaseUrl, systemId, componentCount } = options;
  if (componentCount > 0) return 'ready';
  return (await isDesignSystemImported({ databaseUrl, systemId }))
    ? 'empty'
    : 'not-imported';
}

function resolveDatabaseUrl(input?: string): string {
  const candidate = String(input || '').trim();
  if (candidate && candidate.includes('://')) {
    return candidate;
  }
  return resolveDashboardDbUrl(process.env);
}

async function persistRegistryToDb(options: {
  projectRoot: string;
  systemId: string;
  entries: ComponentRegistryEntry[];
  dryRun: boolean;
  databaseUrl?: string;
}): Promise<{
  upserted: number;
  changed: boolean;
  written: boolean;
  databaseUrl: string;
}> {
  const { projectRoot, systemId, entries, dryRun } = options;
  const dbEntries = toDbEntries(entries);
  const databaseUrl = resolveDatabaseUrl(options.databaseUrl);
  const changed = await hasRegistryDrift({
    databaseUrl,
    systemId,
    nextEntries: dbEntries,
  });
  if (dryRun) {
    return {
      upserted: dbEntries.length,
      changed,
      written: false,
      databaseUrl,
    };
  }

  if (!changed) {
    return {
      upserted: 0,
      changed: false,
      written: false,
      databaseUrl,
    };
  }

  const result = await persistRegistryEntriesToDb({
    projectRoot,
    systemId,
    entries: dbEntries,
    databaseUrl,
  });
  return {
    upserted: result.upserted,
    changed,
    written: changed,
    databaseUrl,
  };
}

function summarizeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Sync documentation indices atomically (DB registry + optional overview).
 *
 * `skipOverview` is useful for DB-only maintenance flows (e.g. `/ops`) where
 * we want registry persistence without generating human-readable overview files.
 */
export async function syncDocumentationState(
  options: {
    databaseUrl?: string;
    overviewPath?: string;
    specsDir?: string;
    docsDir?: string;
    proofsDir?: string;
    dryRun?: boolean;
    skipOverview?: boolean;
    systemId?: string;
    projectRoot?: string;
  } = {},
): Promise<SyncIndicesResult> {
  const {
    databaseUrl = DEFAULT_COMPONENT_REGISTRY_PATH,
    overviewPath,
    specsDir,
    docsDir,
    proofsDir,
    dryRun = false,
    skipOverview = false,
    systemId,
    projectRoot = PROJECT_ROOT,
  } = options;
  const resolvedOverviewPath = path.resolve(
    requireNonEmptyPathOption(overviewPath, 'overviewPath'),
  );
  const resolvedSpecsDir = path.resolve(
    requireNonEmptyPathOption(specsDir, 'specsDir'),
  );
  const resolvedDocsDir = path.resolve(
    requireNonEmptyPathOption(docsDir, 'docsDir'),
  );
  const resolvedProofsDir = path.resolve(
    String(
      proofsDir ||
        path.join(path.dirname(resolvedDocsDir), '_generated', 'visual-proofs'),
    ),
  );

  const resolvedSystemId =
    String(systemId || '').trim() ||
    inferSystemId([resolvedDocsDir, resolvedSpecsDir, resolvedProofsDir]);
  const resolvedDatabaseUrl = resolveDatabaseUrl(databaseUrl);

  const overviewSnapshot = captureFileSnapshot(resolvedOverviewPath);
  try {
    const registry = buildComponentRegistry({
      specsDir: resolvedSpecsDir,
      docsDir: resolvedDocsDir,
      proofsDir: resolvedProofsDir,
      includeVisualProofFiles: false,
    });
    const overviewListState = await resolveOverviewListState({
      databaseUrl: resolvedDatabaseUrl,
      systemId: resolvedSystemId,
      componentCount: registry.components.length,
    });

    const overview = skipOverview
      ? {
          ok: true,
          dryRun,
          changed: false,
          written: false,
          overviewPath: resolvedOverviewPath,
          databaseUrl: resolvedDatabaseUrl,
          componentCount: registry.components.length,
          listState: overviewListState,
        }
      : syncComponentOverview({
          overviewPath: resolvedOverviewPath,
          dryRun,
          registry,
          listState: overviewListState,
        });

    const dbSync = await persistRegistryToDb({
      projectRoot,
      systemId: resolvedSystemId,
      entries: registry.components,
      dryRun,
      databaseUrl: resolvedDatabaseUrl,
    });

    const registryResult = {
      ok: true,
      dryRun,
      changed: dbSync.changed,
      written: dbSync.written,
      databaseUrl: dbSync.databaseUrl,
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
