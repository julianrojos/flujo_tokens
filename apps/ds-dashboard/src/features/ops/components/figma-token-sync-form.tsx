import { useState, useCallback } from "react";
import {
  Download,
  Loader2,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
  Info,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { FigmaMcpConnectionTestButton } from "@/components/figma-mcp-connection-test-button";
import { useOperationRunner, formatRelativeTime } from "../hooks/use-operation-runner";
import { LogTerminal } from "./log-terminal";
import type { FigmaMcpDesignContextCompactResponse } from "@/lib/api";

interface FigmaTokenSyncFormProps {
  id: string;
  label: string;
  description: string;
  endpoint: string;
  onRunSuccess?: () => void;
}

export function FigmaTokenSyncForm({
  id,
  label,
  description,
  endpoint,
  onRunSuccess,
}: FigmaTokenSyncFormProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Form state
  const [figmaUrl, setFigmaUrl] = useState("");
  const [figmaToken, setFigmaToken] = useState("");
  const [autoTriggerToken, setAutoTriggerToken] = useState(0);
  const [force, setForce] = useState(false);
  const [merge, setMerge] = useState(false);
  const [compile, setCompile] = useState(true);
  const [dryRun, setDryRun] = useState(true); // Safe default: dry-run ON
  const [designContext, setDesignContext] = useState<FigmaMcpDesignContextCompactResponse | null>(null);
  const [acknowledgeContextRisk, setAcknowledgeContextRisk] = useState(false);

  const [{ status, isRunning, logLines, summary, lastRunAt, elapsedMs }, { run, clearLogs }] =
    useOperationRunner(id, endpoint, onRunSuccess);

  const handleRun = useCallback(async () => {
    const params: Record<string, unknown> = {
      dryRun,
      force,
      merge,
      compile,
    };
    if (figmaUrl.trim()) params.url = figmaUrl.trim();
    if (figmaToken.trim()) params.figmaToken = figmaToken.trim();
    await run(params);
  }, [run, figmaUrl, figmaToken, dryRun, force, merge, compile]);

  const handleClear = useCallback(() => clearLogs(), [clearLogs]);
  const handleContextChange = useCallback((payload: FigmaMcpDesignContextCompactResponse | null) => {
    setDesignContext(payload);
    setAcknowledgeContextRisk(false);
  }, []);

  const canRun = !isRunning;
  const contextMissingCount =
    designContext?.ok === true ? Number(designContext.tokens?.missingCount || 0) : 0;
  const contextModeFallbackCount =
    designContext?.ok === true ? Number(designContext.tokens?.modeFallbackCount || 0) : 0;
  const hasBlockingContextIssue = contextMissingCount > 0;
  const canRunWithContextGuard = canRun && (!hasBlockingContextIssue || acknowledgeContextRisk);
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
                <Download className="h-4 w-4 text-primary shrink-0" />
                {label}
              </h3>
              {status === "success" && <CheckCircle2 className="h-3.5 w-3.5 text-status-success shrink-0" />}
              {status === "error"   && <XCircle       className="h-3.5 w-3.5 text-destructive shrink-0" />}
              {dryRun && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-status-warning-bg/15 text-status-warning font-medium">
                  DRY RUN
                </span>
              )}
              {force && !merge && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-status-warning-bg/15 text-status-warning font-medium">
                  FORCE
                </span>
              )}
              {merge && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-accent/15 text-accent font-medium">
                  MERGE
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
              status === "success" && "text-status-success",
              status === "error"   && "text-destructive"
            )}
          >
            {status === "running"
              ? "Sincronizando…"
              : status === "success" && elapsedLabel
              ? `Ahora · ${elapsedLabel}`
              : formatRelativeTime(lastRunAt)}
          </span>
        </div>
      </button>

      {isOpen && (
        <div className="border-t border-border/50 p-4 bg-background space-y-5">
          {/* ── Dry-run warning ── */}
          {!dryRun && force && !merge && (
            <div className="flex items-start gap-2 rounded-md border border-status-warning-border/30 bg-status-warning-bg/10 p-3 text-xs text-status-warning">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                <strong>Force sin merge:</strong> los JSON existentes en{" "}
                <code className="font-mono">input/</code> serán reemplazados (se crea un .bak automático).
              </span>
            </div>
          )}

          {/* ── Figma URL ── */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">
              URL de Figma{" "}
              <span className="font-normal text-muted-foreground/60">(opcional — usa figmaFileId del sistema si se omite)</span>
            </label>
            <Input
              type="url"
              placeholder="https://www.figma.com/design/ABC123/…"
              className="font-mono text-xs"
              value={figmaUrl}
              onChange={(e) => setFigmaUrl(e.target.value)}
              disabled={isRunning}
            />
            <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground/70">
              <Info className="h-3 w-3 shrink-0" />
              Extrae el fileKey de la URL automáticamente.
            </p>
            <FigmaMcpConnectionTestButton
              figmaUrl={figmaUrl}
              figmaToken={figmaToken}
              autoTriggerToken={autoTriggerToken}
              className="mt-2"
              showDesignContextCompact
              onDesignContextCompactChange={handleContextChange}
            />
          </div>

          {/* ── Figma Token (optional override) ── */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">
              Figma Token{" "}
              <span className="font-normal text-muted-foreground/60">(opcional — usa FIGMA_TOKEN del entorno si se omite)</span>
            </label>
            <Input
              type="password"
              placeholder="figd_…"
              className="font-mono text-xs"
              value={figmaToken}
              onChange={(e) => setFigmaToken(e.target.value)}
              disabled={isRunning}
              onBlur={() => {
                if (figmaUrl.trim() && figmaToken.trim()) {
                  setAutoTriggerToken((n) => n + 1);
                }
              }}
              autoComplete="off"
            />
          </div>

          {/* ── Toggles ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
            <label className="flex items-start gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={dryRun}
                onChange={(e) => setDryRun(e.target.checked)}
                disabled={isRunning}
                className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-ring"
              />
              <div>
                <span className={cn("text-sm font-medium", isRunning && "opacity-50")}>
                  Dry Run
                </span>
                <p className="text-[11px] text-muted-foreground/70">
                  Muestra qué se escribiría sin guardar nada.
                </p>
              </div>
            </label>

            <label className="flex items-start gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={compile}
                onChange={(e) => setCompile(e.target.checked)}
                disabled={isRunning || dryRun}
                className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-ring"
              />
              <div>
                <span className={cn("text-sm font-medium", (isRunning || dryRun) && "opacity-50")}>
                  Compilar a CSS
                </span>
                <p className="text-[11px] text-muted-foreground/70">
                  Ejecuta ds-tokens-sync al finalizar y regenera las custom properties.
                </p>
              </div>
            </label>

            <label className="flex items-start gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={force}
                onChange={(e) => {
                  setForce(e.target.checked);
                  if (!e.target.checked) setMerge(false);
                }}
                disabled={isRunning}
                className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-ring"
              />
              <div>
                <span className={cn("text-sm font-medium", isRunning && "opacity-50")}>
                  Forzar re-sync
                </span>
                <p className="text-[11px] text-muted-foreground/70">
                  Sobreescribe los JSON aunque ya existan (guarda .bak).
                </p>
              </div>
            </label>

            <label className={cn("flex items-start gap-2 cursor-pointer select-none", !force && "opacity-40 pointer-events-none")}>
              <input
                type="checkbox"
                checked={merge}
                onChange={(e) => setMerge(e.target.checked)}
                disabled={isRunning || !force}
                className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-ring"
              />
              <div>
                <span className={cn("text-sm font-medium", (isRunning || !force) && "opacity-50")}>
                  Merge (preserva tokens manuales)
                </span>
                <p className="text-[11px] text-muted-foreground/70">
                  Deep-merge en vez de reemplazar. Requiere «Forzar».
                </p>
              </div>
            </label>
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
            <div className="flex flex-col items-end gap-1.5">
              {hasBlockingContextIssue ? (
                <>
                  <p className="max-w-[340px] text-right text-[11px] text-status-error">
                    Current selection has {contextMissingCount} token bindings without a resolved variable.
                  </p>
                  <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={acknowledgeContextRisk}
                      onChange={(event) => setAcknowledgeContextRisk(event.target.checked)}
                      disabled={isRunning}
                      className="h-3.5 w-3.5"
                    />
                    Continue anyway
                  </label>
                </>
              ) : contextModeFallbackCount > 0 ? (
                <p className="max-w-[340px] text-right text-[11px] text-status-warning">
                  Current selection includes {contextModeFallbackCount} variables using mode fallback.
                </p>
              ) : null}
              <button
                onClick={handleRun}
                disabled={!canRunWithContextGuard}
                className="flex items-center gap-2 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground px-5 py-2 text-sm font-medium transition disabled:opacity-50"
              >
                {isRunning ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {dryRun ? "Previsualizando…" : "Sincronizando…"}
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" />
                    {dryRun ? "Preview" : "Sincronizar Variables"}
                  </>
                )}
              </button>
            </div>
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
