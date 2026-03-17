import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, Save, Undo2, X } from "lucide-react";

import type { TokenRegistry } from "@/types/token-registry";
import type {
  ComponentSpecValidateResponse,
  SpecDiffEntry,
  SpecValidationIssue,
} from "@/types/spec-editor";
import {
  restoreComponentSpecBackup,
  saveComponentSpec,
  validateComponentSpecInput,
} from "@/lib/api";
import { type ApiErrorDisplay, toApiErrorDisplay } from "@/lib/api-error-ux";
import { ApiErrorMessage } from "@/components/api-error-message";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface SpecEditorDrawerProps {
  open: boolean;
  slug: string;
  displayName: string;
  specPath: string | null;
  initialRaw: string;
  initialHash: string | null;
  tokenRegistry: TokenRegistry | null;
  onClose: () => void;
  onSaved: (result: { message: string }) => void;
}

const SNIPPETS: Array<{ id: string; label: string; content: string }> = [
  {
    id: "token-mapping",
    label: "token_mapping section",
    content: [
      "token_mapping:",
      "  container.background:",
      "    state=Default: TBD",
      "    state=Hover: TBD",
    ].join("\n"),
  },
  {
    id: "accessibility",
    label: "accessibility basics",
    content: [
      "accessibility:",
      "  role: button",
      "  focus:",
      "    tokens:",
      "      inner: TBD",
      "      outer: TBD",
      "  hit_area:",
      "    desktop_token: TBD",
      "    mobile_token: TBD",
      "  labeling:",
      "    rules:",
      "      - TBD",
    ].join("\n"),
  },
];

function resolveTokenPreview(
  tokenRegistry: TokenRegistry | null,
  value: string | null,
) {
  const query = String(value || "").trim();
  if (!query || query.toUpperCase() === "TBD" || !tokenRegistry) return null;
  return (
    tokenRegistry.byPath?.[query] ??
    tokenRegistry.bySlashPath?.[query] ??
    null
  );
}

function riskBadgeVariant(risk: SpecDiffEntry["risk"]) {
  if (risk === "high") return "warning" as const;
  if (risk === "medium") return "neutral" as const;
  return "success" as const;
}

function issueBadgeVariant(severity: SpecValidationIssue["severity"]) {
  return severity === "error" ? "warning" : "neutral";
}

