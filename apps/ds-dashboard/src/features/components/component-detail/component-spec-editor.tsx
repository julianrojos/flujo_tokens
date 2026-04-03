import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";

import type { PartialComponentSpec } from "ds-types";
import { patchEditorialSpec } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusAlert } from "@/components/ui/status-alert";
import { StringListEditor } from "@/components/ui/string-list-editor";
import {
  Modal,
  ModalContent,
  ModalHeader,
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

const SummaryMarkdownEditor = lazy(() =>
  import("@/components/rich-text-editor/summary-markdown-editor").then((module) => ({
    default: module.SummaryMarkdownEditor,
  })),
);

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
}

export function ComponentSpecEditor({
  open,
  slug,
  spec,
  expectedUpdatedAt,
  onSaved,
  onCancel,
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
  }, [open, slug]);

  useEffect(() => {
    if (!open) return;
    setSummary(toSummary(spec));
    setBestPractices(toBestPractices(spec));
    setContentGuidelines(toContentGuidelines(spec));
    setAccessibility(toAccessibility(spec));
  }, [open, slug, spec]);

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
      <ModalContent size="lg">
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

        <div className="max-h-[60vh] space-y-5 overflow-y-auto overscroll-contain p-5">
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
                <Input
                  id="accessibility-role"
                  value={accessibility.role}
                  onChange={(e) => {
                    markUnsaved();
                    setAccessibility((current) => ({ ...current, role: e.target.value }));
                  }}
                  placeholder="e.g., dialog, button, navigation"
                />
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
            </div>
          </section>

          {/* Status messages */}
          {isDirty ? (
            <StatusAlert variant="warning" description="You have unsaved changes." />
          ) : null}
          {confirmDiscardOpen ? (
            <div className="mt-3 rounded-md border border-border/70 bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">
                You have unsaved changes. Do you want to discard them?
              </p>
              <div className="mt-2 flex items-center gap-2">
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
              </div>
            </div>
          ) : null}

          {successMessage ? (
            <StatusAlert variant="success" description={successMessage} />
          ) : null}
          {warningMessage ? (
            <StatusAlert variant="warning" description={warningMessage} />
          ) : null}
          {error ? (
            <StatusAlert variant="error" description={error} />
          ) : null}

          {/* Actions */}
          <div className="mt-4 flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleCancel} disabled={isSaving}>
              {savedWithMarkdownSync ? "Ok, close" : "Cancel"}
            </Button>
            <Button size="sm" onClick={handleSave} disabled={isSaving || !isDirty}>
              {isSaving ? "Saving..." : "Save spec details"}
            </Button>
          </div>
        </div>
      </ModalContent>
    </Modal>
  );
}
