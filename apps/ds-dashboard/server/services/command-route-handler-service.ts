/**
 * Command Route Handler Service
 *
 * Handles command-related route logic.
 */

import { spawn, type SpawnOptions } from 'node:child_process';
import path from 'node:path';
import type { Context } from 'hono';

import {
  buildCaptureFigmaScreenshotCommandConfig,
  isInvalidTokensSourceError,
  buildRunScriptCommandArgs,
} from '../lib/command-route-service.ts';
import { resolveDatabaseProvider } from '../db/pg-db-service.js';
import {
  buildCaptureFigmaScreenshotQueueArgs,
  buildRefreshScriptQueueArgs,
  buildRunScriptQueueConfig,
  parseScriptNameFromRoute,
} from '../lib/command-route-enqueue-service.ts';
import {
  resolveFileKeyForSystem,
  syncDesignSystemFromPlugin,
  buildTokenUsageRowsFromFilesystem,
} from './figma-db-sync-service.ts';
import { generateTokenCssFromDb, flushCssToDisk } from './generate-token-css-service.ts';
import { getPluginConnectionManager } from './plugin-connection-manager.ts';
import { persistCapturePayloadToComponentRepo } from './capture-db-persistence-service.ts';
import { bulkInsert } from '../lib/sql-bulk-insert.ts';
import {
  fetchVariablesDirect,
  searchComponentsDirect,
} from './figma-direct-bridge-service.ts';
import { getSharedResponseCache } from './response-cache.ts';
import {
  getCachedComponentSnapshot,
  setCachedComponentSnapshot,
} from './component-snapshot-cache.ts';
import { getCachedPrewarmComponentSnapshot } from './figma-prewarm-snapshot-cache.ts';
import {
  getFreshCachedFigmaFileVersion,
  setFigmaFileVersionCache,
} from './figma-file-version-cache.ts';
import { DependencyRepository } from '../db/dependency-repository.js';
import { DesignSystemSyncJobRepository } from '../db/design-system-sync-job-repository.js';
import { DependencySyncService } from './dependency-sync-service.js';
import { resolveEnvRef } from '../lib/env-ref-utils.js';
import { refreshUsageIndexDbOnly } from './ops-db-maintenance-service.ts';
import { runCaptureFromFigmaUrl } from '../../../../tooling/src/services/capture-orchestrator-main.js';
import { fetchFigmaFile, fetchFigmaNodes } from '../../../../tooling/src/services/figma-api.js';
import {
  computeContentFingerprint,
  diffFigmaVsDb,
  type DbComponentRef,
  type FigmaNodeSnapshot,
} from './figma-diff-service.js';
import { stripDiacritics } from '../../../../tooling/src/utils/strip-diacritics.js';
import type { FigmaNode } from '../../../../tooling/src/utils/figma.js';

const PARENT_USAGE_SYNC_TIMEOUT_MS = 15_000;
type SyncDiffDryRunResultOk = {
  ok: true;
  sourceCandidates: Array<Record<string, unknown>>;
  diff: ReturnType<typeof diffFigmaVsDb>;
  pathUsed: 'plugin' | 'rest' | 'cache';
  fileVersion: string;
  componentsDurationMs: number;
};

type SyncDiffDryRunResult =
  | SyncDiffDryRunResultOk
  | {
      ok: false;
      error: string;
    };

type SyncVariablesDryRunDebug = {
  fileVersion: string;
  durationMs: number;
};

const syncDiffDryRunInflightByKey = new Map<
  string,
  Promise<SyncDiffDryRunResult>
>();
const SYNC_PREVIEW_CACHE_TTL_MS = 30 * 60 * 1000;
const SYNC_PREVIEW_CACHE_MAX_ENTRIES = 300;
const syncDiffDryRunResultCacheByKey = new Map<
  string,
  {
    systemId: string;
    cachedAt: number;
    value: SyncDiffDryRunResult;
  }
>();
const syncVariablesDryRunResultCacheByKey = new Map<
  string,
  {
    systemId: string;
    cachedAt: number;
    value: ReturnType<typeof summarizeVariablesStep> & {
      _debug?: SyncVariablesDryRunDebug;
    };
  }
>();
const syncVariablesDryRunInflightByKey = new Map<
  string,
  Promise<
    | {
        ok: true;
        summary: ReturnType<typeof summarizeVariablesStep>;
      }
    | {
        ok: false;
        error: string;
      }
  >
>();
const syncDiffApplyInflightByKey = new Map<
  string,
  Promise<
    | {
        ok: true;
        sourceCandidates: Array<Record<string, unknown>>;
        diff: ReturnType<typeof diffFigmaVsDb>;
      }
    | {
        ok: false;
        error: string;
      }
  >
>();

function buildSyncDiffDryRunInflightKey(input: {
  systemId: string;
  fileKey: string;
  fileVersion: string;
}): string {
  return JSON.stringify({
    systemId: toTrimmedString(input.systemId),
    fileKey: toTrimmedString(input.fileKey),
    fileVersion: toTrimmedString(input.fileVersion),
  });
}

function buildSyncVariablesDryRunInflightKey(input: {
  systemId: string;
  fileKey: string;
  fileVersion: string;
}): string {
  return JSON.stringify({
    systemId: toTrimmedString(input.systemId),
    fileKey: toTrimmedString(input.fileKey),
    fileVersion: toTrimmedString(input.fileVersion),
  });
}

function pruneSyncPreviewCacheEntriesByAge(
  map: Map<string, { cachedAt: number }>,
  nowMs: number,
): void {
  for (const [key, entry] of map.entries()) {
    if (nowMs - entry.cachedAt > SYNC_PREVIEW_CACHE_TTL_MS) {
      map.delete(key);
    }
  }
}

function pruneSyncPreviewCacheEntriesBySize(map: Map<string, unknown>): void {
  while (map.size > SYNC_PREVIEW_CACHE_MAX_ENTRIES) {
    const oldestKey = map.keys().next().value;
    if (!oldestKey) break;
    map.delete(oldestKey);
  }
}

function getCachedSyncDiffPreviewResult(
  key: string,
):
  | SyncDiffDryRunResult
  | null {
  const nowMs = Date.now();
  pruneSyncPreviewCacheEntriesByAge(syncDiffDryRunResultCacheByKey, nowMs);
  const cached = syncDiffDryRunResultCacheByKey.get(key);
  if (!cached) return null;
  if (nowMs - cached.cachedAt > SYNC_PREVIEW_CACHE_TTL_MS) {
    syncDiffDryRunResultCacheByKey.delete(key);
    return null;
  }
  syncDiffDryRunResultCacheByKey.delete(key);
  syncDiffDryRunResultCacheByKey.set(key, {
    ...cached,
    cachedAt: nowMs,
  });
  return cached.value;
}

function setCachedSyncDiffPreviewResult(
  key: string,
  systemId: string,
  value: SyncDiffDryRunResult,
): void {
  const nowMs = Date.now();
  pruneSyncPreviewCacheEntriesByAge(syncDiffDryRunResultCacheByKey, nowMs);
  syncDiffDryRunResultCacheByKey.set(key, {
    systemId: toTrimmedString(systemId),
    cachedAt: nowMs,
    value,
  });
  pruneSyncPreviewCacheEntriesBySize(syncDiffDryRunResultCacheByKey);
}

function clearSyncDiffPreviewCacheForSystem(systemId: string): void {
  const normalizedSystemId = toTrimmedString(systemId);
  if (!normalizedSystemId) return;
  for (const [key, entry] of syncDiffDryRunResultCacheByKey.entries()) {
    if (entry.systemId === normalizedSystemId) {
      syncDiffDryRunResultCacheByKey.delete(key);
    }
  }
}

function clearSyncVariablesPreviewCacheForSystem(systemId: string): void {
  const normalizedSystemId = toTrimmedString(systemId);
  if (!normalizedSystemId) return;
  for (const [key, entry] of syncVariablesDryRunResultCacheByKey.entries()) {
    if (entry.systemId === normalizedSystemId) {
      syncVariablesDryRunResultCacheByKey.delete(key);
    }
  }
}

export function computeDesignSystemImportCoverage(
  components: Array<{ name: string; status: string; nodeId: string | null }>,
  sourceCandidates?: Array<Record<string, unknown>>,
): {
  detectedComponentsCount: number;
  importedComponentsCount: number;
  pendingComponentsCount: number;
  importedComponentNames: string[];
  pendingComponentNames: string[];
} {
  const importedComponents = components.filter((component) => component.status !== 'missing');
  const importedComponentNames = importedComponents.map((component) => component.name);
  const pendingComponentNamesFallback = components
    .filter((component) => component.status === 'missing')
    .map((component) => component.name);

  const normalizedSourceCandidates = Array.isArray(sourceCandidates)
    ? sourceCandidates
        .map((candidate) => {
          const nodeId = toTrimmedString(
            candidate.node_id ?? candidate.nodeId ?? candidate.nodeID,
          );
          const name = toTrimmedString(candidate.name);
          return {
            nodeId: nodeId || null,
            name: name || null,
          };
        })
        .filter(
          (
            candidate,
          ): candidate is {
            nodeId: string | null;
            name: string | null;
          } => Boolean(candidate.nodeId || candidate.name),
        )
    : [];

  if (normalizedSourceCandidates.length === 0) {
    return {
      detectedComponentsCount: components.length,
      importedComponentsCount: importedComponents.length,
      pendingComponentsCount: pendingComponentNamesFallback.length,
      importedComponentNames,
      pendingComponentNames: pendingComponentNamesFallback,
    };
  }

  const importedNodeIds = new Set(
    importedComponents
      .map((component) => component.nodeId)
      .filter((value): value is string => Boolean(value && value.trim())),
  );
  const importedNames = new Set(
    importedComponents
      .map((component) => component.name)
      .filter((value): value is string => Boolean(value && value.trim())),
  );
  const pendingComponentNames = normalizedSourceCandidates
    .filter((candidate) => {
      if (candidate.nodeId && importedNodeIds.has(candidate.nodeId)) return false;
      if (!candidate.nodeId && candidate.name && importedNames.has(candidate.name)) return false;
      return Boolean(candidate.nodeId || candidate.name);
    })
    .map((candidate) => candidate.name || candidate.nodeId || '')
    .filter((name) => name.trim().length > 0);

  return {
    detectedComponentsCount: normalizedSourceCandidates.length,
    importedComponentsCount: importedComponents.length,
    pendingComponentsCount: pendingComponentNames.length,
    importedComponentNames,
    pendingComponentNames,
  };
}

async function refreshDesignSystemImportCoverage(args: {
  designSystemRepository?: import('../db/design-system-repository.js').DesignSystemRepository;
  componentRepo?: import('../db/component-repository.js').ComponentRepository;
  systemId: string;
  sourceCandidates?: Array<Record<string, unknown>>;
}): Promise<void> {
  const { designSystemRepository, componentRepo, systemId, sourceCandidates } = args;
  if (!designSystemRepository || !componentRepo) return;

  // Use the lean coverage projection — name + status + node id — instead of
  // getAll() which also loads specs, proofs and Figma metadata. Coverage
  // counters need nothing beyond what this single SELECT returns.
  const [currentSystem, components] = await Promise.all([
    designSystemRepository.getById(systemId),
    componentRepo.getComponentCoverageRows(systemId),
  ]);
  if (!currentSystem) return;

  const coverage = computeDesignSystemImportCoverage(components, sourceCandidates);

  const hasCoverageChanges =
    currentSystem.detectedComponentsCount !== coverage.detectedComponentsCount ||
    currentSystem.importedComponentsCount !== coverage.importedComponentsCount ||
    currentSystem.pendingComponentsCount !== coverage.pendingComponentsCount ||
    JSON.stringify(currentSystem.importedComponentNames || []) !==
      JSON.stringify(coverage.importedComponentNames) ||
    JSON.stringify(currentSystem.pendingComponentNames || []) !==
      JSON.stringify(coverage.pendingComponentNames);

  if (!hasCoverageChanges) return;

  await designSystemRepository.update(systemId, {
    detectedComponentsCount: coverage.detectedComponentsCount,
    importedComponentsCount: coverage.importedComponentsCount,
    pendingComponentsCount: coverage.pendingComponentsCount,
    importedComponentNames: coverage.importedComponentNames,
    pendingComponentNames: coverage.pendingComponentNames,
  });
}

function toDurationMs(value: unknown): number | undefined {
  const durationMs = Number(value);
  if (!Number.isFinite(durationMs) || durationMs < 0) return undefined;
  return Math.max(0, Math.round(durationMs));
}

function formatDurationMs(durationMs: number): string {
  return `${Math.max(0, Math.round(durationMs))} ms`;
}

function getCachedSyncVariablesPreviewResult(
  key: string,
): (ReturnType<typeof summarizeVariablesStep> & {
  _debug?: SyncVariablesDryRunDebug;
}) | null {
  const nowMs = Date.now();
  pruneSyncPreviewCacheEntriesByAge(syncVariablesDryRunResultCacheByKey, nowMs);
  const cached = syncVariablesDryRunResultCacheByKey.get(key);
  if (!cached) return null;
  if (nowMs - cached.cachedAt > SYNC_PREVIEW_CACHE_TTL_MS) {
    syncVariablesDryRunResultCacheByKey.delete(key);
    return null;
  }
  syncVariablesDryRunResultCacheByKey.delete(key);
  syncVariablesDryRunResultCacheByKey.set(key, {
    ...cached,
    cachedAt: nowMs,
  });
  return cached.value;
}

function setCachedSyncVariablesPreviewResult(
  key: string,
  systemId: string,
  value: ReturnType<typeof summarizeVariablesStep> & {
    _debug?: SyncVariablesDryRunDebug;
  },
): void {
  const nowMs = Date.now();
  pruneSyncPreviewCacheEntriesByAge(syncVariablesDryRunResultCacheByKey, nowMs);
  syncVariablesDryRunResultCacheByKey.set(key, {
    systemId: toTrimmedString(systemId),
    cachedAt: nowMs,
    value,
  });
  pruneSyncPreviewCacheEntriesBySize(syncVariablesDryRunResultCacheByKey);
}

function buildNoPluginSocketForFileMessage(figmaFileId: string): string {
  return (
    `No plugin connection is available for Figma file "${toTrimmedString(figmaFileId)}". ` +
    'Open that exact file in Figma Desktop, run the Figma Desktop Bridge plugin, and retry.'
  );
}

function hasUsablePluginSocketForFile(
  manager: ReturnType<typeof getPluginConnectionManager>,
  fileKey: string,
): boolean {
  const normalizedFileKey = toTrimmedString(fileKey);
  if (!normalizedFileKey) return false;
  if (manager.getPreferredSocketId(normalizedFileKey)) return true;
  return manager.getConnectionCount() === 1 && manager.getActiveFileKeys().length === 0;
}

function shouldUseTsxLoader(scriptPath: string): boolean {
  const normalizedPath = String(scriptPath || '').trim().toLowerCase();
  return (
    normalizedPath.endsWith('.ts') ||
    normalizedPath.endsWith('.tsx') ||
    normalizedPath.endsWith('.mts') ||
    normalizedPath.endsWith('.cts')
  );
}

function buildNodeCommandArgs(
  scriptPath: string,
  scriptArgs: string[],
): string[] {
  const normalizedScriptPath = String(scriptPath || '').trim();
  const extraArgs = Array.isArray(scriptArgs) ? [...scriptArgs] : [];
  return shouldUseTsxLoader(normalizedScriptPath)
    ? ['--import', 'tsx', normalizedScriptPath, ...extraArgs]
    : [normalizedScriptPath, ...extraArgs];
}

function toTrimmedString(value: unknown): string {
  return String(value || '').trim();
}

/**
 * Tracks the wall-clock time of the last successful *fresh* variables fetch
 * (i.e. a fetch that explicitly invalidated the cache before calling the
 * plugin). Keyed by Figma fileKey. Used by buildPrewarmedVariablesFetchFn to
 * skip the re-invalidation when a fresh fetch happened very recently.
 *
 * Memory note: this Map is intentionally unbounded, but cardinality is
 * O(distinct Figma fileKeys seen by this server process). A ds-dashboard
 * instance typically serves 1–10 unique files over its lifetime, so no
 * eviction policy is needed in production. Each entry is ~50–100 bytes.
 * Tests should call clearVariablesFreshFetchCache() in afterEach to avoid
 * cross-test state leaks.
 */
type VariablesFreshFetchEntry = {
  freshAt: number;
};

const variablesFreshFetchByKey = new Map<string, VariablesFreshFetchEntry>();

/** Clears the prewarm tracker. Intended for use in tests only. */
export function clearVariablesFreshFetchCache(): void {
  variablesFreshFetchByKey.clear();
}

function recordFreshVariablesFetch(fileKey: string): void {
  const effectiveFileKey = toTrimmedString(fileKey);
  if (!effectiveFileKey) return;
  variablesFreshFetchByKey.set(effectiveFileKey, {
    freshAt: Date.now(),
  });
}

/**
 * Window (ms) within which a previous fresh fetch is considered "warm enough"
 * to reuse without re-invalidating the cache.
 *
 * Tradeoff: a longer window reduces WebSocket roundtrips (saves ~10-30 s per
 * sync) but widens the interval in which a Figma variable edit made after the
 * preview could be silently ignored. 2 minutes covers the typical
 * "preview → review diff → select components → click sync" workflow while
 * keeping the stale-variable exposure short enough to be acceptable.
 *
 * If the window expires the sync falls back to buildFreshVariablesFetchFn,
 * which invalidates the cache and fetches live data — same behaviour as before
 * the prewarm optimisation was introduced.
 */
