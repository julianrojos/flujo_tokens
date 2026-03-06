import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

import type { PartialComponentSpec } from "ds-types";
import { patchEditorialSpec } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { SummaryMarkdownEditor } from "@/components/rich-text-editor/summary-markdown-editor";
import {
  isSummaryDirty,
  persistSummaryEditorial,
  resolveCancelIntent,
  toSummary,
  type SummaryFields,
} from "./component-spec-editor-logic";

interface ComponentSpecEditorProps {
  open: boolean;
  slug: string;
  spec: PartialComponentSpec | null;
  expectedHash: string | null;
  onSaved: (result: { message: string; rawHash: string | null }) => void;
  onCancel: () => void;
}

export function ComponentSpecEditor({
  open,
  slug,
  spec,
  expectedHash,
  onSaved,
  onCancel,
}: ComponentSpecEditorProps) {
  const [isMounted, setIsMounted] = useState(false);
  const baselineSummary = useMemo(() => toSummary(spec), [spec]);
  const [summary, setSummary] = useState<SummaryFields>(() => toSummary(spec));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);
  const isDirty = isSummaryDirty(summary, baselineSummary);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setSummary(toSummary(spec));
    setError(null);
    setConfirmDiscardOpen(false);
  }, [open, spec]);

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    try {
      const saved = await persistSummaryEditorial({
        slug,
        expectedHash,
        summary,
      }, {
        patchEditorialSpecFn: patchEditorialSpec,
      });
      onSaved({
        message: saved.message,
        rawHash: saved.rawHash,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    if (resolveCancelIntent(isDirty) === "confirm") {
      setConfirmDiscardOpen(true);
      return;
    }
    onCancel();
  };

  useEffect(() => {
    if (!open || !isMounted) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") handleCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, isMounted, handleCancel]);

  useEffect(() => {
    if (!open || !isMounted) return;
    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
    };
  }, [open, isMounted]);

  if (!open || !isMounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[1102]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="summary-editor-modal-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
        onClick={handleCancel}
        aria-label="Close summary editor"
      />

      <div className="relative z-10 flex min-h-full items-center justify-center p-4 md:p-6">
        <section className="w-[min(760px,96vw)] rounded-xl border border-border bg-card shadow-2xl">
          <div className="flex items-start justify-between border-b border-border/70 p-5">
            <div>
              <h3 id="summary-editor-modal-title" className="text-lg font-semibold">
                Edit summary (spec source)
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Supports markdown formatting. Changes are persisted as markdown strings.
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={handleCancel} aria-label="Close dialog">
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="space-y-3 p-5">
            <div>
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Purpose</span>
              <SummaryMarkdownEditor
                value={summary.purpose}
                onChange={(markdown) =>
                  setSummary((current) => ({ ...current, purpose: markdown }))
                }
                placeholder="Enter purpose..."
              />
            </div>

            <div>
              <span className="mb-1 block text-xs font-medium text-muted-foreground">
                When to use
              </span>
              <SummaryMarkdownEditor
                value={summary.when_to_use}
                onChange={(markdown) =>
                  setSummary((current) => ({ ...current, when_to_use: markdown }))
                }
                placeholder="Enter when to use..."
              />
            </div>

            <div>
              <span className="mb-1 block text-xs font-medium text-muted-foreground">
                When not to use
              </span>
              <SummaryMarkdownEditor
                value={summary.when_not_to_use}
                onChange={(markdown) =>
                  setSummary((current) => ({ ...current, when_not_to_use: markdown }))
                }
                placeholder="Enter when not to use..."
              />
            </div>

            {error ? (
              <p className="mt-3 rounded-md border border-red-500/40 bg-red-500/10 p-2 text-sm text-red-700">
                {error}
              </p>
            ) : null}
            {isDirty ? (
              <p className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-700">
                You have unsaved changes.
              </p>
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

            <div className="mt-4 flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleCancel} disabled={isSaving}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSave} disabled={isSaving || !isDirty}>
                {isSaving ? "Saving..." : "Save summary (markdown)"}
              </Button>
            </div>
          </div>
        </section>
      </div>
    </div>,
    document.body,
  );
}
