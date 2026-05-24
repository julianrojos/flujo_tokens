import * as React from "react";
import { useEffect, useRef } from "react";
import { X, Terminal } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type RunStatus = "idle" | "running" | "success" | "error";

export interface LogLine {
  text: string;
  kind: "stdout" | "stderr" | "system";
}

export interface LogTerminalProps {
  logLines: LogLine[];
  summary?: string;
  status: RunStatus;
  elapsedMs?: number;
  onClear?: () => void;
  className?: string;
}

export const LogTerminal = React.forwardRef<HTMLDivElement, LogTerminalProps>(
  function LogTerminal(
    { logLines, summary, status, elapsedMs, onClear, className },
    ref,
  ) {
    const logEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      logEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [logLines.length]);

    if (logLines.length === 0 && !summary) return null;

    const elapsedLabel =
      elapsedMs !== undefined
        ? elapsedMs >= 1000
          ? `${(elapsedMs / 1000).toFixed(1)}s`
          : `${elapsedMs}ms`
        : undefined;

    return (
      <div ref={ref} className={cn("overflow-hidden rounded-b-lg", className)}>
        {/* Terminal body */}
        {logLines.length > 0 && (
          <div
            className="max-h-80 overflow-y-auto bg-surface-1 font-mono text-[11px] leading-relaxed text-foreground"
            aria-live="polite"
            aria-label="Command output"
          >
            {/* Terminal header bar */}
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-surface-2 px-3 py-1.5">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Terminal className="h-3 w-3" />
                <span className="text-[10px] uppercase tracking-wider">Output</span>
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  {logLines.length} lines
                </span>
              </div>
              <div className="flex items-center gap-3">
                {status === "running" && (
                  <span className="flex items-center gap-1 text-[10px] text-status-warning">
                    <span className="animate-pulse h-1.5 w-1.5 rounded-full bg-status-warning inline-block" />
                    Running…
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
                      ? "text-status-error"
                      : line.kind === "system"
                      ? "text-primary italic"
                      : "text-foreground"
                  )}
                >
                  <span className="w-6 shrink-0 select-none text-right tabular-nums text-muted-foreground">
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
              "flex items-center justify-between px-3 py-2 text-xs font-medium border-t",
              status === "success"
                ? "bg-status-success-bg/10 text-status-success border-status-success-border/20"
                : "bg-destructive/10 text-destructive border-destructive/20"
            )}
          >
            <span>{summary}</span>
            <div className="flex items-center gap-3 text-[11px] opacity-80">
              {elapsedLabel && <span className="tabular-nums">{elapsedLabel}</span>}
              {onClear && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={onClear}
                  aria-label="Clear output"
                className="h-auto py-0 px-1 text-[11px] opacity-70 hover:opacity-100"
                >
                  <X className="h-3 w-3" />
                  Clear
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Running state: show summary bar with spinner */}
        {status === "running" && !summary && (
          <div className="flex items-center justify-between px-3 py-2 text-xs text-muted-foreground border-t border-border/30 bg-muted/20">
            <span className="animate-pulse">Processing…</span>
          </div>
        )}
      </div>
    );
  },
);

LogTerminal.displayName = "LogTerminal";
