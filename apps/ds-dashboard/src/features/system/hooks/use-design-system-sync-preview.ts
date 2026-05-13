import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  applySyncDesignSystem,
  previewSyncDesignSystem,
  previewSyncDesignSystemVariables,
  type SyncDesignSystemApplyResponse,
  type SyncDesignSystemDiffResult,
  type SyncDesignSystemDryRunResponse,
  type SyncDesignSystemStepResult,
} from '@/lib/api';
import { toApiErrorDisplay, type ApiErrorDisplay } from '@/lib/api-error-ux';

type CachedVariablesPreviewEntry = {
  systemId: string;
  fileVersion: string;
  lastSyncRunId: string;
  cachedAt: number;
  value: SyncDesignSystemStepResult | null;
  warning: string | null;
  debug:
    | {
        fileVersion?: string;
        durationMs?: number;
        cacheHit?: boolean;
      }
    | null;
};

const VARIABLES_PREVIEW_CACHE_TTL_MS = 10 * 60 * 1000;
const VARIABLES_PREVIEW_CACHE_MAX_ENTRIES = 200;
const VARIABLES_PREVIEW_CACHE_MAX_ENTRIES_PER_SYSTEM = 20;
const variablesPreviewCache = new Map<string, CachedVariablesPreviewEntry>();

function buildVariablesPreviewCacheKey(args: {
  systemId: string;
  fileVersion: string;
  lastSyncRunId?: string;
}): string {
  return JSON.stringify({
    systemId: String(args.systemId || '').trim(),
    fileVersion: String(args.fileVersion || '').trim(),
    lastSyncRunId: String(args.lastSyncRunId || '').trim(),
  });
}

function pruneVariablesPreviewCacheByAge(nowMs: number): void {
  for (const [key, entry] of variablesPreviewCache.entries()) {
    if (nowMs - entry.cachedAt > VARIABLES_PREVIEW_CACHE_TTL_MS) {
      variablesPreviewCache.delete(key);
    }
  }
}

function pruneVariablesPreviewCacheBySystemLimit(systemId: string): void {
  const normalizedSystemId = String(systemId || '').trim();
  if (!normalizedSystemId) return;
  const keysForSystem: string[] = [];
  for (const [key, entry] of variablesPreviewCache.entries()) {
    if (entry.systemId === normalizedSystemId) {
      keysForSystem.push(key);
    }
  }
  while (keysForSystem.length > VARIABLES_PREVIEW_CACHE_MAX_ENTRIES_PER_SYSTEM) {
    const oldestKey = keysForSystem.shift();
    if (!oldestKey) break;
    variablesPreviewCache.delete(oldestKey);
  }
}

function pruneVariablesPreviewCacheByGlobalLimit(): void {
  while (variablesPreviewCache.size > VARIABLES_PREVIEW_CACHE_MAX_ENTRIES) {
    const oldestKey = variablesPreviewCache.keys().next().value;
    if (!oldestKey) break;
    variablesPreviewCache.delete(oldestKey);
  }
}

function getCachedVariablesPreview(
  systemId: string,
  fileVersion: string,
  lastSyncRunId?: string,
): CachedVariablesPreviewEntry | null {
  const nowMs = Date.now();
  pruneVariablesPreviewCacheByAge(nowMs);
  const cacheKey = buildVariablesPreviewCacheKey({
    systemId,
    fileVersion,
    lastSyncRunId,
  });
  const cached = variablesPreviewCache.get(cacheKey);
  if (!cached) return null;
  if (nowMs - cached.cachedAt > VARIABLES_PREVIEW_CACHE_TTL_MS) {
    variablesPreviewCache.delete(cacheKey);
    return null;
  }
  variablesPreviewCache.delete(cacheKey);
  const touched: CachedVariablesPreviewEntry = {
    ...cached,
    cachedAt: nowMs,
  };
  variablesPreviewCache.set(cacheKey, touched);
  return touched;
}

