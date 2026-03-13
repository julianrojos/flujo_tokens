import { useState, useCallback } from "react";
import {
  Camera,
  Loader2,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { FigmaMcpConnectionTestButton } from "@/components/figma-mcp-connection-test-button";
import { useOperationRunner, formatRelativeTime } from "../hooks/use-operation-runner";
import { LogTerminal } from "./log-terminal";

interface CaptureFormProps {
  id: string;
  label: string;
  description: string;
  endpoint: string;
  onRunSuccess?: () => void;
}

export function CaptureForm({
  id,
  label,
  description,
  endpoint,
  onRunSuccess,
}: CaptureFormProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Form state
  const [figmaUrl, setFigmaUrl] = useState("");
  const [componentSlug, setComponentSlug] = useState("");
  const [includeVariants, setIncludeVariants] = useState(false);
  const [dryRun, setDryRun] = useState(false);
  const [scale, setScale] = useState<"1" | "2">("2");
  const [format, setFormat] = useState<"png" | "svg">("png");

  const [{ status, isRunning, logLines, summary, lastRunAt, elapsedMs }, { run, clearLogs }] =
    useOperationRunner(id, endpoint, onRunSuccess);

  const handleRun = useCallback(async () => {
    if (!figmaUrl.trim()) return;
    const params: Record<string, unknown> = {
      figmaUrl: figmaUrl.trim(),
      dryRun,
      scale: Number(scale),
      format,
      includeVariants,
      refreshIndices: true,
    };
    if (componentSlug.trim()) params.componentSlug = componentSlug.trim();
    await run(params);
  }, [run, figmaUrl, componentSlug, includeVariants, dryRun, scale, format]);

  const handleClear = useCallback(() => clearLogs(), [clearLogs]);

  const canRun = !isRunning && !!figmaUrl.trim();
  const hasLogs = logLines.length > 0 || !!summary;

  const elapsedLabel =
    elapsedMs !== undefined
      ? elapsedMs >= 1000
        ? `${(elapsedMs / 1000).toFixed(1)}s`
        : `${elapsedMs}ms`
      : undefined;

  return (
    <div className="flex flex-col rounded-lg border border-border/70 bg-card shadow-sm overflow-hidden">
      {/* ── Collapsible header ── */}
      <button
        type="button"
        className="flex items-center justify-between px-4 py-3 bg-muted/20 hover:bg-muted/30 transition-colors text-left w-full"
        onClick={() => setIsOpen((v) => !v)}
      >
        <div className="flex items-center gap-3 min-w-0">
          {isOpen ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold flex items-center gap-1.5">
                <Camera className="h-4 w-4 text-primary shrink-0" />
                {label}
              </h3>
              {status === "success" && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />}
              {status === "error"   && <XCircle       className="h-3.5 w-3.5 text-destructive shrink-0" />}
              {dryRun && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 font-medium">
                  DRY RUN
                </span>
              )}
              {includeVariants && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                  + variantes
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground truncate">{description}</p>
          </div>
        </div>

        {/* Last run info */}
        <div className="hidden sm:flex flex-col items-end text-right shrink-0 ml-4">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
            Última ejecución
          </span>
          <span
            className={cn(
              "text-xs font-medium tabular-nums",
              status === "success" && "text-emerald-600 dark:text-emerald-400",
              status === "error"   && "text-destructive"
            )}
          >
            {status === "running"
              ? "Capturando…"
              : status === "success" && elapsedLabel
              ? `Ahora · ${elapsedLabel}`
              : formatRelativeTime(lastRunAt)}
          </span>
        </div>
      </button>

      {isOpen && (
        <div className="border-t border-border/50 p-4 bg-background space-y-5">
          {/* ── Figma URL (full width) ── */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">
              URL de Figma <span className="text-destructive">*</span>
            </label>
            <input
              type="url"
              placeholder="https://www.figma.com/design/…?node-id=…"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50 font-mono text-xs"
              value={figmaUrl}
              onChange={(e) => setFigmaUrl(e.target.value)}
              disabled={isRunning}
            />
            <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground/70">
              <Info className="h-3 w-3 shrink-0" />
              URL del nodo en Figma (incluye node-id en la query string).
            </p>
            <FigmaMcpConnectionTestButton figmaUrl={figmaUrl} className="mt-2" />
          </div>

          {/* ── Grid: slug + options ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Left: slug */}
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">
                Slug del componente
                <span className="ml-1 font-normal text-muted-foreground/60">(opcional)</span>
              </label>
              <input
                type="text"
                placeholder="ej. button, card, alert"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
                value={componentSlug}
                onChange={(e) => setComponentSlug(e.target.value)}
                disabled={isRunning}
              />
              <p className="mt-1 text-[11px] text-muted-foreground/70">
                Asocia la captura al componente en el registry.
              </p>
            </div>

            {/* Right: format + scale + flags */}
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">
                    Formato
                  </label>
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
                    value={format}
                    onChange={(e) => setFormat(e.target.value as "png" | "svg")}
                    disabled={isRunning}
                  >
                    <option value="png">PNG</option>
                    <option value="svg">SVG</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">
                    Escala
                  </label>
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
                    value={scale}
                    onChange={(e) => setScale(e.target.value as "1" | "2")}
                    disabled={isRunning}
                  >
                    <option value="1">1× (72 dpi)</option>
                    <option value="2">2× (144 dpi)</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={includeVariants}
                    onChange={(e) => setIncludeVariants(e.target.checked)}
                    disabled={isRunning}
                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <span className={cn("text-sm font-medium", isRunning && "opacity-50")}>
                    Incluir variantes
                    <span className="ml-1 text-xs text-muted-foreground font-normal">
                      (captura cada variante del componente set)
                    </span>
                  </span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={dryRun}
                    onChange={(e) => setDryRun(e.target.checked)}
                    disabled={isRunning}
                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <span className={cn("text-sm font-medium", isRunning && "opacity-50")}>
                    Dry Run
                    <span className="ml-1 text-xs text-muted-foreground font-normal">
                      (simula sin guardar archivos)
                    </span>
                  </span>
                </label>
              </div>
            </div>
          </div>

          {/* ── Run button row ── */}
          <div className="flex items-center justify-between pt-1 border-t border-border/50">
            {hasLogs && !isRunning ? (
              <button
                type="button"
                onClick={handleClear}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Limpiar output
              </button>
            ) : (
              <div />
            )}
            <button
              onClick={handleRun}
              disabled={!canRun}
              title={!figmaUrl.trim() ? "Introduce una URL de Figma para continuar" : undefined}
              className="flex items-center gap-2 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground px-5 py-2 text-sm font-medium transition disabled:opacity-50"
            >
              {isRunning ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Capturando…
                </>
              ) : (
                <>
                  <Camera className="h-4 w-4" />
                  Capturar screenshot
                </>
              )}
            </button>
          </div>

          {/* ── Log output ── */}
          {(hasLogs || isRunning) && (
            <LogTerminal
              logLines={logLines}
              summary={summary}
              status={status}
              elapsedMs={elapsedMs}
              onClear={handleClear}
            />
          )}
        </div>
      )}
    </div>
  );
}
