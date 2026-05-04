import { useCallback, useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  applySyncDesignSystem,
  previewSyncDesignSystem,
  syncDesignSystemStep,
  type SyncDesignSystemApplyResponse,
  type SyncDesignSystemDiffResult,
  type SyncDesignSystemDryRunResponse,
  type SyncDesignSystemStepResult,
} from '@/lib/api';
import { toApiErrorDisplay, type ApiErrorDisplay } from '@/lib/api-error-ux';

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function buildPreviewNotice(diff: SyncDesignSystemDiffResult): string {
  return [
    countLabel(diff.new_in_figma.length, 'new component', 'new components'),
    countLabel(diff.updated_in_figma.length, 'updated component', 'updated components'),
    countLabel(diff.unchanged.length, 'unchanged component', 'unchanged components'),
    countLabel(diff.missing_in_figma.length, 'missing component', 'missing components'),
  ].join(' · ');
}

function buildApplyNotice(summary: SyncDesignSystemApplyResponse['summary']): string {
  return [
    countLabel(summary.created, 'created component', 'created components'),
    countLabel(summary.updated, 'updated component', 'updated components'),
    countLabel(summary.unchanged, 'unchanged component', 'unchanged components'),
    countLabel(summary.missing, 'missing component', 'missing components'),
  ].join(' · ');
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
  notice: string | null;
  error: ApiErrorDisplay | null;
  isPreviewing: boolean;
  isApplying: boolean;
  runPreview: () => Promise<SyncDesignSystemDryRunResponse | undefined>;
  runApply: () => Promise<SyncDesignSystemApplyResponse | undefined>;
  resetPreview: () => void;
}

export function useDesignSystemSyncPreview(
  args: UseDesignSystemSyncPreviewArgs,
): DesignSystemSyncPreviewState {
  const queryClient = useQueryClient();
  const [diffResult, setDiffResult] = useState<SyncDesignSystemDiffResult | null>(null);
  const [variablesPreview, setVariablesPreview] = useState<SyncDesignSystemStepResult | null>(null);
  const [variablesPreviewWarning, setVariablesPreviewWarning] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<ApiErrorDisplay | null>(null);

  const resetPreview = useCallback(() => {
    setDiffResult(null);
    setVariablesPreview(null);
    setVariablesPreviewWarning(null);
    setNotice(null);
    setError(null);
  }, []);

  useEffect(() => {
    resetPreview();
  }, [args.systemId, resetPreview]);

  const previewMutation = useMutation({
    mutationFn: async (): Promise<{
      dryRun: SyncDesignSystemDryRunResponse;
      variables: SyncDesignSystemStepResult | null;
      variablesWarning: string | null;
    }> => {
      const figmaUrl = String(args.figmaUrl || '').trim();
      if (!figmaUrl) {
        throw new Error('Figma URL is required to preview the sync diff.');
      }
      const figmaToken = String(args.figmaToken || '').trim() || undefined;
      const [dryRunResult, variablesResult] = await Promise.allSettled([
        previewSyncDesignSystem({
          systemId: args.systemId,
          figmaUrl,
          figmaToken,
        }),
        syncDesignSystemStep(
          'variables',
          {
            url: figmaUrl,
            figmaToken,
            dryRun: true,
          },
          {
            systemId: args.systemId,
          },
        ),
      ]);
      if (dryRunResult.status === 'rejected') {
        throw dryRunResult.reason;
      }
      if (variablesResult.status === 'rejected') {
        const reason =
          variablesResult.reason instanceof Error
            ? variablesResult.reason.message
            : String(variablesResult.reason || 'Variables preview failed.');
        return {
          dryRun: dryRunResult.value,
          variables: null,
          variablesWarning: `Variables preview unavailable: ${reason}`,
        };
      }
      return {
        dryRun: dryRunResult.value,
        variables: variablesResult.value,
        variablesWarning: null,
      };
    },
    onSuccess: (response) => {
      setError(null);
      setDiffResult(response.dryRun.diff);
      setVariablesPreview(response.variables);
      setVariablesPreviewWarning(response.variablesWarning);
      setNotice(buildPreviewNotice(response.dryRun.diff));
    },
    onError: (cause) => {
      setDiffResult(null);
      setVariablesPreview(null);
      setVariablesPreviewWarning(null);
      setNotice(null);
      setError(toPreviewErrorDisplay(cause));
    },
  });

  const applyMutation = useMutation({
    mutationFn: async (): Promise<SyncDesignSystemApplyResponse> => {
      const figmaUrl = String(args.figmaUrl || '').trim();
      if (!figmaUrl) {
        throw new Error('Figma URL is required to apply the sync diff.');
      }
      return applySyncDesignSystem({
        systemId: args.systemId,
        figmaUrl,
        figmaToken: String(args.figmaToken || '').trim() || undefined,
      });
    },
    onSuccess: async (response) => {
      setError(null);
      setNotice(`Applied changes: ${buildApplyNotice(response.summary)}.`);
      setDiffResult(null);
      setVariablesPreview(null);
      setVariablesPreviewWarning(null);
      args.onApplySuccess?.(response);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['component-catalog'] }),
        queryClient.invalidateQueries({ queryKey: ['health'] }),
      ]);
    },
    onError: (cause) => {
      setNotice(null);
      setError(toPreviewErrorDisplay(cause));
    },
  });

  return {
    diffResult,
    variablesPreview,
    variablesPreviewWarning,
    notice,
    error,
    isPreviewing: previewMutation.isPending,
    isApplying: applyMutation.isPending,
    runPreview: async () => (await previewMutation.mutateAsync()).dryRun,
    runApply: async () => applyMutation.mutateAsync(),
    resetPreview,
  };
}
