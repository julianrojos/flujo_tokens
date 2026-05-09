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

const PREVIEW_CACHE_TTL_MS = 30_000;

type CachedPreviewDiffEntry = {
  systemId: string;
  expiresAt: number;
  dryRun: SyncDesignSystemDryRunResponse;
};

type CachedVariablesPreviewEntry = {
  systemId: string;
  expiresAt: number;
  value: SyncDesignSystemStepResult | null;
  warning: string | null;
};

const previewDiffCache = new Map<string, CachedPreviewDiffEntry>();
const variablesPreviewCache = new Map<string, CachedVariablesPreviewEntry>();

function buildPreviewCacheKey(input: {
  systemId: string;
  figmaUrl: string;
  figmaToken?: string;
}): string {
  return JSON.stringify({
    systemId: String(input.systemId || '').trim(),
    figmaUrl: String(input.figmaUrl || '').trim(),
    figmaToken: String(input.figmaToken || '').trim(),
  });
}

function getCachedPreviewDiff(
  cacheKey: string,
): SyncDesignSystemDryRunResponse | null {
  const now = Date.now();
  const cached = previewDiffCache.get(cacheKey);
  if (!cached) return null;
  if (cached.expiresAt <= now) {
    previewDiffCache.delete(cacheKey);
    return null;
  }
  return cached.dryRun;
}

function setCachedPreviewDiff(
  cacheKey: string,
  systemId: string,
  dryRun: SyncDesignSystemDryRunResponse,
): void {
  previewDiffCache.set(cacheKey, {
    systemId: String(systemId || '').trim(),
    expiresAt: Date.now() + PREVIEW_CACHE_TTL_MS,
    dryRun,
  });
}

function getCachedVariablesPreview(
  cacheKey: string,
): CachedVariablesPreviewEntry | null {
  const now = Date.now();
  const cached = variablesPreviewCache.get(cacheKey);
  if (!cached) return null;
  if (cached.expiresAt <= now) {
    variablesPreviewCache.delete(cacheKey);
    return null;
  }
  return cached;
}

function setCachedVariablesPreview(
  cacheKey: string,
  systemId: string,
  value: SyncDesignSystemStepResult | null,
  warning: string | null,
): void {
  variablesPreviewCache.set(cacheKey, {
    systemId: String(systemId || '').trim(),
    expiresAt: Date.now() + PREVIEW_CACHE_TTL_MS,
    value,
    warning,
  });
}

function clearPreviewCacheForSystem(systemId: string): void {
  const normalizedSystemId = String(systemId || '').trim();
  for (const [key, entry] of previewDiffCache.entries()) {
    if (entry.systemId === normalizedSystemId) {
      previewDiffCache.delete(key);
    }
  }
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
  onApplySuccess?: (response: SyncDesignSystemApplyResponse) => void;
}

