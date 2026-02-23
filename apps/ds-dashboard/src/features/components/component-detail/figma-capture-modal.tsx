import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  captureFigmaScreenshot,
  type CaptureFigmaScreenshotResult,
} from "@/lib/api";

interface FigmaCaptureModalProps {
  open: boolean;
  onClose: () => void;
  defaultFigmaUrl: string;
  componentSlug: string;
  onCaptured: (summary: {
    capturedCount: number;
    failedCount: number;
    skippedCount: number;
  }) => void;
}

export function FigmaCaptureModal({
  open,
  onClose,
  defaultFigmaUrl,
  componentSlug,
  onCaptured,
}: FigmaCaptureModalProps) {
  const [isMounted, setIsMounted] = useState(false);
  const [figmaUrl, setFigmaUrl] = useState(defaultFigmaUrl);
  const [includeVariants, setIncludeVariants] = useState(true);
  const [variantLimit, setVariantLimit] = useState(6);
  const [componentKind, setComponentKind] = useState<
    "component_set" | "component" | "all"
  >("component_set");
  const [previewing, setPreviewing] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [previewResult, setPreviewResult] =
    useState<CaptureFigmaScreenshotResult | null>(null);
  const [captureResult, setCaptureResult] =
    useState<CaptureFigmaScreenshotResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setFigmaUrl(defaultFigmaUrl);
    setPreviewResult(null);
    setCaptureResult(null);
    setError(null);
  }, [defaultFigmaUrl, open]);

  useEffect(() => {
    if (!open) return;
    setPreviewResult(null);
    setCaptureResult(null);
  }, [figmaUrl, includeVariants, variantLimit, componentKind, open]);

  useEffect(() => {
    if (!open || !isMounted) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, isMounted, onClose]);

  useEffect(() => {
    if (!open || !isMounted) return;
    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth =
      window.innerWidth - document.documentElement.clientWidth;

    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
    };
  }, [open, isMounted]);

  const safeUrl = useMemo(() => String(figmaUrl || "").trim(), [figmaUrl]);

  const runPreview = async () => {
    if (!safeUrl || previewing || capturing) return;
    setPreviewing(true);
    setError(null);
    setCaptureResult(null);
    try {
      const result = await captureFigmaScreenshot({
        figmaUrl: safeUrl,
        componentSlug,
        includeVariants,
        variantLimit,
        componentKind,
        requireExistingDoc: true,
        continueOnError: true,
        refreshIndices: false,
        dryRun: true,
        mainCaptureMode: "rest",
      });
      setPreviewResult(result);
    } catch (cause) {
      setPreviewResult(null);
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setPreviewing(false);
    }
  };

  const handleCapture = async () => {
    if (!safeUrl || capturing || previewing) return;
    setCapturing(true);
    setError(null);
    try {
      const result = await captureFigmaScreenshot({
        figmaUrl: safeUrl,
        componentSlug,
        includeVariants,
        variantLimit,
        componentKind,
        requireExistingDoc: true,
        continueOnError: true,
        refreshIndices: true,
        dryRun: false,
        mainCaptureMode: "rest",
      });
      setCaptureResult(result);
      onCaptured({
        capturedCount: Array.isArray(result.captured)
          ? result.captured.length
          : 0,
        failedCount: Array.isArray(result.failed) ? result.failed.length : 0,
        skippedCount: Array.isArray(result.skipped) ? result.skipped.length : 0,
      });
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setCapturing(false);
    }
  };

  if (!open || !isMounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[1002]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="figma-capture-modal-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
        aria-label="Close Figma capture modal"
        onClick={onClose}
      />

      <div className="relative z-10 flex min-h-full items-center justify-center p-4 md:p-6">
        <div className="w-[min(840px,96vw)] rounded-xl border border-border bg-card shadow-2xl">
          <div className="flex items-start justify-between border-b border-border/70 p-5">
            <div>
              <h3
                id="figma-capture-modal-title"
                className="text-lg font-semibold"
              >
                Update Component from Figma URL
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Paste a Figma URL to refresh this component's visual proof and
                synced detail data.
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              aria-label="Close dialog"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="space-y-4 p-5">
            <div className="space-y-1.5">
              <label htmlFor="figma-capture-url" className="text-sm font-medium">
                Figma URL
              </label>
              <Input
                id="figma-capture-url"
                value={figmaUrl}
                onChange={(event) => setFigmaUrl(event.target.value)}
                placeholder="https://www.figma.com/design/<file>/<name>?node-id=..."
              />
              <p className="text-xs text-muted-foreground">
                With <code>node-id</code>: captures that component. Without
                node id: scans the document and resolves all affected components.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-border"
                  checked={includeVariants}
                  onChange={(event) => setIncludeVariants(event.target.checked)}
                />
                Include variants
              </label>

              <div className="space-y-1.5">
                <label
                  htmlFor="figma-capture-variant-limit"
                  className="text-sm font-medium"
                >
                  Variant limit
                </label>
                <Input
                  id="figma-capture-variant-limit"
                  type="number"
                  min={1}
                  max={20}
                  value={variantLimit}
                  onChange={(event) => {
                    const nextValue = Number(event.target.value);
                    if (!Number.isFinite(nextValue) || nextValue <= 0) return;
                    setVariantLimit(
                      Math.min(20, Math.max(1, Math.floor(nextValue))),
                    );
                  }}
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="figma-capture-kind" className="text-sm font-medium">
                  Document scope
                </label>
                <select
                  id="figma-capture-kind"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={componentKind}
                  onChange={(event) =>
                    setComponentKind(
                      event.target.value as "component_set" | "component" | "all",
                    )
                  }
                >
                  <option value="component_set">Component sets only</option>
                  <option value="component">Components only</option>
                  <option value="all">All component nodes</option>
                </select>
              </div>
            </div>

            {error ? (
              <div className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            {previewResult ? (
              <div className="rounded-md border border-border/70 bg-muted/20 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold">Preview</p>
                  <p className="text-xs text-muted-foreground">
                    {previewResult.targets_total ?? 0} target(s) ·{" "}
                    {previewResult.total_candidates ?? 0} candidate(s)
                  </p>
                </div>
                {Array.isArray(previewResult.targets) &&
                previewResult.targets.length > 0 ? (
                  <div className="mt-3 max-h-48 overflow-auto rounded border border-border/60 bg-background/70">
                    <table className="w-full text-left text-xs">
                      <thead className="sticky top-0 bg-background">
                        <tr>
                          <th className="px-2 py-1.5 font-semibold">Slug</th>
                          <th className="px-2 py-1.5 font-semibold">Node</th>
                          <th className="px-2 py-1.5 font-semibold">Kind</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewResult.targets.slice(0, 20).map((target) => (
                          <tr
                            key={`${target.slug}:${target.node_id}`}
                            className="border-t border-border/40"
                          >
                            <td className="px-2 py-1.5 font-mono">
                              {target.slug}
                            </td>
                            <td className="px-2 py-1.5 font-mono">
                              {target.node_id}
                            </td>
                            <td className="px-2 py-1.5">{target.kind || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {previewResult.targets.length > 20 ? (
                      <div className="border-t border-border/40 px-2 py-1.5 text-[11px] text-muted-foreground">
                        +{previewResult.targets.length - 20} more targets
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">
                    No capture targets resolved for this URL/configuration.
                  </p>
                )}
                {Array.isArray(previewResult.skipped) &&
                previewResult.skipped.length > 0 ? (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    {previewResult.skipped.length} skipped target(s) in preview.
                  </p>
                ) : null}
              </div>
            ) : null}

            {captureResult ? (
              <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-800">
                Capture done: {captureResult.captured?.length ?? 0} captured ·{" "}
                {captureResult.failed?.length ?? 0} failed ·{" "}
                {captureResult.skipped?.length ?? 0} skipped
              </div>
            ) : null}
          </div>

          <div className="flex justify-end gap-2 border-t border-border/70 p-5">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={capturing || previewing}
            >
              Cancel
            </Button>
            <Button
              variant="outline"
              onClick={runPreview}
              disabled={capturing || previewing || !safeUrl}
            >
              {previewing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Resolving...
                </>
              ) : (
                "Preview targets"
              )}
            </Button>
            <Button
              variant="default"
              onClick={handleCapture}
              disabled={
                capturing ||
                previewing ||
                !safeUrl ||
                !previewResult ||
                (previewResult.targets_total ?? 0) === 0
              }
            >
              {capturing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Capturing...
                </>
              ) : (
                <>
                  <Camera className="mr-2 h-4 w-4" />
                  Capture & replace
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
