import { useEffect, useRef } from "react";
import { X, Terminal } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LogLine, RunStatus } from "../hooks/use-operation-runner";

interface LogTerminalProps {
  logLines: LogLine[];
  summary?: string;
  status: RunStatus;
  elapsedMs?: number;
  onClear?: () => void;
  className?: string;
}

export function LogTerminal({
  logLines,
  summary,
  status,
  elapsedMs,
  onClear,
  className,
}: LogTerminalProps) {
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logLines]);

  if (logLines.length === 0 && !summary) return null;

  const elapsedLabel =
    elapsedMs !== undefined
      ? elapsedMs >= 1000
        ? `${(elapsedMs / 1000).toFixed(1)}s`
        : `${elapsedMs}ms`
      : undefined;

  return (
    <div className={cn("overflow-hidden rounded-b-lg", className)}>
      {/* Terminal body */}
      {logLines.length > 0 && (
        <div className="bg-zinc-950 text-zinc-300 font-mono text-[11px] leading-relaxed max-h-80 overflow-y-auto">
          {/* Terminal header bar */}
          <div className="sticky top-0 flex items-center justify-between px-3 py-1.5 border-b border-zinc-800 bg-zinc-900 z-10">
            <div className="flex items-center gap-2 text-zinc-500">
              <Terminal className="h-3 w-3" />
              <span className="text-[10px] uppercase tracking-wider">Output</span>
              {logLines.length > 0 && (
                <span className="text-[10px] text-zinc-600 tabular-nums">
                  {logLines.length} líneas
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {status === "running" && (
                <span className="flex items-center gap-1 text-[10px] text-amber-400">
                  <span className="animate-pulse h-1.5 w-1.5 rounded-full bg-amber-400 inline-block" />
                  Ejecutando…
                </span>
              )}
            </div>
          </div>

          <div className="p-3 space-y-0.5">
            {logLines.map((line, i) => (
              <div
                key={i}
                className={cn(
                  "flex gap-3 break-all whitespace-pre-wrap",
                  line.kind === "stderr"
                    ? "text-red-400"
                    : line.kind === "system"
                    ? "text-blue-400 italic"
                    : "text-zinc-300"
                )}
              >
                <span className="select-none text-zinc-700 shrink-0 tabular-nums w-6 text-right">
                  {i + 1}
                </span>
                <span className="flex-1">{line.text}</span>
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        </div>
      )}

      {/* Summary bar — shown below terminal when done */}
      {summary && status !== "running" && (
        <div
          className={cn(
            "flex items-center justify-between px-3 py-2 text-xs font-medium",
            status === "success"
              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-t border-emerald-500/20"
              : "bg-destructive/10 text-destructive border-t border-destructive/20"
          )}
        >
          <span>{summary}</span>
          <div className="flex items-center gap-3 text-[11px] opacity-80">
            {elapsedLabel && <span className="tabular-nums">{elapsedLabel}</span>}
            {onClear && (
              <button
                onClick={onClear}
                className="flex items-center gap-1 hover:opacity-100 opacity-70 transition-opacity"
                title="Limpiar output"
              >
                <X className="h-3 w-3" />
                Limpiar
              </button>
            )}
          </div>
        </div>
      )}

      {/* Running state: show summary bar with spinner */}
      {status === "running" && !summary && (
        <div className="flex items-center justify-between px-3 py-2 text-xs text-muted-foreground border-t border-border/30 bg-muted/20">
          <span className="animate-pulse">Procesando…</span>
        </div>
      )}
    </div>
  );
}
