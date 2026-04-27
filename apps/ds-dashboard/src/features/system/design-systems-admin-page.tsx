import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';

import { FormField } from '@/components/common';
import { Button, buttonVariants } from '@/components/ui/button';
import { PageHeader, SystemTabsNav } from '@/components/composites';
import { Input } from '@/components/ui/input';
import {
  Modal,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from '@/components/ui/overlay/modal';
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
import { NewSystemPage } from './new-system-page';
import { DatabaseConfigPanel } from './components/database-config-panel';
import { DesignSystemUpdateActions } from './design-system-update-actions';
import { buildUpdateActionsProps } from './design-systems-admin-page-logic';

type RowDraft = {
  name: string;
  makeDefault: boolean;
};

function toDraft(
  system: DesignSystemConfigEntry,
  defaultSystemId = '',
): RowDraft {
  const id = String(system.id || '');
  return {
    name: String(system.name || ''),
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
  return normalizeDraftText(base.name) !== normalizeDraftText(draft.name);
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
  const navigate = useNavigate();
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
  const [deleteSuccessSystem, setDeleteSuccessSystem] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const normalizedRouteSystemId = String(routeSystemId || '').trim();
  const targetSystem = useMemo(
    () => systems.find((s) => s.id === normalizedRouteSystemId) || null,
    [systems, normalizedRouteSystemId],
  );
  const componentImportSnapshot = useMemo(() => {
    if (!targetSystem) return null;
    const detected = targetSystem.detectedComponentsCount;
    const imported = targetSystem.importedComponentsCount;
    const pending = targetSystem.pendingComponentsCount;
    const importedNames = Array.isArray(targetSystem.importedComponentNames)
      ? targetSystem.importedComponentNames
      : [];
    const pendingNames = Array.isArray(targetSystem.pendingComponentNames)
      ? targetSystem.pendingComponentNames
      : [];
    const hasSnapshot =
      typeof detected === 'number' ||
      typeof imported === 'number' ||
      typeof pending === 'number' ||
      importedNames.length > 0 ||
      pendingNames.length > 0;
    if (!hasSnapshot) return null;
    return {
      detected,
      imported,
      pending,
      importedNames,
      pendingNames,
    };
  }, [targetSystem]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const config = await fetchDesignSystemsConfig();
      const systemsList = config.systems || [];
      setSystems(systemsList);
      setDefaultSystem(config.defaultSystem || '');
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
    setDeleteModalTarget(null);
    setDeleteConfirmed(false);
    setDeletePreview(null);
    setDeletePreviewLoading(false);
    try {
      const response = await deleteDesignSystem(id);
      const nextSystems = response.config.systems || [];
      replaceSystems(nextSystems, {
        activeSystemId: response.config.defaultSystem || undefined,
      });
      setSystems(nextSystems);
      setDefaultSystem(response.config.defaultSystem || '');
      setDrafts(
        Object.fromEntries(
          nextSystems.map((system) => [
            system.id,
            toDraft(system, response.config.defaultSystem),
          ]),
        ),
      );
      setDeleteSuccessSystem({
        id,
        name: String(
          systems.find((system) => system.id === id)?.name || id,
        ),
      });
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

  if (!loading && !targetSystem && systems.length === 0 && !deleteSuccessSystem) {
    return <NewSystemPage />;
  }

  if (!loading && !targetSystem && !deleteSuccessSystem) {
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
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-titles font-semibold tracking-tight titles-color">
                    {targetSystem.name}
                  </h2>
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
                        const preview = await fetchDeletePreview(
                          targetSystem.id,
                        );
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
                <FormField
                  id={buildFieldId(targetSystem.id, 'name')}
                  label="Name"
                >
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
                </FormField>
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

              {componentImportSnapshot ? (
                <section className="space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <h3 className="text-sm font-titles font-semibold titles-color">
                        Import Coverage
                      </h3>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-[var(--app-surface-1)] px-2.5 py-1 text-xs text-foreground">
                        <span className="text-muted-foreground">Detected</span>
                        <strong className="font-semibold text-foreground">
                          {componentImportSnapshot.detected ?? '—'}
                        </strong>
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full border border-status-success-border/40 bg-status-success-bg/15 px-2.5 py-1 text-xs text-status-success">
                        <span>Imported</span>
                        <strong className="font-semibold text-status-success">
                          {componentImportSnapshot.imported ?? '—'}
                        </strong>
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full border border-status-warning/40 bg-status-warning/10 px-2.5 py-1 text-xs text-status-warning">
                        <span>Pending</span>
                        <strong className="font-semibold text-status-warning">
                          {componentImportSnapshot.pending ?? '—'}
                        </strong>
                      </span>
                    </div>
                  </div>
                  <div className="grid gap-3 lg:grid-cols-2">
                    <section className="rounded border border-border/70 bg-[var(--app-surface-1)] p-3">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground">
                        Imported Components
                      </h3>
                      {componentImportSnapshot.importedNames.length > 0 ? (
                        <ul className="mt-2 max-h-40 space-y-1 overflow-auto pr-1 text-xs text-muted-foreground">
                          {componentImportSnapshot.importedNames.map(
                            (name, index) => (
                              <li
                                key={`imported-${index}-${name}`}
                                className="leading-relaxed"
                              >
                                • {name}
                              </li>
                            ),
                          )}
                        </ul>
                      ) : (
                        <p className="mt-2 text-xs text-muted-foreground">
                          No imported components.
                        </p>
                      )}
                    </section>
                    <section className="rounded border border-border/70 bg-[var(--app-surface-1)] p-3">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground">
                        Pending Components
                      </h3>
                      {componentImportSnapshot.pendingNames.length > 0 ? (
                        <ul className="mt-2 max-h-40 space-y-1 overflow-auto pr-1 text-xs text-muted-foreground">
                          {componentImportSnapshot.pendingNames.map(
                            (name, index) => (
                              <li
                                key={`pending-${index}-${name}`}
                                className="leading-relaxed"
                              >
                                • {name}
                              </li>
                            ),
                          )}
                        </ul>
                      ) : (
                        <p className="mt-2 text-xs text-muted-foreground">
                          No pending components.
                        </p>
                      )}
                    </section>
                  </div>
                </section>
              ) : (
                <p className="text-xs text-muted-foreground">
                  No component import snapshot available yet.
                </p>
              )}
            </div>
          </section>
          <section className="rounded-lg border border-border bg-card p-4">
            <DesignSystemUpdateActions
              {...buildUpdateActionsProps({
                systemId: targetSystem.id,
                figmaFileId: String(targetSystem.figmaFileId || ''),
                disabled: !!busyIds[targetSystem.id],
              })}
            />
          </section>

          <DatabaseConfigPanel />
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
                <h2 className="text-lg font-titles font-semibold tracking-tight titles-color">
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
                              ...and {deletePreview.totalConsumerCount - 20}{' '}
                              more
                            </div>
                          )}
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground">
                          This also clears {deletePreview.counts.syncRuns}
                          related usage tracking (
                          {deletePreview.counts.componentUsage} component
                          records and {deletePreview.counts.variableUsage}{' '}
                          variable records).
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

      <Modal
        open={!!deleteSuccessSystem}
        onClose={() => undefined}
        aria-labelledby="delete-success-title"
      >
        <ModalContent size="sm">
          {deleteSuccessSystem ? (
            <>
              <ModalHeader>
                <div>
                  <h2
                    id="delete-success-title"
                    className="text-lg font-titles font-semibold tracking-tight titles-color"
                  >
                    Design system deleted
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {deleteSuccessSystem.name} was deleted successfully.
                  </p>
                </div>
              </ModalHeader>
              <div className="p-5 pt-4">
                <p className="text-sm text-foreground">
                  You can continue with a new design system from here.
                </p>
              </div>
              <ModalFooter>
                <Button
                  onClick={() => {
                    const nextSystemId = String(systems[0]?.id || '').trim();
                    setDeleteSuccessSystem(null);
                    navigate(
                      nextSystemId
                        ? ROUTE_PATTERNS.systemOverview.replace(
                            ':systemId',
                            encodeURIComponent(nextSystemId),
                          )
                        : ROUTE_PATTERNS.newSystem,
                      { replace: true },
                    );
                  }}
                >
                  Accept
                </Button>
              </ModalFooter>
            </>
          ) : null}
        </ModalContent>
      </Modal>
    </div>
  );
}
