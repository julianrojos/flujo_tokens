import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { FormField } from '@/components/common';
import { Input } from '@/components/ui/input';
import {
  ApiError,
  cancelQueueJob,
  getQueueJob,
  syncDesignSystem,
  syncDesignSystemStep,
  type CaptureFigmaProgress,
  type SyncDesignSystemStepResult,
  type SyncDesignSystemResult,
} from '@/lib/api';
import {
  resolveOverallSyncStatus,
  type SyncStepKey,
  type SyncStepStatus,
  type SyncStepSummary,
} from '@/features/system/design-system-sync-logic';
import {
  resolveTokensSyncProgressMessage,
} from '@/features/system/design-system-update-actions-logic';
import { SyncDiffPreview } from '@/features/system/SyncDiffPreview';
import { useDesignSystemSyncPreview } from '@/features/system/hooks/use-design-system-sync-preview';

function toSuggestedFigmaUrl(figmaFileId: string | null | undefined): string {
  const trimmed = String(figmaFileId || '').trim();
  if (!trimmed) return '';
  return `https://www.figma.com/design/${encodeURIComponent(trimmed)}`;
}

interface DesignSystemUpdateActionsProps {
  systemId: string;
  figmaFileId?: string;
  disabled?: boolean;
  onRunSuccess?: () => void;
}

type SyncStepState = {
  jobId?: string;
  status: SyncStepStatus;
  summary: SyncStepSummary | null;
  progress: CaptureFigmaProgress | null;
};

const EMPTY_SYNC_STEP_STATE: SyncStepState = {
  status: 'idle',
  summary: null,
  progress: null,
};

function cloneEmptySyncState(): Record<SyncStepKey, SyncStepState> {
  return {
    components: { ...EMPTY_SYNC_STEP_STATE },
    variables: { ...EMPTY_SYNC_STEP_STATE },
    tokens: { ...EMPTY_SYNC_STEP_STATE },
  };
}

const SYNC_STATE_STORAGE_PREFIX = 'ds-design-system-sync-state:';

type PersistedSyncStepState = {
  jobId?: string;
  status: SyncStepStatus;
  summary: SyncStepSummary | null;
};

type PersistedSyncState = {
  systemId: string;
  jobId?: string;
  updatedAt: string;
  steps: Record<SyncStepKey, PersistedSyncStepState>;
  error?: string;
};

function getSyncStateStorageKey(systemId: string): string {
  return `${SYNC_STATE_STORAGE_PREFIX}${String(systemId || '').trim()}`;
}

export function clearPersistedSyncState(systemId: string): void {
  if (typeof window === 'undefined') return;
  const storageKey = getSyncStateStorageKey(systemId);
  if (!storageKey.trim()) return;
  window.localStorage.removeItem(storageKey);
}

function toPersistedSyncStepState(step: SyncStepState): PersistedSyncStepState {
  return {
    jobId: step.jobId,
    status: step.status,
    summary: step.summary,
  };
}

function toSyncStepStateFromPersisted(
  persisted: PersistedSyncStepState,
): SyncStepState {
  return {
    jobId: persisted.jobId,
    status: persisted.status,
    summary: persisted.summary,
    progress: null,
  };
}

function buildLegacyTokensStepState(
  components: SyncStepState,
  variables: SyncStepState,
): SyncStepState {
  const statuses = [components.status, variables.status];
  if (statuses.some((status) => status === 'running' || status === 'queued')) {
    return {
      ...EMPTY_SYNC_STEP_STATE,
      status: 'running',
    };
  }
  if (statuses.every((status) => status === 'failed')) {
    return {
      status: 'failed',
      summary: buildFailedSummary('tokens', 'Legacy sync snapshot migrated.'),
      progress: null,
    };
  }
  return {
    status: 'completed',
    summary: {
      status: 'completed',
      headline: 'Build tokens generated.',
      details: [],
      warnings: [],
    },
    progress: null,
  };
}

function toActiveSyncOperation(
  operation: unknown,
): 'full' | SyncStepKey | null {
  const normalized = String(operation || '').trim();
  if (normalized === 'sync:design-system') return 'full';
  if (normalized === 'sync:design-system:components') return 'components';
  if (normalized === 'sync:design-system:variables') return 'variables';
  if (normalized === 'sync:design-system:tokens') return 'tokens';
  return null;
}

export function loadPersistedSyncState(
  systemId: string,
): { jobId?: string; steps: Record<SyncStepKey, SyncStepState>; error?: string; updatedAt?: string } | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(getSyncStateStorageKey(systemId));
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<PersistedSyncState>;
    if (String(parsed.systemId || '').trim() !== String(systemId || '').trim()) {
      return null;
    }
    if (!parsed.steps?.components || !parsed.steps?.variables) {
      return null;
    }
    return {
      jobId: String(parsed.jobId || '').trim() || undefined,
      error: String(parsed.error || '').trim() || undefined,
      updatedAt: String(parsed.updatedAt || '').trim() || undefined,
      steps: (() => {
        const components = toSyncStepStateFromPersisted(parsed.steps.components);
        const variables = toSyncStepStateFromPersisted(parsed.steps.variables);
        return {
          components,
          variables,
          tokens: parsed.steps.tokens
            ? toSyncStepStateFromPersisted(parsed.steps.tokens)
            : buildLegacyTokensStepState(components, variables),
        };
      })(),
    };
  } catch {
    return null;
  }
}

