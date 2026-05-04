import type {
  CaptureFigmaProgress,
  CaptureFigmaScreenshotResult,
  SyncFigmaTokensResult,
} from '@/lib/api';

export type SyncStepKey = 'components' | 'variables' | 'tokens';

export type SyncStepStatus =
  | 'idle'
  | 'queued'
  | 'running'
  | 'completed'
  | 'completed_with_warnings'
  | 'failed';

export interface SyncStepSummary {
  status: SyncStepStatus;
  headline: string;
  details: string[];
  warnings: string[];
}

export interface SyncStepProgress {
  status: CaptureFigmaProgress['status'];
  completed: number;
  total: number;
  remaining: number;
  currentSlug?: string;
  message?: string;
}

function toCount(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.floor(parsed);
}

function summarizeComponentFailure(
  failed: Array<{ slug: string; error: string }> | undefined,
): string[] {
  if (!Array.isArray(failed) || failed.length === 0) return [];
  const first = failed[0];
  const message = String(first?.error || '').trim();
  if (!message) return [];
  return [`First failed component: ${message}`];
}

export function summarizeComponentsSyncResult(
  result: CaptureFigmaScreenshotResult,
): SyncStepSummary {
  const capturedCount = Array.isArray(result.captured)
    ? result.captured.length
    : 0;
  const failedCount = Array.isArray(result.failed) ? result.failed.length : 0;
  const skippedCount = Array.isArray(result.skipped) ? result.skipped.length : 0;
  const targetCount = Array.isArray(result.targets)
    ? result.targets.length
    : toCount(result.targets_total) || capturedCount + failedCount + skippedCount;
  const warnings: string[] = [];

  if (Array.isArray(result.failed) && result.failed.length > 0) {
    warnings.push(`${result.failed.length} component(s) failed to import.`);
    warnings.push(...summarizeComponentFailure(result.failed));
  }
  if (skippedCount > 0) {
    warnings.push(`${skippedCount} component candidate(s) were skipped during capture.`);
  }
  if (result.figma_error?.message) {
    warnings.push(String(result.figma_error.message));
  }
  if (result.ok === false && warnings.length === 0) {
    warnings.push(String(result.error || result.message || 'Components sync failed.'));
  }
  if (
    capturedCount === 0 &&
    failedCount === 0 &&
    skippedCount === 0 &&
    result.ok !== false
  ) {
    warnings.push('No capture targets were resolved from the Figma file.');
  }

  let status: SyncStepStatus = 'completed';
  if (failedCount > 0) {
    status = capturedCount > 0 ? 'completed_with_warnings' : 'failed';
  } else if (skippedCount > 0) {
    status = 'completed_with_warnings';
  } else if (result.ok === false) {
    status = 'failed';
  }

  const headline =
    status === 'failed'
      ? 'Components sync failed'
      : status === 'completed_with_warnings'
        ? 'Components synced with warnings'
        : 'Components synced';

  return {
    status,
    headline,
    details: [
      `Captured: ${capturedCount}`,
      `Failed: ${failedCount}`,
      `Skipped: ${skippedCount}`,
      `Targets: ${targetCount}`,
    ],
    warnings,
  };
}

export function summarizeVariablesSyncResult(
  result: SyncFigmaTokensResult,
): SyncStepSummary {
  const warnings: string[] = [];
  if (result.componentsTruncated) {
    warnings.push('Component list was truncated by the plugin search limit.');
  }
  if (result.ok === false) {
    warnings.push('Variables sync failed.');
  }

  const status: SyncStepStatus =
    result.ok === false
      ? 'failed'
      : warnings.length > 0
        ? 'completed_with_warnings'
        : 'completed';

  const headline =
    status === 'failed'
      ? 'Variables sync failed'
      : status === 'completed_with_warnings'
        ? 'Variables synced with warnings'
        : 'Variables synced';

  return {
    status,
    headline,
    details: [
      `Tokens: ${toCount(result.tokens)}`,
      `Token mode values: ${toCount(result.tokenModeValues)}`,
      `Aliases: ${toCount(result.aliases)}`,
      `Components: ${toCount(result.components)}`,
      `Usage restored: ${toCount(result.usageRestored)}`,
      `Usage dropped: ${toCount(result.usageDropped)}`,
    ],
    warnings,
  };
}

export function resolveOverallSyncStatus(args: {
  components: SyncStepStatus;
  variables: SyncStepStatus;
  tokens: SyncStepStatus;
}): SyncStepStatus {
  const values = [args.components, args.variables, args.tokens];
  if (values.some((v) => v === 'running' || v === 'queued')) return 'running';
  if (values.every((v) => v === 'idle')) return 'idle';
  if (values.some((v) => v === 'completed_with_warnings')) return 'completed_with_warnings';
  if (
    values.some((v) => v === 'failed') &&
    values.some((v) => v === 'completed' || v === 'completed_with_warnings')
  ) return 'completed_with_warnings';
  if (values.some((v) => v === 'failed')) return 'failed';
  if (values.every((v) => v === 'completed')) return 'completed';
  return 'idle';
}
