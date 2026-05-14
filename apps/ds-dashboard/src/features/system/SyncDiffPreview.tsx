import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Modal,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from '@/components/ui/overlay';
import {
  StatusAlert,
  StatusAlertDescription,
  StatusAlertTitle,
} from '@/components/ui/status-alert';
import type {
  SyncDesignSystemDiffResult,
  SyncDesignSystemDryRunResponse,
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
  previewDebug?: SyncDesignSystemDryRunResponse['_debug'] | null;
  variablesPreviewDebug?: SyncDesignSystemStepResult['_debug'] | null;
  error?: ApiErrorDisplay | null;
  isPreviewing?: boolean;
  isVariablesPreviewing?: boolean;
  hasRequestedVariablesPreview?: boolean;
  isApplying?: boolean;
  isSyncRunning?: boolean;
  canRetryFailedSteps?: boolean;
  disabled?: boolean;
  onPreview: () => void;
  onLoadVariablesPreview?: () => void;
  onApply: (selectedNodeIds: string[] | undefined) => void;
  onReset: () => void;
  onCancelSync?: () => void;
  onRetryFailedSteps?: () => void;
  onRetryVariablesPreview?: () => void;
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

const SELECTABLE_COMPONENT_BUCKETS = new Set<BucketKey>(['new_in_figma', 'updated_in_figma']);

function getSelectableBucketNodeIds(
  bucket: BucketKey,
  items: SyncDesignSystemDiffResult[BucketKey],
): string[] {
  if (bucket === 'new_in_figma') {
    return (items as SyncDesignSystemNodeSnapshot[]).map((i) => i.nodeId);
  }
  if (bucket === 'updated_in_figma') {
    return (
      items as Array<{ figma: SyncDesignSystemNodeSnapshot; db: SyncDesignSystemDiffDbComponentRef }>
    ).map((i) => i.figma.nodeId);
  }
  return [];
}

function buildInitialSelection(diff: SyncDesignSystemDiffResult | null): Set<string> {
  if (!diff) return new Set();
  const ids = new Set<string>();
  for (const item of diff.new_in_figma) ids.add(item.nodeId);
  for (const item of diff.updated_in_figma) ids.add(item.figma.nodeId);
  return ids;
}

function buildSelectionResetKey(diff: SyncDesignSystemDiffResult | null): string {
  if (!diff) return '';
  const newIds = diff.new_in_figma.map((item) => item.nodeId).join('|');
  const updatedIds = diff.updated_in_figma
    .map((item) => item.figma.nodeId)
    .join('|');
  return `${newIds}::${updatedIds}`;
}


function countLabel(count: number): string {
  return `${count} ${count === 1 ? 'item' : 'items'}`;
}

// ---------------------------------------------------------------------------
// Per-bucket modal
// ---------------------------------------------------------------------------

function FigmaComponentGlyph() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 18 18"
      className="block h-4 w-4 shrink-0 text-[var(--app-brand-figma)]"
      fill="currentColor"
    >
      <path d="M9 1.75 12.25 5 9 8.25 5.75 5 9 1.75Z" />
      <path d="M13 5.75 16.25 9 13 12.25 9.75 9 13 5.75Z" />
      <path d="M9 9.75 12.25 13 9 16.25 5.75 13 9 9.75Z" />
      <path d="M1.75 9 5 5.75 8.25 9 5 12.25 1.75 9Z" />
    </svg>
  );
}

type ModalItem = {
  key: string;
  nodeId: string | null; // null for db-only (deleted / unchanged read-only) items
  name: string;
  detail: string;
  pageName: string; // '' when not available (e.g. deleted items)
  hasFigmaGlyph: boolean;
};