export function extractQueueJobState(
  jobState: Awaited<ReturnType<typeof getQueueJob>>,
  fallbackSteps: Record<SyncStepKey, SyncStepState>,
): {
  steps: Record<SyncStepKey, SyncStepState>;
  error?: string;
} | null {
  const job = jobState?.job;
  const result = job?.result && typeof job.result === 'object' ? job.result : null;
  const payload = result?.payload && typeof result.payload === 'object'
    ? (result.payload as Record<string, unknown>)
    : null;
  const operation = String(job?.operation || '').trim();

  if (job?.status === 'running') {
    if (operation === 'sync:design-system:components') {
      return {
        steps: {
          ...fallbackSteps,
          components: {
            ...fallbackSteps.components,
            jobId: job.id,
            status: 'running',
            progress: {
              status: 'running',
              completed: 0,
              total: 0,
              remaining: 0,
              message: 'Running',
            },
          },
        },
      };
    }
    if (operation === 'sync:design-system:tokens') {
      return {
        steps: {
          ...fallbackSteps,
          tokens: {
            ...fallbackSteps.tokens,
            jobId: job.id,
            status: 'running',
            progress: {
              status: 'running',
              completed: 0,
              total: 0,
              remaining: 0,
              message: 'Running',
            },
          },
        },
      };
    }
    if (operation === 'sync:design-system:variables') {
      return {
        steps: {
          ...fallbackSteps,
          variables: {
            ...fallbackSteps.variables,
            jobId: job.id,
            status: 'running',
            progress: {
              status: 'running',
              completed: 0,
              total: 0,
              remaining: 0,
              message: 'Running',
            },
          },
        },
      };
    }
    return {
      steps: {
        components: {
          ...fallbackSteps.components,
          jobId: job.id,
          status: 'running',
          progress: {
            status: 'running',
            completed: 0,
            total: 0,
            remaining: 0,
            message: 'Running',
          },
        },
        variables: {
          ...fallbackSteps.variables,
          jobId: job.id,
          status: 'running',
          progress: {
            status: 'running',
            completed: 0,
            total: 0,
            remaining: 0,
            message: 'Running',
          },
        },
        tokens: {
          ...fallbackSteps.tokens,
          jobId: job.id,
          status: 'running',
          progress: {
            status: 'running',
            completed: 0,
            total: 0,
            remaining: 0,
            message: 'Running',
          },
        },
      },
    };
  }

  if (!payload) return null;

  if (operation === 'sync:design-system') {
    const steps = payload.steps && typeof payload.steps === 'object' ? (payload.steps as Record<string, unknown>) : null;
    if (!steps?.components || !steps?.variables) return null;
    return {
      steps: {
        components: toStepStateFromBackend(
          'components',
          steps.components as SyncDesignSystemResult['steps']['components'],
        ),
        variables: toStepStateFromBackend(
          'variables',
          steps.variables as SyncDesignSystemResult['steps']['variables'],
        ),
        tokens: fallbackSteps.tokens,
      },
      error:
        job.status === 'error'
          ? String(result?.summary || payload.summary || 'Sync failed.')
          : '',
    };
  }

  if (operation === 'sync:design-system:tokens') {
    return {
      steps: {
        ...fallbackSteps,
        tokens: toStepStateFromBackend(
          'tokens',
          payload as unknown as SyncDesignSystemResult['steps']['components'],
        ),
      },
      error:
        job.status === 'error'
          ? String(result?.summary || payload.summary || 'Sync failed.')
          : '',
    };
  }

  if (operation === 'sync:design-system:components') {
    return {
      steps: {
        ...fallbackSteps,
        components: toStepStateFromBackend(
          'components',
          payload as unknown as SyncDesignSystemResult['steps']['components'],
        ),
      },
      error:
        job.status === 'error'
          ? String(result?.summary || payload.summary || 'Sync failed.')
          : '',
    };
  }

  if (operation === 'sync:design-system:variables') {
    return {
      steps: {
        ...fallbackSteps,
        variables: toStepStateFromBackend(
          'variables',
          payload as unknown as SyncDesignSystemResult['steps']['variables'],
        ),
      },
      error:
        job.status === 'error'
          ? String(result?.summary || payload.summary || 'Sync failed.')
          : '',
    };
  }

  return null;
}

