import { useEffect, useMemo, useState } from "react";

import type { PartialComponentSpec } from "ds-types";
import { patchEditorialSpec } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  isSummaryDirty,
  persistSummaryEditorial,
  resolveCancelIntent,
  toSummary,
  type SummaryFields,
} from "./component-spec-editor-logic";

interface ComponentSpecEditorProps {
  slug: string;
  spec: PartialComponentSpec | null;
  expectedHash: string | null;
  onSaved: (result: { message: string; rawHash: string | null }) => void;
  onCancel: () => void;
}

export function ComponentSpecEditor({
  slug,
  spec,
  expectedHash,
  onSaved,
  onCancel,
}: ComponentSpecEditorProps) {
  const baselineSummary = useMemo(() => toSummary(spec), [spec]);
  const [summary, setSummary] = useState<SummaryFields>(() => toSummary(spec));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);
  const isDirty = isSummaryDirty(summary, baselineSummary);

  useEffect(() => {
    setSummary(toSummary(spec));
    setError(null);
    setConfirmDiscardOpen(false);
  }, [spec]);

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

  return (
    <section className="rounded-lg border border-border/70 bg-background/60 p-4">
      <div className="mb-3">
        <h4 className="text-sm font-semibold">Edit Summary</h4>
        <p className="mt-1 text-xs text-muted-foreground">
          This editor only updates editorial fields and does not modify capture fields.
        </p>
      </div>

      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Purpose</span>
          <textarea
            value={summary.purpose}
            onChange={(event) =>
              setSummary((current) => ({ ...current, purpose: event.target.value }))
            }
            rows={3}
            className="w-full rounded-md border border-border bg-background p-2 text-sm"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">When to use</span>
          <textarea
            value={summary.when_to_use}
            onChange={(event) =>
              setSummary((current) => ({ ...current, when_to_use: event.target.value }))
            }
            rows={3}
            className="w-full rounded-md border border-border bg-background p-2 text-sm"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">
            When not to use
          </span>
          <textarea
            value={summary.when_not_to_use}
            onChange={(event) =>
              setSummary((current) => ({ ...current, when_not_to_use: event.target.value }))
            }
            rows={3}
            className="w-full rounded-md border border-border bg-background p-2 text-sm"
          />
        </label>
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
          {isSaving ? "Saving..." : "Save summary"}
        </Button>
      </div>
    </section>
  );
}