function toModalItems(
  bucket: BucketKey,
  items: SyncDesignSystemDiffResult[BucketKey],
): ModalItem[] {
  if (bucket === 'new_in_figma') {
    return (items as SyncDesignSystemNodeSnapshot[]).map((item) => ({
      key: `${item.nodeId}-${item.contentFingerprint}`,
      nodeId: item.nodeId,
      name: item.name,
      detail: `variants ${item.variantCount}`,
      pageName: item.pageName || '',
      hasFigmaGlyph: true,
    }));
  }
  if (bucket === 'updated_in_figma') {
    return (
      items as Array<{
        figma: SyncDesignSystemNodeSnapshot;
        db: SyncDesignSystemDiffDbComponentRef;
      }>
    ).map((item) => ({
      key: `${item.figma.nodeId}-${item.db.id}`,
      nodeId: item.figma.nodeId,
      name: item.figma.name,
      detail: `DB: ${item.db.name} · variants ${item.figma.variantCount}`,
      pageName: item.figma.pageName || '',
      hasFigmaGlyph: true,
    }));
  }
  if (bucket === 'unchanged') {
    return (
      items as Array<{
        figma: SyncDesignSystemNodeSnapshot;
        db: SyncDesignSystemDiffDbComponentRef;
      }>
    ).map((item) => ({
      key: `${item.figma.nodeId}-${item.db.id}`,
      nodeId: null, // unchanged items are not selectable
      name: item.figma.name,
      detail: `DB: ${item.db.name} · variants ${item.figma.variantCount}`,
      pageName: item.figma.pageName || '',
      hasFigmaGlyph: true,
    }));
  }
  // missing_in_figma
  return (items as SyncDesignSystemDiffDbComponentRef[]).map((item) => ({
    key: `${item.nodeId}-${item.id}`,
    nodeId: null,
    name: item.name,
    detail: `${item.slug} · ${item.status}`,
    pageName: '',
    hasFigmaGlyph: false,
  }));
}

interface ComponentBucketModalProps {
  bucket: BucketKey;
  items: SyncDesignSystemDiffResult[BucketKey];
  selectedNodeIds: Set<string>;
  onNodeSelectionChange: (nodeId: string, checked: boolean) => void;
  onBulkSelectionChange: (nodeIds: string[], checked: boolean) => void;
  onClose: () => void;
}

