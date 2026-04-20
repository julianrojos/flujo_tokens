import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';

import { Button, buttonVariants } from '@/components/ui/button';
import { PageHeader, SystemTabsNav } from '@/components/composites';
import { Input } from '@/components/ui/input';
import { Modal, ModalCloseButton, ModalContent, ModalHeader } from '@/components/ui/overlay/modal';
import { ApiErrorMessage } from '@/components/api-error-message';
import {
  deleteDesignSystem,
  fetchDeletePreview,
  fetchDesignSystemsConfig,
  updateDesignSystem,
  type DesignSystemConfigEntry,
} from '@/lib/api';
import type { DeletePreviewResponse } from '@/lib/api';
import { type ApiErrorDisplay, toApiErrorDisplay } from '@/lib/api-error-ux';
import { useDesignSystem } from '@/lib/design-system-context';
import { ROUTE_PATTERNS } from '@/lib/routes';
import { NewSystemPage } from '@/features/system/new-system-page';
import { DesignSystemUpdateActions } from '@/features/system/design-system-update-actions';
import { buildUpdateActionsProps } from '@/features/system/design-systems-admin-page-logic';

type RowDraft = {
  name: string;
  compileVariablesOnCapture: boolean;
  makeDefault: boolean;
};

function toDraft(
  system: DesignSystemConfigEntry,
  defaultSystemId = '',
): RowDraft {
  const id = String(system.id || '');
  return {
    name: String(system.name || ''),
    compileVariablesOnCapture: system.compileVariablesOnCapture !== false,
    makeDefault: id === defaultSystemId,
  };
}

function buildFieldId(systemId: string, fieldName: string) {
  const safeSystemId = String(systemId || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '-');
  return `ds-admin-${safeSystemId}-${fieldName}`;
}

function normalizeDraftText(value: string): string {
  return String(value || '').trim();
}

function hasDraftChanges(
  system: DesignSystemConfigEntry,
  draft: RowDraft,
  defaultSystemId: string,
): boolean {
  const base = toDraft(system, defaultSystemId);
  return (
    hasNonDefaultDraftChanges(system, draft, defaultSystemId) ||
    base.makeDefault !== draft.makeDefault
  );
}

function hasNonDefaultDraftChanges(
  system: DesignSystemConfigEntry,
  draft: RowDraft,
  defaultSystemId: string,
): boolean {
  const base = toDraft(system, defaultSystemId);
  return (
    normalizeDraftText(base.name) !== normalizeDraftText(draft.name) ||
    base.compileVariablesOnCapture !== draft.compileVariablesOnCapture
  );
}

function shouldShowSaveButton(
  system: DesignSystemConfigEntry,
  draft: RowDraft,
  defaultSystemId: string,
): boolean {
  const base = toDraft(system, defaultSystemId);
  const hasNonDefaultChanges = hasNonDefaultDraftChanges(
    system,
    draft,
    defaultSystemId,
  );
  if (hasNonDefaultChanges) return true;
  // For default switches, show Save only on the target row that becomes default.
  return base.makeDefault !== draft.makeDefault && draft.makeDefault;
}

