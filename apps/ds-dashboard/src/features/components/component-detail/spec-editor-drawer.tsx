import { useEffect, useMemo, useRef, useState } from "react";
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
import { StatusAlert } from "@/components/ui/status-alert";
import {
  Modal,
  ModalContent,
} from "@/components/ui/overlay";

interface SpecEditorDrawerProps {
  open: boolean;
  slug: string;
  displayName: string;
  specPath: string | null;
  initialRaw: string;
  initialHash: string | null;
  tokenRegistry: TokenRegistry | null;
  onClose: () => void;
  onSaved: (result: { message: string; raw?: string; rawHash?: string | null }) => void;
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
  const [raw, setRaw] = useState(initialRaw);
  const [baselineRaw, setBaselineRaw] = useState(initialRaw);
  const [validating, setValidating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [validation, setValidation] = useState<ComponentSpecValidateResponse | null>(null);
  const [validationIssues, setValidationIssues] = useState<SpecValidationIssue[]>([]);
  const [error, setError] = useState<ApiErrorDisplay | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [confirmRiskyChanges, setConfirmRiskyChanges] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const handleSaveRef = useRef<() => Promise<void>>();

  const dirty = raw.trim() !== baselineRaw.trim();
  const confirmationRequired = useMemo(() => {
    if (!validation || validation.diff.length === 0) return false;
    return validation.diff.some((d) => d.risk === "high");
  }, [validation]);

  const summary = useMemo(() => {
    if (!validation) return null;
    return {
      valid: validation.validation.valid,
      blocking: validation.validation.issues.filter((i) => i.severity === "error").length,
      warnings: validation.validation.issues.filter((i) => i.severity === "warning").length,
      diffCount: validation.diff.length,
    };
  }, [validation]);

  useEffect(() => {
    if (!open) return;
    setRaw(initialRaw);
    setBaselineRaw(initialRaw);
    setValidation(null);
    setValidationIssues([]);
    setError(null);
    setSuccess(null);
    setConfirmRiskyChanges(false);
  }, [open, initialRaw]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "s") {
        event.preventDefault();
        if (!saving && dirty && validation?.validation.valid && (!confirmationRequired || confirmRiskyChanges)) {
          void handleSaveRef.current?.();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, saving, dirty, validation, confirmationRequired, confirmRiskyChanges]);

  const runValidation = async (value: string) => {
    setValidating(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await validateComponentSpecInput({
        slug,
        raw: value,
      });
      setValidation(result);
      setValidationIssues(result.validation.issues);
    } catch (cause) {
      setError(
        toApiErrorDisplay(cause, {
          fallbackTitle: "Validation failed",
          fallbackMessage: "Unable to validate spec.",
        }),
      );
    } finally {
      setValidating(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await saveComponentSpec({
        slug,
        raw,
      });
      setSuccess(result.message ?? null);
      setBaselineRaw(raw);
      onSaved({ message: result.message ?? '', raw, rawHash: result.rawHash });
      onClose();
    } catch (cause) {
      setError(
        toApiErrorDisplay(cause, {
          fallbackTitle: "Save failed",
          fallbackMessage: "Unable to save spec.",
        }),
      );
    } finally {
      setSaving(false);
    }
  };

  // Keep ref in sync so the keyboard shortcut always calls the latest handleSave
  handleSaveRef.current = handleSave;

  const handleRestore = async () => {
    setRestoring(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await restoreComponentSpecBackup({ slug });
      // Restore doesn't return raw content, so we just reload the page state
      setSuccess(result.message ?? null);
      onSaved({ message: result.message ?? '' });
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

  return (
    <Modal open={open} onClose={onClose} zIndex={1100}>
      <ModalContent
        size="lg"
        className="h-[90vh] w-full overflow-hidden p-0"
      >
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
                  {validating ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-4 w-4" />
                  )}
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
                ref={textareaRef}
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
                  {summary !== null ? (
                    summary.valid ? (
                      <Badge variant="success">
                        <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                        Valid
                      </Badge>
                    ) : (
                      <Badge variant="warning">
                        <AlertTriangle className="mr-1 h-3.5 w-3.5" />
                        Needs fixes
                      </Badge>
                    )
                  ) : null}
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
                  <StatusAlert variant="success" description={success} />
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
                        <li
                          key={`${issue.code}-${issue.path}-${index}`}
                          className="rounded-md border border-border/70 p-2"
                        >
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
                                  <span className="font-medium text-status-success">Resolved:</span>{" "}
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
                {restoring ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Undo2 className="mr-2 h-4 w-4" />
                )}
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
                {saving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Save spec
              </Button>
            </div>
          </footer>
        </div>
      </ModalContent>
    </Modal>
  );
}