function ComponentBucketModal({
  bucket,
  items,
  selectedNodeIds,
  onNodeSelectionChange,
  onBulkSelectionChange,
  onClose,
}: ComponentBucketModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const filterInputRef = useRef<HTMLInputElement | null>(null);
  const modalTitleId = useId();

  const meta = bucketMeta[bucket];
  const isSelectable = SELECTABLE_COMPONENT_BUCKETS.has(bucket);

  const modalItems = useMemo(() => toModalItems(bucket, items), [bucket, items]);

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return modalItems;
    const q = searchQuery.toLowerCase();
    return modalItems.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.pageName.toLowerCase().includes(q) ||
        item.detail.toLowerCase().includes(q),
    );
  }, [searchQuery, modalItems]);

  // Group by pageName; items with empty pageName end up under key ''
  const grouped = useMemo(() => {
    const groups = new Map<string, ModalItem[]>();
    for (const item of filteredItems) {
      const page = item.pageName || '';
      const existing = groups.get(page) ?? [];
      existing.push(item);
      groups.set(page, existing);
    }
    return groups;
  }, [filteredItems]);

  // Whether all items use the empty-key group (no pageName available — render flat)
  const isFlatList = useMemo(
    () => grouped.size === 1 && grouped.has(''),
    [grouped],
  );

  const [openPages, setOpenPages] = useState<Set<string>>(() => new Set());

  const togglePage = (pageName: string) => {
    setOpenPages((prev) => {
      const next = new Set(prev);
      if (next.has(pageName)) next.delete(pageName);
      else next.add(pageName);
      return next;
    });
  };

  // Selection helpers
  const allSelectableNodeIds = useMemo(
    () =>
      isSelectable
        ? modalItems.map((i) => i.nodeId).filter((id): id is string => id !== null)
        : [],
    [isSelectable, modalItems],
  );
  const filteredSelectableNodeIds = useMemo(
    () =>
      isSelectable
        ? filteredItems.map((i) => i.nodeId).filter((id): id is string => id !== null)
        : [],
    [isSelectable, filteredItems],
  );

  const selectedInBucket = allSelectableNodeIds.filter((id) =>
    selectedNodeIds.has(id),
  ).length;

  const allFilteredSelected =
    filteredSelectableNodeIds.length > 0 &&
    filteredSelectableNodeIds.every((id) => selectedNodeIds.has(id));
  const someFilteredSelected = filteredSelectableNodeIds.some((id) =>
    selectedNodeIds.has(id),
  );

  const handleSelectAll = (checked: boolean) => {
    onBulkSelectionChange(filteredSelectableNodeIds, checked);
  };

  const handlePageToggleSelection = (pageItems: ModalItem[]) => {
    const pageNodeIds = pageItems
      .map((i) => i.nodeId)
      .filter((id): id is string => id !== null);
    if (pageNodeIds.length === 0) return;
    const allPageSelected = pageNodeIds.every((id) => selectedNodeIds.has(id));
    onBulkSelectionChange(pageNodeIds, !allPageSelected);
  };

  return (
    <Modal open onClose={onClose} aria-labelledby={modalTitleId}>
      <ModalContent size="md" className="flex max-h-[85vh] flex-col overflow-hidden">
        <ModalHeader className="items-start gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h3
                id={modalTitleId}
                className="text-lg font-titles font-semibold titles-color"
              >
                {meta.title} components
              </h3>
              <Badge variant={meta.badgeVariant}>{items.length}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">{meta.description}</p>
          </div>
          <ModalCloseButton
            onClick={onClose}
            label={`Close ${meta.title.toLowerCase()} components`}
          />
        </ModalHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 p-5">
          {/* Top bar: select-all + search filter */}
          <div className="flex items-center justify-between gap-3">
            {isSelectable ? (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  aria-label={`Select all ${meta.title.toLowerCase()} components`}
                  checked={allFilteredSelected}
                  indeterminate={someFilteredSelected && !allFilteredSelected}
                  onChange={(e) => handleSelectAll(e.target.checked)}
                />
                Select all
              </label>
            ) : (
              <div />
            )}
            <div className="relative">
              <Input
                ref={filterInputRef}
                aria-label="Filter components"
                placeholder="Filter by name or page…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="max-w-xs pr-9 text-sm"
              />
              {searchQuery.trim() ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2 p-0 text-muted-foreground hover:text-foreground"
                  aria-label="Clear filter"
                  onClick={() => {
                    setSearchQuery('');
                    filterInputRef.current?.focus();
                  }}
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              ) : null}
            </div>
          </div>

          {/* Item list */}
          <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border p-3">
            {filteredItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {searchQuery.trim()
                  ? 'No matches for current filter.'
                  : 'No items in this bucket.'}
              </p>
            ) : isFlatList ? (
              // Flat list — no pageName grouping (e.g. deleted items)
              <div className="space-y-1">
                {(grouped.get('') ?? []).map((item) => (
                  <div key={item.key} className="flex items-start gap-2 py-1">
                    {item.hasFigmaGlyph ? <FigmaComponentGlyph /> : null}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-foreground">{item.name}</p>
                      {item.detail ? (
                        <p className="text-xs text-muted-foreground">{item.detail}</p>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              // Grouped by pageName
              <div className="space-y-3">
                {Array.from(grouped.entries()).map(([pageName, pageItems]) => {
                  const pageNodeIds = pageItems
                    .map((i) => i.nodeId)
                    .filter((id): id is string => id !== null);
                  const pageAllSelected =
                    isSelectable &&
                    pageNodeIds.length > 0 &&
                    pageNodeIds.every((id) => selectedNodeIds.has(id));
                  const pageSomeSelected =
                    isSelectable && pageNodeIds.some((id) => selectedNodeIds.has(id));
                  const isOpen = openPages.has(pageName);

                  return (
                    <div key={pageName} className="space-y-1">
                      <div className="flex items-center gap-2">
                        {isSelectable ? (
                          <Checkbox
                            aria-label={`Select all components in ${pageName}`}
                            checked={pageAllSelected}
                            indeterminate={pageSomeSelected && !pageAllSelected}
                            onChange={() => handlePageToggleSelection(pageItems)}
                          />
                        ) : null}
                        <button
                          type="button"
                          className="flex min-w-0 flex-1 items-center justify-between text-left text-sm font-medium text-foreground"
                          aria-expanded={isOpen}
                          onClick={() => togglePage(pageName)}
                        >
                          <span>{pageName || '(no page)'}</span>
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            {isOpen ? (
                              <ChevronDown className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5" />
                            )}
                            {pageItems.length}
                          </span>
                        </button>
                      </div>
                      {isOpen
                        ? pageItems.map((item) => {
                            const checked =
                              item.nodeId !== null && selectedNodeIds.has(item.nodeId);
                            return (
                              <div
                                key={item.key}
                                className="ml-4 flex items-center gap-2 py-0.5 text-sm"
                              >
                                {item.hasFigmaGlyph ? <FigmaComponentGlyph /> : null}
                                {isSelectable && item.nodeId !== null ? (
                                  <Checkbox
                                    aria-label={`Select component ${item.name}`}
                                    checked={checked}
                                    onChange={(e) =>
                                      onNodeSelectionChange(
                                        item.nodeId as string,
                                        e.target.checked,
                                      )
                                    }
                                  />
                                ) : null}
                                <div className="min-w-0 flex-1">
                                  <span className="text-foreground">{item.name}</span>
                                  {item.detail ? (
                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                      {item.detail}
                                    </p>
                                  ) : null}
                                </div>
                              </div>
                            );
                          })
                        : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Selection counter */}
          {isSelectable && allSelectableNodeIds.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              {selectedInBucket} of {allSelectableNodeIds.length} selected
            </p>
          ) : null}
        </div>

        <ModalFooter className="justify-end">
          <Button onClick={onClose}>Done</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Variable bucket helpers
// ---------------------------------------------------------------------------

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
  previewDebug = null,
  variablesPreviewDebug = null,
  error,
  isPreviewing = false,
  isVariablesPreviewing = false,
  hasRequestedVariablesPreview = false,
  isApplying = false,
  isSyncRunning = false,
  canRetryFailedSteps = false,
  disabled = false,
  onPreview,
  onLoadVariablesPreview,
  onApply,
  onReset,
  onCancelSync,
  onRetryFailedSteps,
  onRetryVariablesPreview,
}: SyncDiffPreviewProps) {
  const previewReady = diffResult !== null;
  const isPreviewRefreshing = isPreviewing && previewReady;
  const variablesDiffPreview = useMemo(
    () => buildVariablesDiffPreview(variablesPreview),
    [variablesPreview],
  );
  const [openModalBucket, setOpenModalBucket] = useState<BucketKey | null>(null);
  const [openVariableBuckets, setOpenVariableBuckets] = useState<Record<BucketKey, boolean>>({
    new_in_figma: false,
    updated_in_figma: false,
    unchanged: false,
    missing_in_figma: false,
  });

  // Component selection state — resets whenever the diff result changes
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(() =>
    buildInitialSelection(diffResult),
  );
  const selectionResetKey = useMemo(
    () => buildSelectionResetKey(diffResult),
    [diffResult],
  );
  const initialSelectedNodeIds = useMemo(
    () => buildInitialSelection(diffResult),
    [selectionResetKey],
  );
  useEffect(() => {
    setSelectedNodeIds(initialSelectedNodeIds);
  }, [initialSelectedNodeIds]);

  const totalSelectableCount = useMemo(() => {
    if (!diffResult) return 0;
    return diffResult.new_in_figma.length + diffResult.updated_in_figma.length;
  }, [diffResult]);

  const canApply = totalSelectableCount === 0 || selectedNodeIds.size > 0;
  const componentsDurationMs = Number(previewDebug?.componentsDurationMs);
  const variablesDurationMs = Number(variablesPreviewDebug?.durationMs);
  const hasComponentsDuration = Number.isFinite(componentsDurationMs) && componentsDurationMs >= 0;
  const hasVariablesDuration = Number.isFinite(variablesDurationMs) && variablesDurationMs >= 0;
  const hasPathUsed = String(previewDebug?.pathUsed || '').trim().length > 0;
  const hasTelemetry = hasPathUsed || hasComponentsDuration || hasVariablesDuration;

  function setNodeSelected(nodeId: string, checked: boolean) {
    setSelectedNodeIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(nodeId);
      else next.delete(nodeId);
      return next;
    });
  }

  function setMultipleNodesSelected(nodeIds: string[], checked: boolean) {
    setSelectedNodeIds((prev) => {
      const next = new Set(prev);
      for (const id of nodeIds) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-sm font-titles font-semibold titles-color">Sync diff preview</h3>
          <p className="text-sm text-muted-foreground">
            Compare Figma against the database before applying changes.
          </p>
          {hasTelemetry ? (
            <p className="text-xs text-muted-foreground">
              {hasPathUsed ? `Path: ${String(previewDebug?.pathUsed)}` : 'Path: n/a'}
              {hasComponentsDuration ? ` · Components: ${componentsDurationMs} ms` : ''}
              {hasVariablesDuration ? ` · Variables: ${variablesDurationMs} ms` : ''}
            </p>
          ) : null}
        </div>
      </div>

      <div className="space-y-4">
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

        {isPreviewRefreshing ? (
          <StatusAlert variant="info">
            <StatusAlertTitle>Updating preview</StatusAlertTitle>
            <StatusAlertDescription>
              Showing the previous diff while the new scan completes.
            </StatusAlertDescription>
          </StatusAlert>
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

        {previewReady ? (
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
                  <StatusAlertTitle>
                    {isVariablesPreviewing
                      ? 'Loading variables preview'
                      : hasRequestedVariablesPreview
                      ? 'Variables diff unavailable'
                      : 'Variables preview not loaded'}
                  </StatusAlertTitle>
                  <StatusAlertDescription>
                    {isVariablesPreviewing
                      ? 'Component diff is ready. Variables preview is still running automatically.'
                      : !hasRequestedVariablesPreview
                      ? 'Variables preview loads automatically after the component diff. Use the button below to refresh it manually.'
                      : variablesPreviewWarning
                      ? 'The variables preview response is incomplete. Check plugin/API warnings and retry.'
                      : 'This response does not include variable diff buckets. Restart the API server to load the latest backend changes.'}
                  </StatusAlertDescription>
                  {!isVariablesPreviewing && onLoadVariablesPreview ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      onClick={onLoadVariablesPreview}
                      disabled={disabled || isSyncRunning}
                    >
                      Refresh variables preview
                    </Button>
                  ) : null}
                  {!isVariablesPreviewing && variablesPreviewWarning && onRetryVariablesPreview ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      onClick={onRetryVariablesPreview}
                      disabled={disabled || isSyncRunning}
                    >
                      Retry variables
                    </Button>
                  ) : null}
                </StatusAlert>
              ) : (
                (
                  ['new_in_figma', 'updated_in_figma', 'missing_in_figma', 'unchanged'] as BucketKey[]
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
                                className="bg-surface-1 py-2"
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
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-titles font-semibold titles-color">Components</h4>
                {totalSelectableCount > 0 ? (
                  <span className="text-xs text-muted-foreground">
                    {selectedNodeIds.size} / {totalSelectableCount} selected
                  </span>
                ) : null}
              </div>
              {(
                ['new_in_figma', 'updated_in_figma', 'missing_in_figma', 'unchanged'] as BucketKey[]
              ).map((bucket) => {
                const meta = bucketMeta[bucket];
                const items = diffResult[bucket];
                const isSelectable = SELECTABLE_COMPONENT_BUCKETS.has(bucket);
                const bucketNodeIds = isSelectable
                  ? getSelectableBucketNodeIds(bucket, items)
                  : [];
                const selectedInBucket = bucketNodeIds.filter((id) =>
                  selectedNodeIds.has(id),
                ).length;

                if (items.length === 0) {
                  return (
                    <div
                      key={bucket}
                      className="rounded border border-border/70 bg-surface-1 p-3"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h5 className="text-sm font-titles font-semibold leading-none text-foreground">
                            {meta.title}
                          </h5>
                          <Badge variant={meta.badgeVariant}>0</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{meta.description}</p>
                      </div>
                    </div>
                  );
                }

                return (
                  <button
                    key={bucket}
                    type="button"
                    className="w-full rounded border border-border/70 bg-surface-1 p-3 text-left transition-colors hover:border-border hover:bg-surface-2"
                    onClick={() => setOpenModalBucket(bucket)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h5 className="text-sm font-titles font-semibold leading-none text-foreground transition-colors hover:text-primary">
                            {meta.title}
                          </h5>
                          <Badge variant={meta.badgeVariant}>{items.length}</Badge>
                          {isSelectable && bucketNodeIds.length > 0 ? (
                            <span className="text-xs text-muted-foreground">
                              {selectedInBucket} selected
                            </span>
                          ) : null}
                        </div>
                        <p className="text-xs text-muted-foreground">{meta.description}</p>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </div>
                  </button>
                );
              })}

              {openModalBucket && diffResult ? (
                <ComponentBucketModal
                  bucket={openModalBucket}
                  items={diffResult[openModalBucket]}
                  selectedNodeIds={selectedNodeIds}
                  onNodeSelectionChange={setNodeSelected}
                  onBulkSelectionChange={setMultipleNodesSelected}
                  onClose={() => setOpenModalBucket(null)}
                />
              ) : null}
            </div>
          </div>
        ) : null}
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
            disabled={disabled || isPreviewing || isApplying || isSyncRunning}
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
              disabled={disabled || isPreviewing || isApplying || isSyncRunning}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onPreview}
              disabled={disabled || isPreviewing || isApplying || isSyncRunning}
              loading={isPreviewing}
            >
              Re-scan
            </Button>
            <Button
              type="button"
              onClick={() =>
                onApply(totalSelectableCount > 0 ? [...selectedNodeIds] : undefined)
              }
              disabled={disabled || isPreviewing || isApplying || isSyncRunning || !canApply}
              loading={isApplying}
            >
              Sync design system
            </Button>
          </>
        ) : (
          <Button
            type="button"
            onClick={onPreview}
            disabled={disabled || isPreviewing || isApplying || isSyncRunning}
            loading={isPreviewing}
          >
            Preview sync diff
          </Button>
        )}
      </div>
    </section>
  );
}
