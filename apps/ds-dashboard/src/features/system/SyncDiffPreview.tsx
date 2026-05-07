import { useId, useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  StatusAlert,
  StatusAlertDescription,
  StatusAlertTitle,
} from '@/components/ui/status-alert';
import type {
  SyncDesignSystemDiffResult,
  SyncDesignSystemNodeSnapshot,
  SyncDesignSystemDiffDbComponentRef,
  SyncDesignSystemStepResult,
} from '@/lib/api';
import type { ApiErrorDisplay } from '@/lib/api-error-ux';

type BucketKey = keyof SyncDesignSystemDiffResult;
type VariablePreviewItem = {
  id: string;
  label: string;
  detail?: string;
};

type VariablesDiffPreview = Record<BucketKey, VariablePreviewItem[]>;
type VariablesDiffPreviewBuild = {
  diff: VariablesDiffPreview | null;
  counts: Record<BucketKey, number>;
  hasBucketSignals: boolean;
};
type VariableBucketResolution = {
  items: VariablePreviewItem[];
  aliasUsed: string | null;
};

interface SyncDiffPreviewProps {
  diffResult: SyncDesignSystemDiffResult | null;
  variablesPreview?: SyncDesignSystemStepResult | null;
  variablesPreviewWarning?: string | null;
  syncErrorMessage?: string | null;
  syncProgress?: {
    active: boolean;
    percent: number;
    label: string;
    detail?: string;
  } | null;
  syncOutcome?: {
    status: 'success' | 'error';
    message: string;
  } | null;
  notice?: string | null;
  error?: ApiErrorDisplay | null;
  isPreviewing?: boolean;
  isApplying?: boolean;
  isSyncRunning?: boolean;
  canRetryFailedSteps?: boolean;
  disabled?: boolean;
  onPreview: () => void;
  onApply: () => void;
  onReset: () => void;
  onCancelSync?: () => void;
  onRetryFailedSteps?: () => void;
}

function SyncProgressBar({
  percent,
  label,
  detail,
}: {
  percent: number;
  label: string;
  detail?: string;
}) {
  const clampedPercent = Math.min(100, Math.max(0, percent));
  const labelId = useId();

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span id={labelId} className="text-muted-foreground">
          {label}
          {detail ? <span className="ml-2 text-xs text-muted-foreground/90">{detail}</span> : null}
        </span>
        <span className="font-medium tabular-nums">{clampedPercent}%</span>
      </div>
      <div
        role="progressbar"
        aria-labelledby={labelId}
        aria-valuetext={`${clampedPercent}%`}
        aria-valuenow={clampedPercent}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full rounded-full bg-primary transition-all duration-700 ease-out"
          style={{ width: `${clampedPercent}%` }}
        />
      </div>
    </div>
  );
}

const bucketMeta: Record<
  BucketKey,
  {
    title: string;
    description: string;
    badgeVariant: 'success' | 'warning' | 'neutral' | 'error';
    itemKind: 'figma' | 'pair' | 'db';
    defaultOpen: boolean;
  }
> = {
  new_in_figma: {
    title: 'New',
    description: 'Items in Figma that do not exist in the database yet.',
    badgeVariant: 'success',
    itemKind: 'figma',
    defaultOpen: true,
  },
  updated_in_figma: {
    title: 'Updated',
    description: 'Items that exist in both places but changed in Figma.',
    badgeVariant: 'warning',
    itemKind: 'pair',
    defaultOpen: true,
  },
  unchanged: {
    title: 'Unchanged',
    description: 'Items that match between Figma and the database.',
    badgeVariant: 'neutral',
    itemKind: 'pair',
    defaultOpen: false,
  },
  missing_in_figma: {
    title: 'Deleted',
    description: 'Items present in the database but missing in Figma.',
    badgeVariant: 'error',
    itemKind: 'db',
    defaultOpen: true,
  },
};

function countLabel(count: number): string {
  return `${count} ${count === 1 ? 'item' : 'items'}`;
}