function serializeSyncState(
  systemId: string,
  steps: Record<SyncStepKey, SyncStepState>,
  jobId?: string,
  error?: string,
): string {
  const payload: PersistedSyncState = {
    systemId,
    jobId: String(jobId || '').trim() || undefined,
    updatedAt: new Date().toISOString(),
    steps: {
      components: toPersistedSyncStepState(steps.components),
      variables: toPersistedSyncStepState(steps.variables),
      tokens: toPersistedSyncStepState(steps.tokens),
    },
    error: String(error || '').trim() || undefined,
  };
  return JSON.stringify(payload);
}

function resolveStepLabel(step: SyncStepKey): string {
  if (step === 'components') return 'Components';
  if (step === 'variables') return 'Variables';
  return 'Build tokens';
}

function buildFailedSummary(
  step: SyncStepKey,
  message: string,
): SyncStepSummary {
  return {
    status: 'failed',
    headline: `${resolveStepLabel(step)} sync failed`,
    details: [],
    warnings: [message],
  };
}

function toProgressPercentFromStep(step: SyncStepState): number {
  const progress = step.progress;
  if (progress && progress.total > 0) {
    const raw = Math.round((progress.completed / progress.total) * 100);
    return Math.min(100, Math.max(0, raw));
  }
  if (step.status === 'completed') return 100;
  if (step.status === 'failed') return 100;
  if (step.status === 'running') return 55;
  if (step.status === 'queued') return 15;
  return 0;
}

function toProgressDetail(step: SyncStepState): string | null {
  const progress = step.progress;
  if (!progress) return null;
  if (progress.total > 0) return `${progress.completed}/${progress.total}`;
  const message = String(progress.message || '').trim();
  if (message) return message;
  return null;
}

function toTokenTimingLine(result: SyncDesignSystemStepResult): string | null {
  const raw = result.raw;
  if (!raw || typeof raw !== 'object') return null;
  const timings = (raw as Record<string, unknown>).timingsMs;
  if (!timings || typeof timings !== 'object') return null;
  const map = timings as Record<string, unknown>;
  const cssGeneration = Number(map.cssGeneration);
  const usageBuild = Number(map.usageBuild);
  const usagePersist = Number(map.usagePersist);
  if (
    !Number.isFinite(cssGeneration) &&
    !Number.isFinite(usageBuild) &&
    !Number.isFinite(usagePersist)
  ) {
    return null;
  }
  const parts = [
    Number.isFinite(cssGeneration)
      ? `CSS ${Math.max(0, Math.round(cssGeneration))} ms`
      : null,
    Number.isFinite(usageBuild)
      ? `Usage build ${Math.max(0, Math.round(usageBuild))} ms`
      : null,
    Number.isFinite(usagePersist)
      ? `Usage persist ${Math.max(0, Math.round(usagePersist))} ms`
      : null,
  ].filter(Boolean);
  if (parts.length === 0) return null;
  return `Timings: ${parts.join(' · ')}`;
}

function getTokensTimingDetail(step: SyncStepState): string | null {
  const details = step.summary?.details || [];
  for (const detail of details) {
    const value = String(detail || '').trim();
    if (!value) continue;
    if (value.startsWith('Timings:')) return value;
  }
  return null;
}

function toStepStateFromBackend(
  step: SyncStepKey,
  result: SyncDesignSystemStepResult,
): SyncStepState {
  const tokenTimingLine = step === 'tokens' ? toTokenTimingLine(result) : null;
  const detailLines = Object.entries(result.counts).map(
    ([label, value]) => `${label}: ${value}`,
  );
  if (tokenTimingLine) {
    detailLines.push(tokenTimingLine);
  }
  return {
    jobId: result.jobId,
    status: result.status,
    summary: {
      status: result.status,
      headline:
        step === 'components'
          ? result.summary || 'Components synced.'
          : step === 'variables'
            ? result.summary || 'Variables synced.'
            : result.summary || 'Build tokens generated.',
      details: detailLines,
      warnings: result.warnings,
    },
    progress: null,
  };
}

