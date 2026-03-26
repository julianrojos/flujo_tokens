import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal, ModalContent } from "@/components/ui/overlay/modal";
import { ApiErrorMessage } from "@/components/api-error-message";
import {
  deleteDesignSystem,
  fetchDeletePreview,
  fetchDesignSystemsConfig,
  listConsumers,
  updateDesignSystem,
  type DesignSystemConfigEntry,
} from "@/lib/api";
import type { DeletePreviewResponse } from "@/lib/api";
import { type ApiErrorDisplay, toApiErrorDisplay } from "@/lib/api-error-ux";
import { useDesignSystem } from "@/lib/design-system-context";
import { cn } from "@/lib/utils";
import { NewSystemPage } from "@/features/system/new-system-page";
import { DesignSystemUpdateActions } from "@/features/system/design-system-update-actions";
import { buildUpdateActionsProps } from "@/features/system/design-systems-admin-page-logic";
import type { DsConsumer } from "@/types/consumers";

type RowDraft = {
  name: string;
  appName: string;
  figmaFileId: string;
  figmaApiToken: string;
  inputDir: string;
  outputDir: string;
  docsDir: string;
  collections: string;
  compileVariablesOnCapture: boolean;
  makeDefault: boolean;
};

function toDraft(system: DesignSystemConfigEntry, defaultSystemId = ""): RowDraft {
  const id = String(system.id || "");
  return {
    name: String(system.name || ""),
    appName: String(system.appName || ""),
    figmaFileId: String(system.figmaFileId || ""),
    figmaApiToken: String(system.figmaApiToken || ""),
    inputDir: String(system.inputDir || ""),
    outputDir: String(system.outputDir || ""),
    docsDir: String(system.docsDir || ""),
    collections: Array.isArray(system.collections) ? system.collections.join(", ") : "",
    compileVariablesOnCapture: system.compileVariablesOnCapture !== false,
    makeDefault: id === defaultSystemId,
  };
}

