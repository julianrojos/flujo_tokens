import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  deleteDesignSystem,
  fetchDesignSystemsConfig,
  updateDesignSystem,
  type DesignSystemConfigEntry,
} from "@/lib/api";
import { useDesignSystem } from "@/lib/design-system-context";

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

export function DesignSystemsAdminPage() {
  const { replaceSystems } = useDesignSystem();
  const [systems, setSystems] = useState<DesignSystemConfigEntry[]>([]);
  const [defaultSystem, setDefaultSystem] = useState("");
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyIds, setBusyIds] = useState<Record<string, boolean>>({});
  const [deleteModalTarget, setDeleteModalTarget] = useState<{ id: string; name: string } | null>(
    null,
  );
  const [deleteConfirmed, setDeleteConfirmed] = useState(false);

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
      setDrafts(
        Object.fromEntries(
          (config.systems || []).map((system) => [system.id, toDraft(system, config.defaultSystem)]),
        ),
      );
      replaceSystems(
        (config.systems || []).map((system) => ({
          id: String(system.id || ""),
          name: String(system.name || ""),
        })),
        { activeSystemId: config.defaultSystem || undefined },
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
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
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(id, false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
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
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(id, false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl py-8">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h1 className="text-3xl font-bold tracking-tight">Design Systems Admin</h1>
        <Link to="/system/new" className={buttonVariants({ size: "sm", variant: "outline" })}>
          Add New Design System
        </Link>
      </div>
      <p className="mb-6 text-sm text-muted-foreground">
        Default system appears first; remaining systems are sorted alphabetically. Edit fields and save, or delete systems.
      </p>

      {error ? (
        <div className="mb-4 rounded-md border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
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
            return (
              <section key={id} className="rounded-xl border border-border bg-card p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold">{system.name}</h2>
                    {isDefault ? (
                      <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                        DEFAULT
                      </span>
                    ) : null}
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{id}</code>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" onClick={() => void handleSave(id)} disabled={isBusy}>
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setDeleteModalTarget({ id, name: String(system.name || id) });
                        setDeleteConfirmed(false);
                      }}
                      disabled={isBusy || isDefault}
                    >
                      Delete
                    </Button>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <Input
                    value={draft.name}
                    onChange={(e) => handleFieldChange(id, "name", e.target.value)}
                    placeholder="Name"
                    disabled={isBusy}
                  />
                  <Input
                    value={draft.appName}
                    onChange={(e) => handleFieldChange(id, "appName", e.target.value)}
                    placeholder="App name"
                    disabled={isBusy}
                  />
                  <Input
                    value={draft.figmaFileId}
                    onChange={(e) => handleFieldChange(id, "figmaFileId", e.target.value)}
                    placeholder="Figma file id"
                    disabled={isBusy}
                  />
                  <Input
                    value={draft.figmaApiToken}
                    onChange={(e) => handleFieldChange(id, "figmaApiToken", e.target.value)}
                    placeholder="Figma token env reference (e.g. FIGMA_TOKEN_MY_SYSTEM)"
                    disabled={isBusy}
                  />
                  <Input
                    value={draft.inputDir}
                    onChange={(e) => handleFieldChange(id, "inputDir", e.target.value)}
                    placeholder="input/<system>"
                    disabled={isBusy}
                  />
                  <Input
                    value={draft.outputDir}
                    onChange={(e) => handleFieldChange(id, "outputDir", e.target.value)}
                    placeholder="output/<system>"
                    disabled={isBusy}
                  />
                  <Input
                    value={draft.docsDir}
                    onChange={(e) => handleFieldChange(id, "docsDir", e.target.value)}
                    placeholder="docs/<system>"
                    disabled={isBusy}
                  />
                  <Input
                    value={draft.collections}
                    onChange={(e) => handleFieldChange(id, "collections", e.target.value)}
                    placeholder="Primitives, Typography, Semantic, Components, A11y"
                    disabled={isBusy}
                  />
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
              </section>
            );
          })}
        </div>
      )}

      {deleteModalTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl border border-border bg-card p-5 shadow-xl">
            <h2 className="mb-2 text-lg font-semibold">Confirm deletion</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              Are you sure you want to delete <strong>{deleteModalTarget.name}</strong>. All its
              data will be removed. This action cannot be undone.
            </p>

            <label className="mb-5 flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={deleteConfirmed}
                onChange={(e) => setDeleteConfirmed(e.target.checked)}
                className="h-4 w-4"
              />
              <span>I understand and want to continue</span>
            </label>

            <div className="flex items-center justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setDeleteModalTarget(null);
                  setDeleteConfirmed(false);
                }}
              >
                Cancel
              </Button>
              <Button
                variant="outline"
                className="border-red-500/50 text-red-700 hover:bg-red-500/10 hover:text-red-700 dark:text-red-400 dark:hover:text-red-400"
                disabled={!deleteConfirmed || !!busyIds[deleteModalTarget.id]}
                onClick={() =>
                  void handleDelete(deleteModalTarget.id, deleteModalTarget.name)
                }
              >
                Yes, delete
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