function formatSnapshot(snapshot: SyncDesignSystemNodeSnapshot): string {
  const parts = [snapshot.name, snapshot.nodeId];
  if (snapshot.pageName) {
    parts.push(snapshot.pageName);
  }
  return parts.join(' · ');
}

function formatDbSnapshot(snapshot: SyncDesignSystemDiffDbComponentRef): string {
  return [snapshot.name, snapshot.slug, snapshot.nodeId].join(' · ');
}

function renderBucketItem(
  bucket: BucketKey,
  item:
    | SyncDesignSystemNodeSnapshot
    | { figma: SyncDesignSystemNodeSnapshot; db: SyncDesignSystemDiffDbComponentRef }
    | SyncDesignSystemDiffDbComponentRef,
) {
  const meta = bucketMeta[bucket];

  if (meta.itemKind === 'figma') {
    const snapshot = item as SyncDesignSystemNodeSnapshot;
    return (
      <li key={`${snapshot.nodeId}-${snapshot.contentFingerprint}`} className="bg-surface-1 px-3 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm text-foreground">{formatSnapshot(snapshot)}</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {snapshot.pageName ? `${snapshot.pageName} · ` : ''}
          {snapshot.type} · variants {snapshot.variantCount}
        </p>
      </li>
    );
  }

  if (meta.itemKind === 'db') {
    const snapshot = item as SyncDesignSystemDiffDbComponentRef;
    return (
      <li key={`${snapshot.nodeId}-${snapshot.id}`} className="bg-surface-1 px-3 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm text-foreground">{formatDbSnapshot(snapshot)}</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {snapshot.slug} · {snapshot.status}
        </p>
      </li>
    );
  }

  const pair = item as {
    figma: SyncDesignSystemNodeSnapshot;
    db: SyncDesignSystemDiffDbComponentRef;
  };
  return (
    <li key={`${pair.figma.nodeId}-${pair.db.id}`} className="bg-surface-1 px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-foreground">{formatSnapshot(pair.figma)}</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        DB: {formatDbSnapshot(pair.db)}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {pair.figma.pageName ? `${pair.figma.pageName} · ` : ''}
        {pair.figma.type} · variants {pair.figma.variantCount}
      </p>
    </li>
  );
}

const variableBucketAliases: Record<BucketKey, string[]> = {
  new_in_figma: ['new_in_figma', 'new', 'added', 'created'],
  updated_in_figma: ['updated_in_figma', 'updated', 'modified', 'changed'],
  unchanged: ['unchanged', 'same'],
  missing_in_figma: ['missing_in_figma', 'missing', 'deleted', 'removed'],
};

function toVariablePreviewItem(value: unknown, bucket: BucketKey): VariablePreviewItem | null {
  if (typeof value === 'string') {
    const label = value.trim();
    if (!label) return null;
    return {
      id: `${bucket}-${label}`,
      label,
    };
  }
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const label =
    String(
      row.name ??
        row.path ??
        row.slug ??
        row.id ??
        row.key ??
        row.variableId ??
        row.variable_id ??
        '',
    ).trim() || null;
  if (!label) return null;
  const detail =
    String(
      row.collection ??
        row.mode ??
        row.reason ??
        row.status ??
        row.type ??
        '',
    ).trim() || undefined;
  const identity =
    String(row.id ?? row.key ?? row.variableId ?? row.variable_id ?? label).trim() || label;
  return {
    id: `${bucket}-${identity}`,
    label,
    detail,
  };
}

function readVariableBucketItems(raw: Record<string, unknown>, bucket: BucketKey): VariableBucketResolution {
  for (const alias of variableBucketAliases[bucket]) {
    const candidate = raw[alias];
    if (!Array.isArray(candidate)) continue;
    const items = candidate
      .map((entry) => toVariablePreviewItem(entry, bucket))
      .filter((entry): entry is VariablePreviewItem => entry !== null);
    if (items.length > 0) return { items, aliasUsed: alias };
  }
  return { items: [], aliasUsed: null };
}

