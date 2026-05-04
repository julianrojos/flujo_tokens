import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { FormField } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusAlert } from '@/components/ui/status-alert';
import { useOperationRunner } from '@/hooks/use-operation-runner';
import {
  cancelQueueJob,
  getQueueJob,
  syncDesignSystem,
  syncDesignSystemStep,
  type CaptureFigmaProgress,
  type SyncDesignSystemStepResult,
  type SyncDesignSystemResult,
} from '@/lib/api';
import {
  buildUpdateComponentsPayload,
  buildUpdateVariablesPayload,
  resolveUpdateButtonLabel,
} from '@/features/system/design-system-update-actions-logic';
import {
  resolveOverallSyncHeadline,
  resolveOverallSyncStatus,
  type SyncStepKey,
  type SyncStepStatus,
  type SyncStepSummary,
} from '@/features/system/design-system-sync-logic';
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

function toRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
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

function statusToneClasses(status: SyncStepStatus): string {
  switch (status) {
    case 'completed':
      return 'border-status-success-border/40 bg-status-success-bg/15 text-status-success';
    case 'completed_with_warnings':
      return 'border-status-warning/40 bg-status-warning/10 text-status-warning';
    case 'failed':
      return 'border-status-error/40 bg-status-error-bg/15 text-status-error';
    case 'running':
    case 'queued':
      return 'border-border/70 bg-muted/40 text-foreground';
    case 'idle':
    default:
      return 'border-border/70 bg-surface-1 text-muted-foreground';
  }
}

function resolveStepLabel(step: SyncStepKey): string {
  if (step === 'components') return 'Components';
  if (step === 'variables') return 'Variables';
  return 'Build tokens';
}

