/**
 * Ops Recent Operations Section - regressions + history table + detail panel.
 */

import { useCallback } from "react";
import { RefreshCw, ChevronRight, X, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { SectionHeader } from "@/components/composites/section-header";
import { Button } from "@/components/ui/button";
import { ApiErrorMessage } from "@/components/api-error-message";
import type { OperationHistoryEvent, OperationRegression } from "@/lib/api";
import type { ApiErrorDisplay } from "@/lib/api-error-ux";
import { formatRelativeTime } from "@/hooks/use-operation-runner";

interface OpsRecentOperationsSectionProps {
  regressions: OperationRegression[];
  regressionsLoading: boolean;
  regressionsError: ApiErrorDisplay | null;
  historyEvents: OperationHistoryEvent[];
  historyLoading: boolean;
  historyError: ApiErrorDisplay | null;
  selectedHistoryEvent: OperationHistoryEvent | null;
  selectedHistoryEventId: string | null;
  replayInFlightEventId: string | null;
  replayNotice: string | null;
  replayError: ApiErrorDisplay | null;
  onRefreshRegressions: () => void;
  onRefreshHistory: () => void;
  onSelectEvent: (id: string | null) => void;
  onReplay: () => void;
}

function DetailItem({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("truncate text-sm", mono && "font-mono text-[12px]")}>{value}</p>
    </div>
  );
}