function setCachedVariablesPreview(
  systemId: string,
  fileVersion: string,
  lastSyncRunId: string | undefined,
  value: SyncDesignSystemStepResult | null,
  warning: string | null,
  debug:
    | {
        fileVersion?: string;
        durationMs?: number;
        cacheHit?: boolean;
      }
    | null,
): void {
  const nowMs = Date.now();
  pruneVariablesPreviewCacheByAge(nowMs);
  const normalizedSystemId = String(systemId || '').trim();
  const normalizedFileVersion = String(fileVersion || '').trim();
  const normalizedSyncRunId = String(lastSyncRunId || '').trim();
  const cacheKey = buildVariablesPreviewCacheKey({
    systemId: normalizedSystemId,
    fileVersion: normalizedFileVersion,
    lastSyncRunId: normalizedSyncRunId,
  });
  variablesPreviewCache.set(cacheKey, {
    systemId: normalizedSystemId,
    fileVersion: normalizedFileVersion,
    lastSyncRunId: normalizedSyncRunId,
    cachedAt: nowMs,
    value,
    warning,
    debug,
  });
  pruneVariablesPreviewCacheBySystemLimit(normalizedSystemId);
  pruneVariablesPreviewCacheByGlobalLimit();
}

function clearPreviewCacheForSystem(systemId: string): void {
  const normalizedSystemId = String(systemId || '').trim();
  for (const [key, entry] of variablesPreviewCache.entries()) {
    if (entry.systemId === normalizedSystemId) {
      variablesPreviewCache.delete(key);
    }
  }
}

function toPreviewErrorDisplay(cause: unknown): ApiErrorDisplay {
  return toApiErrorDisplay(cause, {
    fallbackTitle: 'Sync preview unavailable',
    fallbackMessage: 'Unable to preview the design system diff.',
  });
}

export interface UseDesignSystemSyncPreviewArgs {
  systemId: string;
  figmaUrl: string;
  figmaToken?: string;
  lastSyncRunId?: string;
  onApplySuccess?: (response: SyncDesignSystemApplyResponse) => void;
}

export interface DesignSystemSyncPreviewState {
  diffResult: SyncDesignSystemDiffResult | null;
  variablesPreview: SyncDesignSystemStepResult | null;
  variablesPreviewWarning: string | null;
  hasRequestedVariablesPreview: boolean;
  error: ApiErrorDisplay | null;
  isPreviewing: boolean;
  isVariablesPreviewing: boolean;
  isApplying: boolean;
  previewDebug: SyncDesignSystemDryRunResponse['_debug'] | null;
  variablesPreviewDebug: SyncDesignSystemStepResult['_debug'] | null;
  runPreview: () => Promise<SyncDesignSystemDryRunResponse | undefined>;
  loadVariablesPreview: () => void;
  retryVariablesPreview: () => void;
  runApply: (selectedNodeIds?: string[]) => Promise<SyncDesignSystemApplyResponse | undefined>;
  resetPreview: () => void;
}

