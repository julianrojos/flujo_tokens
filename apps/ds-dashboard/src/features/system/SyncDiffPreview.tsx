import { useId, useState } from 'react';

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
    title: 'Nuevos',
    description: 'Componentes en Figma que no existen aún en la base de datos.',
    badgeVariant: 'success',
    itemKind: 'figma',
    defaultOpen: true,
  },
  updated_in_figma: {
    title: 'Actualizados',
    description: 'Componentes que existen en ambos lados pero cambiaron en Figma.',
    badgeVariant: 'warning',
    itemKind: 'pair',
    defaultOpen: true,
  },
  unchanged: {
    title: 'Sin cambios',
    description: 'Componentes que coinciden entre Figma y la base de datos.',
    badgeVariant: 'neutral',
    itemKind: 'pair',
    defaultOpen: false,
  },
  missing_in_figma: {
    title: 'Desaparecidos',
    description: 'Componentes presentes en la base de datos pero ausentes en Figma.',
    badgeVariant: 'error',
    itemKind: 'db',
    defaultOpen: true,
  },
};

function countLabel(count: number): string {
  return `${count} ${count === 1 ? 'elemento' : 'elementos'}`;
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
      <li key={`${snapshot.nodeId}-${snapshot.contentFingerprint}`} className="rounded border border-border/60 bg-surface-1 px-3 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-medium text-foreground">{formatSnapshot(snapshot)}</span>
          <span className="text-xs text-muted-foreground">{snapshot.nodeId}</span>
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
      <li key={`${snapshot.nodeId}-${snapshot.id}`} className="rounded border border-border/60 bg-surface-1 px-3 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-medium text-foreground">{formatDbSnapshot(snapshot)}</span>
          <span className="text-xs text-muted-foreground">{snapshot.nodeId}</span>
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
    <li key={`${pair.figma.nodeId}-${pair.db.id}`} className="rounded border border-border/60 bg-surface-1 px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium text-foreground">{formatSnapshot(pair.figma)}</span>
        <span className="text-xs text-muted-foreground">{pair.figma.nodeId}</span>
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
  const [openBuckets, setOpenBuckets] = useState<Record<BucketKey, boolean>>({
    new_in_figma: true,
    updated_in_figma: true,
    unchanged: false,
    missing_in_figma: true,
  });

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-base font-titles font-semibold titles-color">Sync diff preview</h3>
          <p className="text-sm text-muted-foreground">
            Compare Figma against the database before applying changes.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {previewReady ? (
            <>
              <Badge variant="success">{diffResult.new_in_figma.length}</Badge>
              <Badge variant="warning">{diffResult.updated_in_figma.length}</Badge>
              <Badge variant="neutral">{diffResult.unchanged.length}</Badge>
              <Badge variant="error">{diffResult.missing_in_figma.length}</Badge>
            </>
          ) : (
            <Badge variant="neutral">Ready to scan</Badge>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {notice ? (
          <StatusAlert variant="success">
            <StatusAlertTitle>Preview ready</StatusAlertTitle>
            <StatusAlertDescription>{notice}</StatusAlertDescription>
          </StatusAlert>
        ) : null}

        {variablesPreview ? (
          <div className="rounded border border-border/70 bg-surface-1 p-3">
            <p className="text-sm font-semibold titles-color">Variables preview</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {variablesPreview.summary}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge
                variant={
                  variablesPreview.status === 'failed'
                    ? 'error'
                    : variablesPreview.status === 'completed_with_warnings'
                      ? 'warning'
                      : 'success'
                }
              >
                {variablesPreview.status.replace(/_/g, ' ')}
              </Badge>
              {Object.entries(variablesPreview.counts).map(([label, value]) => (
                <Badge key={label} variant="neutral">
                  {label}: {value}
                </Badge>
              ))}
            </div>
            {variablesPreview.warnings.length > 0 ? (
              <ul className="mt-2 space-y-1 text-xs text-status-warning">
                {variablesPreview.warnings.map((warning) => (
                  <li key={warning}>• {warning}</li>
                ))}
              </ul>
            ) : null}
          </div>
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
          <div className="space-y-3">
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
                        <span className="font-semibold titles-color">{meta.title}</span>
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
