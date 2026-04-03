import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";

import type { PartialComponentSpec } from "ds-types";
import { patchEditorialSpec } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { StringListEditor } from "@/components/ui/string-list-editor";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalFooter,
} from "@/components/ui/overlay";
import {
  isSummaryDirty,
  isBestPracticesDirty,
  isContentGuidelinesDirty,
  isAccessibilityDirty,
  persistEditorial,
  resolveCancelIntent,
  toSummary,
  toBestPractices,
  toContentGuidelines,
  toAccessibility,
  type SummaryFields,
  type BestPracticesFields,
  type ContentGuidelinesFields,
  type AccessibilityFields,
} from "./component-spec-editor-logic";
import { markEditorialSuggestionApplied } from "./lib/component-spec-api";

const SummaryMarkdownEditor = lazy(() =>
  import("@/components/rich-text-editor/summary-markdown-editor").then((module) => ({
    default: module.SummaryMarkdownEditor,
  })),
);

const ARIA_ROLE_OPTIONS = [
  "alert",
  "alertdialog",
  "application",
  "article",
  "banner",
  "blockquote",
  "button",
  "caption",
  "cell",
  "checkbox",
  "code",
  "columnheader",
  "combobox",
  "complementary",
  "contentinfo",
  "definition",
  "deletion",
  "dialog",
  "directory",
  "document",
  "emphasis",
  "feed",
  "figure",
  "form",
  "generic",
  "grid",
  "gridcell",
  "group",
  "heading",
  "img",
  "insertion",
  "link",
  "list",
  "listbox",
  "listitem",
  "log",
  "main",
  "mark",
  "marquee",
  "math",
  "menu",
  "menubar",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "meter",
  "navigation",
  "none",
  "note",
  "option",
  "paragraph",
  "presentation",
  "progressbar",
  "radio",
  "radiogroup",
  "region",
  "row",
  "rowgroup",
  "rowheader",
  "scrollbar",
  "search",
  "searchbox",
  "separator",
  "slider",
  "spinbutton",
  "status",
  "strong",
  "subscript",
  "superscript",
  "switch",
  "tab",
  "table",
  "tablist",
  "tabpanel",
  "term",
  "textbox",
  "time",
  "timer",
  "toolbar",
  "tooltip",
  "tree",
  "treegrid",
  "treeitem",
] as const;

const ARIA_ROLE_SET = new Set<string>(ARIA_ROLE_OPTIONS);

function SummaryEditorLoadingFallback() {
  return <div className="min-h-[80px] animate-pulse rounded-md border border-border bg-muted/30" />;
}

interface ComponentSpecEditorProps {
  open: boolean;
  slug: string;
  spec: PartialComponentSpec | null;
  expectedUpdatedAt: number | null;
  onSaved: (result: { message: string; updatedAt: number | null }) => void;
  onCancel: () => void;
  suggestion?: { id: number; patch: Record<string, unknown> } | null;
  suggestionLoading?: boolean;
  onApplySuggestion?: () => void;
  onDiscardSuggestion?: () => void;
}