export function useDesignSystemSyncPreview(
  args: UseDesignSystemSyncPreviewArgs,
): DesignSystemSyncPreviewState {
  const queryClient = useQueryClient();
  const [diffResult, setDiffResult] = useState<SyncDesignSystemDiffResult | null>(null);
  const [variablesPreview, setVariablesPreview] = useState<SyncDesignSystemStepResult | null>(null);
  const [variablesPreviewWarning, setVariablesPreviewWarning] = useState<string | null>(null);
  const [hasRequestedVariablesPreview, setHasRequestedVariablesPreview] = useState(false);
  const [error, setError] = useState<ApiErrorDisplay | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isVariablesPreviewing, setIsVariablesPreviewing] = useState(false);
  const [previewDebug, setPreviewDebug] = useState<SyncDesignSystemDryRunResponse['_debug'] | null>(null);
  const [variablesPreviewDebug, setVariablesPreviewDebug] = useState<SyncDesignSystemStepResult['_debug'] | null>(null);
  const latestPreviewRunRef = useRef(0);
  // Keeps diffResult accessible inside runPreview without adding it to the
  // useCallback dep array (which would recreate the function on every diff change).
  const diffResultRef = useRef(diffResult);
  useEffect(() => {
    diffResultRef.current = diffResult;
  }, [diffResult]);
  const previewDebugRef = useRef(previewDebug);
  useEffect(() => {
    previewDebugRef.current = previewDebug;
  }, [previewDebug]);

  const resetPreview = useCallback(() => {
    setDiffResult(null);
    setVariablesPreview(null);
    setVariablesPreviewWarning(null);
    setHasRequestedVariablesPreview(false);
    setError(null);
    setIsPreviewing(false);
    setIsVariablesPreviewing(false);
    setPreviewDebug(null);
    setVariablesPreviewDebug(null);
  }, []);

  useEffect(() => {
    resetPreview();
  }, [args.systemId, resetPreview]);

  const runVariablesPreview = useCallback(
    async (input: {
      figmaUrl: string;
      figmaToken?: string;
      fileVersion: string;
      lastSyncRunId?: string;
      runId: number;
      allowVersionCache: boolean;
    }): Promise<void> => {
      const normalizedFileVersion = String(input.fileVersion || '').trim();
      const normalizedLastSyncRunId = String(
        input.lastSyncRunId || args.lastSyncRunId || '',
      ).trim();
      const cached = input.allowVersionCache && normalizedFileVersion
        ? getCachedVariablesPreview(
            args.systemId,
            normalizedFileVersion,
            normalizedLastSyncRunId,
          )
        : null;
      if (cached) {
        if (latestPreviewRunRef.current === input.runId) {
          setVariablesPreview(cached.value);
          setVariablesPreviewWarning(cached.warning);
          setVariablesPreviewDebug({
            ...(cached.debug || {}),
            fileVersion: normalizedFileVersion,
            cacheHit: true,
          });
          setIsVariablesPreviewing(false);
        }
        return;
      }

      try {
        const variables = await previewSyncDesignSystemVariables({
          systemId: args.systemId,
          figmaUrl: input.figmaUrl,
          figmaToken: input.figmaToken,
          fileVersion: normalizedFileVersion || undefined,
        });
        const responseFileVersion =
          String(variables._debug?.fileVersion || normalizedFileVersion).trim();
        if (responseFileVersion) {
          setCachedVariablesPreview(
            args.systemId,
            responseFileVersion,
            normalizedLastSyncRunId,
            variables,
            null,
            variables._debug || null,
          );
        }
        if (latestPreviewRunRef.current !== input.runId) return;
        setVariablesPreview(variables);
        setVariablesPreviewWarning(null);
        setVariablesPreviewDebug(variables._debug || null);
      } catch (cause) {
        const reason =
          cause instanceof Error
            ? cause.message
            : String(cause || 'Variables preview failed.');
        const warning = `Variables preview unavailable: ${reason}`;
        if (latestPreviewRunRef.current !== input.runId) return;
        setVariablesPreview(null);
        setVariablesPreviewWarning(warning);
        setVariablesPreviewDebug(null);
      } finally {
        if (latestPreviewRunRef.current === input.runId) {
          setIsVariablesPreviewing(false);
        }
      }
    },
    [args.lastSyncRunId, args.systemId],
  );

  const runPreview = useCallback(async (): Promise<SyncDesignSystemDryRunResponse | undefined> => {
    const figmaUrl = String(args.figmaUrl || '').trim();
    if (!figmaUrl) {
      const previewError = toPreviewErrorDisplay(
        new Error('Figma URL is required to preview the sync diff.'),
      );
      setError(previewError);
      throw new Error(previewError.message);
    }

    const figmaToken = String(args.figmaToken || '').trim() || undefined;
    const runId = latestPreviewRunRef.current + 1;
    const hadPreviousDiff = diffResultRef.current !== null;
    latestPreviewRunRef.current = runId;
    setError(null);
    setHasRequestedVariablesPreview(false);
    setVariablesPreview(null);
    setVariablesPreviewWarning(null);
    setVariablesPreviewDebug(null);
    setIsPreviewing(true);
    setIsVariablesPreviewing(false);

    try {
      const fileVersionHint = String(previewDebugRef.current?.fileVersion || '').trim();
      const lastSyncRunId = String(args.lastSyncRunId || '').trim();
      const dryRun = await previewSyncDesignSystem({
        systemId: args.systemId,
        figmaUrl,
        figmaToken,
        fileVersionHint: fileVersionHint || undefined,
      });
      if (latestPreviewRunRef.current !== runId) {
        return dryRun;
      }
      setDiffResult(dryRun.diff);
      setPreviewDebug(dryRun._debug || null);
      setHasRequestedVariablesPreview(true);
      setIsVariablesPreviewing(true);
      await runVariablesPreview({
        figmaUrl,
        figmaToken,
        fileVersion: String(dryRun._debug?.fileVersion || '').trim(),
        lastSyncRunId: lastSyncRunId || undefined,
        runId,
        allowVersionCache: true,
      });
      return dryRun;
    } catch (cause) {
      if (latestPreviewRunRef.current === runId) {
        if (!hadPreviousDiff) {
          setDiffResult(null);
          setVariablesPreview(null);
          setVariablesPreviewWarning(null);
          setHasRequestedVariablesPreview(false);
          setPreviewDebug(null);
          setVariablesPreviewDebug(null);
        }
        setError(toPreviewErrorDisplay(cause));
        setIsVariablesPreviewing(false);
      }
      throw cause;
    } finally {
      if (latestPreviewRunRef.current === runId) {
        setIsPreviewing(false);
      }
    }
  }, [args.figmaToken, args.figmaUrl, args.lastSyncRunId, args.systemId, runVariablesPreview]);

  // Retries just the variables step without re-fetching the component diff.
  // Bypasses the client cache so that a plugin reconnect is picked up immediately.
  const loadVariablesPreview = useCallback((allowVersionCache: boolean): void => {
    const figmaUrl = String(args.figmaUrl || '').trim();
    if (!figmaUrl) return;
    const currentPreviewDebug = previewDebugRef.current;
    if (!currentPreviewDebug && !diffResultRef.current) return;
    const figmaToken = String(args.figmaToken || '').trim() || undefined;
    const fileVersion = String(currentPreviewDebug?.fileVersion || '').trim();
    const lastSyncRunId = String(args.lastSyncRunId || '').trim();
    const runId = latestPreviewRunRef.current + 1;
    latestPreviewRunRef.current = runId;
    setHasRequestedVariablesPreview(true);
    setIsVariablesPreviewing(true);
    setVariablesPreviewWarning(null);
    void runVariablesPreview({
      figmaUrl,
      figmaToken,
      fileVersion,
      lastSyncRunId: lastSyncRunId || undefined,
      runId,
      allowVersionCache,
    });
  }, [args.figmaToken, args.figmaUrl, args.lastSyncRunId, runVariablesPreview]);

  const retryVariablesPreview = useCallback((): void => {
    loadVariablesPreview(false);
  }, [loadVariablesPreview]);

  const applyMutation = useMutation({
    mutationFn: async (selectedNodeIds?: string[]): Promise<SyncDesignSystemApplyResponse> => {
      const figmaUrl = String(args.figmaUrl || '').trim();
      if (!figmaUrl) {
        throw new Error('Figma URL is required to apply the sync diff.');
      }
      // Pass the fileVersion captured during the preview run so the server can
      // hit the in-process component snapshot cache instead of re-fetching.
      const previewFileVersion =
        String(previewDebugRef.current?.fileVersion || '').trim() || undefined;
      return applySyncDesignSystem({
        systemId: args.systemId,
        figmaUrl,
        figmaToken: String(args.figmaToken || '').trim() || undefined,
        selectedComponentNodeIds: selectedNodeIds,
        previewFileVersion,
      });
    },
    onSuccess: async (response) => {
      setError(null);
      setDiffResult(null);
      setVariablesPreview(null);
      setVariablesPreviewWarning(null);
      setPreviewDebug(null);
      setVariablesPreviewDebug(null);
      clearPreviewCacheForSystem(args.systemId);
      args.onApplySuccess?.(response);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['component-catalog'] }),
        queryClient.invalidateQueries({ queryKey: ['health'] }),
      ]);
    },
    onError: (cause) => {
      setError(toPreviewErrorDisplay(cause));
    },
  });

  return {
    diffResult,
    variablesPreview,
    variablesPreviewWarning,
    hasRequestedVariablesPreview,
    error,
    isPreviewing,
    isVariablesPreviewing,
    isApplying: applyMutation.isPending,
    previewDebug,
    variablesPreviewDebug,
    runPreview,
    loadVariablesPreview: () => loadVariablesPreview(true),
    retryVariablesPreview,
    runApply: async (selectedNodeIds?: string[]) => applyMutation.mutateAsync(selectedNodeIds),
    resetPreview,
  };
}