function readVariableBucketCount(
  raw: Record<string, unknown>,
  counts: Record<string, number>,
  bucket: BucketKey,
  preferredAlias: string | null,
  fallbackLength: number,
): number {
  if (preferredAlias) {
    const preferredRawValue = raw[preferredAlias];
    if (
      typeof preferredRawValue === 'number' &&
      Number.isFinite(preferredRawValue) &&
      preferredRawValue >= 0
    ) {
      return Math.floor(preferredRawValue);
    }
    const preferredCountValue = counts[preferredAlias];
    if (
      typeof preferredCountValue === 'number' &&
      Number.isFinite(preferredCountValue) &&
      preferredCountValue >= 0
    ) {
      return Math.floor(preferredCountValue);
    }
  }

  for (const alias of variableBucketAliases[bucket]) {
    const rawValue = raw[alias];
    if (typeof rawValue === 'number' && Number.isFinite(rawValue) && rawValue >= 0) {
      return Math.floor(rawValue);
    }
    const countValue = counts[alias];
    if (typeof countValue === 'number' && Number.isFinite(countValue) && countValue >= 0) {
      return Math.floor(countValue);
    }
  }
  return fallbackLength;
}

function buildVariablesDiffPreview(
  variablesPreview: SyncDesignSystemStepResult | null,
): VariablesDiffPreviewBuild {
  if (!variablesPreview) {
    return {
      diff: null,
      counts: {
        new_in_figma: 0,
        updated_in_figma: 0,
        unchanged: 0,
        missing_in_figma: 0,
      },
      hasBucketSignals: false,
    };
  }

  const summaryRaw =
    variablesPreview.raw && typeof variablesPreview.raw === 'object'
      ? (variablesPreview.raw as Record<string, unknown>)
      : {};
  const raw =
    summaryRaw.raw && typeof summaryRaw.raw === 'object'
      ? (summaryRaw.raw as Record<string, unknown>)
      : summaryRaw;
  const counts =
    variablesPreview.counts && typeof variablesPreview.counts === 'object'
      ? variablesPreview.counts
      : {};

  const newBucket = readVariableBucketItems(raw, 'new_in_figma');
  const updatedBucket = readVariableBucketItems(raw, 'updated_in_figma');
  const unchangedBucket = readVariableBucketItems(raw, 'unchanged');
  const missingBucket = readVariableBucketItems(raw, 'missing_in_figma');
  const hasBucketSignals = (Object.keys(variableBucketAliases) as BucketKey[]).some((bucket) =>
    variableBucketAliases[bucket].some((alias) => {
      const rawValue = raw[alias];
      if (Array.isArray(rawValue)) return true;
      if (typeof rawValue === 'number' && Number.isFinite(rawValue)) return true;
      const countValue = counts[alias];
      return typeof countValue === 'number' && Number.isFinite(countValue);
    }),
  );

  return {
    diff: {
      new_in_figma: newBucket.items,
      updated_in_figma: updatedBucket.items,
      unchanged: unchangedBucket.items,
      missing_in_figma: missingBucket.items,
    },
    counts: {
      new_in_figma: readVariableBucketCount(
        raw,
        counts,
        'new_in_figma',
        newBucket.aliasUsed,
        newBucket.items.length,
      ),
      updated_in_figma: readVariableBucketCount(
        raw,
        counts,
        'updated_in_figma',
        updatedBucket.aliasUsed,
        updatedBucket.items.length,
      ),
      unchanged: readVariableBucketCount(
        raw,
        counts,
        'unchanged',
        unchangedBucket.aliasUsed,
        unchangedBucket.items.length,
      ),
      missing_in_figma: readVariableBucketCount(
        raw,
        counts,
        'missing_in_figma',
        missingBucket.aliasUsed,
        missingBucket.items.length,
      ),
    },
    hasBucketSignals,
  };
}