export function DesignSystemUpdateActions({
  systemId,
  figmaFileId,
  disabled = false,
  onRunSuccess,
}: DesignSystemUpdateActionsProps) {
  const suggestedUrl = useMemo(
    () => toSuggestedFigmaUrl(figmaFileId),
    [figmaFileId],
  );

  const [sharedFigmaUrl, setSharedFigmaUrl] = useState(suggestedUrl);
  const [sharedToken, setSharedToken] = useState('');
  const [syncSteps, setSyncSteps] = useState<Record<SyncStepKey, SyncStepState>>(
    () => cloneEmptySyncState(),
  );
  const [syncError, setSyncError] = useState<string>('');
  const [hasTriggeredSyncInView, setHasTriggeredSyncInView] = useState(false);
  const [activeSyncJobId, setActiveSyncJobId] = useState<string | null>(null);
  const [activeSyncOperation, setActiveSyncOperation] = useState<'full' | SyncStepKey | null>(null);
  const syncRunIdRef = useRef(0);
  const pendingSyncPersistRef = useRef<{
    jobId?: string;
    error?: string;
    } | null>(null);
  const {
    diffResult: syncDiffResult,
    variablesPreview: syncVariablesPreview,
    variablesPreviewWarning: syncVariablesPreviewWarning,
    error: syncDiffError,
    isPreviewing: isSyncDiffPreviewing,
    isVariablesPreviewing: isSyncVariablesPreviewing,
    isApplying: isSyncDiffApplying,
    previewDebug: syncDiffPreviewDebug,
    variablesPreviewDebug: syncVariablesPreviewDebug,
    runPreview: runSyncDiffPreview,
    loadVariablesPreview: loadSyncVariablesPreview,
    retryVariablesPreview: retrySyncVariablesPreview,
    runApply: runSyncDiffApply,
    resetPreview: resetSyncDiffPreview,
    hasRequestedVariablesPreview: hasRequestedSyncVariablesPreview,
  } = useDesignSystemSyncPreview({
    systemId,
    figmaUrl: sharedFigmaUrl,
    figmaToken: sharedToken,
    onApplySuccess: () => {},
  });

  useEffect(() => {
    if (!suggestedUrl) return;
    setSharedFigmaUrl((current) =>
      String(current || '').trim() ? current : suggestedUrl,
    );
  }, [suggestedUrl]);

  useEffect(() => {
    const persisted = loadPersistedSyncState(systemId);
    if (!persisted) {
      setHasTriggeredSyncInView(false);
      setSyncSteps(cloneEmptySyncState());
      setSyncError('');
      setActiveSyncJobId(null);
      setActiveSyncOperation(null);
      return;
    }
    setHasTriggeredSyncInView(false);
    setSyncSteps(persisted.steps);
    setSyncError(persisted.error || '');
    if (!persisted.jobId) return;

    let cancelled = false;
    void getQueueJob(persisted.jobId)
      .then((jobState) => {
        if (cancelled) return;
        const hydrated = extractQueueJobState(jobState, persisted.steps);
        const job = jobState?.job;
        if (!hydrated) {
          setActiveSyncJobId(null);
          setActiveSyncOperation(null);
          return;
        }
        setSyncSteps(hydrated.steps);
        setSyncError(hydrated.error || '');
        if (job?.status === 'running') {
          setActiveSyncJobId(job.id);
          setActiveSyncOperation(toActiveSyncOperation(job.operation));
          return;
        }
        setActiveSyncJobId(null);
        setActiveSyncOperation(null);
      })
      .catch((cause) => {
        if (
          cause instanceof ApiError &&
          cause.status === 404 &&
          cause.code === 'queue.job_not_found'
        ) {
          clearPersistedSyncState(systemId);
          if (cancelled) return;
          setHasTriggeredSyncInView(false);
          setSyncSteps(cloneEmptySyncState());
          setSyncError('');
          setActiveSyncJobId(null);
          setActiveSyncOperation(null);
          return;
        }
        // Keep the local persisted snapshot if the server lookup fails.
      });

    return () => {
      cancelled = true;
    };
  }, [systemId]);

  const overallSyncStatus = useMemo(
    () =>
      resolveOverallSyncStatus({
        components: syncSteps.components.status,
        variables: syncSteps.variables.status,
        tokens: syncSteps.tokens.status,
      }),
    [syncSteps.components.status, syncSteps.variables.status, syncSteps.tokens.status],
  );

  const isSyncRunning =
    overallSyncStatus === 'running' || Boolean(activeSyncJobId);
  const lastSyncProgressPercentRef = useRef(0);

  const syncProgress = useMemo(() => {
    if (isSyncDiffPreviewing) {
      return { active: true, percent: 20, label: 'Previewing sync diff…' };
    }
    if (isSyncVariablesPreviewing) {
      return { active: true, percent: 30, label: 'Previewing variables diff…' };
    }
    if (isSyncDiffApplying) {
      return { active: true, percent: 40, label: 'Applying component reconciliation…' };
    }
    if (!isSyncRunning) {
      lastSyncProgressPercentRef.current = 0;
      return { active: false, percent: 0, label: '' };
    }

    const componentsPercent = toProgressPercentFromStep(syncSteps.components);
    const variablesPercent = toProgressPercentFromStep(syncSteps.variables);
    const tokensPercent = toProgressPercentFromStep(syncSteps.tokens);
    const parallelPhasePercent = Math.round((componentsPercent + variablesPercent) / 2);
    const weightedPercent = Math.round(parallelPhasePercent * 0.7 + tokensPercent * 0.3);
    const safePercent = Math.min(99, Math.max(5, weightedPercent));

    const renderTokensSyncProgress = () => {
      const tokensMessage = resolveTokensSyncProgressMessage(syncSteps.tokens);
      const nextPercent = Math.max(70, safePercent);
      const monotonicPercent = Math.max(lastSyncProgressPercentRef.current, nextPercent);
      lastSyncProgressPercentRef.current = monotonicPercent;
      return {
        active: true,
        percent: monotonicPercent,
        label: tokensMessage.label,
        detail:
          toProgressDetail(syncSteps.tokens) || tokensMessage.detail || undefined,
      };
    };

    // Phase order: tokens running > components/variables running > queued > tokens queued.
    // Keeping tokens-running first ensures the final phase label shows correctly, but
    // tokens-queued must NOT preempt the components/variables-running label — otherwise
    // the progress bar shows "Queueing token CSS…" for the entire duration of the
    // components+variables phase (potentially 30+ min) just because tokens was
    // pre-marked as queued before those steps finished.
    if (syncSteps.tokens.status === 'running') {
      return renderTokensSyncProgress();
    }
    if (syncSteps.components.status === 'running' || syncSteps.variables.status === 'running') {
      const componentDetail = toProgressDetail(syncSteps.components);
      const variableDetail = toProgressDetail(syncSteps.variables);
      const detail = [componentDetail ? `Components ${componentDetail}` : null, variableDetail ? `Variables ${variableDetail}` : null]
        .filter(Boolean)
        .join(' · ');
      const monotonicPercent = Math.max(lastSyncProgressPercentRef.current, safePercent);
      lastSyncProgressPercentRef.current = monotonicPercent;
      return {
        active: true,
        percent: monotonicPercent,
        label: 'Syncing components and variables…',
        detail: detail || undefined,
      };
    }
    if (syncSteps.components.status === 'queued' || syncSteps.variables.status === 'queued') {
      const monotonicPercent = Math.max(lastSyncProgressPercentRef.current, 10);
      lastSyncProgressPercentRef.current = monotonicPercent;
      return { active: true, percent: monotonicPercent, label: 'Queueing sync job…' };
    }
    // Tokens queued: job has been submitted to the queue but not yet picked up.
    // This appears briefly (~200 ms) after the full sync completes and before the
    // in-process tokens worker starts. Shown here (after components/variables checks)
    // so it never masks the ongoing parallel-phase label.
    if (syncSteps.tokens.status === 'queued') {
      return renderTokensSyncProgress();
    }
    const monotonicPercent = Math.max(lastSyncProgressPercentRef.current, 95);
    lastSyncProgressPercentRef.current = monotonicPercent;
    return { active: true, percent: monotonicPercent, label: 'Finalizing sync…' };
  }, [
    isSyncDiffApplying,
    isSyncDiffPreviewing,
    isSyncVariablesPreviewing,
    isSyncRunning,
    syncSteps.components,
    syncSteps.tokens,
    syncSteps.variables,
  ]);

  const syncOutcome = useMemo(() => {
    if (!hasTriggeredSyncInView) {
      return null;
    }

    if (isSyncRunning || isSyncDiffApplying || isSyncDiffPreviewing || isSyncVariablesPreviewing) {
      return null;
    }

    const hasExecutedStep =
      syncSteps.components.status !== 'idle' ||
      syncSteps.variables.status !== 'idle' ||
      syncSteps.tokens.status !== 'idle';

    if (!hasExecutedStep) {
      return null;
    }

    if (syncError) {
      return {
        status: 'error' as const,
        message: syncError,
      };
    }

    const failedStep = (['components', 'variables', 'tokens'] as SyncStepKey[])
      .map((step) => {
        const state = syncSteps[step];
        if (state.status !== 'failed') return null;
        const reason = state.summary?.warnings?.[0] || state.summary?.headline || '';
        return String(reason || '').trim() || null;
      })
      .find((value) => String(value || '').trim().length > 0);

    if (failedStep) {
      return {
        status: 'error' as const,
        message: failedStep,
      };
    }

    if (overallSyncStatus === 'failed') {
      return {
        status: 'error' as const,
        message: 'Sync failed for one or more steps.',
      };
    }

    if (
      overallSyncStatus === 'completed' ||
      overallSyncStatus === 'completed_with_warnings'
    ) {
      const tokensTimingDetail = getTokensTimingDetail(syncSteps.tokens);
      const baseMessage =
        overallSyncStatus === 'completed_with_warnings'
          ? 'Design system sync completed with warnings.'
          : 'Design system sync completed successfully.';
      return {
        status: 'success' as const,
        message: tokensTimingDetail
          ? `${baseMessage} ${tokensTimingDetail}`
          : baseMessage,
      };
    }

    return null;
  }, [
    hasTriggeredSyncInView,
    isSyncDiffApplying,
    isSyncDiffPreviewing,
    isSyncVariablesPreviewing,
    isSyncRunning,
    overallSyncStatus,
    syncError,
    syncSteps,
  ]);

  const updateStepState = useCallback(
    (
      step: SyncStepKey,
      patch: Partial<SyncStepState> | ((current: SyncStepState) => SyncStepState),
    ) => {
      setSyncSteps((prev) => {
        const current = prev[step];
        const nextState =
          typeof patch === 'function' ? patch(current) : { ...current, ...patch };
        return {
          ...prev,
          [step]: nextState,
        };
      });
    },
    [],
  );

  const persistSyncState = useCallback(
    (
      steps: Record<SyncStepKey, SyncStepState>,
      jobId?: string,
      error?: string,
    ) => {
      if (typeof window === 'undefined') return;
      const storageKey = getSyncStateStorageKey(systemId);
      if (!storageKey.trim()) return;
      window.localStorage.setItem(
        storageKey,
        serializeSyncState(systemId, steps, jobId, error),
      );
    },
    [systemId],
  );

  useEffect(() => {
    const pending = pendingSyncPersistRef.current;
    if (!pending) return;
    pendingSyncPersistRef.current = null;
    persistSyncState(syncSteps, pending.jobId, pending.error);
  }, [persistSyncState, syncSteps]);

  const cancelSync = useCallback(async () => {
    const jobId = activeSyncJobId;
    if (!jobId) return;
    try {
      await cancelQueueJob(jobId);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Failed to cancel sync.';
      setSyncError(message);
      return;
    }
    // Only reset state after confirmed cancel
    syncRunIdRef.current += 1;
    setActiveSyncJobId(null);
    setActiveSyncOperation(null);
    pendingSyncPersistRef.current = null;
    if (!activeSyncOperation || activeSyncOperation === 'full') {
      const emptyState = cloneEmptySyncState();
      setSyncSteps(emptyState);
      setSyncError('');
      persistSyncState(emptyState, undefined, '');
    } else {
      const step = activeSyncOperation;
      pendingSyncPersistRef.current = { error: '' };
      setSyncSteps((prev) => ({ ...prev, [step]: { ...EMPTY_SYNC_STEP_STATE } }));
      setSyncError('');
    }
  }, [activeSyncJobId, activeSyncOperation, persistSyncState]);

  const startSync = useCallback(
    async () => {
      const url = String(sharedFigmaUrl || '').trim();
      const nextRunId = syncRunIdRef.current + 1;
      syncRunIdRef.current = nextRunId;
      setHasTriggeredSyncInView(true);
      setSyncError('');
      resetSyncDiffPreview();

      if (!url) {
        setSyncError('Figma URL is required to sync the design system.');
        return;
      }

      const parallelSteps = ['components', 'variables'] as SyncStepKey[];
      // Components and variables are submitted as one job immediately.
      for (const step of parallelSteps) {
        updateStepState(step, {
          status: 'queued',
          summary: null,
          progress: {
            status: 'queued',
            completed: 0,
            total: 0,
            remaining: 0,
            message: 'Queued',
          },
        });
      }
      // Tokens is NOT submitted until after the full sync completes — reset to
      // idle so the step list doesn't show "Queued" for 30+ min before it runs.
      updateStepState('tokens', { ...EMPTY_SYNC_STEP_STATE });

      const runningComponentsState: SyncStepState = {
        status: 'running',
        summary: null,
        progress: { status: 'running', completed: 0, total: 0, remaining: 0, message: 'Running' },
      };
      const runningVariablesState: SyncStepState = {
        status: 'running',
        summary: null,
        progress: { status: 'running', completed: 0, total: 0, remaining: 0, message: 'Running' },
      };
      const runningTokensState: SyncStepState = {
        status: 'running',
        summary: null,
        progress: { status: 'running', completed: 0, total: 0, remaining: 0, message: 'Running' },
      };

      let nextComponentsState: SyncStepState = runningComponentsState;
      let nextVariablesState: SyncStepState = runningVariablesState;

      try {
        updateStepState('components', runningComponentsState);
        updateStepState('variables', runningVariablesState);

        const result = await syncDesignSystem(
          {
            url,
            figmaToken: String(sharedToken || '').trim() || undefined,
          },
          {
            systemId,
            onQueued: (jobId) => {
              setActiveSyncJobId(jobId ?? null);
              setActiveSyncOperation('full');
              // Tokens is not submitted yet — persist it as idle so a page reload
              // during the full sync doesn't restore a stale "queued" tokens state.
              persistSyncState(
                {
                  components: runningComponentsState,
                  variables: runningVariablesState,
                  tokens: { ...EMPTY_SYNC_STEP_STATE },
                },
                jobId,
                '',
              );
            },
          },
        );

        if (syncRunIdRef.current !== nextRunId) return;

        setActiveSyncJobId(null);
        setActiveSyncOperation(null);
        nextComponentsState = toStepStateFromBackend('components', result.steps.components);
        nextVariablesState = toStepStateFromBackend('variables', result.steps.variables);
        updateStepState('components', nextComponentsState);
        updateStepState('variables', nextVariablesState);

        // Variables sync done — now run tokens step (sequential, reads DB)
        if (syncRunIdRef.current !== nextRunId) return;

        const variablesFailed = result.steps.variables.status === 'failed';
        if (variablesFailed) {
          // Variables failed: mark tokens as failed too, no CSS to generate
          const failedTokensState: SyncStepState = {
            status: 'failed',
            summary: buildFailedSummary('tokens', 'Variables sync failed — cannot generate CSS.'),
            progress: null,
          };
          updateStepState('tokens', failedTokensState);
          const overallError = result.warnings[0] || 'Sync failed.';
          setSyncError(overallError);
          persistSyncState(
            { components: nextComponentsState, variables: nextVariablesState, tokens: failedTokensState },
            result.jobId,
            overallError,
          );
          return;
        }

        updateStepState('tokens', runningTokensState);

        try {
          const tokensResult = await syncDesignSystemStep(
            'tokens',
            {},
            {
              systemId,
              onQueued: (jobId) => {
                setActiveSyncJobId(jobId ?? null);
                setActiveSyncOperation('tokens');
                pendingSyncPersistRef.current = { jobId, error: '' };
                setSyncSteps((prev) => ({
                  ...prev,
                  tokens: { ...runningTokensState, jobId },
                }));
              },
              onProgress: (progress) => {
                if (syncRunIdRef.current !== nextRunId) return;
                setSyncSteps((prev) => ({
                  ...prev,
                  tokens: {
                    ...prev.tokens,
                    status:
                      progress.status === 'queued'
                        ? 'queued'
                        : progress.status === 'running'
                          ? 'running'
                          : prev.tokens.status,
                    progress: {
                      status: progress.status,
                      completed: Number(progress.completed) || 0,
                      total: Number(progress.total) || 0,
                      remaining: Number(progress.remaining) || 0,
                      message: progress.message,
                      currentSlug: progress.currentSlug,
                    },
                  },
                }));
              },
              // Tokens step runs in-process (no subprocess). Poll frequently
              // so the UI reflects completion within ~200 ms instead of 900 ms.
              pollIntervalMs: 200,
            },
          );

          if (syncRunIdRef.current !== nextRunId) return;

          setActiveSyncJobId(null);
          setActiveSyncOperation(null);
          const nextTokensState = toStepStateFromBackend('tokens', tokensResult);
          updateStepState('tokens', nextTokensState);

          const overallFailed =
            result.status === 'failed' || tokensResult.status === 'failed';
          const syncError =
            overallFailed
              ? result.warnings[0] || tokensResult.warnings[0] || 'Sync failed.'
              : '';
          setSyncError(syncError);
          if (!overallFailed) {
            onRunSuccess?.();
          }
          pendingSyncPersistRef.current = { jobId: tokensResult.jobId, error: syncError };
          setSyncSteps((prev) => ({
            ...prev,
            components: nextComponentsState,
            variables: nextVariablesState,
            tokens: nextTokensState,
          }));
        } catch (tokensCause) {
          if (syncRunIdRef.current !== nextRunId) return;
          setActiveSyncJobId(null);
          setActiveSyncOperation(null);
          const message =
            tokensCause instanceof Error ? tokensCause.message : String(tokensCause || 'Tokens step failed.');
          const failedTokensState: SyncStepState = {
            status: 'failed',
            summary: buildFailedSummary('tokens', message),
            progress: null,
          };
          setSyncError(message);
          pendingSyncPersistRef.current = { error: message };
          setSyncSteps((prev) => ({ ...prev, tokens: failedTokensState }));
        }
      } catch (cause) {
        if (syncRunIdRef.current !== nextRunId) return;
        setActiveSyncJobId(null);
        setActiveSyncOperation(null);
        const message =
          cause instanceof Error ? cause.message : String(cause || 'Sync failed.');
        const failedComponentsState: SyncStepState = {
          status: 'failed',
          summary: buildFailedSummary('components', message),
          progress: null,
        };
        const failedVariablesState: SyncStepState = {
          status: 'failed',
          summary: buildFailedSummary('variables', message),
          progress: null,
        };
        const failedTokensState: SyncStepState = {
          status: 'failed',
          summary: buildFailedSummary('tokens', message),
          progress: null,
        };
        setSyncError(message);
        updateStepState('components', failedComponentsState);
        updateStepState('variables', failedVariablesState);
        updateStepState('tokens', failedTokensState);
        persistSyncState(
          {
            components: failedComponentsState,
            variables: failedVariablesState,
            tokens: failedTokensState,
          },
          undefined,
          message,
        );
      }
    },
    [
      persistSyncState,
      resetSyncDiffPreview,
      sharedFigmaUrl,
      sharedToken,
      systemId,
      updateStepState,
      onRunSuccess,
    ],
  );

  const handleApplyAndRunSync = useCallback(async (selectedNodeIds?: string[]) => {
    setHasTriggeredSyncInView(true);
    try {
      await runSyncDiffApply(selectedNodeIds);
    } catch (cause) {
      const reason =
        cause instanceof Error ? cause.message : String(cause || 'Apply step failed.');
      setSyncError(`Sync did not start because apply failed: ${reason}`);
      return;
    }
    await startSync();
  }, [runSyncDiffApply, startSync]);

  const failedSteps = useMemo(
    () =>
      (['components', 'variables', 'tokens'] as SyncStepKey[]).filter(
        (step) => syncSteps[step].status === 'failed',
      ),
    [syncSteps],
  );

  const retryFailedSteps = useCallback(async () => {
    const url = String(sharedFigmaUrl || '').trim();
    const needsUrl = failedSteps.some((step) => step !== 'tokens');
    const retryRunId = syncRunIdRef.current + 1;
    syncRunIdRef.current = retryRunId;
    setHasTriggeredSyncInView(true);
    if (needsUrl && !url) {
      setSyncError('Figma URL is required to sync the design system.');
      return;
    }

    if (failedSteps.length === 0) return;
    if (failedSteps.includes('components') && failedSteps.includes('variables')) {
      await startSync();
      return;
    }

    setSyncError('');
    resetSyncDiffPreview();

    for (const step of failedSteps) {
      const stepArgs =
        step === 'tokens'
          ? {}
          : { url, figmaToken: String(sharedToken || '').trim() || undefined };
      const runningState: SyncStepState = {
        status: 'running',
        summary: null,
        progress: {
          status: 'running',
          completed: 0,
          total: 0,
          remaining: 0,
          message: 'Running',
        },
      };

      try {
        updateStepState(step, runningState);
        const result = await syncDesignSystemStep(step, stepArgs, {
          systemId,
          onQueued: (jobId) => {
            setActiveSyncJobId(jobId ?? null);
            setActiveSyncOperation(step);
            pendingSyncPersistRef.current = { jobId, error: '' };
            setSyncSteps((prev) => ({
              ...prev,
              [step]: { ...runningState, jobId },
            }));
          },
          // Tokens runs in-process; poll more frequently than the 900 ms default.
          ...(step === 'tokens' ? { pollIntervalMs: 200 } : {}),
        });
        if (syncRunIdRef.current !== retryRunId) return;
        setActiveSyncJobId(null);
        setActiveSyncOperation(null);
        const nextState = toStepStateFromBackend(step, result);
        pendingSyncPersistRef.current = { jobId: result.jobId, error: '' };
        setSyncSteps((prev) => ({ ...prev, [step]: nextState }));
      } catch (cause) {
        if (syncRunIdRef.current !== retryRunId) return;
        setActiveSyncJobId(null);
        setActiveSyncOperation(null);
        const message =
          cause instanceof Error ? cause.message : String(cause || `Retry ${step} failed.`);
        const failedState: SyncStepState = {
          status: 'failed',
          summary: buildFailedSummary(step, message),
          progress: null,
        };
        setSyncError(message);
        pendingSyncPersistRef.current = { error: message };
        setSyncSteps((prev) => ({ ...prev, [step]: failedState }));
        break;
      }
    }
  }, [
    failedSteps,
    resetSyncDiffPreview,
    sharedFigmaUrl,
    sharedToken,
    startSync,
    systemId,
    updateStepState,
  ]);

  return (
    <div>
      <h2 className="mb-3 text-base font-titles font-semibold titles-color">
        Update from Figma
      </h2>

      <div className="space-y-2">
        <FormField
          id="design-system-update-figma-url"
          label="Figma URL"
          className="min-w-0"
        >
          <Input
            id="design-system-update-figma-url"
            value={sharedFigmaUrl}
            onChange={(event) => {
              resetSyncDiffPreview();
              setSharedFigmaUrl(event.target.value);
            }}
            placeholder="https://www.figma.com/design/…"
            disabled={disabled || isSyncRunning}
          />
        </FormField>
        <FormField
          id="design-system-update-figma-token"
          label="Figma token override"
          className="min-w-0"
        >
          <Input
            id="design-system-update-figma-token"
            type="password"
            value={sharedToken}
            onChange={(event) => {
              resetSyncDiffPreview();
              setSharedToken(event.target.value);
            }}
            placeholder="Figma token (optional)"
            autoComplete="off"
            disabled={disabled || isSyncRunning}
          />
        </FormField>
      </div>

      <div className="mt-5 space-y-4">
        <SyncDiffPreview
          diffResult={syncDiffResult}
          variablesPreview={syncVariablesPreview}
          variablesPreviewWarning={syncVariablesPreviewWarning}
          syncErrorMessage={syncError || null}
          syncProgress={syncProgress}
          syncOutcome={syncOutcome}
          previewDebug={syncDiffPreviewDebug}
          variablesPreviewDebug={syncVariablesPreviewDebug}
          error={syncDiffError}
          disabled={disabled}
          isPreviewing={isSyncDiffPreviewing}
          isVariablesPreviewing={isSyncVariablesPreviewing}
          isApplying={isSyncDiffApplying}
          hasRequestedVariablesPreview={hasRequestedSyncVariablesPreview}
          isSyncRunning={isSyncRunning}
          canRetryFailedSteps={failedSteps.length > 0}
          onPreview={() => void runSyncDiffPreview()}
          onLoadVariablesPreview={() => loadSyncVariablesPreview()}
          onApply={(selectedNodeIds) => void handleApplyAndRunSync(selectedNodeIds)}
          onReset={resetSyncDiffPreview}
          onCancelSync={() => void cancelSync()}
          onRetryFailedSteps={() => void retryFailedSteps()}
          onRetryVariablesPreview={retrySyncVariablesPreview}
        />
      </div>
    </div>
  );
}
