import { useState, useCallback } from "react";
import { PlayCircle, Loader2, CheckCircle2, XCircle, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { LogTerminal } from "@/components/composites/log-terminal";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { useOperationRunner } from "@/hooks/use-operation-runner";

interface OperationRowProps {
  id: string;
  label: string;
  description: string;
  endpoint: string;
  onRunSuccess?: () => void;
  systemId?: string;
}

export function OperationRow({
  id,
  label,
  description,
  endpoint,
  onRunSuccess,
  systemId,
}: OperationRowProps) {
  const [isLogExpanded, setIsLogExpanded] = useState(false);
  const [{ status, isRunning, logLines, summary, lastRunAt, elapsedMs }, { run, clearLogs }] =
    useOperationRunner(id, endpoint, onRunSuccess, { systemId });

  // Use a callback that receives the result status directly to avoid stale closure
  const handleRun = useCallback(async () => {
    setIsLogExpanded(true);
    await run();
    // Note: run() resolves after state is set; we read via useEffect-like pattern
    // by keeping logs expanded — user can collapse manually or clear
  }, [run]);

  const handleClear = useCallback(() => {
    clearLogs();
    setIsLogExpanded(false);
  }, [clearLogs]);

  const hasLogs = logLines.length > 0 || !!summary;

  const elapsedLabel =
    elapsedMs !== undefined
      ? elapsedMs >= 1000
        ? `${(elapsedMs / 1000).toFixed(1)}s`
        : `${elapsedMs}ms`
      : undefined;

  return (
    <div className="flex flex-col rounded border border-border/70 bg-card shadow-sm overflow-hidden">
      {/* Header row */}
      <div className="flex items-center justify-between px-4 py-3 bg-muted/20">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <h3 className="truncate text-base font-titles font-semibold">{label}</h3>
            {status === "success" && (
              <CheckCircle2 className="h-3.5 w-3.5 text-status-success shrink-0" />
            )}
            {status === "error" && (
              <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate mr-4">{description}</p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {/* Last run info: timestamp + elapsed */}
          <div className="hidden sm:flex flex-col items-end text-right">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Última ejecución
            </span>
            <span
              className={cn(
                "text-xs font-medium tabular-nums",
                status === "success" && "text-status-success",
                status === "error" && "text-destructive"
              )}
            >
              {status === "running"
                ? "Ejecutando…"
                : status === "success" && elapsedLabel
                ? `Ahora · ${elapsedLabel}`
                : formatRelativeTime(lastRunAt)}
            </span>
          </div>

          {/* Toggle logs */}
          {hasLogs && (
            <button
              onClick={() => setIsLogExpanded((v) => !v)}
              className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-muted/60 transition-colors text-muted-foreground"
              title={isLogExpanded ? "Ocultar output" : "Ver output"}
            >
              {isLogExpanded ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </button>
          )}

          {/* Run button */}
          <button
            onClick={handleRun}
            disabled={isRunning}
            className="flex items-center gap-1.5 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground px-3 py-1.5 text-sm font-medium transition disabled:opacity-50"
          >
            {isRunning ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span className="hidden sm:inline">Ejecutando…</span>
              </>
            ) : (
              <>
                <PlayCircle className="h-3.5 w-3.5" />
                <span>Ejecutar</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Log terminal (collapsible) */}
      {isLogExpanded && hasLogs && (
        <div className="border-t border-border/50">
          <LogTerminal
            logLines={logLines}
            summary={summary}
            status={status}
            elapsedMs={elapsedMs}
            onClear={handleClear}
          />
        </div>
      )}
    </div>
  );
}