const VARIABLES_PREWARM_WINDOW_MS = 2 * 60_000;

function buildFreshVariablesFetchFn(
  defaultFileKey: string,
): (fileKey?: string | null) => Promise<import('../../../../tooling/src/utils/figma.ts').FigmaVariablesResponse> {
  return async (fileKey?: string | null) => {
    const effectiveFileKey =
      toTrimmedString(fileKey) || toTrimmedString(defaultFileKey);
    if (effectiveFileKey) {
      getSharedResponseCache().invalidateFile(effectiveFileKey);
    }
    const result = await fetchVariablesDirect(effectiveFileKey || null);
    // Record the timestamp so buildPrewarmedVariablesFetchFn can skip the
    // re-invalidation when a fresh fetch happened very recently (e.g. preview
    // ran 1-2 seconds before the sync button was clicked).
    recordFreshVariablesFetch(effectiveFileKey);
    return result;
  };
}

/**
 * Returns a variables-fetch function for use in the full sync's variables step.
 *
 * Strategy:
 * - If a fresh fetch (via buildFreshVariablesFetchFn) happened within
 *   `windowMs` for this fileKey, the shared response cache already holds the
 *   current Figma state. Return a cache-first fetch that skips the WebSocket
 *   roundtrip (~10-30 s saved).
 * - Otherwise, fall back to buildFreshVariablesFetchFn which invalidates the
 *   cache and fetches live data, guaranteeing correctness.
 *
 * This resolves the tension between:
 * - Correctness: sync must persist the current Figma state, not a stale snapshot.
 * - Performance: the SyncDiffPreview (which runs just before sync) already paid
 *   the WebSocket cost; there is no value in paying it again if nothing changed.
 */
function buildPrewarmedVariablesFetchFn(
  defaultFileKey: string,
  windowMs: number = VARIABLES_PREWARM_WINDOW_MS,
): (fileKey?: string | null) => Promise<import('../../../../tooling/src/utils/figma.ts').FigmaVariablesResponse> {
  const effectiveFileKey = toTrimmedString(defaultFileKey);
  const lastFreshAt = effectiveFileKey
    ? variablesFreshFetchByKey.get(effectiveFileKey)
    : undefined;
  const withinWindow =
    lastFreshAt !== undefined && Date.now() - lastFreshAt.freshAt < windowMs;
  const isPrewarm = withinWindow;

  if (isPrewarm) {
    // Cache is warm and fresh — skip cache invalidation, serve from cache.
    // fetchVariablesDirect reads from the shared response cache (TTL 5 min)
    // which was populated by the buildFreshVariablesFetchFn call in the preview.
    return (fileKey?: string | null) =>
      fetchVariablesDirect(
        toTrimmedString(fileKey) || effectiveFileKey || null,
      );
  }

  // Cache is cold or the prewarm window has expired — do a full fresh fetch.
  return buildFreshVariablesFetchFn(defaultFileKey);
}

function toNonNegativeInt(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.floor(parsed);
}

function stripNodeIdFromFigmaUrl(rawUrl: string): string {
  const value = String(rawUrl || '').trim();
  if (!value) return '';
  try {
    const url = new URL(value);
    for (const key of ['node-id', 'node_id', 'nodeId']) {
      url.searchParams.delete(key);
    }
    const rawHash = String(url.hash || '').replace(/^#/, '');
    if (rawHash) {
      const hashParams = new URLSearchParams(rawHash.replace(/^[/?]+/, ''));
      for (const key of ['node-id', 'node_id', 'nodeId']) {
        hashParams.delete(key);
      }
      url.hash = hashParams.toString() ? `#${hashParams.toString()}` : '';
    }
    return url.toString();
  } catch {
    return value;
  }
}

function buildCommandEnv(
  baseEnv: Record<string, string> | undefined,
  databaseUrl: string | undefined,
): Record<string, string> | undefined {
  const normalizedDatabaseUrl = String(databaseUrl || '').trim();
  if (!normalizedDatabaseUrl) {
    return baseEnv;
  }
  return {
    ...(baseEnv || {}),
    DATABASE_URL: normalizedDatabaseUrl,
    TEST_DATABASE_URL: normalizedDatabaseUrl,
    DB_PROVIDER: resolveDatabaseProvider({
      DATABASE_URL: normalizedDatabaseUrl,
    }),
  };
}

export function summarizeCapturedStep(result: unknown): {
  status: 'completed' | 'completed_with_warnings' | 'failed';
  summary: string;
  warnings: string[];
  counts: Record<string, number>;
  durationMs?: number;
  raw: Record<string, unknown>;
} {
  const payload = result && typeof result === 'object' ? (result as Record<string, unknown>) : {};
  const durationMs = toDurationMs(payload.durationMs);
  const captured = Array.isArray(payload.captured) ? payload.captured.length : 0;
  const failed = Array.isArray(payload.failed) ? payload.failed.length : 0;
  const skipped = Array.isArray(payload.skipped) ? payload.skipped.length : 0;
  const targets = Array.isArray(payload.targets)
    ? payload.targets.length
    : toNonNegativeInt(payload.targets_total);
  const warnings: string[] = [];
  const noTargets = targets === 0 && captured === 0 && failed === 0;
  if (failed > 0) {
    warnings.push(`${failed} component(s) failed to import.`);
  }
  if (skipped > 0) {
    warnings.push(`${skipped} component candidate(s) were skipped during capture.`);
  }
  if (noTargets && skipped === 0 && payload.ok !== false) {
    warnings.push('No capture targets were resolved from the Figma file.');
  }
  if (payload.figma_error && typeof payload.figma_error === 'object') {
    const figmaError = payload.figma_error as Record<string, unknown>;
    const message = toTrimmedString(figmaError.message);
    if (message) warnings.push(message);
  }
  if (Array.isArray(payload.warnings)) {
    for (const warning of payload.warnings) {
      const message = toTrimmedString(warning);
      if (message) warnings.push(message);
    }
  }
  const hardFailure = payload.ok === false;
  if (hardFailure) {
    const message = toTrimmedString(payload.error) || toTrimmedString(payload.message);
    if (message) warnings.push(message);
  }

  const status =
    hardFailure
      ? 'failed'
      : failed > 0
      ? captured > 0
        ? 'completed_with_warnings'
        : 'failed'
      : skipped > 0
        ? 'completed_with_warnings'
        : noTargets && !hardFailure
      ? 'completed_with_warnings'
        : 'completed';

  return {
    status,
    summary:
      status === 'failed'
        ? 'Components sync failed.'
        : status === 'completed_with_warnings'
          ? 'Components synced with warnings.'
          : 'Components synced.',
    warnings,
    counts: { captured, failed, skipped, targets },
    ...(durationMs !== undefined ? { durationMs } : {}),
    raw: payload,
  };
}

function extractSourceCandidatesFromCapturedStep(
  step: {
    raw?: Record<string, unknown>;
  } | null | undefined,
): Array<Record<string, unknown>> {
  const raw = step?.raw;
  if (!raw || typeof raw !== 'object') return [];

  const report = raw.report && typeof raw.report === 'object'
    ? (raw.report as Record<string, unknown>)
    : null;
  const candidateSources = [
    raw.source_candidates,
    raw.sourceCandidates,
    report?.source_candidates,
    report?.sourceCandidates,
  ];

  for (const candidateSource of candidateSources) {
    if (!Array.isArray(candidateSource)) continue;
    return candidateSource
      .map((entry) =>
        entry && typeof entry === 'object' && !Array.isArray(entry)
          ? ({ ...entry } as Record<string, unknown>)
          : null,
      )
      .filter((entry): entry is Record<string, unknown> => Boolean(entry));
  }

  return [];
}

function summarizeVariablesStep(result: unknown): {
  status: 'completed' | 'completed_with_warnings' | 'failed';
  summary: string;
  warnings: string[];
  counts: Record<string, number>;
  durationMs?: number;
  raw: Record<string, unknown>;
} {
  const payload = result && typeof result === 'object' ? (result as Record<string, unknown>) : {};
  const durationMs = toDurationMs(payload.durationMs);
  const warnings: string[] = [];
  if (payload.componentsTruncated === true) {
    warnings.push('Component list was truncated by the plugin search limit.');
  }
  if (Array.isArray(payload.warnings)) {
    for (const warning of payload.warnings) {
      const message = toTrimmedString(warning);
      if (message) warnings.push(message);
    }
  }
  if (payload.ok === false) {
    const message = toTrimmedString(payload.error) || toTrimmedString(payload.message);
    if (message) warnings.push(message);
  }
  const status =
    payload.ok === false
      ? 'failed'
      : warnings.length > 0
        ? 'completed_with_warnings'
        : 'completed';
  return {
    status,
    summary:
      status === 'failed'
        ? 'Variables sync failed.'
        : status === 'completed_with_warnings'
          ? 'Variables synced with warnings.'
          : 'Variables synced.',
    warnings,
    counts: {
      tokens: toNonNegativeInt(payload.tokens),
      tokenModeValues: toNonNegativeInt(payload.tokenModeValues),
      aliases: toNonNegativeInt(payload.aliases),
      components: toNonNegativeInt(payload.components),
      usageRestored: toNonNegativeInt(payload.usageRestored),
      usageDropped: toNonNegativeInt(payload.usageDropped),
    },
    ...(durationMs !== undefined ? { durationMs } : {}),
    raw: payload,
  };
}

function resolveOverallSyncStatus(args: {
  components: 'completed' | 'completed_with_warnings' | 'failed';
  variables: 'completed' | 'completed_with_warnings' | 'failed';
}): 'completed' | 'completed_with_warnings' | 'failed' {
  if (args.components === 'failed' && args.variables === 'failed') {
    return 'failed';
  }
  if (
    args.components === 'completed_with_warnings' ||
    args.variables === 'completed_with_warnings' ||
    (args.components === 'failed' && args.variables === 'completed') ||
    (args.components === 'completed' && args.variables === 'failed')
  ) {
    return 'completed_with_warnings';
  }
  return 'completed';
}

function resolveQueueStatusFromSyncStatus(
  status: 'completed' | 'completed_with_warnings' | 'failed' | 'running' | 'queued',
): 'queued' | 'running' | 'success' | 'error' {
  if (status === 'queued' || status === 'running') {
    return status;
  }
  return status === 'failed' ? 'error' : 'success';
}

async function persistDesignSystemSyncJobState(
  db: import('postgres').Sql | undefined,
  input: {
    jobId: string;
    systemId: string;
    operationName: string;
    label: string;
    status: 'queued' | 'running' | 'success' | 'error';
    requestId?: string | null;
    startedAt?: string | null;
    finishedAt?: string | null;
    result?: Record<string, unknown> | null;
  },
): Promise<void> {
  if (!db || typeof db !== 'function') return;
  const repo = new DesignSystemSyncJobRepository(db);
  await repo.upsertJob({
    jobId: input.jobId,
    systemId: input.systemId,
    operationName: input.operationName,
    label: input.label,
    status: input.status,
    requestId: input.requestId ?? null,
    startedAt: input.startedAt ?? null,
    finishedAt: input.finishedAt ?? null,
    result: input.result ?? null,
  });
}

function toFigmaNodeSnapshots(
  sourceCandidates: Array<Record<string, unknown>>,
): FigmaNodeSnapshot[] {
  const snapshots: FigmaNodeSnapshot[] = [];
  for (const candidate of sourceCandidates) {
    const nodeId = toTrimmedString(
      candidate.node_id ?? candidate.nodeId ?? candidate.nodeID,
    );
    if (!nodeId) continue;
    const name = toTrimmedString(candidate.name) || nodeId;
    const type = toTrimmedString(candidate.type ?? candidate.kind) || 'component';
    const pageName =
      toTrimmedString(candidate.page_name ?? candidate.pageName ?? candidate.page) ||
      undefined;
    const variantCount = toNonNegativeInt(
      candidate.variant_count ?? candidate.variantCount,
    );
    const slug = slugifyComponentName(name);
    snapshots.push({
      nodeId,
      name,
      type,
      slug,
      pageName,
      variantCount,
      contentFingerprint:
        toTrimmedString(candidate.contentFingerprint) ||
        computeContentFingerprint({
          name,
          type,
          pageName,
          variantCount,
        }),
    });
  }
  return snapshots;
}

function cacheComponentSnapshotForFileVersion(args: {
  fileKey: string;
  fileVersion: string;
  sourceCandidates: Array<Record<string, unknown>>;
}): void {
  const fileKey = toTrimmedString(args.fileKey);
  const fileVersion = toTrimmedString(args.fileVersion);
  if (!fileKey || !fileVersion) return;
  setCachedComponentSnapshot({
    fileKey,
    fileVersion,
    includeVariants: false,
    compact: true,
    components: args.sourceCandidates.map((candidate) => ({ ...candidate })),
  });
}

function slugifyComponentName(name: string): string {
  return (
    stripDiacritics(String(name || '').trim())
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 120) || 'component'
  );
}

function uniqueSlug(baseSlug: string, used: Set<string>): string {
  if (!used.has(baseSlug)) {
    used.add(baseSlug);
    return baseSlug;
  }
  let counter = 2;
  while (used.has(`${baseSlug}-${counter}`)) counter += 1;
  const next = `${baseSlug}-${counter}`;
  used.add(next);
  return next;
}

function allocateComponentSlug(
  preferredSlug: string,
  usedSlugs: Set<string>,
  currentSlug?: string,
): string {
  const normalizedCurrentSlug = toTrimmedString(currentSlug);
  if (normalizedCurrentSlug) {
    usedSlugs.delete(normalizedCurrentSlug);
  }
  return uniqueSlug(
    toTrimmedString(preferredSlug) || 'component',
    usedSlugs,
  );
}

function resolveExistingComponentSlug(args: {
  currentSlug: string;
  fallbackName: string;
  usedSlugs: Set<string>;
}): string {
  const current = String(args.currentSlug ?? '');
  if (current.trim().length > 0) {
    args.usedSlugs.add(current);
    return current;
  }
  return allocateComponentSlug(
    slugifyComponentName(args.fallbackName),
    args.usedSlugs,
  );
}

async function resolveSyncDesignSystemFigmaToken(params: {
  db?: import('postgres').Sql;
  systemId: string;
  figmaToken: string;
}): Promise<string> {
  const directToken = toTrimmedString(params.figmaToken);
  if (directToken) {
    return directToken;
  }
  if (!params.db) {
    return '';
  }
  const rows = (await params.db`
    SELECT figma_api_token
    FROM design_systems
    WHERE id = ${params.systemId}
    LIMIT 1
  `) as Array<{ figma_api_token: string | null }>;
  return toTrimmedString(resolveEnvRef(String(rows[0]?.figma_api_token || '').trim()));
}

function collectComponentSnapshotsFromNodeTree(args: {
  node: FigmaNode;
  pageName: string;
  insideComponentSet: boolean;
  byNodeId: Map<string, FigmaNodeSnapshot>;
}): void {
  const { node, pageName, insideComponentSet, byNodeId } = args;
  const nodeId = toTrimmedString(node.id);
  const nodeName = toTrimmedString(node.name) || nodeId;
  const rawType = toTrimmedString(node.type).toUpperCase();
  const children = Array.isArray(node.children) ? node.children : [];
  let nextInsideComponentSet = insideComponentSet;

  if (rawType === 'COMPONENT_SET' && nodeId) {
    const variantCount = children.filter(
      (child) => toTrimmedString(child?.type).toUpperCase() === 'COMPONENT',
    ).length;
    if (!byNodeId.has(nodeId)) {
      byNodeId.set(nodeId, {
        nodeId,
        name: nodeName,
        type: rawType,
        slug: slugifyComponentName(nodeName),
        pageName,
        variantCount,
        contentFingerprint: computeContentFingerprint({
          name: nodeName,
          type: rawType,
          pageName,
          variantCount,
        }),
      });
    }
    nextInsideComponentSet = true;
  } else if (rawType === 'COMPONENT' && nodeId && !insideComponentSet) {
    if (!byNodeId.has(nodeId)) {
      byNodeId.set(nodeId, {
        nodeId,
        name: nodeName,
        type: rawType,
        slug: slugifyComponentName(nodeName),
        pageName,
        variantCount: 0,
        contentFingerprint: computeContentFingerprint({
          name: nodeName,
          type: rawType,
          pageName,
          variantCount: 0,
        }),
      });
    }
  }

  for (const child of children) {
    collectComponentSnapshotsFromNodeTree({
      node: child,
      pageName,
      insideComponentSet: nextInsideComponentSet,
      byNodeId,
    });
  }
}

async function fetchFigmaComponentsForDiff(args: {
  fileKey: string;
  figmaToken: string;
}): Promise<FigmaNodeSnapshot[]> {
  const { fileKey, figmaToken } = args;
  const topLevel = await fetchFigmaFile({
    fileKey,
    token: figmaToken,
    depth: 1,
  });
  const pages = Array.isArray(topLevel?.document?.children)
    ? topLevel.document.children.filter(
        (node) => toTrimmedString(node?.id).length > 0,
      )
    : [];
  if (pages.length === 0) {
    return [];
  }

  const pagePayloads = await Promise.all(
    pages.map((page) =>
      fetchFigmaNodes({
        fileKey,
        nodeIds: [toTrimmedString(page.id)],
        token: figmaToken,
        // depth=7 from page ≈ depth=8 from document root (page itself is depth 0
        // in the nodes response). Matches the original full-file fetch depth so
        // deeply-nested COMPONENT_SET children are always visible.
        depth: 7,
      }),
    ),
  );
  const byNodeId = new Map<string, FigmaNodeSnapshot>();
  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index];
    const payload = pagePayloads[index];
    const pageId = toTrimmedString(page.id);
    if (!pageId) continue;
    const rootNode = payload?.nodes?.[pageId]?.document;
    if (!rootNode || typeof rootNode !== 'object') continue;
    const pageName =
      toTrimmedString(rootNode.name) ||
      toTrimmedString(page.name) ||
      `Page ${index + 1}`;
    collectComponentSnapshotsFromNodeTree({
      node: rootNode,
      pageName,
      insideComponentSet: false,
      byNodeId,
    });
  }

  return Array.from(byNodeId.values());
}