function toProgressWidth(progress: CaptureFigmaProgress | null): string {
  if (!progress || progress.total <= 0) return '0%';
  const ratio = Math.min(1, progress.completed / progress.total);
  return `${Math.max(0, ratio * 100)}%`;
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

function toStepStateFromBackend(
  step: SyncStepKey,
  result: SyncDesignSystemStepResult,
): SyncStepState {
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
      details: Object.entries(result.counts).map(
        ([label, value]) => `${label}: ${value}`,
      ),
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
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [activeSyncJobId, setActiveSyncJobId] = useState<string | null>(null);
  const [activeSyncOperation, setActiveSyncOperation] = useState<'full' | SyncStepKey | null>(null);
  const syncRunIdRef = useRef(0);
  const syncStepsRef = useRef(syncSteps);
  const pendingSyncPersistRef = useRef<{
    jobId?: string;
    error?: string;
    } | null>(null);
  const {
    diffResult: syncDiffResult,
    notice: syncDiffNotice,
    error: syncDiffError,
    isPreviewing: isSyncDiffPreviewing,
    isApplying: isSyncDiffApplying,
    runPreview: runSyncDiffPreview,
    runApply: runSyncDiffApply,
    resetPreview: resetSyncDiffPreview,
  } = useDesignSystemSyncPreview({
    systemId,
    figmaUrl: sharedFigmaUrl,
    figmaToken: sharedToken,
    onApplySuccess: () => {
      setLastSyncedAt(new Date().toISOString());
    },
  });

  const [componentsState, componentsActions] = useOperationRunner(
    `ds-admin-components-${systemId}`,
    '/api/capture-figma-screenshot',
    onRunSuccess,
    { systemId },
  );
  const [variablesState, variablesActions] = useOperationRunner(
    `ds-admin-variables-${systemId}`,
    '/api/sync-figma-tokens',
    onRunSuccess,
    { systemId },
  );

  useEffect(() => {
    if (!suggestedUrl) return;
    setSharedFigmaUrl((current) =>
      String(current || '').trim() ? current : suggestedUrl,
    );
  }, [suggestedUrl]);

  useEffect(() => {
    const persisted = loadPersistedSyncState(systemId);
    if (!persisted) {
      setSyncSteps(cloneEmptySyncState());
      setSyncError('');
      setActiveSyncJobId(null);
      setActiveSyncOperation(null);
      return;
    }
    setSyncSteps(persisted.steps);
    setSyncError(persisted.error || '');
    if (persisted.updatedAt && !persisted.error) {
      setLastSyncedAt(persisted.updatedAt);
    }
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
      .catch(() => {
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

  const overallSyncSummary = useMemo(
    () => resolveOverallSyncHeadline(overallSyncStatus),
    [overallSyncStatus],
  );

  const isSyncRunning = overallSyncStatus === 'running';

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

  useEffect(() => {
    syncStepsRef.current = syncSteps;
  }, [syncSteps]);

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
      setSyncError('');
      resetSyncDiffPreview();

      if (!url) {
        setSyncError('Figma URL is required to sync the design system.');
        return;
      }

      const parallelSteps = ['components', 'variables'] as SyncStepKey[];
      for (const step of [...parallelSteps, 'tokens' as SyncStepKey]) {
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
              const queuedTokensState: SyncStepState = {
                status: 'queued',
                summary: null,
                progress: null,
              };
              const nextSteps = {
                components: runningComponentsState,
                variables: runningVariablesState,
                tokens: queuedTokensState,
              };
              setActiveSyncJobId(jobId ?? null);
              setActiveSyncOperation('full');
              persistSyncState(nextSteps, jobId, '');
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
            },
          );

          if (syncRunIdRef.current !== nextRunId) return;

          setActiveSyncJobId(null);
          setActiveSyncOperation(null);
          const nextTokensState = toStepStateFromBackend('tokens', tokensResult);
          updateStepState('tokens', nextTokensState);

          const overallFailed =
            result.status === 'failed' || tokensResult.status === 'failed';
          const overallWarnings =
            result.status === 'completed_with_warnings' ||
            tokensResult.status === 'completed_with_warnings';
          const syncError =
            overallFailed
              ? result.warnings[0] || tokensResult.warnings[0] || 'Sync failed.'
              : '';
          setSyncError(syncError);
          if (!overallFailed && !overallWarnings) {
            setLastSyncedAt(new Date().toISOString());
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
    ],
  );

  const retryFailedStep = useCallback(
    async (step: SyncStepKey) => {
      const url = String(sharedFigmaUrl || '').trim();
      if (!url && step !== 'tokens') {
        setSyncError('Figma URL is required to sync the design system.');
        return;
      }

      setSyncError('');
      resetSyncDiffPreview();
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

      const stepArgs =
        step === 'tokens'
          ? {}
          : { url, figmaToken: String(sharedToken || '').trim() || undefined };

      try {
        updateStepState(step, runningState);
        const result = await syncDesignSystemStep(
          step,
          stepArgs,
          {
            systemId,
            onQueued: (jobId) => {
              const nextStepState = {
                ...runningState,
                jobId,
              };
              const nextSteps = {
                ...syncStepsRef.current,
                [step]: nextStepState,
              };
              setActiveSyncJobId(jobId ?? null);
              setActiveSyncOperation(step);
              syncStepsRef.current = nextSteps;
              setSyncSteps(nextSteps);
              persistSyncState(nextSteps, jobId, '');
            },
          },
        );
        setActiveSyncJobId(null);
        setActiveSyncOperation(null);
        const nextState = toStepStateFromBackend(step, result);
        pendingSyncPersistRef.current = { jobId: result.jobId, error: '' };
        updateStepState(step, nextState);
      } catch (cause) {
        setActiveSyncJobId(null);
        setActiveSyncOperation(null);
        const message =
          cause instanceof Error ? cause.message : String(cause || 'Sync failed.');
        const failedState: SyncStepState = {
          status: 'failed',
          summary: buildFailedSummary(step, message),
          progress: null,
        };
        setSyncError(message);
        pendingSyncPersistRef.current = { error: message };
        setSyncSteps((prev) => ({
          ...prev,
          [step]: failedState,
        }));
      }
    },
    [
      persistSyncState,
      resetSyncDiffPreview,
      sharedFigmaUrl,
      sharedToken,
      systemId,
      updateStepState,
    ],
  );

  const handleUpdateComponents = useCallback(async () => {
    const built = buildUpdateComponentsPayload({
      figmaUrl: sharedFigmaUrl,
      figmaToken: sharedToken,
    });
    if (!built.ok) {
      return;
    }
    await componentsActions.run(built.payload);
  }, [componentsActions, sharedFigmaUrl, sharedToken]);

  const handleUpdateVariables = useCallback(async () => {
    const payload = buildUpdateVariablesPayload({
      figmaUrl: sharedFigmaUrl,
      figmaToken: sharedToken,
    });
    await variablesActions.run(payload);
  }, [variablesActions, sharedFigmaUrl, sharedToken]);

  const canRunVariablesUpdate = !disabled && !variablesState.isRunning;

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
            disabled={
              disabled ||
              isSyncRunning ||
              componentsState.isRunning ||
              variablesState.isRunning
            }
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
            disabled={
              disabled ||
              isSyncRunning ||
              componentsState.isRunning ||
              variablesState.isRunning
            }
          />
        </FormField>
      </div>

      <div className="mt-5 space-y-4">
        <SyncDiffPreview
          diffResult={syncDiffResult}
          notice={syncDiffNotice}
          error={syncDiffError}
          disabled={
            disabled ||
            isSyncRunning ||
            componentsState.isRunning ||
            variablesState.isRunning
          }
          isPreviewing={isSyncDiffPreviewing}
          isApplying={isSyncDiffApplying}
          onPreview={() => void runSyncDiffPreview()}
          onApply={() => void runSyncDiffApply()}
          onReset={resetSyncDiffPreview}
        />

        <div className="rounded-lg border border-border bg-surface-1 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="text-sm font-semibold titles-color">
                Sync design system
              </p>
              <p className="text-xs text-muted-foreground">
                {lastSyncedAt
                  ? `Last synced ${toRelativeTime(lastSyncedAt)} · Components and variables in parallel, then CSS generation`
                  : 'Components and variables run in parallel. CSS is generated after. Partial failure is reported per step.'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {isSyncRunning && activeSyncJobId ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void cancelSync()}
                >
                  Cancel
                </Button>
              ) : null}
              <Button
                onClick={() => void startSync()}
                disabled={disabled || isSyncRunning}
              >
                {isSyncRunning ? 'Syncing...' : 'Sync design system'}
              </Button>
            </div>
          </div>

          {syncError ? (
            <div className="mt-3">
              <StatusAlert variant="error" title="Sync error" description={syncError} />
            </div>
          ) : null}

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(['components', 'variables', 'tokens'] as SyncStepKey[]).map((step) => {
              const state = syncSteps[step];
              const summary = state.summary;
              const canRetry = state.status === 'failed' && !isSyncRunning;
              const hasProgress =
                state.progress &&
                (state.progress.total > 0 || state.progress.completed > 0);
              return (
                <section
                  key={step}
                  className="rounded border border-border/70 bg-card p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-titles font-semibold titles-color">
                        {resolveStepLabel(step)}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        {summary?.headline ??
                          (state.status === 'running'
                            ? 'Running'
                            : state.status === 'queued'
                              ? 'Queued'
                              : 'Waiting to run')}
                      </p>
                    </div>
                    <span
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${statusToneClasses(state.status)}`}
                    >
                      {state.status.replace(/_/g, ' ')}
                    </span>
                  </div>

                  {hasProgress ? (
                    <div className="mt-3">
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-foreground/70 transition-all"
                          style={{ width: toProgressWidth(state.progress) }}
                        />
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {state.progress?.completed ?? 0} /{' '}
                        {state.progress?.total ?? 0} completed
                        {state.progress?.currentSlug ? (
                          <>
                            {' '}
                            · current:{' '}
                            <span className="font-medium text-foreground">
                              {state.progress.currentSlug}
                            </span>
                          </>
                        ) : null}
                      </p>
                    </div>
                  ) : (state.status === 'running' || state.status === 'queued') ? (
                    <div className="mt-3">
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div className="h-full w-full animate-pulse rounded-full bg-foreground/30" />
                      </div>
                    </div>
                  ) : null}

                  {summary ? (
                    <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      {summary.details.map((detail) => {
                        const [label, value] = detail.split(':', 2);
                        return (
                          <div
                            key={`${step}-${detail}`}
                            className="rounded border border-border/60 bg-surface-1 px-2 py-1.5"
                          >
                            <dt className="text-muted-foreground">
                              {label.trim()}
                            </dt>
                            <dd className="font-medium text-foreground">
                              {value?.trim() || '0'}
                            </dd>
                          </div>
                        );
                      })}
                    </dl>
                  ) : null}

                  {summary?.warnings.length ? (
                    <ul className="mt-3 space-y-1 text-xs text-status-warning">
                      {summary.warnings.map((warning) => (
                        <li key={`${step}-${warning}`}>• {warning}</li>
                      ))}
                    </ul>
                  ) : null}

                  {canRetry ? (
                    <div className="mt-3">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void retryFailedStep(step)}
                      >
                        Rerun failed step
                      </Button>
                    </div>
                  ) : null}
                </section>
              );
            })}
          </div>

          <div className="mt-4 rounded border border-border/70 bg-surface-1 p-3">
            <p className="text-sm font-semibold titles-color">
              {overallSyncSummary}
            </p>
            {overallSyncStatus !== 'idle' ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Overall status:{' '}
                <span className="font-medium text-foreground">
                  {overallSyncStatus.replace(/_/g, ' ')}
                </span>
              </p>
            ) : null}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Advanced direct updates
          </p>
          <div className="flex items-center justify-end gap-2">
            <Button
              onClick={() => void handleUpdateComponents()}
              disabled={disabled || isSyncRunning || componentsState.isRunning}
            >
              {resolveUpdateButtonLabel({
                type: 'components',
                isRunning: componentsState.isRunning,
              })}
            </Button>
            <Button
              onClick={() => void handleUpdateVariables()}
              disabled={!canRunVariablesUpdate || isSyncRunning}
            >
              {resolveUpdateButtonLabel({
                type: 'variables',
                isRunning: variablesState.isRunning,
              })}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