export function OpsRecentOperationsSection({
  regressions,
  regressionsLoading,
  regressionsError,
  historyEvents,
  historyLoading,
  historyError,
  selectedHistoryEvent,
  selectedHistoryEventId,
  replayInFlightEventId,
  replayNotice,
  replayError,
  onRefreshRegressions,
  onRefreshHistory,
  onSelectEvent,
  onReplay,
}: OpsRecentOperationsSectionProps) {
  const handleSelectEvent = useCallback((id: string) => {
    onSelectEvent(id === selectedHistoryEventId ? null : id);
  }, [onSelectEvent, selectedHistoryEventId]);

  return (
    <section className="space-y-3 pt-2 border-t border-border/40">
      <SectionHeader
        title="Recent Operations"
        badge="History"
        action={
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={onRefreshRegressions} disabled={regressionsLoading} aria-label="Refresh regression signals">
              <RefreshCw className={cn("h-3.5 w-3.5", regressionsLoading && "animate-spin")} />
              Refresh signals
            </Button>
            <Button variant="ghost" size="sm" onClick={onRefreshHistory} disabled={historyLoading} aria-label="Refresh operations history">
              <RefreshCw className={cn("h-3.5 w-3.5", historyLoading && "animate-spin")} />
              Refresh history
            </Button>
          </div>
        }
      />

      {historyError && <ApiErrorMessage error={historyError} />}
      {regressionsError && <ApiErrorMessage error={regressionsError} />}

      {/* Regression Watch */}
      <div className="rounded-xl border border-border/70 bg-card/50 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-2 border-b border-border/60">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Regression Watch</h3>
          <span className="text-[11px] text-muted-foreground">{regressions.length} signal{regressions.length === 1 ? "" : "s"}</span>
        </div>
        <div className="divide-y divide-border/50">
          {regressionsLoading && regressions.length === 0 ? (
            <div className="px-4 py-3 text-sm text-muted-foreground">Computing regressions...</div>
          ) : regressions.length === 0 ? (
            <div className="px-4 py-3 text-sm text-muted-foreground">No regression signals detected.</div>
          ) : (
            regressions.slice(0, 4).map((row) => (
              <div key={`${row.system || "_"}:${row.operation}`} className="px-4 py-3 text-xs space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="font-medium truncate">{row.operation}</span>
                  {row.system && <span className="text-[11px] text-muted-foreground">[{row.system}]</span>}
                  <span className={cn(
                    "inline-flex h-5 items-center rounded-full px-2 text-[11px] font-medium",
                    row.severity === "high" ? "bg-status-error-bg/15 text-status-error" : "bg-status-warning-bg/15 text-status-warning"
                  )}>{row.severity}</span>
                </div>
                {row.signals.map((signal) => (
                  <p key={`${row.operation}-${signal.kind}`} className="text-[11px] text-muted-foreground">{signal.message}</p>
                ))}
              </div>
            ))
          )}
        </div>
      </div>

      {/* History Table */}
      <div className="rounded-xl border border-border/70 bg-card/50 shadow-sm overflow-hidden">
        <div className="grid grid-cols-[140px_1fr_100px_100px] gap-3 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground border-b border-border/60">
          <span>When</span>
          <span>Operation</span>
          <span>Status</span>
          <span>Duration</span>
        </div>
        <div className="divide-y divide-border/50">
          {historyLoading && historyEvents.length === 0 ? (
            <div className="px-4 py-3 text-sm text-muted-foreground">Loading recent operations...</div>
          ) : historyEvents.length === 0 ? (
            <div className="px-4 py-3 text-sm text-muted-foreground">No recent operations logged.</div>
          ) : (
            historyEvents.map((event) => {
              const selected = selectedHistoryEvent?.id === event.id;
              return (
                <button
                  key={event.id}
                  type="button"
                  onClick={() => handleSelectEvent(event.id)}
                  className={cn(
                    "grid w-full grid-cols-[140px_1fr_100px_100px] gap-3 px-4 py-3 text-xs text-left transition-colors",
                    "hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    selected && "bg-muted/50"
                  )}
                >
                  <span className="text-muted-foreground">{formatRelativeTime(event.timestamp)}</span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <ChevronRight className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", selected && "rotate-90")} />
                      <span className="truncate font-medium">{event.operation}</span>
                    </div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      {event.result?.summary || "No summary"}
                      {event.requestId ? ` · ${event.requestId}` : ""}
                    </div>
                  </div>
                  <span className={cn(
                    "inline-flex h-5 items-center rounded-full px-2 text-[11px] font-medium w-fit",
                    event.status === "success" ? "bg-status-success-bg/15 text-status-success" :
                    event.status === "running" || event.status === "queued" ? "bg-accent/15 text-accent" :
                    event.status === "cancelled" ? "bg-status-warning-bg/15 text-status-warning" : "bg-status-error-bg/15 text-status-error"
                  )}>{event.status}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {typeof event.durationMs === "number" ? `${event.durationMs} ms` : "—"}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Detail Panel */}
      {selectedHistoryEvent && (
        <div className="rounded-xl border border-border/70 bg-card/50 p-4 shadow-sm space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold">{selectedHistoryEvent.operation}</h3>
              <p className="text-xs text-muted-foreground">
                {selectedHistoryEvent.timestamp} · {selectedHistoryEvent.eventType}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={onReplay}
                disabled={replayInFlightEventId === selectedHistoryEvent.id || selectedHistoryEvent.status === "running" || selectedHistoryEvent.status === "queued"}
                aria-label="Replay this operation"
              >
                <RotateCcw className={cn("h-3 w-3", replayInFlightEventId === selectedHistoryEvent.id && "animate-spin")} />
                Replay
              </Button>
              <Button variant="outline" size="sm" onClick={() => onSelectEvent(null)} aria-label="Close detail panel">
                <X className="h-3 w-3" />
                Close
              </Button>
            </div>
          </div>

          {replayNotice && (
            <div className="rounded-md border border-status-success-border/40 bg-status-success-bg/10 p-2 text-[11px] text-status-success">
              {replayNotice}
            </div>
          )}
          {replayError && <ApiErrorMessage error={replayError} />}

          <div className="grid gap-2 text-xs md:grid-cols-2">
            <DetailItem label="Status" value={selectedHistoryEvent.status} />
            <DetailItem label="System" value={selectedHistoryEvent.system || "—"} />
            <DetailItem label="Duration" value={typeof selectedHistoryEvent.durationMs === "number" ? `${selectedHistoryEvent.durationMs} ms` : "—"} />
            <DetailItem label="Job ID" value={selectedHistoryEvent.jobId || "—"} mono />
            <DetailItem label="Request ID" value={selectedHistoryEvent.requestId || "—"} mono />
            <DetailItem label="Replay Of" value={selectedHistoryEvent.sourceEventId || "—"} mono />
            <DetailItem label="Input Hash" value={selectedHistoryEvent.inputHash || "—"} mono />
            <DetailItem label="Output Hash" value={selectedHistoryEvent.outputHash || "—"} mono />
            <DetailItem label="Result Code" value={selectedHistoryEvent.result?.code === null || selectedHistoryEvent.result?.code === undefined ? "—" : String(selectedHistoryEvent.result.code)} />
          </div>

          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Result</p>
            <pre className="max-h-56 overflow-auto rounded-md border border-border/70 bg-muted/30 p-3 text-[11px] leading-relaxed">
              {JSON.stringify(selectedHistoryEvent.result || {}, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </section>
  );
}