export function ComponentSpecEditor({
  open,
  slug,
  spec,
  expectedUpdatedAt,
  onSaved,
  onCancel,
  suggestion: externalSuggestion,
  suggestionLoading: externalSuggestionLoading,
  onApplySuggestion,
  onDiscardSuggestion,
}: ComponentSpecEditorProps) {
  const baselineSummary = useMemo(() => toSummary(spec), [spec]);
  const baselineBestPractices = useMemo(() => toBestPractices(spec), [spec]);
  const baselineContentGuidelines = useMemo(() => toContentGuidelines(spec), [spec]);
  const baselineAccessibility = useMemo(() => toAccessibility(spec), [spec]);

  const [summary, setSummary] = useState<SummaryFields>(() => toSummary(spec));
  const [bestPractices, setBestPractices] = useState<BestPracticesFields>(() => toBestPractices(spec));
  const [contentGuidelines, setContentGuidelines] = useState<ContentGuidelinesFields>(() => toContentGuidelines(spec));
  const [accessibility, setAccessibility] = useState<AccessibilityFields>(() => toAccessibility(spec));

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);
  const [savedWithMarkdownSync, setSavedWithMarkdownSync] = useState(false);
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);

  // Track which suggestion was applied so we can mark it after save,
  // even if the banner has been dismissed.
  const [appliedSuggestionId, setAppliedSuggestionId] = useState<number | null>(null);

  const suggestion = externalSuggestion;
  const suggestionLoading = externalSuggestionLoading ?? false;

  const hasCustomAccessibilityRole = useMemo(
    () => accessibility.role.trim().length > 0 && !ARIA_ROLE_SET.has(accessibility.role),
    [accessibility.role],
  );
  const footerStatus = useMemo(() => {
    if (error) {
      return { message: error, tone: "error" as const };
    }
    if (warningMessage) {
      return { message: warningMessage, tone: "warning" as const };
    }
    if (successMessage) {
      return { message: successMessage, tone: "success" as const };
    }
    return null;
  }, [error, warningMessage, successMessage]);

  const summaryIsDirty = useMemo(
    () => isSummaryDirty(summary, baselineSummary),
    [summary, baselineSummary],
  );
  const bpIsDirty = useMemo(
    () => isBestPracticesDirty(bestPractices, baselineBestPractices),
    [bestPractices, baselineBestPractices],
  );
  const cgIsDirty = useMemo(
    () => isContentGuidelinesDirty(contentGuidelines, baselineContentGuidelines),
    [contentGuidelines, baselineContentGuidelines],
  );
  const accIsDirty = useMemo(
    () => isAccessibilityDirty(accessibility, baselineAccessibility),
    [accessibility, baselineAccessibility],
  );
  const isDirty = useMemo(
    () => summaryIsDirty || bpIsDirty || cgIsDirty || accIsDirty,
    [summaryIsDirty, bpIsDirty, cgIsDirty, accIsDirty],
  );

  useEffect(() => {
    if (!open) return;
    setError(null);
    setSuccessMessage(null);
    setWarningMessage(null);
    setSavedWithMarkdownSync(false);
    setConfirmDiscardOpen(false);
    setAppliedSuggestionId(null);
  }, [open, slug]);

  useEffect(() => {
    if (!open) return;
    setSummary(toSummary(spec));
    setBestPractices(toBestPractices(spec));
    setContentGuidelines(toContentGuidelines(spec));
    setAccessibility(toAccessibility(spec));
  }, [open, slug, spec]);

  const applySuggestion = () => {
    if (!suggestion) return;
    const patch = suggestion.patch;

    // Remember which suggestion was applied so we can mark it after save.
    setAppliedSuggestionId(suggestion.id);

    if (patch.summary && typeof patch.summary === "object") {
      const s = patch.summary as Record<string, string>;
      setSummary((prev) => ({
        purpose: s.purpose ?? prev.purpose,
        when_to_use: s.when_to_use ?? prev.when_to_use,
        when_not_to_use: s.when_not_to_use ?? prev.when_not_to_use,
      }));
    } else if (patch.summary !== undefined) {
      console.warn("[spec-editor] Ignored malformed summary in AI patch", patch.summary);
    }
    if (patch.best_practices && typeof patch.best_practices === "object") {
      const bp = patch.best_practices as Record<string, string[]>;
      setBestPractices((prev) => ({
        do: bp.do ?? prev.do,
        dont: bp.dont ?? prev.dont,
      }));
    } else if (patch.best_practices !== undefined) {
      console.warn("[spec-editor] Ignored malformed best_practices in AI patch", patch.best_practices);
    }
    if (patch.content_guidelines && typeof patch.content_guidelines === "object") {
      const cg = patch.content_guidelines as { rules?: string[] };
      if (cg.rules) setContentGuidelines({ rules: cg.rules });
    } else if (patch.content_guidelines !== undefined) {
      console.warn("[spec-editor] Ignored malformed content_guidelines in AI patch", patch.content_guidelines);
    }
    if (patch.accessibility && typeof patch.accessibility === "object") {
      const acc = patch.accessibility as Record<string, unknown>;
      setAccessibility((prev) => ({
        role: typeof acc.role === "string" ? acc.role : prev.role,
        labelingRules: Array.isArray((acc.labeling as { rules?: string[] })?.rules)
          ? (acc.labeling as { rules: string[] }).rules
          : prev.labelingRules,
        notes: Array.isArray(acc.notes) ? (acc.notes as string[]) : prev.notes,
      }));
    } else if (patch.accessibility !== undefined) {
      console.warn("[spec-editor] Ignored malformed accessibility in AI patch", patch.accessibility);
    }
    setSavedWithMarkdownSync(false);
    onApplySuggestion?.();
  };

  const discardSuggestion = () => {
    if (onDiscardSuggestion) {
      onDiscardSuggestion();
      return;
    }
    console.warn("[spec-editor] discardSuggestion called without onDiscardSuggestion prop");
    setAppliedSuggestionId(null);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);
    setWarningMessage(null);
    try {
      const saved = await persistEditorial(
        {
          slug,
          expectedUpdatedAt,
          summary,
          baselineSummary,
          bestPractices,
          baselineBestPractices,
          contentGuidelines,
          baselineContentGuidelines,
          accessibility,
          baselineAccessibility,
          spec,
        },
        {
          patchEditorialSpecFn: patchEditorialSpec,
        },
      );
      onSaved({
        message: saved.message,
        updatedAt: saved.updatedAt,
      });

      if (saved.markdownSynced !== true) {
        setWarningMessage(saved.message || "Editorial fields saved, but markdown regeneration is pending.");
      } else {
        setSuccessMessage(saved.message || "Editorial fields saved successfully.");
      }
      setSavedWithMarkdownSync(saved.markdownSynced === true);

      // Mark the applied suggestion as such (bookkeeping) without blocking save success.
      if (appliedSuggestionId !== null) {
        try {
          await markEditorialSuggestionApplied(slug, appliedSuggestionId);
        } catch (markAppliedError) {
          console.warn("[spec-editor] mark-applied failed, suggestion will reappear:", markAppliedError);
        }
        setAppliedSuggestionId(null);
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    // Baseline hasn't been refetched yet after save, so isDirty may still look stale.
    if (savedWithMarkdownSync) {
      onCancel();
      return;
    }
    if (resolveCancelIntent(isDirty) === "confirm") {
      setConfirmDiscardOpen(true);
      return;
    }
    onCancel();
  };

  const markUnsaved = () => {
    setSavedWithMarkdownSync(false);
    setSuccessMessage(null);
    setWarningMessage(null);
  };

  return (
    <Modal open={open} onClose={handleCancel} zIndex={1102}>
      <ModalContent size="lg" className="flex max-h-[92vh] flex-col overflow-hidden md:max-h-[85vh]">
        <ModalHeader>
          <div>
            <h3 id="spec-editor-modal-title" className="text-lg font-semibold">
              Edit spec details
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Edit summary, best practices, content guidelines, and accessibility metadata.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={handleCancel} aria-label="Close dialog">
            <X className="h-4 w-4" />
          </Button>
        </ModalHeader>

        <div className="flex-1 space-y-5 overflow-y-auto overscroll-contain p-5">
          {/* AI suggestion banner */}
          {suggestionLoading ? (
            <div className="rounded-md border border-border/70 bg-muted/30 p-3">
              <p className="text-sm text-muted-foreground">Loading AI suggestion…</p>
            </div>
          ) : suggestion ? (
            <div className="rounded-md border border-border/70 bg-muted/30 p-3">
              <p className="text-sm text-muted-foreground">
                AI has suggested editorial improvements. Review and apply them, or discard.
              </p>
              <div className="mt-2 flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={discardSuggestion}
                  disabled={isSaving}
                >
                  Discard
                </Button>
                <Button size="sm" onClick={applySuggestion} disabled={isSaving}>
                  Use AI suggestion
                </Button>
              </div>
            </div>
          ) : null}

          {/* Summary section */}
          <section>
            <h4 className="mb-3 text-sm font-semibold">Summary</h4>
            <Suspense
              fallback={
                <div className="space-y-3">
                  <SummaryEditorLoadingFallback />
                  <SummaryEditorLoadingFallback />
                  <SummaryEditorLoadingFallback />
                </div>
              }
            >
              <div className="space-y-3">
                <div>
                  <span className="mb-1 block text-xs font-medium text-muted-foreground">Purpose</span>
                  <SummaryMarkdownEditor
                    value={summary.purpose}
                    onChange={(markdown) => {
                      markUnsaved();
                      setSummary((current) => ({ ...current, purpose: markdown }));
                    }}
                    placeholder="Enter purpose..."
                  />
                </div>

                <div>
                  <span className="mb-1 block text-xs font-medium text-muted-foreground">
                    When to use
                  </span>
                  <SummaryMarkdownEditor
                    value={summary.when_to_use}
                    onChange={(markdown) => {
                      markUnsaved();
                      setSummary((current) => ({ ...current, when_to_use: markdown }));
                    }}
                    placeholder="Enter when to use..."
                  />
                </div>

                <div>
                  <span className="mb-1 block text-xs font-medium text-muted-foreground">
                    When not to use
                  </span>
                  <SummaryMarkdownEditor
                    value={summary.when_not_to_use}
                    onChange={(markdown) => {
                      markUnsaved();
                      setSummary((current) => ({ ...current, when_not_to_use: markdown }));
                    }}
                    placeholder="Enter when not to use..."
                  />
                </div>
              </div>
            </Suspense>
          </section>

          <hr className="border-border" />

          {/* Best Practices section */}
          <section>
            <h4 className="mb-3 text-sm font-semibold">Best Practices</h4>
            <div className="grid gap-4 md:grid-cols-2">
              <StringListEditor
                value={bestPractices.do}
                onChange={(doItems) => {
                  markUnsaved();
                  setBestPractices((current) => ({ ...current, do: doItems }));
                }}
                label="Do"
                placeholder="e.g., Use semantic HTML elements"
              />
              <StringListEditor
                value={bestPractices.dont}
                onChange={(dontItems) => {
                  markUnsaved();
                  setBestPractices((current) => ({ ...current, dont: dontItems }));
                }}
                label="Don't"
                placeholder="e.g., Don't use divs as buttons"
              />
            </div>
          </section>

          <hr className="border-border" />

          {/* Content Guidelines section */}
          <section>
            <h4 className="mb-3 text-sm font-semibold">Content Guidelines</h4>
            <StringListEditor
              value={contentGuidelines.rules}
              onChange={(rules) => {
                markUnsaved();
                setContentGuidelines({ rules });
              }}
              label="Rules"
              placeholder="e.g., Use title case for headings"
            />
          </section>

          <hr className="border-border" />

          {/* Accessibility section */}
          <section>
            <h4 className="mb-3 text-sm font-semibold">Accessibility</h4>
            <div className="space-y-3">
              <div>
                <label
                  htmlFor="accessibility-role"
                  className="mb-1 block text-xs font-medium text-muted-foreground"
                >
                  ARIA Role
                </label>
                <Select
                  id="accessibility-role"
                  value={accessibility.role}
                  onChange={(e) => {
                    markUnsaved();
                    setAccessibility((current) => ({ ...current, role: e.target.value }));
                  }}
                  className="w-full"
                >
                  {hasCustomAccessibilityRole ? (
                    <option value={accessibility.role}>
                      {`Current custom role: ${accessibility.role}`}
                    </option>
                  ) : null}
                  <option value="">No role selected</option>
                  {ARIA_ROLE_OPTIONS.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </Select>
                {hasCustomAccessibilityRole ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    This role is not in the curated list, but it is preserved.
                  </p>
                ) : null}
              </div>
              <StringListEditor
                value={accessibility.labelingRules}
                onChange={(rules) => {
                  markUnsaved();
                  setAccessibility((current) => ({ ...current, labelingRules: rules }));
                }}
                label="Labeling rules"
                placeholder="e.g., Label must include component name"
              />
              <StringListEditor
                value={accessibility.notes}
                onChange={(notes) => {
                  markUnsaved();
                  setAccessibility((current) => ({ ...current, notes }));
                }}
                label="Notes"
                placeholder="e.g., Test with VoiceOver on macOS"
              />
            </div>
          </section>

        </div>

        <ModalFooter className="justify-between">
          <div className="flex min-h-9 flex-col justify-center gap-1">
            {confirmDiscardOpen ? (
              <p className="text-sm text-muted-foreground">
                You have unsaved changes. Do you want to discard them?
              </p>
            ) : isDirty ? (
              <p className="text-sm text-muted-foreground">You have unsaved changes.</p>
            ) : null}
            {footerStatus ? (
              <p
                className={
                  footerStatus.tone === "error"
                    ? "text-xs text-status-error"
                    : footerStatus.tone === "warning"
                      ? "text-xs text-status-warning"
                      : "text-xs text-status-success"
                }
                role={footerStatus.tone === "error" ? "alert" : "status"}
                aria-live={footerStatus.tone === "error" ? "assertive" : "polite"}
              >
                {footerStatus.message}
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {confirmDiscardOpen ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmDiscardOpen(false)}
                  disabled={isSaving}
                >
                  Keep editing
                </Button>
                <Button size="sm" onClick={onCancel} disabled={isSaving}>
                  Discard changes
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" size="sm" onClick={handleCancel} disabled={isSaving}>
                  {savedWithMarkdownSync ? "Ok, close" : "Cancel"}
                </Button>
                <Button size="sm" onClick={handleSave} disabled={isSaving || !isDirty}>
                  {isSaving ? "Saving..." : "Save spec details"}
                </Button>
              </>
            )}
          </div>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