function parseCollections(raw: string) {
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildFieldId(systemId: string, fieldName: string) {
  const safeSystemId = String(systemId || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-");
  return `ds-admin-${safeSystemId}-${fieldName}`;
}

function normalizeDraftText(value: string): string {
  return String(value || "").trim();
}

function normalizeDraftCollections(value: string): string {
  return parseCollections(value).join(",");
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
    normalizeDraftText(base.appName) !== normalizeDraftText(draft.appName) ||
    normalizeDraftText(base.figmaFileId) !== normalizeDraftText(draft.figmaFileId) ||
    normalizeDraftText(base.figmaApiToken) !== normalizeDraftText(draft.figmaApiToken) ||
    normalizeDraftText(base.inputDir) !== normalizeDraftText(draft.inputDir) ||
    normalizeDraftText(base.outputDir) !== normalizeDraftText(draft.outputDir) ||
    normalizeDraftText(base.docsDir) !== normalizeDraftText(draft.docsDir) ||
    normalizeDraftCollections(base.collections) !== normalizeDraftCollections(draft.collections) ||
    base.compileVariablesOnCapture !== draft.compileVariablesOnCapture
  );
}

function shouldShowSaveButton(
  system: DesignSystemConfigEntry,
  draft: RowDraft,
  defaultSystemId: string,
): boolean {
  const base = toDraft(system, defaultSystemId);
  const hasNonDefaultChanges = hasNonDefaultDraftChanges(system, draft, defaultSystemId);
  if (hasNonDefaultChanges) return true;
  // For default switches, show Save only on the target row that becomes default.
  return base.makeDefault !== draft.makeDefault && draft.makeDefault;
}

export function DesignSystemsAdminPage() {
  const { replaceSystems } = useDesignSystem();
  const [systems, setSystems] = useState<DesignSystemConfigEntry[]>([]);
  const [defaultSystem, setDefaultSystem] = useState("");
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiErrorDisplay | null>(null);
  const [busyIds, setBusyIds] = useState<Record<string, boolean>>({});
  const [consumersBySystemId, setConsumersBySystemId] = useState<Record<string, DsConsumer[]>>({});
  const [deleteModalTarget, setDeleteModalTarget] = useState<{ id: string; name: string } | null>(
    null,
  );
  const [deleteConfirmed, setDeleteConfirmed] = useState(false);
  const [deletePreview, setDeletePreview] = useState<DeletePreviewResponse['data'] | null>(null);
  const [deletePreviewLoading, setDeletePreviewLoading] = useState(false);

  const sortedSystems = useMemo(
    () =>
      [...systems].sort((left, right) => {
        const leftId = String(left.id || "");
        const rightId = String(right.id || "");
        const leftIsDefault = leftId === defaultSystem;
        const rightIsDefault = rightId === defaultSystem;
        if (leftIsDefault && !rightIsDefault) return -1;
        if (!leftIsDefault && rightIsDefault) return 1;
        return String(left.name || "").localeCompare(String(right.name || ""), "en", {
          sensitivity: "base",
        });
      }),
    [systems, defaultSystem],
  );

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const config = await fetchDesignSystemsConfig();
      setSystems(config.systems || []);
      setDefaultSystem(config.defaultSystem || "");
      const systemsList = config.systems || [];
      setDrafts(
        Object.fromEntries(
          systemsList.map((system) => [system.id, toDraft(system, config.defaultSystem)]),
        ),
      );
      replaceSystems(
        systemsList.map((system) => ({
          id: String(system.id || ""),
          name: String(system.name || ""),
        })),
        { activeSystemId: config.defaultSystem || undefined },
      );
      const consumersEntries = await Promise.all(
        systemsList.map(async (system) => {
          const systemId = String(system.id || "");
          const dsFileKey = String(system.figmaFileId || "").trim();
          if (!dsFileKey) return [systemId, []] as const;
          try {
            const consumersResponse = await listConsumers(dsFileKey);
            return [systemId, consumersResponse.data] as const;
          } catch (cause) {
            console.warn(
              `[design-systems-admin] Consumer list fetch failed for system "${system.name || systemId}"`,
              cause,
            );
            return [systemId, []] as const;
          }
        }),
      );
      setConsumersBySystemId(Object.fromEntries(consumersEntries));
    } catch (cause) {
      setError(
        toApiErrorDisplay(cause, {
          fallbackTitle: "System list unavailable",
          fallbackMessage: "Unable to load design systems.",
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

  const handleFieldChange = (id: string, key: keyof RowDraft, value: string) => {
    setDrafts((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] ||
          toDraft(systems.find((system) => system.id === id) || { id, name: id }, defaultSystem)),
        [key]: value,
      },
    }));
  };

  const handleMakeDefaultDraftChange = (id: string, checked: boolean) => {
    setDrafts((prev) => {
      const next: Record<string, RowDraft> = {};
      for (const system of systems) {
        const systemId = String(system.id || "");
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
        appName: draft.appName,
        figmaFileId: draft.figmaFileId,
        figmaApiToken: draft.figmaApiToken,
        inputDir: draft.inputDir,
        outputDir: draft.outputDir,
        docsDir: draft.docsDir,
        collections: parseCollections(draft.collections),
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
          fallbackTitle: "System update failed",
          fallbackMessage: "Unable to save design system changes.",
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
          fallbackTitle: "System delete failed",
          fallbackMessage: "Unable to delete design system.",
        }),
      );
    } finally {
      setBusy(id, false);
    }
  };

  if (!loading && !error && sortedSystems.length === 0) {
    return <NewSystemPage />;
  }

  return (
    <div className="mx-auto max-w-5xl py-8">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h1 className="text-3xl font-serif font-bold tracking-tight">Design Systems Admin</h1>
        <Link to="/system/new" className={buttonVariants({ size: "sm", variant: "outline" })}>
          Add New Design System
        </Link>
      </div>
      <p className="mb-6 text-sm text-muted-foreground">
        Default system appears first; remaining systems are sorted alphabetically. Edit fields and save, or delete systems.
      </p>

      {error ? (
        <ApiErrorMessage error={error} className="mb-4" />
      ) : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading systems...</p>
      ) : (
        <div className="space-y-4">
          {sortedSystems.map((system) => {
            const id = String(system.id || "");
            const draft = drafts[id] || toDraft(system, defaultSystem);
            const isBusy = !!busyIds[id];
            const isDefault = id === defaultSystem;
            const hasChanges = hasDraftChanges(system, draft, defaultSystem);
            const showSaveButton = shouldShowSaveButton(system, draft, defaultSystem);
            const registeredConsumers = [...(consumersBySystemId[id] || [])].sort((left, right) =>
              String(left.consumerName || "").localeCompare(String(right.consumerName || ""), "en", {
                sensitivity: "base",
              }),
            );
            return (
              <section key={id} className="rounded-xl border border-border bg-card p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold">{system.name}</h2>
                    {isDefault ? (
                      <span className="rounded bg-status-success-bg/15 px-2 py-0.5 text-[11px] font-medium text-status-success">
                        DEFAULT
                      </span>
                    ) : null}
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{id}</code>
                  </div>
                  <div className="flex items-center gap-2">
                    {hasChanges && showSaveButton ? (
                      <Button size="sm" onClick={() => void handleSave(id)} disabled={isBusy}>
                        Save
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        setDeleteModalTarget({ id, name: String(system.name || id) });
                        setDeleteConfirmed(false);
                        setDeletePreview(null);
                        setDeletePreviewLoading(true);
                        try {
                          const preview = await fetchDeletePreview(id);
                          setDeletePreview(preview.data);
                        } catch (error) {
                          console.error('Failed to load delete preview:', error);
                        } finally {
                          setDeletePreviewLoading(false);
                        }
                      }}
                      disabled={isBusy}
                    >
                      Delete
                    </Button>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <label
                      htmlFor={buildFieldId(id, "name")}
                      className="text-xs font-medium text-muted-foreground"
                    >
                      Name
                    </label>
                    <Input
                      id={buildFieldId(id, "name")}
                      value={draft.name}
                      onChange={(e) => handleFieldChange(id, "name", e.target.value)}
                      placeholder="Name"
                      disabled={isBusy}
                    />
                  </div>
                  <div className="space-y-1">
                    <label
                      htmlFor={buildFieldId(id, "appName")}
                      className="text-xs font-medium text-muted-foreground"
                    >
                      App name
                    </label>
                    <Input
                      id={buildFieldId(id, "appName")}
                      value={draft.appName}
                      onChange={(e) => handleFieldChange(id, "appName", e.target.value)}
                      placeholder="App name"
                      disabled={isBusy}
                    />
                  </div>
                  <div className="space-y-1">
                    <label
                      htmlFor={buildFieldId(id, "figmaFileId")}
                      className="text-xs font-medium text-muted-foreground"
                    >
                      Figma file id
                    </label>
                    <Input
                      id={buildFieldId(id, "figmaFileId")}
                      value={draft.figmaFileId}
                      onChange={(e) => handleFieldChange(id, "figmaFileId", e.target.value)}
                      placeholder="Figma file id"
                      disabled={isBusy}
                    />
                  </div>
                  <div className="space-y-1">
                    <label
                      htmlFor={buildFieldId(id, "figmaApiToken")}
                      className="text-xs font-medium text-muted-foreground"
                    >
                      Figma token env reference
                    </label>
                    <Input
                      id={buildFieldId(id, "figmaApiToken")}
                      value={draft.figmaApiToken}
                      onChange={(e) => handleFieldChange(id, "figmaApiToken", e.target.value)}
                      placeholder="e.g. FIGMA_TOKEN_MY_SYSTEM"
                      disabled={isBusy}
                    />
                  </div>
                  <div className="space-y-1">
                    <label
                      htmlFor={buildFieldId(id, "inputDir")}
                      className="text-xs font-medium text-muted-foreground"
                    >
                      Input directory
                    </label>
                    <Input
                      id={buildFieldId(id, "inputDir")}
                      value={draft.inputDir}
                      onChange={(e) => handleFieldChange(id, "inputDir", e.target.value)}
                      placeholder="design-systems/<system-id>/input"
                      disabled={isBusy}
                    />
                  </div>
                  <div className="space-y-1">
                    <label
                      htmlFor={buildFieldId(id, "outputDir")}
                      className="text-xs font-medium text-muted-foreground"
                    >
                      Output directory
                    </label>
                    <Input
                      id={buildFieldId(id, "outputDir")}
                      value={draft.outputDir}
                      onChange={(e) => handleFieldChange(id, "outputDir", e.target.value)}
                      placeholder="design-systems/<system-id>/output"
                      disabled={isBusy}
                    />
                  </div>
                  <div className="space-y-1">
                    <label
                      htmlFor={buildFieldId(id, "docsDir")}
                      className="text-xs font-medium text-muted-foreground"
                    >
                      Docs directory
                    </label>
                    <Input
                      id={buildFieldId(id, "docsDir")}
                      value={draft.docsDir}
                      onChange={(e) => handleFieldChange(id, "docsDir", e.target.value)}
                      placeholder="design-systems/<system-id>/docs"
                      disabled={isBusy}
                    />
                  </div>
                  <div className="space-y-1">
                    <label
                      htmlFor={buildFieldId(id, "collections")}
                      className="text-xs font-medium text-muted-foreground"
                    >
                      Collections
                    </label>
                    <Input
                      id={buildFieldId(id, "collections")}
                      value={draft.collections}
                      onChange={(e) => handleFieldChange(id, "collections", e.target.value)}
                      placeholder="_Primitives, Semantic, Components..."
                      disabled={isBusy}
                    />
                  </div>
                  <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border/70 px-3 py-2 text-sm md:col-span-2">
                    <input
                      type="checkbox"
                      checked={draft.compileVariablesOnCapture}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [id]: {
                            ...(prev[id] || draft),
                            compileVariablesOnCapture: e.target.checked,
                          },
                        }))
                      }
                      className="h-4 w-4"
                      disabled={isBusy}
                    />
                    <span>Compile Figma variables to design tokens on first capture</span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border/70 px-3 py-2 text-sm md:col-span-2">
                    <input
                      type="checkbox"
                      checked={draft.makeDefault}
                      onChange={(e) => handleMakeDefaultDraftChange(id, e.target.checked)}
                      className="h-4 w-4"
                      disabled={isBusy}
                    />
                    <span>Make this the default system</span>
                  </label>
                </div>

                <DesignSystemUpdateActions
                  {...buildUpdateActionsProps({
                    systemId: id,
                    figmaFileId: draft.figmaFileId,
                    disabled: isBusy,
                  })}
                />

                <div className="mt-4 rounded-md border border-border/70 bg-muted/20 p-3">
                  <h3 className="text-sm font-semibold">Consumer files</h3>
                  {registeredConsumers.length > 0 ? (
                    <ul className="mt-2 space-y-1">
                      {registeredConsumers.map((consumer) => (
                        <li key={consumer.id}>
                          <Link
                            to={`/consumers/${consumer.id}`}
                            className="text-sm text-app-accent hover:underline"
                          >
                            {consumer.consumerName || consumer.consumerFileKey || "Unnamed Consumer"}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-xs text-muted-foreground">
                      No consumer files registered for this design system yet.
                    </p>
                  )}
                  <Link
                    to="/consumers"
                    className={cn(
                      buttonVariants({ variant: "outline", size: "sm" }),
                      "mt-3 inline-flex",
                    )}
                  >
                    Open Consumers
                  </Link>
                </div>
              </section>
            );
          })}
        </div>
      )}

      <Modal
        open={!!deleteModalTarget}
        onClose={() => {
          setDeleteModalTarget(null);
          setDeleteConfirmed(false);
          setDeletePreview(null);
          setDeletePreviewLoading(false);
        }}
      >
        <ModalContent size="lg">
          {deleteModalTarget ? (
            <div className="p-5">
              <h2 className="mb-2 text-lg font-serif font-semibold">
                Confirm deletion
              </h2>

              {deletePreviewLoading ? (
                <p className="mb-4 text-sm text-muted-foreground">
                  Loading preview...
                </p>
              ) : deletePreview ? (
                <div className="mb-4">
                  <p className="mb-3 text-sm text-muted-foreground">
                    Are you sure you want to delete <strong>{deleteModalTarget.name}</strong>?
                    This will permanently remove this design system and its connected consumer files and information.
                  </p>

                  {deletePreview && deletePreview.totalConsumerCount > 0 ? (
                    <div className="mb-3 rounded-lg border border-border bg-muted/30 p-3">
                      <p className="mb-2 text-sm font-medium text-foreground">
                        This will delete {deletePreview.totalConsumerCount} consumer file(s):
                      </p>
                      <div className="max-h-32 space-y-1 overflow-y-auto">
                        {deletePreview.consumers.slice(0, 20).map((consumer) => (
                          <div key={consumer.id} className="text-xs text-muted-foreground">
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
                        related usage tracking ({deletePreview.counts.componentUsage} component records and{" "}
                        {deletePreview.counts.variableUsage} variable records).
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
                  Are you sure you want to delete <strong>{deleteModalTarget.name}</strong>?
                  This will permanently remove this design system and its connected consumer files.
                  This action cannot be undone.
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
                  I understand this will permanently remove this design system and its connected consumer data
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
                  variant="outline"
                  className="border-status-error-border/50 text-status-error hover:bg-status-error-bg/10 hover:text-status-error"
                  disabled={!deleteConfirmed || !!busyIds[deleteModalTarget.id] || deletePreviewLoading}
                  onClick={() =>
                    void handleDelete(deleteModalTarget.id)
                  }
                >
                  {deletePreview && deletePreview.totalConsumerCount > 0
                    ? `Delete system and ${deletePreview.totalConsumerCount} consumers`
                    : 'Delete system'
                  }
                </Button>
              </div>
            </div>
          ) : null}
        </ModalContent>
      </Modal>
    </div>
  );
}
