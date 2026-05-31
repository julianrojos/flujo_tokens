import type { diffFigmaVsDb } from './figma-diff-service.ts';
import { createPreviewCache } from './preview-cache.ts';

export type SyncDiffDryRunResultOk = {
  ok: true;
  sourceCandidates: Array<Record<string, unknown>>;
  diff: ReturnType<typeof diffFigmaVsDb>;
  pathUsed: 'plugin' | 'rest' | 'cache';
  fileVersion: string;
  componentsDurationMs: number;
};

export type SyncDiffDryRunResult =
  | SyncDiffDryRunResultOk
  | {
      ok: false;
      error: string;
    };

export type SyncVariablesDryRunStepResult = {
  status: 'completed' | 'completed_with_warnings' | 'failed';
  summary: string;
  warnings: string[];
  counts: Record<string, number>;
  durationMs?: number;
  raw: Record<string, unknown>;
};

export type SyncVariablesDryRunDebug = {
  fileVersion: string;
  durationMs: number;
};

export type SyncVariablesDryRunResult = SyncVariablesDryRunStepResult & {
  _debug?: SyncVariablesDryRunDebug;
};

const SYNC_PREVIEW_CACHE_TTL_MS = 30 * 60 * 1000;
const SYNC_PREVIEW_CACHE_MAX_ENTRIES = 300;

export const syncDiffDryRunResultCache = createPreviewCache<SyncDiffDryRunResult>({
  ttlMs: SYNC_PREVIEW_CACHE_TTL_MS,
  maxEntries: SYNC_PREVIEW_CACHE_MAX_ENTRIES,
});

export const syncVariablesDryRunResultCache = createPreviewCache<SyncVariablesDryRunResult>({
  ttlMs: SYNC_PREVIEW_CACHE_TTL_MS,
  maxEntries: SYNC_PREVIEW_CACHE_MAX_ENTRIES,
});

export const syncDiffDryRunInflightByKey = new Map<string, Promise<SyncDiffDryRunResult>>();

export const syncVariablesDryRunInflightByKey = new Map<
  string,
  Promise<
    | {
        ok: true;
        summary: SyncVariablesDryRunResult;
      }
    | {
        ok: false;
        error: string;
      }
  >
>();

function normalizePreviewCacheKey(input: {
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

function toTrimmedString(value: unknown): string {
  return String(value || '').trim();
}

export function buildSyncDiffDryRunInflightKey(input: {
  systemId: string;
  fileKey: string;
  fileVersion: string;
}): string {
  return normalizePreviewCacheKey(input);
}

export function buildSyncVariablesDryRunInflightKey(input: {
  systemId: string;
  fileKey: string;
  fileVersion: string;
}): string {
  return normalizePreviewCacheKey(input);
}

export function getCachedSyncDiffPreviewResult(key: string): SyncDiffDryRunResult | null {
  return syncDiffDryRunResultCache.get(key);
}

export function setCachedSyncDiffPreviewResult(
  key: string,
  systemId: string,
  value: SyncDiffDryRunResult,
): void {
  syncDiffDryRunResultCache.set(key, systemId, value);
}

export function clearSyncDiffPreviewCacheForSystem(systemId: string): void {
  syncDiffDryRunResultCache.clearForSystem(systemId);
}

export function getCachedSyncVariablesPreviewResult(
  key: string,
): SyncVariablesDryRunResult | null {
  return syncVariablesDryRunResultCache.get(key);
}

export function setCachedSyncVariablesPreviewResult(
  key: string,
  systemId: string,
  value: SyncVariablesDryRunResult,
): void {
  syncVariablesDryRunResultCache.set(key, systemId, value);
}

export function clearSyncVariablesPreviewCacheForSystem(systemId: string): void {
  syncVariablesDryRunResultCache.clearForSystem(systemId);
}