export function SyncDiffPreview({
  diffResult,
  variablesPreview = null,
  variablesPreviewWarning = null,
  syncErrorMessage = null,
  syncProgress = null,
  syncOutcome = null,
  notice,
  error,
  isPreviewing = false,
  isApplying = false,
  isSyncRunning = false,
  canRetryFailedSteps = false,
  disabled = false,
  onPreview,
  onApply,
  onReset,
  onCancelSync,
  onRetryFailedSteps,
}: SyncDiffPreviewProps) {
  const previewReady = diffResult !== null;
  const variablesDiffPreview = useMemo(
    () => buildVariablesDiffPreview(variablesPreview),
    [variablesPreview],
  );
  const [openBuckets, setOpenBuckets] = useState<Record<BucketKey, boolean>>({
    new_in_figma: false,
    updated_in_figma: false,
    unchanged: false,
    missing_in_figma: false,
  });
  const [openVariableBuckets, setOpenVariableBuckets] = useState<Record<BucketKey, boolean>>({
    new_in_figma: false,
    updated_in_figma: false,
    unchanged: false,
    missing_in_figma: false,
  });

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-sm font-titles font-semibold titles-color">Sync diff preview</h3>
          <p className="text-sm text-muted-foreground">
            Compare Figma against the database before applying changes.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {notice ? (
          <StatusAlert variant="success">
            <StatusAlertTitle>Preview ready</StatusAlertTitle>
            <StatusAlertDescription>{notice}</StatusAlertDescription>
          </StatusAlert>
        ) : null}

        {variablesPreviewWarning ? (
          <StatusAlert variant="warning">
            <StatusAlertTitle>Variables preview unavailable</StatusAlertTitle>
            <StatusAlertDescription>{variablesPreviewWarning}</StatusAlertDescription>
          </StatusAlert>
        ) : null}

        {syncErrorMessage && syncOutcome?.status !== 'error' ? (
          <StatusAlert variant="error">
            <StatusAlertTitle>Sync error</StatusAlertTitle>
            <StatusAlertDescription>{syncErrorMessage}</StatusAlertDescription>
          </StatusAlert>
        ) : null}

        {syncProgress?.active ? (
          <SyncProgressBar
            percent={syncProgress.percent}
            label={syncProgress.label}
            detail={syncProgress.detail}
          />
        ) : null}

        {syncOutcome ? (
          <StatusAlert variant={syncOutcome.status === 'success' ? 'success' : 'error'}>
            <StatusAlertTitle>
              {syncOutcome.status === 'success' ? 'Success' : 'Sync failed'}
            </StatusAlertTitle>
            <StatusAlertDescription>{syncOutcome.message}</StatusAlertDescription>
          </StatusAlert>
        ) : null}

        {error ? (
          <StatusAlert variant="error">
            <StatusAlertTitle>{error.title}</StatusAlertTitle>
            <StatusAlertDescription>{error.message}</StatusAlertDescription>
            {error.action ? <p className="text-xs text-status-error/90">{error.action}</p> : null}
          </StatusAlert>
        ) : null}

        {!previewReady ? (
          <StatusAlert variant="info">
            <StatusAlertTitle>Run a dry-run first</StatusAlertTitle>
            <StatusAlertDescription>
              Inspect the diff before mutating the database. The apply step re-scans Figma before writing, so the preview stays auditable.
            </StatusAlertDescription>
          </StatusAlert>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
            <div className="space-y-3">
              <div className="space-y-1">
                <h4 className="text-sm font-titles font-semibold titles-color">Variables</h4>
                {!variablesDiffPreview.hasBucketSignals &&
                String(variablesPreview?.summary || '').trim() ? (
                  <p className="text-xs text-muted-foreground">
                    {variablesPreview?.summary}
                  </p>
                ) : null}
              </div>
              {!variablesDiffPreview.hasBucketSignals ? (
                <StatusAlert variant="info">
                  <StatusAlertTitle>Variables diff unavailable</StatusAlertTitle>
                  <StatusAlertDescription>
                    {variablesPreviewWarning
                      ? 'The variables preview response is incomplete. Check plugin/API warnings and retry.'
                      : 'This response does not include variable diff buckets. Restart the API server to load the latest backend changes.'}
                  </StatusAlertDescription>
                </StatusAlert>
              ) : (
                (
                  ['new_in_figma', 'updated_in_figma', 'unchanged', 'missing_in_figma'] as BucketKey[]
                ).map((bucket) => {
                  const meta = bucketMeta[bucket];
                  const items = variablesDiffPreview.diff?.[bucket] || [];
                  const count = variablesDiffPreview.counts[bucket];
                  const open = openVariableBuckets[bucket];
                  return (
                    <details
                      key={`variables-${bucket}`}
                      className="rounded border border-border/70 bg-surface-1 p-3"
                      open={open}
                      onToggle={(event) => {
                        const nextOpen = event.currentTarget.open;
                        setOpenVariableBuckets((current) => ({
                          ...current,
                          [bucket]: nextOpen,
                        }));
                      }}
                    >
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded outline-none">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <h5 className="text-sm font-titles font-semibold leading-none text-foreground transition-colors hover:text-primary">{meta.title}</h5>
                            <Badge variant={meta.badgeVariant}>{count}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">{meta.description}</p>
                        </div>
                      </summary>
                      <div className="mt-3">
                        {items.length > 0 ? (
                          <ul className="space-y-2">
                            {items.map((item) => (
                              <li
                                key={item.id}
                                className="bg-surface-1 px-3 py-2"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="text-sm text-foreground">{item.label}</span>
                                </div>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            {count > 0
                              ? `${countLabel(count)} detected, but this preview response does not include per-variable rows.`
                              : 'No items in this bucket.'}
                          </p>
                        )}
                      </div>
                    </details>
                  );
                })
              )}
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <h4 className="text-sm font-titles font-semibold titles-color">Components</h4>
              </div>
              {(
                ['new_in_figma', 'updated_in_figma', 'unchanged', 'missing_in_figma'] as BucketKey[]
              ).map((bucket) => {
                const meta = bucketMeta[bucket];
                const items = diffResult[bucket];
                const open = openBuckets[bucket];
                return (
                  <details
                    key={bucket}
                    className="rounded border border-border/70 bg-surface-1 p-3"
                    open={open}
                    onToggle={(event) => {
                      const nextOpen = event.currentTarget.open;
                      setOpenBuckets((current) => ({
                        ...current,
                        [bucket]: nextOpen,
                      }));
                    }}
                  >
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded outline-none">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h5 className="text-sm font-titles font-semibold leading-none text-foreground transition-colors hover:text-primary">{meta.title}</h5>
                          <Badge variant={meta.badgeVariant}>{items.length}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{meta.description}</p>
                      </div>
                    </summary>
                    <div className="mt-3">
                      {items.length > 0 ? (
                        <ul className="space-y-2">
                          {items.map((item) => renderBucketItem(bucket, item))}
                        </ul>
                      ) : (
                        <p className="text-sm text-muted-foreground">No items in this bucket.</p>
                      )}
                    </div>
                  </details>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        {isSyncRunning && onCancelSync ? (
          <Button
            type="button"
            variant="outline"
            onClick={onCancelSync}
            disabled={disabled || isPreviewing || isApplying}
          >
            Cancel sync
          </Button>
        ) : null}
        {!isSyncRunning && canRetryFailedSteps && onRetryFailedSteps ? (
          <Button
            type="button"
            variant="outline"
            onClick={onRetryFailedSteps}
            disabled={disabled || isPreviewing || isApplying}
          >
            Retry failed steps
          </Button>
        ) : null}
        {previewReady ? (
          <>
            <Button
              type="button"
              variant="outline"
              onClick={onReset}
              disabled={disabled || isPreviewing || isApplying}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onPreview}
              disabled={disabled || isPreviewing || isApplying}
              loading={isPreviewing}
            >
              Re-scan
            </Button>
            <Button
              type="button"
              onClick={onApply}
              disabled={disabled || isPreviewing || isApplying}
              loading={isApplying}
            >
              Sync design system
            </Button>
          </>
        ) : (
          <Button
            type="button"
            onClick={onPreview}
            disabled={disabled || isPreviewing || isApplying}
            loading={isPreviewing}
          >
            Preview sync diff
          </Button>
        )}
      </div>
    </section>
  );
}