export function SpecEditorDrawer({
  open,
  slug,
  displayName,
  specPath,
  initialRaw,
  initialHash,
  tokenRegistry,
  onClose,
  onSaved,
}: SpecEditorDrawerProps) {
  const [isMounted, setIsMounted] = useState(false);
  const [raw, setRaw] = useState(initialRaw);
  const [baselineRaw, setBaselineRaw] = useState(initialRaw);
  const [baselineHash, setBaselineHash] = useState<string | null>(initialHash);
  const [validation, setValidation] = useState<ComponentSpecValidateResponse | null>(null);
  const [validating, setValidating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [confirmRiskyChanges, setConfirmRiskyChanges] = useState(false);
  const [error, setError] = useState<ApiErrorDisplay | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const validationRunRef = useRef(0);

  const dirty = raw !== baselineRaw;

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setRaw(initialRaw);
    setBaselineRaw(initialRaw);
    setBaselineHash(initialHash);
    setValidation(null);
    setError(null);
    setSuccess(null);
    setConfirmRiskyChanges(false);
  }, [open, initialHash, initialRaw]);

  useEffect(() => {
    if (!open || !isMounted) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open, isMounted]);

  const runValidation = async (nextRaw: string) => {
    if (!open) return;
    const runId = validationRunRef.current + 1;
    validationRunRef.current = runId;
    setValidating(true);
    try {
      const result = await validateComponentSpecInput({ slug, raw: nextRaw });
      if (validationRunRef.current !== runId) return;
      setValidation(result);
      setError(null);
    } catch (cause) {
      if (validationRunRef.current !== runId) return;
      setError(
        toApiErrorDisplay(cause, {
          fallbackTitle: "Spec validation failed",
          fallbackMessage: "Unable to validate component spec.",
        }),
      );
      setValidation(null);
    } finally {
      if (validationRunRef.current === runId) {
        setValidating(false);
      }
    }
  };

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      void runValidation(raw);
    }, 320);
    return () => window.clearTimeout(timer);
  }, [open, raw, slug]);

  useEffect(() => {
    if (!open || !isMounted) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (!saving && !restoring && validation?.validation.valid && dirty) {
          void handleSave();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, isMounted, saving, restoring, validation, dirty]);

  const validationIssues = validation?.validation.issues ?? [];
  const confirmationRequired = validationIssues.some(
    (issue) => issue.requiresConfirmation === true,
  );

  const summary = useMemo(() => {
    if (!validation) return null;
    return {
      valid: validation.validation.valid,
      blocking: validation.validation.blockingIssueCount,
      warnings: validation.validation.warningCount,
      diffCount: validation.diff.length,
    };
  }, [validation]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await saveComponentSpec({
        slug,
        raw,
        expectedHash: baselineHash,
        refreshRegistry: true,
        confirmRiskyChanges,
      });

      if (!result.ok) {
        if (result.validation) {
          setValidation((previous) =>
            previous
              ? {
                  ...previous,
                  validation: result.validation,
                  diff: result.diff || [],
                  parsed: result.parsed,
                  rawHash: result.rawHash,
                }
              : null,
          );
        }
        if (result.requiresConfirmation) {
          setConfirmRiskyChanges(true);
        }
        setError(
          toApiErrorDisplay(result.message, {
            fallbackTitle: "Spec save failed",
            fallbackMessage: "Unable to save spec.",
          }),
        );
        return;
      }

      setBaselineRaw(raw);
      setBaselineHash(result.rawHash);
      setConfirmRiskyChanges(false);
      const message = result.message || "Spec saved successfully.";
      setSuccess(message);
      onSaved({ message });
      await runValidation(raw);
    } catch (cause) {
      setError(
        toApiErrorDisplay(cause, {
          fallbackTitle: "Spec save failed",
          fallbackMessage: "Unable to save spec.",
        }),
      );
    } finally {
      setSaving(false);
    }
  };

  const handleRestore = async () => {
    setRestoring(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await restoreComponentSpecBackup({
        slug,
        refreshRegistry: true,
      });
      if (!result.ok) {
        setError(
          toApiErrorDisplay(result.message, {
            fallbackTitle: "Backup restore failed",
            fallbackMessage: "Unable to restore backup.",
          }),
        );
        return;
      }
      const message = result.message || "Backup restored successfully.";
      setSuccess(message);
      onSaved({ message });
      onClose();
    } catch (cause) {
      setError(
        toApiErrorDisplay(cause, {
          fallbackTitle: "Backup restore failed",
          fallbackMessage: "Unable to restore backup.",
        }),
      );
    } finally {
      setRestoring(false);
    }
  };

  const insertSnippet = (snippetContent: string) => {
    setRaw((previous) => {
      const next = previous.trimEnd();
      if (!next) return `${snippetContent}\n`;
      return `${next}\n\n${snippetContent}\n`;
    });
  };

  if (!open || !isMounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[1100]">
      <button
        type="button"
        className="absolute inset-0 bg-black/35"
        onClick={onClose}
        aria-label="Close spec editor"
      />
      <div className="absolute inset-0 flex items-center justify-center p-4 md:p-6">
        <aside className="h-[90vh] w-[70vw] overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
          <div className="flex h-full flex-col">
          <header className="flex items-start justify-between border-b border-border/70 px-5 py-4">
            <div>
              <h3 className="text-lg font-semibold">Inline Spec Editor</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {displayName} · <code>{slug}</code>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {specPath ? specPath : "Spec path unavailable"}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close editor">
              <X className="h-4 w-4" />
            </Button>
          </header>

          <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[1fr_360px]">
            <section className="flex min-h-0 flex-col border-b border-border/70 p-4 lg:border-b-0 lg:border-r lg:p-5">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void runValidation(raw)}
                  disabled={validating || saving || restoring}
                >
                  {validating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  Validate
                </Button>
                {SNIPPETS.map((snippet) => (
                  <Button
                    key={snippet.id}
                    variant="outline"
                    size="sm"
                    onClick={() => insertSnippet(snippet.content)}
                    disabled={saving || restoring}
                  >
                    + {snippet.label}
                  </Button>
                ))}
              </div>
              <textarea
                value={raw}
                onChange={(event) => setRaw(event.target.value)}
                className="min-h-[260px] flex-1 w-full resize-none rounded-md border border-border bg-background p-3 font-mono text-[12px] leading-5 outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                spellCheck={false}
                aria-label="Component spec YAML editor"
              />
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <span>{dirty ? "Unsaved changes" : "Saved"}</span>
                  {summary ? (
                    <>
                      <span>·</span>
                      <span>{summary.diffCount} changes</span>
                    </>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <kbd className="rounded border bg-muted px-1.5 py-0.5">⌘/Ctrl + S</kbd>
                  <span>Save</span>
                </div>
              </div>
            </section>

            <section className="min-h-0 overflow-auto p-4 lg:p-5">
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  {summary?.valid ? (
                    <Badge variant="success">
                      <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                      Valid
                    </Badge>
                  ) : (
                    <Badge variant="warning">
                      <AlertTriangle className="mr-1 h-3.5 w-3.5" />
                      Needs fixes
                    </Badge>
                  )}
                  {summary ? (
                    <>
                      <Badge variant="neutral">{summary.blocking} errors</Badge>
                      <Badge variant="neutral">{summary.warnings} warnings</Badge>
                    </>
                  ) : null}
                </div>

                {error ? (
                  <ApiErrorMessage error={error} className="p-2.5 text-xs" />
                ) : null}
                {success ? (
                  <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-2.5 text-xs text-emerald-700">
                    {success}
                  </div>
                ) : null}

                <div>
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Validation
                  </h4>
                  {validationIssues.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No validation issues.</p>
                  ) : (
                    <ul className="space-y-2">
                      {validationIssues.slice(0, 24).map((issue, index) => (
                        <li key={`${issue.code}-${issue.path}-${index}`} className="rounded-md border border-border/70 p-2">
                          <div className="mb-1 flex items-center gap-2">
                            <Badge variant={issueBadgeVariant(issue.severity)}>
                              {issue.severity}
                            </Badge>
                            <span className="font-mono text-[11px]">{issue.path || "$"}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">{issue.message}</p>
                        </li>
                      ))}
                      {validationIssues.length > 24 ? (
                        <li className="text-xs text-muted-foreground">
                          +{validationIssues.length - 24} more issues
                        </li>
                      ) : null}
                    </ul>
                  )}
                </div>

                <div>
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Semantic Diff
                  </h4>
                  {!validation || validation.diff.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No changes detected.</p>
                  ) : (
                    <ul className="space-y-2">
                      {validation.diff.slice(0, 30).map((entry, index) => {
                        const tokenPreview =
                          entry.category === "token_mapping"
                            ? resolveTokenPreview(tokenRegistry, entry.afterValue)
                            : null;
                        return (
                          <li key={`${entry.path}-${index}`} className="rounded-md border border-border/70 p-2">
                            <div className="mb-1 flex items-center gap-2">
                              <Badge variant={riskBadgeVariant(entry.risk)}>{entry.risk}</Badge>
                              <Badge variant="neutral">{entry.kind}</Badge>
                              <span className="font-mono text-[11px]">{entry.path}</span>
                            </div>
                            <div className="space-y-1 text-[11px] text-muted-foreground">
                              <div>
                                <span className="font-medium text-foreground/80">Before:</span>{" "}
                                <code>{entry.beforeValue ?? "—"}</code>
                              </div>
                              <div>
                                <span className="font-medium text-foreground/80">After:</span>{" "}
                                <code>{entry.afterValue ?? "—"}</code>
                              </div>
                              {tokenPreview ? (
                                <div>
                                  <span className="font-medium text-emerald-700">Resolved:</span>{" "}
                                  <code>{tokenPreview.path}</code> ({tokenPreview.resolvedValue})
                                </div>
                              ) : null}
                            </div>
                          </li>
                        );
                      })}
                      {validation.diff.length > 30 ? (
                        <li className="text-xs text-muted-foreground">
                          +{validation.diff.length - 30} more changes
                        </li>
                      ) : null}
                    </ul>
                  )}
                </div>
              </div>
            </section>
          </div>

          <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 px-5 py-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {confirmationRequired ? (
                <span>Risky changes detected. Confirm to enable save.</span>
              ) : (
                <span>Save runs spec validation and refreshes registry.</span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {confirmationRequired ? (
                <label className="inline-flex items-center gap-2 rounded-md border border-border/70 bg-background px-2 py-1 text-xs">
                  <input
                    type="checkbox"
                    checked={confirmRiskyChanges}
                    onChange={(event) => setConfirmRiskyChanges(event.target.checked)}
                  />
                  Confirm risky changes
                </label>
              ) : null}
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleRestore()}
                disabled={saving || restoring}
              >
                {restoring ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Undo2 className="mr-2 h-4 w-4" />}
                Restore backup
              </Button>
              <Button
                size="sm"
                onClick={() => void handleSave()}
                disabled={
                  saving ||
                  restoring ||
                  !dirty ||
                  !validation?.validation.valid ||
                  (confirmationRequired && !confirmRiskyChanges)
                }
              >
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save spec
              </Button>
            </div>
          </footer>
        </div>
        </aside>
      </div>
    </div>,
    document.body,
  );
}