export function DesignSystemsAdminPage() {
  const { systemId: routeSystemId } = useParams<{ systemId: string }>();
  const { replaceSystems } = useDesignSystem();
  const [systems, setSystems] = useState<DesignSystemConfigEntry[]>([]);
  const [defaultSystem, setDefaultSystem] = useState('');
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiErrorDisplay | null>(null);
  const [busyIds, setBusyIds] = useState<Record<string, boolean>>({});
  const [deleteModalTarget, setDeleteModalTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [deleteConfirmed, setDeleteConfirmed] = useState(false);
  const [deletePreview, setDeletePreview] = useState<
    DeletePreviewResponse['data'] | null
  >(null);
  const [deletePreviewLoading, setDeletePreviewLoading] = useState(false);

  const normalizedRouteSystemId = String(routeSystemId || '').trim();
  const targetSystem = useMemo(
    () => systems.find((s) => s.id === normalizedRouteSystemId) || null,
    [systems, normalizedRouteSystemId],
  );

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const config = await fetchDesignSystemsConfig();
      setSystems(config.systems || []);
      setDefaultSystem(config.defaultSystem || '');
      const systemsList = config.systems || [];
      setDrafts(
        Object.fromEntries(
          systemsList.map((system) => [
            system.id,
            toDraft(system, config.defaultSystem),
          ]),
        ),
      );
      // Update systems list only; activeSystem is managed by SystemTabsLayout (URL-first sync).
      replaceSystems(
        systemsList.map((system) => ({
          id: String(system.id || ''),
          name: String(system.name || ''),
        })),
      );
    } catch (cause) {
      setError(
        toApiErrorDisplay(cause, {
          fallbackTitle: 'System list unavailable',
          fallbackMessage: 'Unable to load design systems.',
        }),
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const setBusy = (id: string, value: boolean) => {
    setBusyIds((prev) => ({ ...prev, [id]: value }));
  };

  const handleFieldChange = (
    id: string,
    key: keyof RowDraft,
    value: string,
  ) => {
    setDrafts((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] ||
          toDraft(
            systems.find((system) => system.id === id) || { id, name: id },
            defaultSystem,
          )),
        [key]: value,
      },
    }));
  };

  const handleMakeDefaultDraftChange = (id: string, checked: boolean) => {
    setDrafts((prev) => {
      const next: Record<string, RowDraft> = {};
      for (const system of systems) {
        const systemId = String(system.id || '');
        const base = prev[systemId] || toDraft(system, defaultSystem);
        next[systemId] = {
          ...base,
          makeDefault: checked ? systemId === id : systemId === defaultSystem,
        };
      }
      return next;
    });
  };

  const handleSave = async (id: string) => {
    const draft = drafts[id];
    if (!draft) return;
    setBusy(id, true);
    setError(null);
    try {
      const response = await updateDesignSystem(id, {
        name: draft.name,
        compileVariablesOnCapture: draft.compileVariablesOnCapture,
        makeDefault: draft.makeDefault,
      });
      replaceSystems(response.config.systems, {
        activeSystemId: response.config.defaultSystem || undefined,
      });
      await load();
    } catch (cause) {
      setError(
        toApiErrorDisplay(cause, {
          fallbackTitle: 'System update failed',
          fallbackMessage: 'Unable to save design system changes.',
        }),
      );
    } finally {
      setBusy(id, false);
    }
  };

  const handleDelete = async (id: string) => {
    setBusy(id, true);
    setError(null);
    try {
      const response = await deleteDesignSystem(id);
      replaceSystems(response.config.systems, {
        activeSystemId: response.config.defaultSystem || undefined,
      });
      await load();
      setDeleteModalTarget(null);
      setDeleteConfirmed(false);
      setDeletePreview(null);
      setDeletePreviewLoading(false);
    } catch (cause) {
      setError(
        toApiErrorDisplay(cause, {
          fallbackTitle: 'System delete failed',
          fallbackMessage: 'Unable to delete design system.',
        }),
      );
    } finally {
      setBusy(id, false);
    }
  };

  if (!loading && !targetSystem && systems.length === 0) {
    return <NewSystemPage />;
  }

  if (!loading && !targetSystem) {
    return <Navigate to={ROUTE_PATTERNS.newSystem} replace />;
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Design Systems Admin"
        actions={
          <Link
            to={ROUTE_PATTERNS.newSystem}
            className={buttonVariants({ size: 'sm', variant: 'outline' })}
          >
            Add New Design System
          </Link>
        }
      />
      <SystemTabsNav />

      {error ? <ApiErrorMessage error={error} className="mb-4" /> : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading system...</p>
      ) : targetSystem ? (
        <div className="space-y-4">
          <section className="rounded-lg border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-titles font-semibold tracking-tight">{targetSystem.name}</h2>
                {targetSystem.id === defaultSystem ? (
                  <span className="rounded bg-status-success-bg/15 px-2 py-0.5 text-[11px] font-medium text-status-success">
                    DEFAULT
                  </span>
                ) : null}
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                  {targetSystem.id}
                </code>
              </div>
              <div className="flex items-center gap-2">
                {hasDraftChanges(
                  targetSystem,
                  drafts[targetSystem.id] ||
                    toDraft(targetSystem, defaultSystem),
                  defaultSystem,
                ) && (
                  <Button
                    size="sm"
                    onClick={() => void handleSave(targetSystem.id)}
                    disabled={!!busyIds[targetSystem.id]}
                  >
                    Save
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    setDeleteModalTarget({
                      id: targetSystem.id,
                      name: String(targetSystem.name || targetSystem.id),
                    });
                    setDeleteConfirmed(false);
                    setDeletePreview(null);
                    setDeletePreviewLoading(true);
                    try {
                      const preview = await fetchDeletePreview(targetSystem.id);
                      setDeletePreview(preview.data);
                    } catch (error) {
                      console.error('Failed to load delete preview:', error);
                    } finally {
                      setDeletePreviewLoading(false);
                    }
                  }}
                  disabled={!!busyIds[targetSystem.id]}
                >
                  Delete
                </Button>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <label
                  htmlFor={buildFieldId(targetSystem.id, 'name')}
                  className="text-xs font-medium text-muted-foreground"
                >
                  Name
                </label>
                <Input
                  id={buildFieldId(targetSystem.id, 'name')}
                  value={
                    (
                      drafts[targetSystem.id] ||
                      toDraft(targetSystem, defaultSystem)
                    ).name
                  }
                  onChange={(e) =>
                    handleFieldChange(targetSystem.id, 'name', e.target.value)
                  }
                  placeholder="Name"
                  disabled={!!busyIds[targetSystem.id]}
                />
              </div>
              <label className="flex cursor-pointer items-center gap-2 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={
                    (
                      drafts[targetSystem.id] ||
                      toDraft(targetSystem, defaultSystem)
                    ).makeDefault
                  }
                  onChange={(e) =>
                    handleMakeDefaultDraftChange(
                      targetSystem.id,
                      e.target.checked,
                    )
                  }
                  className="h-4 w-4"
                  disabled={!!busyIds[targetSystem.id]}
                />
                <span>Make this the default system</span>
              </label>
            </div>

            <DesignSystemUpdateActions
              {...buildUpdateActionsProps({
                systemId: targetSystem.id,
                figmaFileId: String(targetSystem.figmaFileId || ''),
                disabled: !!busyIds[targetSystem.id],
              })}
            />

          </section>
        </div>
      ) : null}

      <Modal
        open={!!deleteModalTarget}
        onClose={() => {
          setDeleteModalTarget(null);
          setDeleteConfirmed(false);
          setDeletePreview(null);
          setDeletePreviewLoading(false);
        }}
      >
        <ModalContent size="md">
          {deleteModalTarget ? (
            <>
              <ModalHeader className="items-start gap-4">
                <h2 className="text-lg font-titles font-semibold tracking-tight">
                  Confirm deletion
                </h2>
                <ModalCloseButton
                  onClick={() => {
                    setDeleteModalTarget(null);
                    setDeleteConfirmed(false);
                    setDeletePreview(null);
                    setDeletePreviewLoading(false);
                  }}
                  label="Close deletion confirmation dialog"
                />
              </ModalHeader>
              <div className="p-5 pt-4">
                {deletePreviewLoading ? (
                  <p className="mb-4 text-sm text-muted-foreground">
                    Loading preview...
                  </p>
                ) : deletePreview ? (
                  <div className="mb-4">
                    <p className="mb-3 text-sm text-muted-foreground">
                      Are you sure you want to delete{' '}
                      <strong>{deleteModalTarget.name}</strong>? This will
                      permanently remove this design system and its connected
                      consumer files and information.
                    </p>

                    {deletePreview && deletePreview.totalConsumerCount > 0 ? (
                      <div className="mb-3 rounded border border-border bg-muted/30 p-3">
                        <p className="mb-2 text-sm font-medium text-foreground">
                          This will delete {deletePreview.totalConsumerCount}{' '}
                          consumer file(s):
                        </p>
                        <div className="max-h-32 space-y-1 overflow-y-auto">
                          {deletePreview.consumers
                            .slice(0, 20)
                            .map((consumer) => (
                              <div
                                key={consumer.id}
                                className="text-xs text-muted-foreground"
                              >
                                • {consumer.name} ({consumer.fileKey})
                              </div>
                            ))}
                          {deletePreview.totalConsumerCount > 20 && (
                            <div className="text-xs text-muted-foreground italic">
                              ...and {deletePreview.totalConsumerCount - 20} more
                            </div>
                          )}
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground">
                          This also clears {deletePreview.counts.syncRuns}
                          related usage tracking (
                          {deletePreview.counts.componentUsage} component records
                          and {deletePreview.counts.variableUsage} variable
                          records).
                        </div>
                      </div>
                    ) : (
                      <p className="mb-3 text-sm text-muted-foreground">
                        No linked consumer files found.
                      </p>
                    )}

                    <p className="text-xs text-status-error">
                      ⚠️ This action cannot be undone.
                    </p>
                  </div>
                ) : (
                  <p className="mb-4 text-sm text-muted-foreground">
                    Are you sure you want to delete{' '}
                    <strong>{deleteModalTarget.name}</strong>? This will
                    permanently remove this design system and its connected
                    consumer files. This action cannot be undone.
                  </p>
                )}

                <label className="mb-5 flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={deleteConfirmed}
                    onChange={(e) => setDeleteConfirmed(e.target.checked)}
                    className="h-4 w-4"
                  />
                  <span>
                    I understand this will permanently remove this design system
                    and its connected consumer data
                  </span>
                </label>

                <div className="flex items-center justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setDeleteModalTarget(null);
                      setDeleteConfirmed(false);
                      setDeletePreview(null);
                      setDeletePreviewLoading(false);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    disabled={
                      !deleteConfirmed ||
                      !!busyIds[deleteModalTarget.id] ||
                      deletePreviewLoading
                    }
                    onClick={() => void handleDelete(deleteModalTarget.id)}
                  >
                    {deletePreview && deletePreview.totalConsumerCount > 0
                      ? `Delete system and ${deletePreview.totalConsumerCount} consumers`
                      : 'Delete system'}
                  </Button>
                </div>
              </div>
            </>
          ) : null}
        </ModalContent>
      </Modal>
    </div>
  );
}