export interface DesignSystemSyncPreviewState {
  diffResult: SyncDesignSystemDiffResult | null;
  variablesPreview: SyncDesignSystemStepResult | null;
  variablesPreviewWarning: string | null;
  error: ApiErrorDisplay | null;
  isPreviewing: boolean;
  isVariablesPreviewing: boolean;
  isApplying: boolean;
  runPreview: () => Promise<SyncDesignSystemDryRunResponse | undefined>;
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
  const [error, setError] = useState<ApiErrorDisplay | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isVariablesPreviewing, setIsVariablesPreviewing] = useState(false);
  const latestPreviewRunRef = useRef(0);

  const resetPreview = useCallback(() => {
    setDiffResult(null);
    setVariablesPreview(null);
    setVariablesPreviewWarning(null);
    setError(null);
    setIsPreviewing(false);
    setIsVariablesPreviewing(false);
  }, []);

  useEffect(() => {
    resetPreview();
  }, [args.systemId, resetPreview]);

  const runVariablesPreview = useCallback(
    async (input: {
      cacheKey: string;
      figmaUrl: string;
      figmaToken?: string;
      runId: number;
      allowCache: boolean;
    }): Promise<void> => {
      const cached = input.allowCache
        ? getCachedVariablesPreview(input.cacheKey)
        : null;
      if (cached) {
        if (latestPreviewRunRef.current === input.runId) {
          setVariablesPreview(cached.value);
          setVariablesPreviewWarning(cached.warning);
          setIsVariablesPreviewing(false);
        }
        return;
      }

      try {
        const variables = await previewSyncDesignSystemVariables({
          systemId: args.systemId,
          figmaUrl: input.figmaUrl,
          figmaToken: input.figmaToken,
        });
        setCachedVariablesPreview(input.cacheKey, args.systemId, variables, null);
        if (latestPreviewRunRef.current !== input.runId) return;
        setVariablesPreview(variables);
        setVariablesPreviewWarning(null);
      } catch (cause) {
        const reason =
          cause instanceof Error
            ? cause.message
            : String(cause || 'Variables preview failed.');
        const warning = `Variables preview unavailable: ${reason}`;
        if (latestPreviewRunRef.current !== input.runId) return;
        setVariablesPreview(null);
        setVariablesPreviewWarning(warning);
      } finally {
        if (latestPreviewRunRef.current === input.runId) {
          setIsVariablesPreviewing(false);
        }
      }
    },
    [args.systemId],
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
    const cacheKey = buildPreviewCacheKey({
      systemId: args.systemId,
      figmaUrl,
      figmaToken,
    });
    const runId = latestPreviewRunRef.current + 1;
    latestPreviewRunRef.current = runId;
    setError(null);
    setVariablesPreviewWarning(null);
    setIsPreviewing(true);
    setIsVariablesPreviewing(true);

    try {
      const cachedDryRun = getCachedPreviewDiff(cacheKey);
      const dryRun = cachedDryRun
        ? cachedDryRun
        : await previewSyncDesignSystem({
            systemId: args.systemId,
            figmaUrl,
            figmaToken,
          });
      if (!cachedDryRun) {
        setCachedPreviewDiff(cacheKey, args.systemId, dryRun);
      }
      if (latestPreviewRunRef.current !== runId) {
        return dryRun;
      }
      setDiffResult(dryRun.diff);
      void runVariablesPreview({
        cacheKey,
        figmaUrl,
        figmaToken,
        runId,
        allowCache: true,
      });
      return dryRun;
    } catch (cause) {
      if (latestPreviewRunRef.current === runId) {
        setDiffResult(null);
        setVariablesPreview(null);
        setVariablesPreviewWarning(null);
        setError(toPreviewErrorDisplay(cause));
        setIsVariablesPreviewing(false);
      }
      throw cause;
    } finally {
      if (latestPreviewRunRef.current === runId) {
        setIsPreviewing(false);
      }
    }
  }, [args.figmaToken, args.figmaUrl, args.systemId, runVariablesPreview]);

  // Retries just the variables step without re-fetching the component diff.
  // Bypasses the client cache so that a plugin reconnect is picked up immediately.
  const retryVariablesPreview = useCallback((): void => {
    const figmaUrl = String(args.figmaUrl || '').trim();
    if (!figmaUrl) return;
    const figmaToken = String(args.figmaToken || '').trim() || undefined;
    const cacheKey = buildPreviewCacheKey({ systemId: args.systemId, figmaUrl, figmaToken });
    const runId = latestPreviewRunRef.current + 1;
    latestPreviewRunRef.current = runId;
    setIsVariablesPreviewing(true);
    setVariablesPreviewWarning(null);
    void runVariablesPreview({ cacheKey, figmaUrl, figmaToken, runId, allowCache: false });
  }, [args.figmaToken, args.figmaUrl, args.systemId, runVariablesPreview]);

  const applyMutation = useMutation({
    mutationFn: async (selectedNodeIds?: string[]): Promise<SyncDesignSystemApplyResponse> => {
      const figmaUrl = String(args.figmaUrl || '').trim();
      if (!figmaUrl) {
        throw new Error('Figma URL is required to apply the sync diff.');
      }
      return applySyncDesignSystem({
        systemId: args.systemId,
        figmaUrl,
        figmaToken: String(args.figmaToken || '').trim() || undefined,
        selectedComponentNodeIds: selectedNodeIds,
      });
    },
    onSuccess: async (response) => {
      setError(null);
      setDiffResult(null);
      setVariablesPreview(null);
      setVariablesPreviewWarning(null);
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
    error,
    isPreviewing,
    isVariablesPreviewing,
    isApplying: applyMutation.isPending,
    runPreview,
    retryVariablesPreview,
    runApply: async (selectedNodeIds?: string[]) => applyMutation.mutateAsync(selectedNodeIds),
    resetPreview,
  };
}