async function resolveFigmaFileVersion(args: {
  fileKey: string;
  figmaToken: string;
}): Promise<{
  fileVersion: string;
  durationMs: number;
}> {
  const cachedVersion = getFreshCachedFigmaFileVersion({
    fileKey: args.fileKey,
  });
  if (cachedVersion) {
    return {
      fileVersion: cachedVersion,
      durationMs: 0,
    };
  }
  const startedAt = Date.now();
  const payload = await fetchFigmaFile({
    fileKey: args.fileKey,
    token: args.figmaToken,
    depth: 1,
  });
  const fileVersion = toTrimmedString((payload as { version?: unknown })?.version);
  if (!fileVersion) {
    throw new Error('Unable to resolve Figma file version for preview cache.');
  }
  setFigmaFileVersionCache({
    fileKey: args.fileKey,
    fileVersion,
  });
  return {
    fileVersion,
    durationMs: Math.max(0, Date.now() - startedAt),
  };
}

async function buildSyncDiffSnapshot(params: {
  systemId: string;
  repoRoot: string;
  figmaUrl: string;
  figmaFileId?: string;
  fileVersion?: string;
  figmaToken: string;
  componentRepo: import('../db/component-repository.js').ComponentRepository;
  runCaptureFromFigmaUrlFn?: typeof runCaptureFromFigmaUrl;
  searchComponentsDirectFn?: typeof searchComponentsDirect;
  resolveFigmaFileVersionFn?: typeof resolveFigmaFileVersion;
  disableLeanRestPath?: boolean;
  requirePluginFastPath?: boolean;
}): Promise<SyncDiffDryRunResult> {
  const {
    systemId,
    repoRoot,
    figmaUrl,
    figmaFileId,
    fileVersion = '',
    figmaToken,
    componentRepo,
    runCaptureFromFigmaUrlFn = runCaptureFromFigmaUrl,
    searchComponentsDirectFn = searchComponentsDirect,
    disableLeanRestPath = false,
    requirePluginFastPath = false,
  } = params;

  const dbComponentsPromise = componentRepo.getComponentsForDiff(systemId);
  const normalizedFileVersion = toTrimmedString(fileVersion) || 'unknown';
  const componentsStartedAt = Date.now();

  try {
    const resolvedFileKey = resolveFileKeyForSystem(figmaFileId, { figmaUrl });
    const cachedComponentSnapshot = getCachedComponentSnapshot({
      fileKey: resolvedFileKey,
      fileVersion: normalizedFileVersion,
      includeVariants: false,
      compact: true,
    });
    if (Array.isArray(cachedComponentSnapshot) && cachedComponentSnapshot.length > 0) {
      const dbComponents = await dbComponentsPromise;
      return {
        ok: true,
        pathUsed: 'cache' as const,
        fileVersion: normalizedFileVersion,
        componentsDurationMs: 0,
        sourceCandidates: cachedComponentSnapshot.map((candidate) => ({ ...candidate })),
        diff: diffFigmaVsDb(
          toFigmaNodeSnapshots(cachedComponentSnapshot),
          dbComponents as DbComponentRef[],
          ),
      };
    }

    const prewarmedComponentSnapshot = getCachedPrewarmComponentSnapshot({
      fileKey: resolvedFileKey,
    });
    if (Array.isArray(prewarmedComponentSnapshot) && prewarmedComponentSnapshot.length > 0) {
      setCachedComponentSnapshot({
        fileKey: resolvedFileKey,
        fileVersion: normalizedFileVersion,
        includeVariants: false,
        compact: true,
        components: prewarmedComponentSnapshot,
      });
      const dbComponents = await dbComponentsPromise;
      return {
        ok: true,
        pathUsed: 'cache' as const,
        fileVersion: normalizedFileVersion,
        componentsDurationMs: 0,
        sourceCandidates: prewarmedComponentSnapshot.map((candidate) => ({ ...candidate })),
        diff: diffFigmaVsDb(
          toFigmaNodeSnapshots(prewarmedComponentSnapshot),
          dbComponents as DbComponentRef[],
        ),
      };
    }

    const manager = getPluginConnectionManager();
    const activeFileKeys = new Set(
      manager
        .getActiveFileKeys()
        .map((fileKey) => toTrimmedString(fileKey))
        .filter((fileKey) => fileKey.length > 0),
    );
    const hasSingleUnkeyedSocket =
      manager.getConnectionCount() === 1 && activeFileKeys.size === 0;
    const shouldTryPluginFastPath = requirePluginFastPath
      ? Boolean(resolvedFileKey)
      : Boolean(resolvedFileKey) &&
        (activeFileKeys.has(resolvedFileKey) || hasSingleUnkeyedSocket);

    if (requirePluginFastPath && !shouldTryPluginFastPath) {
      await dbComponentsPromise.catch(() => undefined);
      return {
        ok: false,
        error: `Plugin not connected to the requested Figma file "${toTrimmedString(resolvedFileKey) || toTrimmedString(figmaFileId) || 'unknown'}".`,
      };
    }

    if (shouldTryPluginFastPath) {
      try {
        const scanSessionId = `sync-diff-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 10)}`;
        const pluginComponents: Array<{
          nodeId: string;
          name: string;
          type: 'COMPONENT' | 'COMPONENT_SET';
          pageName?: string;
          variantCount?: number;
        }> = [];
        let offset = 0;
        let hasMore = true;
        let pages = 0;
        while (hasMore) {
          pages += 1;
          const page = await searchComponentsDirectFn(resolvedFileKey || null, {
            compact: true,
            includeVariants: false,
            limit: 1000,
            offset,
            scanSessionId,
          });
          if (Array.isArray(page.components) && page.components.length > 0) {
            pluginComponents.push(...page.components);
          }
          hasMore = page.hasMore === true;
          offset = typeof page.nextOffset === 'number'
            ? page.nextOffset
            : offset + (Array.isArray(page.components) ? page.components.length : 0);
          if (!hasMore) break;
          if (pages >= 100) {
            throw new Error(
              'Plugin fast-path pagination limit reached before completion.',
            );
          }
        }

        const byNodeId = new Map<string, FigmaNodeSnapshot>();
        for (const component of pluginComponents) {
          const nodeId = toTrimmedString(component.nodeId);
          if (!nodeId || byNodeId.has(nodeId)) continue;
          const name = toTrimmedString(component.name) || nodeId;
          const type = toTrimmedString(component.type) || 'COMPONENT';
          const pageName = toTrimmedString(component.pageName) || undefined;
          const variantCount = toNonNegativeInt(component.variantCount);
          byNodeId.set(nodeId, {
            nodeId,
            name,
            type,
            slug: slugifyComponentName(name),
            pageName,
            variantCount,
            contentFingerprint: computeContentFingerprint({
              name,
              type,
              pageName,
              variantCount,
            }),
          });
        }

        if (byNodeId.size > 0 || requirePluginFastPath) {
          const dbComponents = await dbComponentsPromise;
          if (requirePluginFastPath && byNodeId.size === 0 && dbComponents.length > 0) {
            return {
              ok: false,
              error:
                `Plugin component scan returned zero components for file "${toTrimmedString(resolvedFileKey) || toTrimmedString(figmaFileId)}". ` +
              'This can be a transient plugin/socket race. Re-open the plugin in that file and retry.',
            };
          }
          const sourceCandidates = Array.from(byNodeId.values()).map((snapshot) => ({
            node_id: snapshot.nodeId,
            name: snapshot.name,
            type: snapshot.type,
            page_name: snapshot.pageName || '',
            variant_count: snapshot.variantCount,
            contentFingerprint: snapshot.contentFingerprint,
          }));
          cacheComponentSnapshotForFileVersion({
            fileKey: resolvedFileKey,
            fileVersion: normalizedFileVersion,
            sourceCandidates,
          });
          return {
            ok: true,
            pathUsed: 'plugin' as const,
            fileVersion: normalizedFileVersion,
            componentsDurationMs: Math.max(0, Date.now() - componentsStartedAt),
            sourceCandidates,
            diff: diffFigmaVsDb(
              Array.from(byNodeId.values()),
              dbComponents as DbComponentRef[],
            ),
          };
        }
      } catch (error) {
        if (requirePluginFastPath) {
          await dbComponentsPromise.catch(() => undefined);
          return {
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : String(error),
          };
        }
        console.warn(
          `[buildSyncDiffSnapshot] Plugin fast path failed; falling back to capture pipeline: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    const canUseLeanRestPath =
      !disableLeanRestPath && toTrimmedString(resolvedFileKey).length > 0;
    let leanSnapshots: FigmaNodeSnapshot[] | null = null;
    if (canUseLeanRestPath && toTrimmedString(resolvedFileKey)) {
      try {
        leanSnapshots = await fetchFigmaComponentsForDiff({
          fileKey: toTrimmedString(resolvedFileKey),
          figmaToken,
        });
      } catch (error) {
        console.warn(
          `[buildSyncDiffSnapshot] Lean REST page scan failed; falling back to capture pipeline: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    if (Array.isArray(leanSnapshots) && leanSnapshots.length > 0) {
      try {
        const dbComponents = await dbComponentsPromise;
        const sourceCandidates = leanSnapshots.map((snapshot) => ({
          node_id: snapshot.nodeId,
          name: snapshot.name,
          type: snapshot.type,
          page_name: snapshot.pageName || '',
          variant_count: snapshot.variantCount,
          contentFingerprint: snapshot.contentFingerprint,
        }));
        cacheComponentSnapshotForFileVersion({
          fileKey: resolvedFileKey,
          fileVersion: normalizedFileVersion,
          sourceCandidates,
        });
        return {
          ok: true,
          pathUsed: 'rest' as const,
          fileVersion: normalizedFileVersion,
          componentsDurationMs: Math.max(0, Date.now() - componentsStartedAt),
          sourceCandidates,
          diff: diffFigmaVsDb(
            leanSnapshots,
            dbComponents as DbComponentRef[],
          ),
        };
      } catch (error) {
        console.warn(
          `[buildSyncDiffSnapshot] Lean REST DB lookup failed; falling back to capture pipeline: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    } else if (Array.isArray(leanSnapshots) && leanSnapshots.length === 0) {
      console.warn(
        '[buildSyncDiffSnapshot] Lean REST page scan returned no top-level components; falling back to capture pipeline.',
      );
    }

    const captureResult = await runCaptureFromFigmaUrlFn(
      {
        system: systemId,
        url: figmaUrl,
        'figma-token': figmaToken,
        'dry-run': 'true',
        'component-kind': 'all',
        'include-variants': 'false',
        'include-spec-exhibits': 'false',
        'continue-on-error': 'true',
        'main-capture-mode': 'rest',
        'tokens-source': 'mcp',
      },
      {
        projectRoot: repoRoot,
        // Limit document tree depth to avoid downloading full component internals.
        // depth=8 covers all realistic nesting patterns (page→section→frame→group→
        // component_set→component) while excluding internal geometry nodes, reducing
        // the Figma file payload by ~95% compared to an unbounded fetch.
        fetchFigmaFileFn: (opts) => fetchFigmaFile({ ...opts, depth: 8 }),
      },
    );

    if (!captureResult.ok) {
      await dbComponentsPromise.catch(() => undefined);
      return {
        ok: false,
        error: toTrimmedString(
          captureResult.error ?? captureResult.message ?? 'Figma scan failed.',
        ),
      };
    }

    const report = captureResult.report;
    const sourceCandidates = Array.isArray(
      report && typeof report === 'object'
        ? (report as Record<string, unknown>).source_candidates
        : null,
    )
      ? ((report as Record<string, unknown>).source_candidates as Array<Record<string, unknown>>)
      : [];
    const dbComponents = await dbComponentsPromise;
    cacheComponentSnapshotForFileVersion({
      fileKey: resolvedFileKey,
      fileVersion: normalizedFileVersion,
      sourceCandidates,
    });
    return {
      ok: true,
      pathUsed: 'rest' as const,
      fileVersion: normalizedFileVersion,
      componentsDurationMs: Math.max(0, Date.now() - componentsStartedAt),
      sourceCandidates,
      diff: diffFigmaVsDb(
        toFigmaNodeSnapshots(sourceCandidates),
        dbComponents as DbComponentRef[],
      ),
    };
  } catch (error) {
    await dbComponentsPromise.catch(() => undefined);
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function failBuildCommandConfig(
  c: Context,
  deps: {
    failJson: (
      c: Context,
      statusCode: number,
      args: Record<string, unknown>,
    ) => Response;
  },
  requestId: string,
  error: unknown,
): Response {
  const { failJson } = deps;
  const message = error instanceof Error ? error.message : String(error);
  const isTokensSourceError = isInvalidTokensSourceError(error);
  return failJson(c, isTokensSourceError ? 400 : 500, {
    code: isTokensSourceError
      ? 'validation.invalid_tokens_source'
      : 'internal.command_build_failed',
    userMessage: message,
    recoverable: isTokensSourceError,
    context: { field: isTokensSourceError ? 'tokensSource' : undefined },
    requestId,
  });
}

export interface CommandRouteHandlerDeps {
  failJson: (
    c: Context,
    statusCode: number,
    args: Record<string, unknown>,
  ) => Response;
  createApiRequestId: () => string;
  getSystemContext: (
    systemHeader: string,
  ) =>
    | {
        repoRoot: string;
        systemId: string;
        figmaFileId?: string;
        captureFromFigmaUrlScriptPath: string;
      }
    | Promise<{
        repoRoot: string;
        systemId: string;
        figmaFileId?: string;
        captureFromFigmaUrlScriptPath: string;
      }>;
  databaseUrl?: string;
  queueNpmScript: (args: unknown) => { id: string };
  queueJobAcceptedPayload: (job: { id: string }) => {
    ok: boolean;
    jobId: string;
  };
  processEnv?: Record<string, string | undefined>;
  spawnProcessFn?: RestartSpawnFn;
  setTimeoutFn?: RestartSetTimeoutFn;
  exitProcessFn?: (code?: number) => void;
  processCwd?: string;
  exitDelayMs?: number;
  readJsonBody: (c: Context) => Promise<Record<string, unknown>>;
  enqueueQueueJob: (args: unknown) => { id: string };
  sha256Text: (value: string) => string;
  runQueuedSpawnCommand: (options: unknown) => Promise<{ ok: boolean }>;
  runCaptureFromFigmaUrlFn?: typeof runCaptureFromFigmaUrl;
  searchComponentsDirectFn?: typeof searchComponentsDirect;
  disableLeanRestPath?: boolean;
  queueNodeJsonCommand: (args: unknown) => { id: string };
  componentRepo?: import('../db/component-repository.js').ComponentRepository;
  designSystemRepository?: import('../db/design-system-repository.js').DesignSystemRepository;
  db?: import('postgres').Sql;
  tokenRepo?: import('../db/token-repository.js').TokenRepository;
  syncDesignSystemFromPluginFn?: typeof syncDesignSystemFromPlugin;
  hasPluginSocketForFile?: (fileKey: string) => boolean;
  toBooleanString: (value: unknown, fallback: boolean) => string;
  toNumberString: (value: unknown, fallback: number, max: number) => string;
}

export async function enqueueRefreshScriptJob(
  c: Context,
  script: string,
  deps: Pick<
    CommandRouteHandlerDeps,
    | 'failJson'
    | 'createApiRequestId'
    | 'getSystemContext'
    | 'queueNpmScript'
    | 'queueJobAcceptedPayload'
    | 'enqueueQueueJob'
    | 'sha256Text'
    | 'tokenRepo'
    | 'db'
  >,
): Promise<Response> {
  const {
    failJson,
    createApiRequestId,
    getSystemContext,
    queueNpmScript,
    queueJobAcceptedPayload,
    enqueueQueueJob,
    sha256Text,
    tokenRepo,
    db,
  } = deps;
  const requestId = createApiRequestId();
  const sysCtx = await getSystemContext(c.req.header('x-ds-system') ?? '');
  const normalizedScript = String(script || '').trim();
  type RefreshDepKey = 'db' | 'tokenRepo';
  const queueDbOnlyJob = (args: {
    label: string;
    operationName: string;
    execute: (ctx: {
      emitChunk: (kind: string, text: string) => void;
    }) =>
      | {
          ok: boolean;
          code?: number;
          summary: string;
          payload?: unknown;
        }
      | Promise<{
          ok: boolean;
          code?: number;
          summary: string;
          payload?: unknown;
        }>;
  }) =>
    enqueueQueueJob({
      label: args.label,
      systemId: sysCtx.systemId,
      operationName: args.operationName,
      requestId,
      inputHash: sha256Text(
        JSON.stringify({
          script: normalizedScript,
          operationName: args.operationName,
          systemId: sysCtx.systemId,
          mode: 'db-only',
        }),
      ),
      execute: async ({
        emitChunk,
      }: {
        emitChunk: (kind: string, text: string) => void;
      }) => await args.execute({ emitChunk }),
    });

  const hasDep = (dep: RefreshDepKey): boolean => {
    if (dep === 'db') return Boolean(db);
    if (dep === 'tokenRepo') return Boolean(tokenRepo);
    const exhaustiveCheck: never = dep;
    return exhaustiveCheck;
  };

  const refreshDbOnlyConfigByScript: Partial<
    Record<
      string,
      {
        deps: RefreshDepKey[];
        build: (emitChunk: (kind: string, text: string) => void) => {
          ok: boolean;
          code?: number;
          summary: string;
          payload?: unknown;
        } | Promise<{
          ok: boolean;
          code?: number;
          summary: string;
          payload?: unknown;
        }>;
        label: string;
        operationName: string;
      }
    >
  > = {
    'ds:token-usage-index': {
      deps: ['db', 'tokenRepo'],
      label: 'refresh token usage (db-only)',
      operationName: 'refresh:token-usage-index',
      build: (emitChunk) =>
        refreshUsageIndexDbOnly({
          systemId: sysCtx.systemId,
          emitChunk,
          sql: db as NonNullable<typeof db>,
          tokenRepo: tokenRepo as NonNullable<typeof tokenRepo>,
        }),
    },
  };

  const dbOnlyConfig = refreshDbOnlyConfigByScript[normalizedScript];
  if (dbOnlyConfig) {
    const missingDep = dbOnlyConfig.deps.find((dep) => !hasDep(dep));
    if (missingDep) {
      return failJson(c, 500, {
        code: 'internal.refresh_dependencies_missing',
        userMessage: `Missing dependency "${missingDep}" for ${normalizedScript}.`,
        recoverable: false,
        requestId,
      });
    }
    const job = queueDbOnlyJob({
      label: dbOnlyConfig.label,
      operationName: dbOnlyConfig.operationName,
      execute: ({ emitChunk }) => dbOnlyConfig.build(emitChunk),
    });
    return c.json(queueJobAcceptedPayload(job), 202);
  }

  const job = queueNpmScript(
    buildRefreshScriptQueueArgs({ sysCtx, requestId, script }),
  );
  return c.json(queueJobAcceptedPayload(job), 202);
}

export interface HandleRestartApiDeps {
  failJson: (
    c: Context,
    statusCode: number,
    args: Record<string, unknown>,
  ) => Response;
  createApiRequestId: () => string;
  processEnv?: Record<string, string | undefined>;
  spawnProcessFn?: RestartSpawnFn;
  setTimeoutFn?: RestartSetTimeoutFn;
  exitProcessFn?: (code?: number) => void;
  processCwd?: string;
  exitDelayMs?: number;
}

export function handleRestartApiRoute(
  c: Context,
  deps: HandleRestartApiDeps,
): Response {
  const { failJson, createApiRequestId } = deps;
  const requestId = createApiRequestId();
  const env = deps.processEnv ?? process.env;
  const isSupervised = String(env.DS_DASHBOARD_SUPERVISED ?? '') === '1';
  const isProduction =
    String(env.NODE_ENV ?? '').toLowerCase() === 'production';
  const selfRestartDisabled =
    String(env.DS_DASHBOARD_DISABLE_SELF_RESTART ?? '') === '1';

  if (isSupervised) {
    return failJson(c, 409, {
      code: 'server.restart_requires_supervisor',
      userMessage:
        'The dashboard is running under the combined dev supervisor. Restart `npm run dashboard:dev` from the repository root.',
      recoverable: true,
      requestId,
      context: {
        restartCommand: 'npm run dashboard:dev',
      },
    });
  }

  if (isProduction || selfRestartDisabled) {
    return failJson(c, 403, {
      code: 'server.restart_forbidden',
      userMessage: 'Automatic API restart is disabled in this runtime.',
      recoverable: false,
      requestId,
    });
  }

  const spawnFn: RestartSpawnFn =
    deps.spawnProcessFn ??
    ((command, args, options) =>
      spawn(command, [...args], (options ?? {}) as SpawnOptions));
  const setTimeoutFn: RestartSetTimeoutFn =
    deps.setTimeoutFn ?? ((callback, delayMs) => setTimeout(callback, delayMs));
  const exitProcessFn =
    deps.exitProcessFn ?? ((code?: number) => process.exit(code));
  const cwd = deps.processCwd ?? process.cwd();
  const repoRoot = path.resolve(cwd, '..', '..');
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

  // Configurable exit delay with minimum safe threshold
  const exitDelayMs = Math.max(deps.exitDelayMs ?? 400, 300);

  try {
    const child = spawnFn(npmCommand, ['run', 'dashboard:dev'], {
      cwd: repoRoot,
      detached: true,
      stdio: 'ignore',
      shell: false,
      env: {
        ...env,
        NODE_ENV: env.NODE_ENV ?? 'development',
      },
    });
    if (typeof child?.unref === 'function') child.unref();
  } catch (error) {
    return failJson(c, 500, {
      code: 'server.restart_spawn_failed',
      userMessage: error instanceof Error ? error.message : String(error),
      recoverable: true,
      requestId,
    });
  }

  // Schedule exit after response is sent
  // The delay ensures the HTTP response has time to be transmitted
  const exitTimer = setTimeoutFn(() => {
    try {
      exitProcessFn(0);
    } catch {
      // ignore process exit failures
    }
  }, exitDelayMs);

  // Prevent timer from keeping process alive if other cleanup is needed
  if (
    typeof exitTimer === 'object' &&
    exitTimer !== null &&
    typeof exitTimer.unref === 'function'
  ) {
    exitTimer.unref();
  }

  return c.json(
    {
      ok: true,
      mode: 'combined',
      restartCommand: 'npm run dashboard:dev',
      message: 'Dashboard restart requested.',
      requestId,
    },
    202,
  );
}

interface RestartSpawnOptions {
  cwd?: string;
  detached?: boolean;
  stdio?: 'ignore';
  shell?: boolean;
  env?: NodeJS.ProcessEnv;
}

type RestartSpawnFn = (
  command: string,
  args: readonly string[],
  options?: RestartSpawnOptions,
) => {
  unref?: () => void;
};

type RestartSetTimeoutHandle =
  | {
      unref?: () => void;
    }
  | number;

type RestartSetTimeoutFn = (
  callback: (...args: unknown[]) => void,
  delayMs?: number,
) => RestartSetTimeoutHandle;

export async function handleRunScriptRoute(
  c: Context,
  deps: CommandRouteHandlerDeps,
): Promise<Response> {
  const {
    failJson,
    createApiRequestId,
    readJsonBody,
    getSystemContext,
    queueJobAcceptedPayload,
    enqueueQueueJob,
    sha256Text,
    runQueuedSpawnCommand,
  } = deps;

  const requestId = createApiRequestId();
  const parsedScript = parseScriptNameFromRoute(
    c.req.param('script'),
    requestId,
  );
  if (!parsedScript.ok) {
    return failJson(c, parsedScript.statusCode, parsedScript.errorArgs);
  }

  const body = await readJsonBody(c);
  const sysCtx = await getSystemContext(c.req.header('x-ds-system') ?? '');

  const runConfig = buildRunScriptQueueConfig({
    scriptName: parsedScript.scriptName,
    body,
    sysCtx,
    requestId,
    buildRunScriptCommandArgsFn: buildRunScriptCommandArgs,
    sha256TextFn: sha256Text,
  });

  const job = enqueueQueueJob({
    ...runConfig.queueArgs,
    execute: async ({
      emitChunk,
      setProcess,
    }: {
      emitChunk: unknown;
      setProcess: unknown;
    }) =>
      await runQueuedSpawnCommand({
        ...runConfig.runCommand,
        emitChunk,
        registerProcess: setProcess,
      }),
  });

  return c.json(queueJobAcceptedPayload(job), 202);
}

export async function handleSyncFigmaTokensRoute(
  c: Context,
  deps: CommandRouteHandlerDeps,
): Promise<Response> {
  const {
    createApiRequestId,
    getSystemContext,
    readJsonBody,
    toBooleanString,
    enqueueQueueJob,
    sha256Text,
    componentRepo,
    db,
    syncDesignSystemFromPluginFn = syncDesignSystemFromPlugin,
    hasPluginSocketForFile,
    queueJobAcceptedPayload,
    failJson,
  } = deps;

  const requestId = createApiRequestId();
  const sysCtx = await getSystemContext(c.req.header('x-ds-system') ?? '');
  const body = await readJsonBody(c);
  const tokensSource = String(
    body.tokensSource ?? body.tokens_source ?? body['tokens-source'] ?? 'mcp',
  )
    .trim()
    .toLowerCase();
  if (tokensSource && tokensSource !== 'mcp') {
    return failJson(c, 400, {
      code: 'validation.invalid_tokens_source',
      userMessage: 'Only plugin-based sync is supported (tokensSource=mcp).',
      recoverable: true,
      context: { field: 'tokensSource' },
      requestId,
    });
  }

  if (!db || !componentRepo) {
    return failJson(c, 500, {
      code: 'internal.sync_dependencies_missing',
      userMessage: 'Sync dependencies are not initialized.',
      recoverable: false,
      requestId,
    });
  }

  const figmaFileId = resolveFileKeyForSystem(sysCtx.figmaFileId, body);
  if (!figmaFileId) {
    return failJson(c, 400, {
      code: 'validation.figma_file_key_missing',
      userMessage:
        'Missing Figma file key. Configure figmaFileId on the system or pass url/fileKey.',
      recoverable: true,
      requestId,
    });
  }

  const canUsePluginSocket =
    typeof hasPluginSocketForFile === 'function'
      ? hasPluginSocketForFile(figmaFileId)
      : hasUsablePluginSocketForFile(getPluginConnectionManager(), figmaFileId);
  if (!canUsePluginSocket) {
    console.warn(
      `[handleSyncFigmaTokensRoute] No plugin socket available for file: ${figmaFileId}`,
    );
    return failJson(c, 409, {
      code: 'sync.no_plugin_socket_for_file',
      userMessage: buildNoPluginSocketForFileMessage(figmaFileId),
      recoverable: true,
      requestId,
      context: {
        figmaFileId,
      },
    });
  }

  const dryRun = toBooleanString(body.dryRun, false) === 'true';
  const includeComponents =
    toBooleanString(body.includeComponents, true) === 'true';
  const selectedComponentNodeIds = Array.isArray(body.selectedComponentNodeIds)
    ? body.selectedComponentNodeIds.filter(
        (id: unknown): id is string =>
          typeof id === 'string' && id.trim().length > 0,
      )
    : undefined;
  const requireComponentProofs =
    toBooleanString(body.requireComponentProofs, true) === 'true';
  const requireVariantProofsWhenPresent =
    toBooleanString(body.requireVariantProofsWhenPresent, true) === 'true';
  const captureComponentProofs =
    toBooleanString(body.captureComponentProofs, includeComponents) === 'true';
  const captureComponentProofVariants =
    toBooleanString(
      body.captureComponentProofVariants,
      captureComponentProofs,
    ) === 'true';

  const job = enqueueQueueJob({
    label: 'sync figma (plugin→db)',
    systemId: sysCtx.systemId,
    operationName: 'sync:figma-db',
    requestId,
    inputHash: sha256Text(
      JSON.stringify({
        systemId: sysCtx.systemId,
        figmaFileId,
        dryRun,
        includeComponents,
        importMode: selectedComponentNodeIds?.length ? 'partial' : 'full',
        selectedCount: selectedComponentNodeIds?.length || 0,
        requireComponentProofs,
        requireVariantProofsWhenPresent,
        captureComponentProofs,
        captureComponentProofVariants,
      }),
    ),
    execute: async ({
      emitChunk,
    }: {
      emitChunk: (kind: string, message: string) => void;
    }) => {
      emitChunk('system', `Syncing "${sysCtx.systemId}" from plugin...`);
      const result = await syncDesignSystemFromPluginFn({
        db,
        componentRepo,
        dsId: sysCtx.systemId,
        figmaFileId,
        dryRun,
        includeComponents,
        selectedComponentNodeIds,
        requireComponentProofs,
        requireVariantProofsWhenPresent,
        captureComponentProofs: includeComponents && !dryRun && captureComponentProofs,
        captureComponentProofVariants:
          includeComponents && !dryRun && captureComponentProofVariants,
        repoRoot: sysCtx.repoRoot,
        reindexUsageFromFilesystem: !dryRun,
        usageReindexStrict: true,
      });
      if (result.componentsTruncated) {
        emitChunk(
          'warning',
          'Component list was truncated by the plugin search limit; missing-component reconciliation may be partial.',
        );
      }
      if (result.usageReindexed > 0) {
        emitChunk(
          'result',
          `Reindexed ${result.usageReindexed} token usage occurrence(s) from current filesystem sources.`,
        );
      }
      if (result.usageReindexWarnings.length > 0) {
        for (const warning of result.usageReindexWarnings) {
          emitChunk('warning', warning);
        }
      }
      if (
        result.usageReindexStatus === 'failed' &&
        result.usageReindexReason !== 'none'
      ) {
        emitChunk(
          'warning',
          `Token usage reindex status: failed (${result.usageReindexReason}).`,
        );
      }
      if (!dryRun) {
        try {
          const rows = (await db`
            SELECT figma_api_token
            FROM design_systems
            WHERE id = ${sysCtx.systemId}
            LIMIT 1
          `) as Array<{ figma_api_token: string | null }>;
          const rawTokenRef = String(rows[0]?.figma_api_token || '').trim();
          const resolvedToken = resolveEnvRef(rawTokenRef);
          const dependencyRepo = new DependencyRepository(db);
          const consumers = await dependencyRepo.listConsumers(sysCtx.systemId);
          const captureParentUsageFromBindings = async (): Promise<number> => {
            const bindingRows = (await db`
              SELECT
                b.token_path,
                COUNT(*)::int AS node_count,
                COALESCE(MAX(t.type), 'UNKNOWN') AS variable_type,
                ARRAY_AGG(DISTINCT NULLIF(TRIM(b.node_id), ''))
                  FILTER (WHERE NULLIF(TRIM(b.node_id), '') IS NOT NULL) AS sample_node_ids
              FROM component_figma_token_bindings b
              JOIN components c ON c.id = b.component_id
              LEFT JOIN tokens t ON t.ds_id = c.ds_id AND t.id = b.token_path
              WHERE c.ds_id = ${sysCtx.systemId}
                AND LENGTH(TRIM(COALESCE(b.token_path, ''))) > 0
              GROUP BY b.token_path
              ORDER BY node_count DESC
            `) as Array<{
              token_path: string;
              node_count: number;
              variable_type: string;
              sample_node_ids: string[] | null;
            }>;

            await dependencyRepo.replaceParentVariableUsage(
              figmaFileId,
              bindingRows.map((row) => ({
                variable_key: String(row.token_path || '').trim(),
                variable_name: String(row.token_path || '').trim(),
                variable_type: String(row.variable_type || 'UNKNOWN').trim(),
                node_count: Number(row.node_count || 0),
                sample_node_ids_json: JSON.stringify(
                  Array.isArray(row.sample_node_ids)
                    ? row.sample_node_ids.filter((id) => Boolean(String(id || '').trim())).slice(0, 20)
                    : [],
                ),
              })),
            );
            return bindingRows.length;
          };
          if (!resolvedToken) {
            const captured = await captureParentUsageFromBindings();
            if (captured > 0) {
              emitChunk(
                'warning',
                `Parent token-usage snapshot used DB fallback from captured component bindings (${captured} variable entries); Figma API token was not resolved.`,
              );
            } else {
              emitChunk(
                'warning',
                'Parent token-usage snapshot skipped: unresolved Figma API token and no component bindings available for fallback.',
              );
            }
          } else if (consumers.length === 0) {
            const captured = await captureParentUsageFromBindings();
            emitChunk(
              'warning',
              `Parent usage snapshot skipped live consumer sync because no consumers are registered yet; DB fallback from captured component bindings wrote ${captured} variable entries.`,
            );
          } else {
            const dependencySyncService = new DependencySyncService(
              dependencyRepo,
              () => ({ figmaApiToken: rawTokenRef }),
            );
            const usageSyncAbortController = new AbortController();
            let usageSyncTimeoutHandle: ReturnType<typeof setTimeout> | null = null;
            const isUsageSyncAborted = (error: unknown): boolean => {
              const detail = error instanceof Error ? error.message : String(error);
              return detail.toLowerCase().includes('aborted');
            };
            try {
              const usageSyncResult = await Promise.race([
                dependencySyncService.syncConsumers({
                  dsFileKey: figmaFileId,
                  force: true,
                  captureParentUsage: true,
                  token: resolvedToken,
                  signal: usageSyncAbortController.signal,
                }).then((value) => ({ kind: 'success' as const, value }))
                  .catch((error) => ({ kind: 'error' as const, error })),
                new Promise<{ kind: 'timeout' }>((resolve) => {
                  usageSyncTimeoutHandle = setTimeout(() => {
                    usageSyncAbortController.abort();
                    resolve({ kind: 'timeout' });
                  }, PARENT_USAGE_SYNC_TIMEOUT_MS);
                  if (
                    typeof usageSyncTimeoutHandle === 'object' &&
                    usageSyncTimeoutHandle !== null &&
                    typeof usageSyncTimeoutHandle.unref === 'function'
                  ) {
                    usageSyncTimeoutHandle.unref();
                  }
                }),
              ]);
              if (usageSyncResult.kind === 'timeout') {
                const captured = await captureParentUsageFromBindings();
                emitChunk(
                  'warning',
                  `Parent usage sync timed out after ${PARENT_USAGE_SYNC_TIMEOUT_MS / 1000}s; DB fallback from captured component bindings wrote ${captured} variable entries.`,
                );
              } else if (usageSyncResult.kind === 'error') {
                const captured = await captureParentUsageFromBindings();
                const reason =
                  usageSyncResult.error instanceof Error
                    ? usageSyncResult.error.message
                    : String(usageSyncResult.error);
                if (isUsageSyncAborted(usageSyncResult.error)) {
                  emitChunk(
                    'result',
                    `Parent usage sync was aborted; DB fallback from captured component bindings wrote ${captured} variable entries.`,
                  );
                  return;
                }
                emitChunk(
                  'warning',
                  `Parent usage scan via API failed (${reason}); DB fallback from captured component bindings wrote ${captured} variable entries.`,
                );
              } else {
                emitChunk(
                  'result',
                  `Captured parent variable usage snapshot (consumers synced: ${usageSyncResult.value.synced}, skipped: ${usageSyncResult.value.skipped}, errors: ${usageSyncResult.value.errored}).`,
                );
              }
            } catch (usageError) {
              const captured = await captureParentUsageFromBindings();
              const reason =
                usageError instanceof Error ? usageError.message : String(usageError);
              if (isUsageSyncAborted(usageError)) {
                emitChunk(
                  'result',
                  `Parent usage sync was aborted; DB fallback from captured component bindings wrote ${captured} variable entries.`,
                );
                return;
              }
              emitChunk(
                  'warning',
                  `Parent usage scan via API failed (${reason}); DB fallback from captured component bindings wrote ${captured} variable entries.`,
                );
            } finally {
              if (usageSyncTimeoutHandle) {
                clearTimeout(usageSyncTimeoutHandle);
              }
            }
          }
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          emitChunk(
            'warning',
            `Parent token-usage snapshot failed: ${reason}`,
          );
        }
      }
      emitChunk(
        'result',
        `Imported ${result.tokens} tokens and ${result.components} components.`,
      );
      return {
        ok: true,
        code: 0,
        summary: 'Sync completed.',
        payload: result,
      };
    },
  });
  return c.json(queueJobAcceptedPayload(job), 202);
}

export async function handleSyncDesignSystemDryRunRoute(
  c: Context,
  deps: CommandRouteHandlerDeps,
): Promise<Response> {
  const {
    failJson,
    createApiRequestId,
    getSystemContext,
    readJsonBody,
    componentRepo,
    db,
    hasPluginSocketForFile,
    runCaptureFromFigmaUrlFn = runCaptureFromFigmaUrl,
    searchComponentsDirectFn = searchComponentsDirect,
    resolveFigmaFileVersionFn = resolveFigmaFileVersion,
    disableLeanRestPath = false,
  } = deps;

  const requestId = createApiRequestId();
  const systemHeader = c.req.param('systemId') ?? c.req.header('x-ds-system') ?? '';
  const sysCtx = await getSystemContext(systemHeader);
  const body = await readJsonBody(c);
  const rawFigmaUrl = toTrimmedString(body.figmaUrl ?? body.url);
  const figmaUrl = stripNodeIdFromFigmaUrl(
    rawFigmaUrl ||
    (sysCtx.figmaFileId
      ? `https://www.figma.com/design/${encodeURIComponent(sysCtx.figmaFileId)}`
      : ''),
  );
  if (!figmaUrl) {
    return failJson(c, 400, {
      code: 'validation.figma_url_required',
      userMessage: 'figmaUrl is required in request body.',
      recoverable: true,
      context: { field: 'figmaUrl' },
      requestId,
    });
  }

  let figmaToken = toTrimmedString(body.figmaToken ?? body.figma_token);
  if (!figmaToken) {
    try {
      figmaToken = await resolveSyncDesignSystemFigmaToken({
        db,
        systemId: sysCtx.systemId,
        figmaToken: figmaToken,
      });
    } catch (error) {
      return failJson(c, 500, {
        code: 'internal.figma_token_lookup_failed',
        userMessage: 'Unable to resolve Figma token from the database.',
        recoverable: false,
        requestId,
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }
  if (!figmaToken) {
    return failJson(c, 400, {
      code: 'validation.figma_token_required',
      userMessage: 'figmaToken is required in request body.',
      recoverable: true,
      context: { field: 'figmaToken' },
      requestId,
    });
  }

  if (!componentRepo) {
    return failJson(c, 500, {
      code: 'internal.sync_dependencies_missing',
      userMessage: 'Sync dependencies are not initialized.',
      recoverable: false,
      requestId,
    });
  }

  const resolvedFileKey = resolveFileKeyForSystem(sysCtx.figmaFileId, { figmaUrl });
  if (!resolvedFileKey) {
    return failJson(c, 400, {
      code: 'validation.figma_file_key_missing',
      userMessage:
        'Missing Figma file key. Configure figmaFileId on the system or pass a valid Figma file URL.',
      recoverable: true,
      requestId,
    });
  }

  const manager = getPluginConnectionManager();
  const hasUsableSocket =
    typeof hasPluginSocketForFile === 'function'
      ? hasPluginSocketForFile(resolvedFileKey)
      : hasUsablePluginSocketForFile(manager, resolvedFileKey);
  if (!hasUsableSocket) {
    return failJson(c, 409, {
      code: 'sync.no_plugin_socket_for_file',
      userMessage: buildNoPluginSocketForFileMessage(resolvedFileKey),
      recoverable: true,
      requestId,
      context: { figmaFileId: resolvedFileKey },
    });
  }

  let fileVersion = '';
  let versionLookupDurationMs = 0;
  try {
    const fileVersionHint = toTrimmedString(body.fileVersionHint);
    const knownRecentVersion = getFreshCachedFigmaFileVersion({
      fileKey: resolvedFileKey,
    });
    fileVersion =
      fileVersionHint && knownRecentVersion && fileVersionHint === knownRecentVersion
        ? fileVersionHint
        : '';
    if (!fileVersion) {
      const versionResult = await resolveFigmaFileVersionFn({
        fileKey: resolvedFileKey,
        figmaToken,
      });
      fileVersion = versionResult.fileVersion;
      versionLookupDurationMs = versionResult.durationMs;
      setFigmaFileVersionCache({
        fileKey: resolvedFileKey,
        fileVersion,
      });
    }
  } catch (error) {
    return c.json(
      {
        ok: false,
        error: 'figma_fetch_failed',
        details: error instanceof Error ? error.message : String(error),
        requestId,
      },
      422,
    );
  }

  const inflightKey = buildSyncDiffDryRunInflightKey({
    systemId: sysCtx.systemId,
    fileKey: resolvedFileKey,
    fileVersion,
  });
  const cachedSnapshot = getCachedSyncDiffPreviewResult(inflightKey);
  if (cachedSnapshot?.ok) {
    return c.json(
      {
        ok: true,
        requestId,
        diff: cachedSnapshot.diff,
        _debug: {
          pathUsed: cachedSnapshot.pathUsed,
          fileVersion: cachedSnapshot.fileVersion,
          componentsDurationMs: cachedSnapshot.componentsDurationMs,
          versionLookupDurationMs,
          cacheHit: true,
        },
      },
      200,
    );
  }
  let inflightSnapshot = syncDiffDryRunInflightByKey.get(inflightKey);
  if (!inflightSnapshot) {
    inflightSnapshot = buildSyncDiffSnapshot({
      systemId: sysCtx.systemId,
      repoRoot: sysCtx.repoRoot,
      figmaUrl,
      figmaFileId: resolvedFileKey,
      fileVersion,
      figmaToken,
      componentRepo,
      runCaptureFromFigmaUrlFn,
      searchComponentsDirectFn,
      disableLeanRestPath,
      requirePluginFastPath: true,
    });
    syncDiffDryRunInflightByKey.set(inflightKey, inflightSnapshot);
  }

  let snapshotResult: SyncDiffDryRunResult;
  try {
    snapshotResult = await inflightSnapshot;
  } finally {
    if (syncDiffDryRunInflightByKey.get(inflightKey) === inflightSnapshot) {
      syncDiffDryRunInflightByKey.delete(inflightKey);
    }
  }

  if (!snapshotResult.ok) {
    // Errors are intentionally NOT cached — transient failures (Figma 503,
    // network hiccup) should not poison preview cache entries.
    return c.json(
      {
        ok: false,
        error: 'figma_fetch_failed',
        details: snapshotResult.error,
        requestId,
      },
      422,
    );
  }

  setCachedSyncDiffPreviewResult(inflightKey, sysCtx.systemId, snapshotResult);
  return c.json(
    {
      ok: true,
      requestId,
      diff: snapshotResult.diff,
      _debug: {
        pathUsed: snapshotResult.pathUsed,
        fileVersion: snapshotResult.fileVersion,
        componentsDurationMs: snapshotResult.componentsDurationMs,
        versionLookupDurationMs,
        cacheHit: false,
      },
    },
    200,
  );
}

export async function handleSyncDesignSystemVariablesDryRunRoute(
  c: Context,
  deps: CommandRouteHandlerDeps,
): Promise<Response> {
  const {
    failJson,
    createApiRequestId,
    getSystemContext,
    readJsonBody,
    componentRepo,
    db,
    hasPluginSocketForFile,
    syncDesignSystemFromPluginFn = syncDesignSystemFromPlugin,
    resolveFigmaFileVersionFn = resolveFigmaFileVersion,
  } = deps;

  const requestId = createApiRequestId();
  const systemHeader = c.req.param('systemId') ?? c.req.header('x-ds-system') ?? '';
  const sysCtx = await getSystemContext(systemHeader);
  const body = await readJsonBody(c);
  const rawFigmaUrl = toTrimmedString(body.figmaUrl ?? body.url);
  const figmaUrl = stripNodeIdFromFigmaUrl(
    rawFigmaUrl ||
    (sysCtx.figmaFileId
      ? `https://www.figma.com/design/${encodeURIComponent(sysCtx.figmaFileId)}`
      : ''),
  );
  if (!figmaUrl) {
    return failJson(c, 400, {
      code: 'validation.figma_url_required',
      userMessage: 'figmaUrl is required in request body.',
      recoverable: true,
      context: { field: 'figmaUrl' },
      requestId,
    });
  }

  if (!componentRepo || !db) {
    return failJson(c, 500, {
      code: 'internal.sync_dependencies_missing',
      userMessage: 'Sync dependencies are not initialized.',
      recoverable: false,
      requestId,
    });
  }

  const figmaFileId = resolveFileKeyForSystem(sysCtx.figmaFileId, body) ||
    sysCtx.figmaFileId ||
    '';
  if (!figmaFileId) {
    return failJson(c, 400, {
      code: 'validation.figma_file_key_missing',
      userMessage:
        'Missing Figma file key. Configure figmaFileId on the system or pass a valid Figma file URL.',
      recoverable: true,
      requestId,
    });
  }

  const manager = getPluginConnectionManager();
  const hasUsableSocket =
    typeof hasPluginSocketForFile === 'function'
      ? hasPluginSocketForFile(figmaFileId)
      : hasUsablePluginSocketForFile(manager, figmaFileId);
  if (!hasUsableSocket) {
    return failJson(c, 409, {
      code: 'sync.no_plugin_socket_for_file',
      userMessage: buildNoPluginSocketForFileMessage(figmaFileId),
      recoverable: true,
      requestId,
      context: { figmaFileId },
    });
  }

  let figmaToken = toTrimmedString(body.figmaToken ?? body.figma_token);
  if (!figmaToken) {
    try {
      figmaToken = await resolveSyncDesignSystemFigmaToken({
        db,
        systemId: sysCtx.systemId,
        figmaToken: figmaToken,
      });
    } catch (error) {
      return failJson(c, 500, {
        code: 'internal.figma_token_lookup_failed',
        userMessage: 'Unable to resolve Figma token from the database.',
        recoverable: false,
        requestId,
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }
  if (!figmaToken) {
    return failJson(c, 400, {
      code: 'validation.figma_token_required',
      userMessage: 'figmaToken is required in request body.',
      recoverable: true,
      context: { field: 'figmaToken' },
      requestId,
    });
  }

  const fileVersionHint = toTrimmedString(body.fileVersion);
  const knownRecentVersion = getFreshCachedFigmaFileVersion({
    fileKey: figmaFileId,
  });
  let fileVersion =
    fileVersionHint && knownRecentVersion && fileVersionHint === knownRecentVersion
      ? fileVersionHint
      : '';
  try {
    if (!fileVersion) {
      const versionResult = await resolveFigmaFileVersionFn({
        fileKey: figmaFileId,
        figmaToken,
      });
      fileVersion = versionResult.fileVersion;
      setFigmaFileVersionCache({
        fileKey: figmaFileId,
        fileVersion,
      });
    }
  } catch (error) {
    return c.json(
      {
        ok: false,
        error: 'figma_fetch_failed',
        details: error instanceof Error ? error.message : String(error),
        requestId,
      },
      422,
    );
  }

  const inflightKey = buildSyncVariablesDryRunInflightKey({
    systemId: sysCtx.systemId,
    fileKey: figmaFileId,
    fileVersion,
  });

  const cachedVariables = getCachedSyncVariablesPreviewResult(inflightKey);
  if (cachedVariables) {
    return c.json(
      {
        ...cachedVariables,
        requestId,
        _debug: {
          ...(cachedVariables._debug || {}),
          fileVersion,
          cacheHit: true,
        },
      },
      200,
    );
  }

  let inflightVariables = syncVariablesDryRunInflightByKey.get(inflightKey);
  if (!inflightVariables) {
    inflightVariables = (async () => {
      try {
        const startedAt = Date.now();
        const result = await syncDesignSystemFromPluginFn({
          db,
          componentRepo,
          dsId: sysCtx.systemId,
          figmaFileId,
          fetchVariables: buildFreshVariablesFetchFn(figmaFileId),
          dryRun: true,
          includeComponents: false,
          selectedComponentNodeIds: undefined,
          requireComponentProofs: false,
          requireVariantProofsWhenPresent: false,
          captureComponentProofs: false,
          captureComponentProofVariants: false,
          repoRoot: sysCtx.repoRoot,
          reindexUsageFromFilesystem: false,
          usageReindexStrict: true,
        });
        recordFreshVariablesFetch(figmaFileId);

        const variablesWarnings =
          result.usageReindexReason === 'no_sources' ? [] : result.usageReindexWarnings;
        const summary = summarizeVariablesStep({
          ...result,
          ok: true,
          warnings: variablesWarnings,
          componentsTruncated: result.componentsTruncated,
        });

        return {
          ok: true as const,
          summary: {
            ...summary,
            _debug: {
              fileVersion,
              durationMs: Math.max(0, Date.now() - startedAt),
            },
          },
        };
      } catch (error) {
        return {
          ok: false as const,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    })();
    syncVariablesDryRunInflightByKey.set(inflightKey, inflightVariables);
  }

  let variablesResult:
    | {
        ok: true;
        summary: ReturnType<typeof summarizeVariablesStep> & {
          _debug?: SyncVariablesDryRunDebug;
        };
      }
    | {
        ok: false;
        error: string;
      };
  try {
    variablesResult = await inflightVariables;
  } finally {
    if (syncVariablesDryRunInflightByKey.get(inflightKey) === inflightVariables) {
      syncVariablesDryRunInflightByKey.delete(inflightKey);
    }
  }

  if (!variablesResult.ok) {
    // Errors are intentionally NOT cached — transient failures (plugin disconnect,
    // network hiccup) should not poison the cache for the full TTL.
    return c.json(
      {
        ok: false,
        error: 'figma_fetch_failed',
        details: variablesResult.error,
        requestId,
      },
      422,
    );
  }

  setCachedSyncVariablesPreviewResult(inflightKey, sysCtx.systemId, variablesResult.summary);
  return c.json(
    {
      ...variablesResult.summary,
      requestId,
      _debug: {
        ...(variablesResult.summary._debug || {}),
        fileVersion,
        cacheHit: false,
      },
    },
    200,
  );
}

export async function handleSyncDesignSystemApplyRoute(
  c: Context,
  deps: CommandRouteHandlerDeps,
): Promise<Response> {
  const {
    failJson,
    createApiRequestId,
    getSystemContext,
    readJsonBody,
    componentRepo,
    designSystemRepository,
    db,
    runCaptureFromFigmaUrlFn,
    searchComponentsDirectFn = searchComponentsDirect,
    disableLeanRestPath = false,
    enqueueQueueJob,
    sha256Text,
    hasPluginSocketForFile,
    syncDesignSystemFromPluginFn = syncDesignSystemFromPlugin,
  } = deps;

  const requestId = createApiRequestId();
  const systemHeader = c.req.param('systemId') ?? c.req.header('x-ds-system') ?? '';
  const sysCtx = await getSystemContext(systemHeader);
  const body = await readJsonBody(c);
  const rawFigmaUrl = toTrimmedString(body.figmaUrl ?? body.url);
  const figmaUrl = stripNodeIdFromFigmaUrl(
    rawFigmaUrl ||
    (sysCtx.figmaFileId
      ? `https://www.figma.com/design/${encodeURIComponent(sysCtx.figmaFileId)}`
      : ''),
  );
  if (!figmaUrl) {
    return failJson(c, 400, {
      code: 'validation.figma_url_required',
      userMessage: 'figmaUrl is required in request body.',
      recoverable: true,
      context: { field: 'figmaUrl' },
      requestId,
    });
  }

  let figmaToken = toTrimmedString(body.figmaToken ?? body.figma_token);
  if (!figmaToken) {
    try {
      figmaToken = await resolveSyncDesignSystemFigmaToken({
        db,
        systemId: sysCtx.systemId,
        figmaToken: figmaToken,
      });
    } catch (error) {
      return failJson(c, 500, {
        code: 'internal.figma_token_lookup_failed',
        userMessage: 'Unable to resolve Figma token from the database.',
        recoverable: false,
        requestId,
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }
  if (!figmaToken) {
    return failJson(c, 400, {
      code: 'validation.figma_token_required',
      userMessage: 'figmaToken is required in request body.',
      recoverable: true,
      context: { field: 'figmaToken' },
      requestId,
    });
  }

  if (!componentRepo || !db) {
    return failJson(c, 500, {
      code: 'internal.sync_dependencies_missing',
      userMessage: 'Sync dependencies are not initialized.',
      recoverable: false,
      requestId,
    });
  }

  // Fire slug read immediately — it's a pure SELECT that doesn't depend on
  // the snapshot result. Runs in parallel with the persist + snapshot fetch.
  const usedSlugsPromise = componentRepo.getExistingSlugs(sysCtx.systemId);

  const startedAt = new Date().toISOString();
  await persistDesignSystemSyncJobState(db, {
    jobId: requestId,
    systemId: sysCtx.systemId,
    operationName: 'sync:design-system:apply',
    label: 'sync design system apply',
    status: 'running',
    requestId,
    startedAt,
  }).catch((error) => {
    console.warn(
      '[handleSyncDesignSystemApplyRoute] Failed to persist running sync job state:',
      error instanceof Error ? error.message : String(error),
    );
  });

  // If the client already ran a preview dry-run, it knows the Figma file
  // version. Pass it here so buildSyncDiffSnapshot can hit the in-process
  // component snapshot cache directly instead of re-fetching the full file.
  const previewFileVersion = toTrimmedString(body.previewFileVersion) || undefined;

  const resolvedApplyFileKey = resolveFileKeyForSystem(sysCtx.figmaFileId, { figmaUrl });
  const applyInflightKey = buildSyncDiffDryRunInflightKey({
    systemId: sysCtx.systemId,
    fileKey: resolvedApplyFileKey || '',
    // Include previewFileVersion so concurrent applies with different preview
    // snapshots don't share the same inflight promise.
    fileVersion: previewFileVersion || '',
  });
  let applyInflightSnapshot = syncDiffApplyInflightByKey.get(applyInflightKey);
  if (!applyInflightSnapshot) {
    applyInflightSnapshot = buildSyncDiffSnapshot({
      systemId: sysCtx.systemId,
      repoRoot: sysCtx.repoRoot,
      figmaUrl,
      figmaFileId: sysCtx.figmaFileId,
      fileVersion: previewFileVersion,
      figmaToken,
      componentRepo,
      runCaptureFromFigmaUrlFn,
      searchComponentsDirectFn,
      disableLeanRestPath,
    });
    syncDiffApplyInflightByKey.set(applyInflightKey, applyInflightSnapshot);
  }

  let snapshotResult:
    | {
        ok: true;
        sourceCandidates: Array<Record<string, unknown>>;
        diff: ReturnType<typeof diffFigmaVsDb>;
      }
    | {
        ok: false;
        error: string;
      };
  try {
    snapshotResult = await applyInflightSnapshot;
  } finally {
    if (
      syncDiffApplyInflightByKey.get(applyInflightKey) === applyInflightSnapshot
    ) {
      syncDiffApplyInflightByKey.delete(applyInflightKey);
    }
  }

  if (!snapshotResult.ok) {
    usedSlugsPromise.catch(() => undefined); // suppress dangling rejection
    const finishedAt = new Date().toISOString();
    await persistDesignSystemSyncJobState(db, {
      jobId: requestId,
      systemId: sysCtx.systemId,
      operationName: 'sync:design-system:apply',
      label: 'sync design system apply',
      status: 'error',
      requestId,
      startedAt,
      finishedAt,
      result: {
        ok: false,
        error: 'figma_fetch_failed',
        details: snapshotResult.error,
      },
    }).catch((error) => {
      console.warn(
        '[handleSyncDesignSystemApplyRoute] Failed to persist failed sync job state:',
        error instanceof Error ? error.message : String(error),
      );
    });
    return c.json(
      {
        ok: false,
        error: 'figma_fetch_failed',
        details: snapshotResult.error,
        requestId,
      },
      422,
    );
  }

  // usedSlugsPromise was fired in parallel with the snapshot — just collect it
  const usedSlugs = new Set(await usedSlugsPromise);

  const rawSelected = body.selectedComponentNodeIds;
  const hasSelectionParam = Array.isArray(rawSelected);
  const selectedComponentNodeIds = hasSelectionParam
    ? (rawSelected as unknown[]).filter(
        (id): id is string => typeof id === 'string' && id.trim().length > 0,
      )
    : undefined;

  if (hasSelectionParam && selectedComponentNodeIds.length === 0) {
    const finishedAt = new Date().toISOString();
    const summary = {
      created: 0,
      updated: 0,
      unchanged: snapshotResult.diff.unchanged.length,
      missing: snapshotResult.diff.missing_in_figma.length,
      upserted: 0,
      markedMissing: 0,
    };
    await persistDesignSystemSyncJobState(db, {
      jobId: requestId,
      systemId: sysCtx.systemId,
      operationName: 'sync:design-system:apply',
      label: 'sync design system apply',
      status: 'success',
      requestId,
      startedAt,
      finishedAt,
      result: {
        ok: true,
        summary,
      },
    }).catch((error) => {
      console.warn(
        '[handleSyncDesignSystemApplyRoute] Failed to persist completed sync job state (empty selection):',
        error instanceof Error ? error.message : String(error),
      );
    });
    return c.json(
      {
        ok: true,
        summary,
        requestId,
      },
      200,
    );
  }

  const selectedNodeSet = hasSelectionParam
    ? new Set(selectedComponentNodeIds)
    : null;

  const createdEntries: Array<import('../db/component-repository.js').ComponentCatalogEntry> = [];
  const updatedEntries: Array<import('../db/component-repository.js').ComponentCatalogEntry> = [];
  const seenDbComponentIds = new Set<number>();
  const figmaSourceUrl =
    figmaUrl || `https://www.figma.com/design/${encodeURIComponent(sysCtx.figmaFileId || '')}`;

  for (const entry of snapshotResult.diff.new_in_figma) {
    if (selectedNodeSet && !selectedNodeSet.has(entry.nodeId)) continue;
    const slug = allocateComponentSlug(
      slugifyComponentName(entry.name),
      usedSlugs,
    );
    createdEntries.push({
      slug,
      name: entry.name,
      status: 'draft',
      docType: 'component',
      figmaNodeId: entry.nodeId,
      contentFingerprint: entry.contentFingerprint,
      figma: {
        fileUrl: figmaSourceUrl,
        componentSetNodeId: entry.nodeId,
        pageName: entry.pageName,
      },
    });
  }

  for (const entry of snapshotResult.diff.updated_in_figma) {
    if (selectedNodeSet && !selectedNodeSet.has(entry.figma.nodeId)) continue;
    if (seenDbComponentIds.has(entry.db.id)) continue;
    seenDbComponentIds.add(entry.db.id);
    updatedEntries.push({
      slug: resolveExistingComponentSlug({
        currentSlug: entry.db.slug,
        fallbackName: entry.figma.name,
        usedSlugs,
      }),
      name: entry.figma.name,
      status: (entry.db.status === 'missing' ? 'draft' : entry.db.status) as
        | 'draft'
        | 'ready'
        | 'needs-review'
        | 'missing',
      docType: 'component',
      figmaNodeId: entry.figma.nodeId,
      contentFingerprint: entry.figma.contentFingerprint,
      figma: {
        fileUrl: figmaSourceUrl,
        componentSetNodeId: entry.figma.nodeId,
        pageName: entry.figma.pageName,
      },
    });
  }

  for (const entry of snapshotResult.diff.unchanged) {
    if (seenDbComponentIds.has(entry.db.id)) continue;
    seenDbComponentIds.add(entry.db.id);
    const needsRelink = String(entry.db.nodeId || '').trim() !== String(entry.figma.nodeId || '').trim();
    const needsBootstrap = !String(entry.db.contentFingerprint || '').trim();
    if (entry.db.status !== 'missing' && !needsRelink && !needsBootstrap) continue;
    updatedEntries.push({
      slug: resolveExistingComponentSlug({
        currentSlug: entry.db.slug,
        fallbackName: entry.figma.name,
        usedSlugs,
      }),
      name: entry.figma.name,
      status: (entry.db.status === 'missing' ? 'draft' : entry.db.status) as
        | 'draft'
        | 'ready'
        | 'needs-review'
        | 'missing',
      docType: 'component',
      figmaNodeId: entry.figma.nodeId,
      contentFingerprint: entry.figma.contentFingerprint,
      figma: {
        fileUrl: figmaSourceUrl,
        componentSetNodeId: entry.figma.nodeId,
        pageName: entry.figma.pageName,
      },
    });
  }

  const upsertEntries = [...createdEntries, ...updatedEntries];
  // Compute missingNodeIds before the parallel DB writes — it's a pure map/filter.
  const missingNodeIds = snapshotResult.sourceCandidates
    .map((candidate) =>
      toTrimmedString(candidate.node_id ?? candidate.nodeId ?? candidate.nodeID),
    )
    .filter((nodeId) => nodeId.length > 0);

  let upserted = 0;
  let markedMissing = 0;
  try {
    // upsertFromRegistry and markMissingComponents are independent:
    // upsert writes the selected components (in Figma); markMissing marks
    // components NOT in Figma as missing. No ordering dependency.
    [upserted, markedMissing] = await Promise.all([
      upsertEntries.length > 0
        ? componentRepo.upsertFromRegistry(sysCtx.systemId, upsertEntries)
        : Promise.resolve(0),
      componentRepo.markMissingComponents(sysCtx.systemId, missingNodeIds),
    ]);

    const finishedAt = new Date().toISOString();
    const summary = {
      created: createdEntries.length,
      updated: updatedEntries.length,
      unchanged: snapshotResult.diff.unchanged.length,
      missing: snapshotResult.diff.missing_in_figma.length,
      upserted,
      markedMissing,
    };
    await persistDesignSystemSyncJobState(db, {
      jobId: requestId,
      systemId: sysCtx.systemId,
      operationName: 'sync:design-system:apply',
      label: 'sync design system apply',
      status: 'success',
      requestId,
      startedAt,
      finishedAt,
      result: {
        ok: true,
        summary,
      },
    }).catch((error) => {
      console.warn(
        '[handleSyncDesignSystemApplyRoute] Failed to persist finished sync job state:',
        error instanceof Error ? error.message : String(error),
      );
    });

    // Await coverage refresh so the HTTP response reflects the updated
    // denormalized counters — the frontend re-fetches design-systems config
    // immediately after receiving this response, so the DB must be up to date.
    await refreshDesignSystemImportCoverage({
      designSystemRepository,
      componentRepo,
      systemId: sysCtx.systemId,
      sourceCandidates: snapshotResult.sourceCandidates,
    }).catch((error) => {
      console.warn(
        '[handleSyncDesignSystemApplyRoute] Failed to refresh design system import coverage:',
        error instanceof Error ? error.message : String(error),
      );
    });

    // After the apply upsert, enrich newly imported components with the same
    // data written during a first-time import: structured Figma data (token
    // bindings, props, layout, variants, instance dependencies) + screenshots.
    //
    // When the Figma plugin is connected we run syncDesignSystemFromPlugin
    // scoped to the upserted nodeIds — identical pipeline to the /new import.
    // If the plugin is offline we do not enqueue any enrichment job; the
    // component keeps its basic metadata until a later sync can capture it.
    const upsertedNodeIds = upsertEntries
      .map((e) => toTrimmedString(e.figmaNodeId))
      .filter((id) => id.length > 0);

    if (upsertedNodeIds.length > 0 && componentRepo && db) {
      const resolvedFigmaFileId =
        resolveFileKeyForSystem(sysCtx.figmaFileId, { figmaUrl: figmaSourceUrl }) ||
        sysCtx.figmaFileId ||
        '';

      const canUsePlugin = resolvedFigmaFileId
        ? (typeof hasPluginSocketForFile === 'function'
            ? hasPluginSocketForFile(resolvedFigmaFileId)
            : hasUsablePluginSocketForFile(getPluginConnectionManager(), resolvedFigmaFileId))
        : false;

      if (canUsePlugin) {
        // Plugin path: full enrichment — structured data + screenshots, exact parity with /new import.
        const _enrichDb = db;
        const _enrichRepo = componentRepo;
        try {
          enqueueQueueJob({
            label: `sync figma components post-apply (${upsertedNodeIds.length})`,
            systemId: sysCtx.systemId,
            operationName: 'sync:figma-db:components-apply',
            requestId: createApiRequestId(),
            inputHash: sha256Text(
              JSON.stringify({
                systemId: sysCtx.systemId,
                figmaFileId: resolvedFigmaFileId,
                selectedNodeIds: [...upsertedNodeIds].sort(),
              }),
            ),
            execute: async ({
              emitChunk,
            }: {
              emitChunk: (kind: string, message: string) => void;
            }) => {
              emitChunk(
                'system',
                `Enriching ${upsertedNodeIds.length} component(s) from Figma plugin (post-apply)...`,
              );
              await syncDesignSystemFromPluginFn({
                db: _enrichDb,
                componentRepo: _enrichRepo,
                dsId: sysCtx.systemId,
                figmaFileId: resolvedFigmaFileId,
                dryRun: false,
                includeComponents: true,
                selectedComponentNodeIds: upsertedNodeIds,
                requireComponentProofs: false,
                requireVariantProofsWhenPresent: false,
                captureComponentProofs: true,
                captureComponentProofVariants: true,
                repoRoot: sysCtx.repoRoot,
                reindexUsageFromFilesystem: false,
                usageReindexStrict: true,
              });
              emitChunk(
                'result',
                `Component enrichment complete for ${upsertedNodeIds.length} component(s).`,
              );
            },
          });
        } catch (error) {
          console.warn(
            '[handleSyncDesignSystemApplyRoute] Failed to enqueue component enrichment job:',
            error instanceof Error ? error.message : String(error),
          );
        }
      }
    }

    clearSyncDiffPreviewCacheForSystem(sysCtx.systemId);
    clearSyncVariablesPreviewCacheForSystem(sysCtx.systemId);

    return c.json(
      {
        ok: true,
        requestId,
        summary,
      },
      200,
    );
  } catch (error) {
    const finishedAt = new Date().toISOString();
    const message = error instanceof Error ? error.message : String(error);
    await persistDesignSystemSyncJobState(db, {
      jobId: requestId,
      systemId: sysCtx.systemId,
      operationName: 'sync:design-system:apply',
      label: 'sync design system apply',
      status: 'error',
      requestId,
      startedAt,
      finishedAt,
      result: {
        ok: false,
        error: 'sync_apply_failed',
        details: message,
        upserted,
      },
    }).catch((persistError) => {
      console.warn(
        '[handleSyncDesignSystemApplyRoute] Failed to persist failed sync job state:',
        persistError instanceof Error ? persistError.message : String(persistError),
      );
    });

    return c.json(
      {
        ok: false,
        error: 'sync_apply_failed',
        details: message,
        requestId,
      },
      500,
    );
  }
}

export async function handleSyncDesignSystemStepRoute(
  c: Context,
  deps: CommandRouteHandlerDeps,
): Promise<Response> {
  const {
    failJson,
    createApiRequestId,
    getSystemContext,
    databaseUrl,
    readJsonBody,
    toBooleanString,
    toNumberString,
    enqueueQueueJob,
    sha256Text,
    runQueuedSpawnCommand,
    componentRepo,
    designSystemRepository,
    db,
    syncDesignSystemFromPluginFn = syncDesignSystemFromPlugin,
    queueJobAcceptedPayload,
  } = deps;

  const requestId = createApiRequestId();
  const sysCtx = await getSystemContext(c.req.header('x-ds-system') ?? '');
  const body = await readJsonBody(c);
  const step = String(c.req.param('step') || '').trim().toLowerCase();

  if (step !== 'components' && step !== 'variables' && step !== 'tokens') {
    return failJson(c, 400, {
      code: 'validation.invalid_sync_step',
      userMessage: `Unsupported sync step "${step}".`,
      recoverable: true,
      context: { step },
      requestId,
    });
  }

  if ((step === 'variables' || step === 'tokens') && !db) {
    return failJson(c, 500, {
      code: 'internal.sync_dependencies_missing',
      userMessage: 'Sync dependencies are not initialized.',
      recoverable: false,
      requestId,
    });
  }

  if (step !== 'tokens' && !componentRepo) {
    return failJson(c, 500, {
      code: 'internal.sync_dependencies_missing',
      userMessage: 'Sync dependencies are not initialized.',
      recoverable: false,
      requestId,
    });
  }

  const rawFigmaUrl = toTrimmedString(body.figmaUrl ?? body.url);
  const fallbackFigmaUrl = sysCtx.figmaFileId
    ? `https://www.figma.com/design/${encodeURIComponent(sysCtx.figmaFileId)}`
    : '';
  const figmaUrl = rawFigmaUrl || fallbackFigmaUrl;
  if (!figmaUrl && step !== 'tokens') {
    return failJson(c, 400, {
      code: 'validation.figma_url_required',
      userMessage: 'figmaUrl is required in request body.',
      recoverable: true,
      context: { field: 'figmaUrl' },
      requestId,
    });
  }

  const figmaToken = toTrimmedString(body.figmaToken ?? body.figma_token);
  const dryRun = toBooleanString(body.dryRun, false) === 'true';
  let resolveSyncJobId!: (jobId: string) => void;
  const syncJobIdPromise = new Promise<string>((resolve) => {
    resolveSyncJobId = resolve;
  });
  const figmaFileId = resolveFileKeyForSystem(sysCtx.figmaFileId, body) ||
    sysCtx.figmaFileId ||
    '';

  const job = enqueueQueueJob({
    label: `sync design system step (${step})`,
    systemId: sysCtx.systemId,
    operationName: `sync:design-system:${step}`,
    priority: step === 'tokens' ? 'high' : 'normal',
    requestId,
    inputHash: sha256Text(
      JSON.stringify({
        systemId: sysCtx.systemId,
        figmaUrl,
        figmaFileId,
        dryRun,
        figmaToken: Boolean(figmaToken),
        step,
      }),
    ),
    execute: async ({
      emitChunk,
      setProcess,
      isCancelled,
    }: {
      emitChunk: (kind: string, message: string) => void;
      setProcess: (process: unknown) => void;
      isCancelled?: () => boolean;
    }) => {
      const syncJobId = await syncJobIdPromise;
      const startedAt = new Date().toISOString();
      const persistCancelledSyncJobState = (summary: string) => {
        void persistDesignSystemSyncJobState(db, {
          jobId: syncJobId,
          systemId: sysCtx.systemId,
          operationName: `sync:design-system:${step}`,
          label: `sync design system step (${step})`,
          status: 'cancelled',
          requestId,
          startedAt,
          finishedAt: new Date().toISOString(),
          result: {
            ok: false,
            code: 1,
            summary,
            payload: {
              status: 'failed',
              summary,
              warnings: [summary],
            },
          },
        }).catch((error) => {
          console.warn(
            '[handleSyncDesignSystemStepRoute] Failed to persist cancelled sync job state:',
            error instanceof Error ? error.message : String(error),
          );
        });
      };
      const cancelledResult = (summary: string) => ({
        ok: false,
        code: 1,
        summary,
        payload: {
          status: 'failed',
          summary,
          warnings: [summary],
        },
      });
      const checkCancelled = () => {
        if (typeof isCancelled !== 'function' || !isCancelled()) return false;
        emitChunk('warning', 'Sync cancelled by user.');
        persistCancelledSyncJobState('Sync cancelled by user.');
        return true;
      };
      // Fire-and-forget: recording 'running' is best-effort — we don't want
      // a slow DB write to delay the actual step work by 5-50 ms.
      void persistDesignSystemSyncJobState(db, {
        jobId: syncJobId,
        systemId: sysCtx.systemId,
        operationName: `sync:design-system:${step}`,
        label: `sync design system step (${step})`,
        status: 'running',
        requestId,
        startedAt,
      }).catch((error) => {
        console.warn(
          '[handleSyncDesignSystemStepRoute] Failed to persist running sync job state:',
          error instanceof Error ? error.message : String(error),
        );
      });
      if (step === 'components') {
        if (checkCancelled()) return cancelledResult('Components step cancelled.');
        const stepStartedAt = Date.now();
        emitChunk('system', 'Rerunning component sync...');
        const captureConfig = buildCaptureFigmaScreenshotCommandConfig({
          body: {
            figmaUrl,
            figmaToken,
            includeVariants: false,
            continueOnError: true,
            dryRun: false,
            variantLimit: 6,
            scale: 2,
            format: 'png',
            mainCaptureMode: 'rest',
            componentKind: 'all',
            tokensSource: 'mcp',
          },
          toBooleanString,
          toNumberString,
        });
        if (!captureConfig.ok) {
          const result = {
            ok: false,
            code: 1,
            summary: captureConfig.errorArgs.userMessage,
            payload: {
              ok: false,
              status: 'failed',
              summary: captureConfig.errorArgs.userMessage,
              warnings: [captureConfig.errorArgs.userMessage],
              counts: { captured: 0, failed: 0, skipped: 0, targets: 0 },
            },
          };
          void persistDesignSystemSyncJobState(db, {
            jobId: syncJobId,
            systemId: sysCtx.systemId,
            operationName: `sync:design-system:${step}`,
            label: `sync design system step (${step})`,
            status: 'error',
            requestId,
            startedAt,
            finishedAt: new Date().toISOString(),
            result,
          }).catch((error) => {
            console.warn(
              '[handleSyncDesignSystemStepRoute] Failed to persist final sync job state:',
              error instanceof Error ? error.message : String(error),
            );
          });
          return result;
        }

        const commandArgs = buildNodeCommandArgs(
          sysCtx.captureFromFigmaUrlScriptPath,
          [...captureConfig.commandArgs, '--system', sysCtx.systemId],
        );
        const commandResult = await runQueuedSpawnCommand({
          cwd: sysCtx.repoRoot,
          command: 'node',
          commandArgs,
          commandEnv: buildCommandEnv(captureConfig.commandEnv, databaseUrl),
          commandLabel: `node ${commandArgs.join(' ')}`,
          emitChunk,
          registerProcess: setProcess,
          parseJsonStdout: true,
          allowNonZeroJson: true,
        });
      const payload =
          (commandResult as { payload?: unknown }).payload &&
          typeof (commandResult as { payload?: unknown }).payload === 'object'
            ? (commandResult as { payload?: Record<string, unknown> }).payload
            : { ok: commandResult.ok };
        const shouldPersistCapturedPayload =
          commandResult.ok ||
          (Array.isArray(payload.captured) && payload.captured.length > 0);
        if (shouldPersistCapturedPayload) {
          const persisted = await persistCapturePayloadToComponentRepo({
            payload,
            componentRepo,
            systemId: sysCtx.systemId,
            repoRoot: sysCtx.repoRoot,
          });
          if (persisted.upserted > 0) {
            emitChunk(
              'result',
              `Persisted ${persisted.upserted} captured component proof(s) to DB.`,
            );
          }
          if (persisted.skipped > 0) {
            emitChunk(
              'warning',
              `Skipped ${persisted.skipped} captured component proof(s) without a local image path.`,
            );
          }
        }
        const summary = summarizeCapturedStep({
          ...payload,
          ok: commandResult.ok,
          message: (commandResult as { summary?: string }).summary,
          durationMs: Math.max(0, Date.now() - stepStartedAt),
        });
        for (const warning of summary.warnings) {
          emitChunk('warning', warning);
        }
        emitChunk('result', summary.summary);
        if (summary.durationMs !== undefined) {
          emitChunk(
            'result',
            `Components step completed in ${formatDurationMs(summary.durationMs)}.`,
          );
        }
        const result = {
          ok: summary.status !== 'failed',
          code: summary.status === 'failed' ? 1 : 0,
          summary: summary.summary,
          payload: summary,
        };
        void persistDesignSystemSyncJobState(db, {
          jobId: syncJobId,
          systemId: sysCtx.systemId,
          operationName: `sync:design-system:${step}`,
          label: `sync design system step (${step})`,
          status: summary.status === 'failed' ? 'error' : 'success',
          requestId,
          startedAt,
          finishedAt: new Date().toISOString(),
          result,
        }).catch((error) => {
          console.warn(
            '[handleSyncDesignSystemStepRoute] Failed to persist final sync job state:',
            error instanceof Error ? error.message : String(error),
          );
        });
        return result;
      }

      if (step === 'tokens') {
        if (checkCancelled()) return cancelledResult('Tokens step cancelled.');
        const startedAt = Date.now();
        emitChunk('system', 'Generating CSS from token registry...');
        try {
          // Phase 1 — CSS generation + alias fetch in parallel.
          // skipDiskWrite=true so the synchronous fs.writeFileSync calls don't
          // block the event loop here; we do the writes asynchronously in phase 2.
          let cssGenerationMs = 0;
          let aliasFetchMs = 0;
          const [cssResult, aliasRows] = await Promise.all([
            (() => {
              const cssStart = Date.now();
              return generateTokenCssFromDb({
                db: db!,
                dsId: sysCtx.systemId,
                repoRoot: sysCtx.repoRoot,
                skipDiskWrite: true,
              }).then((result) => {
                cssGenerationMs = Math.max(0, Date.now() - cssStart);
                return result;
              });
            })(),
            (() => {
              const aliasStart = Date.now();
              return (db!`
                SELECT from_path, to_path, modes
                FROM figma_aliases
                WHERE ds_id = ${sysCtx.systemId}
              ` as Promise<Array<{ from_path: string; to_path: string; modes: unknown }>>).then(
                (rows) => {
                  aliasFetchMs = Math.max(0, Date.now() - aliasStart);
                  return rows;
                },
              );
            })(),
          ]);
          if (checkCancelled()) return cancelledResult('Tokens step cancelled.');
          emitChunk(
            'result',
            `Generated CSS: ${cssResult.primitivesCount} primitive(s), ${cssResult.tokensCount} token(s) in ${formatDurationMs(cssGenerationMs)} (aliases: ${formatDurationMs(aliasFetchMs)}).`,
          );

          emitChunk('system', 'Indexing token usage from generated CSS...');
          const usageBuildStartedAt = Date.now();

          // Phase 2 — disk writes (async) overlap with the synchronous usage
          // indexing so neither blocks the other.
          const diskWritePromise = flushCssToDisk(cssResult);

          const usageBuild = buildTokenUsageRowsFromFilesystem({
            dsId: sysCtx.systemId,
            repoRoot: sysCtx.repoRoot,
            tokenCatalog: cssResult.tokenCatalog,
            aliases: aliasRows.map((a) => ({
              fromPath: a.from_path,
              toPath: a.to_path,
              modes: Array.isArray(a.modes) ? (a.modes as string[]) : [],
            })),
            cssSources: [
              { file: cssResult.primitivesPath, content: cssResult.primitivesCss },
              { file: cssResult.tokensPath, content: cssResult.tokensCss },
            ],
          });
          if (checkCancelled()) return cancelledResult('Tokens step cancelled.');
          const usageBuildMs = Math.max(0, Date.now() - usageBuildStartedAt);
          emitChunk(
            'result',
            `Built token usage index in ${formatDurationMs(usageBuildMs)}.`,
          );

          // Ensure async disk writes complete before we return success.
          // By this point buildTokenUsageRowsFromFilesystem has already run
          // synchronously, so the write and the CPU work fully overlapped.
          await diskWritePromise;
          if (checkCancelled()) return cancelledResult('Tokens step cancelled.');

          let usagePersistMs = 0;
          if (!usageBuild.noSources) {
            if (checkCancelled()) return cancelledResult('Tokens step cancelled.');
            const usagePersistStartedAt = Date.now();
            await db!.begin(async (tx) => {
              await tx`DELETE FROM token_usage_occurrences WHERE ds_id = ${sysCtx.systemId}`;
              await bulkInsert(tx, {
                table: 'token_usage_occurrences',
                columns: ['ds_id', 'token_id', 'kind', 'source', 'owner', 'detail'],
                rows: usageBuild.rows.map((usage) => [
                  sysCtx.systemId,
                  usage.tokenId,
                  usage.kind,
                  usage.source,
                  usage.owner,
                  usage.detail,
                ]),
                onConflict:
                  'ON CONFLICT (ds_id, token_id, kind, source, owner, detail) DO NOTHING',
              });
            });
            if (checkCancelled()) return cancelledResult('Tokens step cancelled.');
            usagePersistMs = Math.max(0, Date.now() - usagePersistStartedAt);
            emitChunk(
              'result',
              `Indexed ${usageBuild.rows.length} usage occurrence(s) in ${formatDurationMs(usagePersistMs)}.`,
            );
          } else {
            emitChunk('result', 'Token usage indexing skipped (no sources found).');
          }

          const warnings = usageBuild.noSources ? [] : usageBuild.warnings;
          const tokensStatus = warnings.length > 0 ? 'completed_with_warnings' : 'completed';
          const tokensSummary =
            tokensStatus === 'completed_with_warnings'
              ? 'CSS generated with warnings.'
              : 'CSS generated and usage indexed.';
          const totalDurationMs = Math.max(0, Date.now() - startedAt);
          emitChunk('result', `Tokens step completed in ${formatDurationMs(totalDurationMs)}.`);
          const jobResult = {
            ok: true,
            code: 0,
            summary: tokensSummary,
            payload: {
              status: tokensStatus,
              summary: tokensSummary,
              warnings,
              counts: {
                primitives: cssResult.primitivesCount,
                tokens: cssResult.tokensCount,
                usageIndexed: usageBuild.rows.length,
              },
              durationMs: totalDurationMs,
              timingsMs: {
                cssGeneration: cssGenerationMs,
                aliasFetch: aliasFetchMs,
                usageBuild: usageBuildMs,
                usagePersist: usagePersistMs,
              },
            },
          };
          void persistDesignSystemSyncJobState(db, {
            jobId: syncJobId,
            systemId: sysCtx.systemId,
            operationName: 'sync:design-system:tokens',
            label: 'sync design system step (tokens)',
            status: 'success',
            requestId,
            startedAt,
            finishedAt: new Date().toISOString(),
            result: jobResult,
          }).catch((error) => {
            console.warn(
              '[handleSyncDesignSystemStepRoute] Failed to persist tokens step job state:',
              error instanceof Error ? error.message : String(error),
            );
          });
          return jobResult;
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          const durationMs = Math.max(0, Date.now() - startedAt);
          emitChunk('warning', `Token CSS generation failed: ${reason}`);
          emitChunk('result', `Tokens step failed after ${formatDurationMs(durationMs)}.`);
          const jobResult = {
            ok: false,
            code: 1,
            summary: 'Token CSS generation failed.',
            payload: {
              status: 'failed',
              summary: 'Token CSS generation failed.',
              warnings: [reason],
              counts: { primitives: 0, tokens: 0, usageIndexed: 0 },
              durationMs,
              timingsMs: {
                cssGeneration: 0,
                aliasFetch: 0,
                usageBuild: 0,
                usagePersist: 0,
              },
            },
          };
          void persistDesignSystemSyncJobState(db, {
            jobId: syncJobId,
            systemId: sysCtx.systemId,
            operationName: 'sync:design-system:tokens',
            label: 'sync design system step (tokens)',
            status: 'error',
            requestId,
            startedAt,
            finishedAt: new Date().toISOString(),
            result: jobResult,
          }).catch((e) => {
            console.warn(
              '[handleSyncDesignSystemStepRoute] Failed to persist tokens step error state:',
              e instanceof Error ? e.message : String(e),
            );
          });
          return jobResult;
        }
      }

      const stepStartedAt = Date.now();
      try {
        if (checkCancelled()) return cancelledResult('Variables step cancelled.');
        emitChunk('system', 'Rerunning variable sync...');
        const result = await syncDesignSystemFromPluginFn({
          db,
          componentRepo,
          dsId: sysCtx.systemId,
          figmaFileId,
          // Use prewarm if a fresh fetch happened within
          // VARIABLES_PREWARM_WINDOW_MS (e.g. preview ran just before this
          // step was triggered); otherwise falls back to a full
          // cache-invalidating fetch.
          fetchVariables: buildPrewarmedVariablesFetchFn(figmaFileId),
          dryRun,
          includeComponents: false,
          selectedComponentNodeIds: undefined,
          requireComponentProofs: false,
          requireVariantProofsWhenPresent: false,
          captureComponentProofs: false,
          captureComponentProofVariants: false,
          repoRoot: sysCtx.repoRoot,
          reindexUsageFromFilesystem: !dryRun,
          usageReindexStrict: true,
        });
        if (checkCancelled()) return cancelledResult('Variables step cancelled.');
        if (result.usageReindexed > 0) {
          emitChunk(
            'result',
            `Reindexed ${result.usageReindexed} token usage occurrence(s) from current filesystem sources.`,
          );
        }
        // noSources means the tokens step hasn't run yet — skip these warnings
        if (result.usageReindexWarnings.length > 0 && result.usageReindexReason !== 'no_sources') {
          for (const warning of result.usageReindexWarnings) {
            emitChunk('warning', warning);
          }
        }
        if (
          result.usageReindexStatus === 'failed' &&
          result.usageReindexReason !== 'none' &&
          result.usageReindexReason !== 'no_sources'
        ) {
          emitChunk(
            'warning',
            `Token usage reindex status: failed (${result.usageReindexReason}).`,
          );
        }
        const variablesStepWarnings =
          result.usageReindexReason === 'no_sources' ? [] : result.usageReindexWarnings;
        const durationMs = Math.max(0, Date.now() - stepStartedAt);
        const summary = summarizeVariablesStep({
          ...result,
          ok: true,
          warnings: variablesStepWarnings,
          componentsTruncated: result.componentsTruncated,
          durationMs,
        });
        for (const warning of summary.warnings) {
          emitChunk('warning', warning);
        }
        emitChunk('result', summary.summary);
        if (summary.durationMs !== undefined) {
          emitChunk(
            'result',
            `Variables step completed in ${formatDurationMs(summary.durationMs)}.`,
          );
        }
        const jobResult = {
          ok: summary.status !== 'failed',
          code: summary.status === 'failed' ? 1 : 0,
          summary: summary.summary,
          payload: summary,
        };
        void persistDesignSystemSyncJobState(db, {
          jobId: syncJobId,
          systemId: sysCtx.systemId,
          operationName: `sync:design-system:${step}`,
          label: `sync design system step (${step})`,
          status: summary.status === 'failed' ? 'error' : 'success',
          requestId,
          startedAt,
          finishedAt: new Date().toISOString(),
          result: jobResult,
        }).catch((error) => {
          console.warn(
            '[handleSyncDesignSystemStepRoute] Failed to persist final sync job state:',
            error instanceof Error ? error.message : String(error),
          );
        });
        return jobResult;
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        const durationMs = Math.max(0, Date.now() - stepStartedAt);
        emitChunk('warning', `Variables sync failed: ${reason}`);
        emitChunk('result', `Variables sync failed after ${formatDurationMs(durationMs)}.`);
        const jobResult = {
          ok: false,
          code: 1,
          summary: 'Variables sync failed.',
          payload: {
            status: 'failed',
            summary: 'Variables sync failed.',
            warnings: [reason],
            counts: {
              tokens: 0,
              tokenModeValues: 0,
              aliases: 0,
              components: 0,
              usageRestored: 0,
              usageDropped: 0,
            },
            durationMs,
            raw: { ok: false, error: reason, durationMs },
          },
        };
        void persistDesignSystemSyncJobState(db, {
          jobId: syncJobId,
          systemId: sysCtx.systemId,
          operationName: `sync:design-system:${step}`,
          label: `sync design system step (${step})`,
          status: 'error',
          requestId,
          startedAt,
          finishedAt: new Date().toISOString(),
          result: jobResult,
        }).catch((persistError) => {
          console.warn(
            '[handleSyncDesignSystemStepRoute] Failed to persist final sync job state:',
            persistError instanceof Error ? persistError.message : String(persistError),
          );
        });
        return jobResult;
      }
    },
  });

  resolveSyncJobId(job.id);
  void persistDesignSystemSyncJobState(db, {
    jobId: job.id,
    systemId: sysCtx.systemId,
    operationName: `sync:design-system:${step}`,
    label: `sync design system step (${step})`,
    status: 'queued',
    requestId,
  }).catch((error) => {
    console.warn(
      '[handleSyncDesignSystemStepRoute] Failed to persist queued sync job state:',
      error instanceof Error ? error.message : String(error),
    );
  });

  return c.json(queueJobAcceptedPayload(job), 202);
}

export async function handleCaptureFigmaScreenshotRoute(
  c: Context,
  deps: CommandRouteHandlerDeps,
): Promise<Response> {
  const {
    failJson,
    createApiRequestId,
    getSystemContext,
    databaseUrl,
    readJsonBody,
    toBooleanString,
    toNumberString,
    queueNodeJsonCommand,
    queueJobAcceptedPayload,
    componentRepo,
  } = deps;

  const requestId = createApiRequestId();
  const sysCtx = await getSystemContext(c.req.header('x-ds-system') ?? '');
  const body = await readJsonBody(c);

  let parsed;
  try {
    parsed = buildCaptureFigmaScreenshotCommandConfig({
      body,
      toBooleanString,
      toNumberString,
    });
  } catch (error) {
    return failBuildCommandConfig(c, deps, requestId, error);
  }
  if (!parsed.ok) {
    return failJson(c, 400, {
      ...parsed.errorArgs,
      requestId,
    });
  }
  if (!componentRepo) {
    return failJson(c, 500, {
      code: 'internal.component_repo_missing',
      userMessage: 'Component repository is not initialized.',
      recoverable: false,
      requestId,
    });
  }

  const queueArgs = buildCaptureFigmaScreenshotQueueArgs({
    sysCtx,
    requestId,
    parsed,
  });
  const job = queueNodeJsonCommand({
    ...queueArgs,
    onSuccess: async ({
      payload,
      emitChunk,
    }: {
      payload: unknown;
      emitChunk: (kind: string, text: string) => void;
    }) => {
      const persisted = await persistCapturePayloadToComponentRepo({
        payload,
        componentRepo,
        systemId: sysCtx.systemId,
        repoRoot: sysCtx.repoRoot,
      });
      if (persisted.upserted > 0) {
        emitChunk(
          'result',
          `Persisted ${persisted.upserted} captured component proof(s) to DB.`,
        );
      }
      if (persisted.skipped > 0) {
        emitChunk(
          'warning',
          `Skipped ${persisted.skipped} captured component proof(s) without a local image path.`,
        );
      }
    },
  });
  return c.json(queueJobAcceptedPayload(job), 202);
}

export async function handleSyncDesignSystemRoute(
  c: Context,
  deps: CommandRouteHandlerDeps,
): Promise<Response> {
  const {
    failJson,
    createApiRequestId,
    getSystemContext,
    databaseUrl,
    readJsonBody,
    toBooleanString,
    toNumberString,
    enqueueQueueJob,
    sha256Text,
    runQueuedSpawnCommand,
    componentRepo,
    designSystemRepository,
    db,
    syncDesignSystemFromPluginFn = syncDesignSystemFromPlugin,
    queueJobAcceptedPayload,
  } = deps;

  const requestId = createApiRequestId();
  const sysCtx = await getSystemContext(c.req.header('x-ds-system') ?? '');
  const body = await readJsonBody(c);

  if (!db || !componentRepo) {
    return failJson(c, 500, {
      code: 'internal.sync_dependencies_missing',
      userMessage: 'Sync dependencies are not initialized.',
      recoverable: false,
      requestId,
    });
  }

  const rawFigmaUrl = toTrimmedString(body.figmaUrl ?? body.url);
  const fallbackFigmaUrl = sysCtx.figmaFileId
    ? `https://www.figma.com/design/${encodeURIComponent(sysCtx.figmaFileId)}`
    : '';
  const figmaUrl = rawFigmaUrl || fallbackFigmaUrl;
  if (!figmaUrl) {
    return failJson(c, 400, {
      code: 'validation.figma_url_required',
      userMessage: 'figmaUrl is required in request body.',
      recoverable: true,
      context: { field: 'figmaUrl' },
      requestId,
    });
  }

  const figmaToken = toTrimmedString(body.figmaToken ?? body.figma_token);
  const dryRun = toBooleanString(body.dryRun, false) === 'true';
  // When true, skip the component screenshot subprocess entirely.
  // Used by the apply+sync flow: apply already committed component metadata from
  // the preview diff, so re-downloading the full Figma file is redundant.
  const skipComponentCapture = toBooleanString(body.skipComponentCapture, false) === 'true';

  const captureConfig = buildCaptureFigmaScreenshotCommandConfig({
    body: {
      figmaUrl,
      figmaToken,
      includeVariants: false,
      continueOnError: true,
      dryRun: false,
      variantLimit: 6,
      scale: 2,
      format: 'png',
      mainCaptureMode: 'rest',
      componentKind: 'all',
      tokensSource: 'mcp',
    },
    toBooleanString,
    toNumberString,
  });
  if (!captureConfig.ok) {
    return failJson(c, 400, {
      ...captureConfig.errorArgs,
      requestId,
    });
  }

  const componentsCommandArgs = buildNodeCommandArgs(
    sysCtx.captureFromFigmaUrlScriptPath,
    [...captureConfig.commandArgs, '--system', sysCtx.systemId],
  );
  const componentsCommandLabel = `node ${componentsCommandArgs.join(' ')}`;
  const figmaFileId = resolveFileKeyForSystem(sysCtx.figmaFileId, body) ||
    sysCtx.figmaFileId ||
    '';
  let resolveSyncJobId!: (jobId: string) => void;
  const syncJobIdPromise = new Promise<string>((resolve) => {
    resolveSyncJobId = resolve;
  });

  const runComponentsStep = async (
    emitChunk: (kind: string, message: string) => void,
    setProcess: (process: unknown) => void,
  ) => {
    const startedAt = Date.now();
    try {
      emitChunk('system', 'Starting component sync...');
      const commandResult = await runQueuedSpawnCommand({
        cwd: sysCtx.repoRoot,
        command: 'node',
        commandArgs: componentsCommandArgs,
        commandEnv: buildCommandEnv(captureConfig.commandEnv, databaseUrl),
        commandLabel: componentsCommandLabel,
        emitChunk,
        registerProcess: setProcess,
        parseJsonStdout: true,
        allowNonZeroJson: true,
      });
      const rawPayload = (commandResult as { payload?: unknown }).payload;
      const payload =
        rawPayload && typeof rawPayload === 'object'
          ? (rawPayload as Record<string, unknown>)
          : { ok: commandResult.ok };
      if (commandResult.ok) {
        const persisted = await persistCapturePayloadToComponentRepo({
          payload,
          componentRepo,
          systemId: sysCtx.systemId,
          repoRoot: sysCtx.repoRoot,
        });
        if (persisted.upserted > 0) {
          emitChunk(
            'result',
            `Persisted ${persisted.upserted} captured component proof(s) to DB.`,
          );
        }
        if (persisted.skipped > 0) {
          emitChunk(
            'warning',
            `Skipped ${persisted.skipped} captured component proof(s) without a local image path.`,
          );
        }
      }
      const durationMs = Math.max(0, Date.now() - startedAt);
      return summarizeCapturedStep({
        ...payload,
        ok: commandResult.ok,
        message: (commandResult as { summary?: string }).summary,
        durationMs,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const durationMs = Math.max(0, Date.now() - startedAt);
      return {
        status: 'failed' as const,
        summary: 'Components sync failed.',
        warnings: [reason],
        counts: { captured: 0, failed: 0, skipped: 0, targets: 0 },
        durationMs,
        raw: { ok: false, error: reason, durationMs },
      };
    }
  };

  const runVariablesStep = async (emitChunk: (kind: string, message: string) => void) => {
    const startedAt = Date.now();
    try {
      emitChunk('system', 'Fetching variables from Figma plugin...');
      const fetchStart = Date.now();
      const result = await syncDesignSystemFromPluginFn({
        db,
        componentRepo,
        dsId: sysCtx.systemId,
        figmaFileId,
        // Use the pre-warming strategy: if the SyncDiffPreview ran within the
        // last 30 s it already paid the GET_VARIABLES_DATA WebSocket cost and
        // the cache holds the current Figma state — skip re-invalidation.
        // If the cache is cold (first sync, preview > 30 s ago, or no preview),
        // buildPrewarmedVariablesFetchFn falls back to buildFreshVariablesFetchFn
        // which invalidates and re-fetches, preserving the correctness guarantee.
        fetchVariables: buildPrewarmedVariablesFetchFn(figmaFileId),
        dryRun,
        includeComponents: false,
        selectedComponentNodeIds: undefined,
        requireComponentProofs: false,
        requireVariantProofsWhenPresent: false,
        captureComponentProofs: false,
        captureComponentProofVariants: false,
        repoRoot: sysCtx.repoRoot,
        // Skip usage reindex here: the tokens step regenerates CSS from scratch
        // and rewrites token_usage_occurrences anyway.
        reindexUsageFromFilesystem: false,
        usageReindexStrict: true,
      });
      emitChunk(
        'result',
        `Variables fetched and persisted in ${formatDurationMs(Math.max(0, Date.now() - fetchStart))}.`,
      );
      const durationMs = Math.max(0, Date.now() - startedAt);
      emitChunk('result', `Variables sync completed in ${formatDurationMs(durationMs)}.`);
      return summarizeVariablesStep({
        ok: true,
        ...result,
        warnings: result.usageReindexReason === 'no_sources' ? [] : result.usageReindexWarnings,
        componentsTruncated: result.componentsTruncated,
        durationMs,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const durationMs = Math.max(0, Date.now() - startedAt);
      emitChunk('warning', `Variables sync failed: ${reason}`);
      emitChunk('result', `Variables sync failed after ${formatDurationMs(durationMs)}.`);
      return {
        status: 'failed' as const,
        summary: 'Variables sync failed.',
        warnings: [reason],
        counts: {
          tokens: 0,
          tokenModeValues: 0,
          aliases: 0,
          components: 0,
          usageRestored: 0,
          usageDropped: 0,
        },
        durationMs,
        raw: { ok: false, error: reason, durationMs },
      };
    }
  };

  const job = enqueueQueueJob({
    label: 'sync design system (figma→db)',
    systemId: sysCtx.systemId,
    operationName: 'sync:design-system',
    priority: 'high',
    requestId,
    inputHash: sha256Text(
      JSON.stringify({
        systemId: sysCtx.systemId,
        figmaUrl,
        figmaFileId,
        dryRun,
        figmaToken: Boolean(figmaToken),
      }),
    ),
    execute: async ({
      emitChunk,
      setProcess,
    }: {
      emitChunk: (kind: string, message: string) => void;
      setProcess: (process: unknown) => void;
    }) => {
      const syncJobId = await syncJobIdPromise;
      const startedAt = new Date().toISOString();
      await persistDesignSystemSyncJobState(db, {
        jobId: syncJobId,
        systemId: sysCtx.systemId,
        operationName: 'sync:design-system',
        label: 'sync design system (figma→db)',
        status: 'running',
        requestId,
        startedAt,
      }).catch((error) => {
        console.warn(
          '[handleSyncDesignSystemRoute] Failed to persist running sync job state:',
          error instanceof Error ? error.message : String(error),
        );
      });
      // Evict stale preview-cache entries so the next preview request after this
      // sync runs a fresh fetch rather than serving the pre-sync snapshot.
      clearSyncDiffPreviewCacheForSystem(sysCtx.systemId);
      clearSyncVariablesPreviewCacheForSystem(sysCtx.systemId);
      emitChunk('system', `Syncing design system "${sysCtx.systemId}" from Figma...`);
      emitChunk('system', 'Running components and variables in parallel...');

      // When skipComponentCapture is set (apply+sync flow), skip the expensive
      // Figma file download + screenshot subprocess. Component metadata was
      // already committed to the DB by the apply route from the preview snapshot.
      const componentsStepPromise = skipComponentCapture
        ? Promise.resolve({
            status: 'completed' as const,
            summary: 'Component capture skipped — applied from preview diff.',
            warnings: [] as string[],
            counts: { captured: 0, failed: 0, skipped: 0, targets: 0 },
            durationMs: 0,
            raw: { ok: true, skipped: true },
          })
        : runComponentsStep(emitChunk, setProcess);

      const [componentsStep, variablesStep] = await Promise.all([
        componentsStepPromise,
        runVariablesStep(emitChunk),
      ]);

      const overallStatus = resolveOverallSyncStatus({
        components: componentsStep.status,
        variables: variablesStep.status,
      });
      const warnings = [...componentsStep.warnings, ...variablesStep.warnings];

      const summary =
        overallStatus === 'failed'
          ? 'Sync failed.'
          : overallStatus === 'completed_with_warnings'
            ? 'Sync completed with warnings.'
            : 'Sync completed.';
      emitChunk('result', summary);

      const result = {
        ok: overallStatus !== 'failed',
        code: overallStatus === 'failed' ? 1 : 0,
        summary,
        payload: {
          ok: overallStatus !== 'failed',
          status: overallStatus,
          steps: {
            components: componentsStep,
            variables: variablesStep,
          },
          warnings,
        },
      };
      // Await coverage refresh so the DB counters are committed before the
      // job transitions to "completed" in the in-memory queue. The client polls
      // for job completion and immediately invalidates ['design-systems-config'],
      // so the refresh must finish before this execute() returns.
      if (!skipComponentCapture) {
        await refreshDesignSystemImportCoverage({
          designSystemRepository,
          componentRepo,
          systemId: sysCtx.systemId,
          sourceCandidates: extractSourceCandidatesFromCapturedStep(componentsStep),
        }).catch((error) => {
          console.warn(
            '[handleSyncDesignSystemRoute] Failed to refresh design system import coverage:',
            error instanceof Error ? error.message : String(error),
          );
        });
      }
      // Second eviction: any preview that ran *during* this sync (after the
      // initial clear above) may have cached a mid-sync snapshot with the same
      // {systemId, fileKey, fileVersion} key. Evict it now so the next preview
      // always fetches fresh Figma state against the updated DB.
      clearSyncDiffPreviewCacheForSystem(sysCtx.systemId);
      clearSyncVariablesPreviewCacheForSystem(sysCtx.systemId);
      void persistDesignSystemSyncJobState(db, {
        jobId: syncJobId,
        systemId: sysCtx.systemId,
        operationName: 'sync:design-system',
        label: 'sync design system (figma→db)',
        status: resolveQueueStatusFromSyncStatus(
          overallStatus === 'failed'
            ? 'failed'
            : overallStatus === 'completed_with_warnings'
              ? 'completed_with_warnings'
              : 'completed',
        ),
        requestId,
        startedAt,
        finishedAt: new Date().toISOString(),
        result,
      }).catch((error) => {
        console.warn(
          '[handleSyncDesignSystemRoute] Failed to persist final sync job state:',
          error instanceof Error ? error.message : String(error),
        );
      });
      return result;
    },
  });

  resolveSyncJobId(job.id);
  void persistDesignSystemSyncJobState(db, {
    jobId: job.id,
    systemId: sysCtx.systemId,
    operationName: 'sync:design-system',
    label: 'sync design system (figma→db)',
    status: 'queued',
    requestId,
  }).catch((error) => {
    console.warn(
      '[handleSyncDesignSystemRoute] Failed to persist queued sync job state:',
      error instanceof Error ? error.message : String(error),
    );
  });

  return c.json(queueJobAcceptedPayload(job), 202);
}
