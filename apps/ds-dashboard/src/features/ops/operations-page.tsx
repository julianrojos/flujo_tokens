import { useState, useEffect, useCallback, useRef } from "react";
import {
  Activity,
  Database,
  ShieldAlert,
  GitGraph,
  RefreshCw,
  Layers,
  FlaskConical,
  Zap,
  Loader2,
  ChevronRight,
  X,
  RotateCcw,
} from "lucide-react";
import { OperationRow } from "./components/operation-row";
import { PipelineForm } from "./components/pipeline-form";
import { CaptureForm } from "./components/capture-form";
import { FigmaTokenSyncForm } from "./components/figma-token-sync-form";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "./hooks/use-operation-runner";
import { API_ERROR_CODES } from "@/lib/api-errors";
import { ApiErrorMessage } from "@/components/api-error-message";
import { type ApiErrorDisplay, toApiErrorDisplay } from "@/lib/api-error-ux";

// ─── Artifact Status ───────────────────────────────────────────────────────────

interface ArtifactMeta {
  id: string;
  label: string;
  icon: React.ElementType;
  generatedAt?: string;
  summary?: string;
  isStale?: boolean;
}

type ArtifactId = "registry" | "usage" | "health" | "graph";

const STALE_HOURS = 24;

function staleness(isoString?: string): boolean {
  if (!isoString) return false;
  const hoursOld = (Date.now() - new Date(isoString).getTime()) / 3_600_000;
  return hoursOld > STALE_HOURS;
}

const INITIAL_ARTIFACTS: ArtifactMeta[] = [
  { id: "registry", label: "Registry",     icon: Database   },
  { id: "usage",    label: "Usage Index",  icon: Activity   },
  { id: "health",   label: "Token Health", icon: ShieldAlert },
  { id: "graph",    label: "Token Graph",  icon: GitGraph   },
];

import {
  ApiError,
  fetchOperationsHistory,
  fetchOperationsRegressions,
  replayOperationEvent,
  type OperationRegression,
  type OperationHistoryEvent,
  getActiveSystemId,
  requestJson,
} from "@/lib/api";

const getSystemHeaders = (): HeadersInit | undefined => {
  const id = getActiveSystemId();
  return id ? { "x-ds-system": id } : undefined;
};

async function fetchArtifactMeta(id: ArtifactId): Promise<Partial<ArtifactMeta>> {
  try {
    switch (id) {
      case "registry": {
        const r = await fetch("/api/component-registry", { headers: getSystemHeaders() });
        if (!r.ok) return {};
        const d = await r.json();
        const lm = r.headers.get("Last-Modified");
        const generatedAt = lm ? new Date(lm).toISOString() : undefined;
        const count = Array.isArray(d.components) ? d.components.length : "?";
        return { generatedAt, summary: `${count} components · v${d.schema_version ?? 1}` };
      }
      case "usage": {
        const r = await fetch("/api/token-usage-index", { headers: getSystemHeaders() });
        if (!r.ok) return {};
        const d = await r.json();
        const lm = r.headers.get("Last-Modified");
        const generatedAt = d.generated_at ?? (lm ? new Date(lm).toISOString() : undefined);
        const total = d.summary?.usage_links_total ?? d.summary?.tokens_total ?? "?";
        return { generatedAt, summary: `${total} tokens indexados` };
      }
      case "health": {
        const r = await fetch("/api/token-health", { headers: getSystemHeaders() });
        if (!r.ok) return {};
        const d = await r.json();
        const generatedAt = d.generated_at;
        const broken = d.summary?.broken_aliases_total ?? 0;
        const unused = d.summary?.unused_tokens_total ?? 0;
        return { generatedAt, summary: `${broken} broken · ${unused} unused` };
      }
      case "graph": {
        const r = await fetch("/api/token-graph", { headers: getSystemHeaders() });
        if (!r.ok) return {};
        const d = await r.json();
        const lm = r.headers.get("Last-Modified");
        const generatedAt = d.generated_at ?? (lm ? new Date(lm).toISOString() : undefined);
        const nodes = d.summary?.total_nodes ?? d.nodes?.length ?? "?";
        const cycles = d.cycles?.length ?? 0;
        return { generatedAt, summary: `${nodes} nodos · ${cycles} ciclos` };
      }
    }
  } catch {
    return {};
  }
}

// ─── Run-All sequential hook ───────────────────────────────────────────────────

const REFRESH_ALL_SEQUENCE = [
  { label: "Registry",     endpoint: "/api/refresh-registry" },
  { label: "Usage Index",  endpoint: "/api/refresh-token-usage-index" },
  { label: "Token Health", endpoint: "/api/refresh-token-health" },
  { label: "Token Graph",  endpoint: "/api/refresh-token-graph" },
];
const RUN_ALL_POLL_INTERVAL_MS = 900;
const RUN_ALL_TIMEOUT_MS = 20 * 60 * 1000;

async function waitForQueuedJob(statusUrl: string): Promise<boolean> {
  let cursor = 0;
  const deadline = Date.now() + RUN_ALL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const separator = statusUrl.includes("?") ? "&" : "?";
    let payload: Record<string, unknown>;
    try {
      payload = await requestJson<Record<string, unknown>>(
        `${statusUrl}${separator}since=${cursor}`,
      );
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.recoverable &&
        (error.status >= 500 || error.status === 429)
      ) {
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, RUN_ALL_POLL_INTERVAL_MS);
        });
        continue;
      }
      return false;
    }

    const nextCursor = Number(payload.nextCursor);
    if (Number.isFinite(nextCursor) && nextCursor > cursor) cursor = nextCursor;

    const job = payload.job && typeof payload.job === "object"
      ? (payload.job as Record<string, unknown>)
      : null;
    const status = String(job?.status ?? "").trim().toLowerCase();
    if (status === "success") return true;
    if (status === "error" || status === "cancelled") return false;

    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, RUN_ALL_POLL_INTERVAL_MS);
    });
  }

  return false;
}

interface RunAllState {
  isRunning: boolean;
  stepIndex: number; // 0 = idle, 1-based while running
  failed: boolean;
  errorCode?: string;
  errorMessage?: string;
}

function useRunAll(onDone: () => void): [RunAllState, () => void] {
  const [state, setState] = useState<RunAllState>({
    isRunning: false,
    stepIndex: 0,
    failed: false,
  });
  const cancelRef = useRef(false);

  const runAll = useCallback(async () => {
    cancelRef.current = false;
    setState({ isRunning: true, stepIndex: 1, failed: false, errorCode: undefined, errorMessage: undefined });

    for (let i = 0; i < REFRESH_ALL_SEQUENCE.length; i++) {
      if (cancelRef.current) break;
      setState((s) => ({ ...s, stepIndex: i + 1 }));
      try {
        const payload = await requestJson<Record<string, unknown>>(REFRESH_ALL_SEQUENCE[i].endpoint, {
          method: "POST",
          headers: getSystemHeaders(),
        });
        const jobId = String(payload.jobId ?? "").trim();
        if (jobId) {
          const statusUrl = String(payload.statusUrl ?? "").trim() || `/api/jobs/${encodeURIComponent(jobId)}`;
          const completed = await waitForQueuedJob(statusUrl);
          if (!completed) {
            setState({
              isRunning: false,
              stepIndex: i + 1,
              failed: true,
              errorCode: API_ERROR_CODES.QUEUE_JOB_FAILED_OR_CANCELLED,
              errorMessage: "Queued operation finished with error or cancellation.",
            });
            return;
          }
        }
      } catch (error) {
        const errorCode =
          error instanceof ApiError ? error.code : "request.failed";
        const errorMessage =
          error instanceof ApiError
            ? error.message
            : "Operation failed.";
        setState({
          isRunning: false,
          stepIndex: i + 1,
          failed: true,
          errorCode,
          errorMessage,
        });
        return;
      }
    }

    setState({
      isRunning: false,
      stepIndex: 0,
      failed: false,
      errorCode: undefined,
      errorMessage: undefined,
    });
    onDone();
  }, [onDone]);

  return [state, runAll];
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function OperationsPage() {
  const [artifacts, setArtifacts] = useState<ArtifactMeta[]>(INITIAL_ARTIFACTS);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [historyEvents, setHistoryEvents] = useState<OperationHistoryEvent[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<ApiErrorDisplay | null>(null);
  const [regressions, setRegressions] = useState<OperationRegression[]>([]);
  const [regressionsLoading, setRegressionsLoading] = useState(false);
  const [regressionsError, setRegressionsError] = useState<ApiErrorDisplay | null>(null);
  const [selectedHistoryEventId, setSelectedHistoryEventId] = useState<string | null>(null);
  const [replayInFlightEventId, setReplayInFlightEventId] = useState<string | null>(null);
  const [replayNotice, setReplayNotice] = useState<string | null>(null);
  const [replayError, setReplayError] = useState<ApiErrorDisplay | null>(null);
  const historyRequestInFlightRef = useRef(false);
  const regressionsRequestInFlightRef = useRef(false);
  const selectedHistoryEvent = historyEvents.find((event) => event.id === selectedHistoryEventId) || null;

  const refreshOperationHistory = useCallback(async () => {
    if (historyRequestInFlightRef.current) return;
    historyRequestInFlightRef.current = true;
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const payload = await fetchOperationsHistory({ limit: 12 });
      const nextEvents = payload.events || [];
      setHistoryEvents(nextEvents);
      setSelectedHistoryEventId((current) =>
        nextEvents.some((event) => event.id === current) ? current : (nextEvents[0]?.id ?? null)
      );
    } catch (cause) {
      setHistoryError(
        toApiErrorDisplay(cause, {
          fallbackTitle: "Operations history unavailable",
          fallbackMessage: "Unable to load recent operations history.",
        }),
      );
      setHistoryEvents([]);
      setSelectedHistoryEventId(null);
    } finally {
      historyRequestInFlightRef.current = false;
      setHistoryLoading(false);
    }
  }, []);

  const refreshOperationRegressions = useCallback(async () => {
    if (regressionsRequestInFlightRef.current) return;
    regressionsRequestInFlightRef.current = true;
    setRegressionsLoading(true);
    setRegressionsError(null);
    try {
      const payload = await fetchOperationsRegressions({
        limit: 300,
        minSamples: 4,
      });
      setRegressions(payload.regressions || []);
    } catch (cause) {
      setRegressionsError(
        toApiErrorDisplay(cause, {
          fallbackTitle: "Regression signals unavailable",
          fallbackMessage: "Unable to compute operation regressions.",
        }),
      );
      setRegressions([]);
    } finally {
      regressionsRequestInFlightRef.current = false;
      setRegressionsLoading(false);
    }
  }, []);

  const refreshStatuses = useCallback(async () => {
    setIsRefreshing(true);
    const updates = await Promise.all(
      (["registry", "usage", "health", "graph"] as ArtifactId[]).map((id) =>
        fetchArtifactMeta(id).then((meta) => ({ id, ...meta }))
      )
    );
    setArtifacts((prev) =>
      prev.map((a) => {
        const update = updates.find((u) => u.id === a.id);
        if (!update) return a;
        return {
          ...a,
          generatedAt: update.generatedAt,
          summary: update.summary,
          isStale: staleness(update.generatedAt),
        };
      })
    );
    setIsRefreshing(false);
  }, []);

  useEffect(() => {
    refreshStatuses();
    void refreshOperationHistory();
    void refreshOperationRegressions();
  }, [refreshStatuses, refreshOperationHistory, refreshOperationRegressions]);

  useEffect(() => {
    setReplayNotice(null);
    setReplayError(null);
  }, [selectedHistoryEventId]);

  const [runAllState, runAll] = useRunAll(() => {
    void refreshStatuses();
    void refreshOperationHistory();
    void refreshOperationRegressions();
  });

  const replaySelectedOperation = useCallback(async () => {
    if (!selectedHistoryEvent || replayInFlightEventId) return;
    setReplayInFlightEventId(selectedHistoryEvent.id);
    setReplayNotice(null);
    setReplayError(null);
    try {
      const payload = await replayOperationEvent(selectedHistoryEvent.id, {
        systemId: selectedHistoryEvent.system || undefined,
      });
      setReplayNotice(`Replay queued as ${payload.jobId}.`);
      void refreshOperationHistory();
      void refreshOperationRegressions();
    } catch (cause) {
      setReplayError(
        toApiErrorDisplay(cause, {
          fallbackTitle: "Replay failed",
          fallbackMessage: "Unable to enqueue replay for this operation.",
        }),
      );
    } finally {
      setReplayInFlightEventId(null);
    }
  }, [
    replayInFlightEventId,
    refreshOperationHistory,
    refreshOperationRegressions,
    selectedHistoryEvent,
  ]);

  const currentStepLabel =
    runAllState.isRunning && runAllState.stepIndex > 0
      ? REFRESH_ALL_SEQUENCE[runAllState.stepIndex - 1]?.label
      : null;

  return (
    <div className="mx-auto max-w-5xl space-y-10 animate-in fade-in duration-500">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Operations</h1>
          <p className="mt-1.5 text-muted-foreground text-sm">
            Centro de control: regenera artefactos, ejecuta pipelines y sincroniza el sistema de diseño.
          </p>
        </div>

        {/* Run All */}
        <div className="shrink-0 flex flex-col items-end gap-1 pt-1">
          <button
            onClick={runAll}
            disabled={runAllState.isRunning || isRefreshing}
            title="Ejecuta en secuencia: Registry → Usage → Health → Graph"
            className={cn(
              "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap",
              runAllState.failed
                ? "bg-destructive/10 text-destructive border border-destructive/30 hover:bg-destructive/15"
                : "bg-primary hover:bg-primary/90 text-primary-foreground disabled:opacity-50"
            )}
          >
            {runAllState.isRunning ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                <span>{currentStepLabel ?? "…"}</span>
              </>
            ) : (
              <>
                <Zap className="h-4 w-4 shrink-0" />
                <span>Actualizar todo</span>
              </>
            )}
          </button>
          {runAllState.isRunning && (
            <span className="text-[10px] text-muted-foreground tabular-nums">
              paso {runAllState.stepIndex} de {REFRESH_ALL_SEQUENCE.length}
            </span>
          )}
          {runAllState.failed && !runAllState.isRunning && (
            <span className="text-[10px] text-destructive">
              Error en "{REFRESH_ALL_SEQUENCE[runAllState.stepIndex - 1]?.label}"
              {runAllState.errorCode ? ` · ${runAllState.errorCode}` : ""}
              {runAllState.errorMessage ? ` · ${runAllState.errorMessage}` : ""}
            </span>
          )}
        </div>
      </header>

      {/* ── System Status ──────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Estado del sistema
          </h2>
          <button
            onClick={refreshStatuses}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")} />
            Actualizar
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {artifacts.map((artifact) => {
            const Icon = artifact.icon;
            const hasDate = !!artifact.generatedAt;
            return (
              <div
                key={artifact.id}
                className="flex flex-col p-4 rounded-xl border border-border/70 bg-card/50 shadow-sm gap-2"
              >
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{artifact.label}</span>
                </div>

                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        "h-2 w-2 rounded-full shrink-0",
                        !hasDate
                          ? "bg-muted-foreground/40"
                          : artifact.isStale
                          ? "bg-status-warning"
                          : "bg-status-success"
                      )}
                    />
                    <span
                      className={cn(
                        "text-xs font-medium tabular-nums",
                        artifact.isStale ? "text-status-warning" : !hasDate ? "text-muted-foreground/60" : ""
                      )}
                    >
                      {hasDate ? formatRelativeTime(artifact.generatedAt) : "Sin datos"}
                    </span>
                  </div>

                  {artifact.summary && (
                    <p className="text-[11px] text-muted-foreground leading-tight pl-3.5 truncate">
                      {artifact.summary}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Recent Operations ─────────────────────────────────────────── */}
      <section className="space-y-3 pt-2 border-t border-border/40">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Recent Operations
          </h2>
          <div className="flex items-center gap-3">
            <button
              onClick={() => void refreshOperationRegressions()}
              disabled={regressionsLoading}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", regressionsLoading && "animate-spin")} />
              Refresh signals
            </button>
            <button
              onClick={() => void refreshOperationHistory()}
              disabled={historyLoading}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", historyLoading && "animate-spin")} />
              Refresh history
            </button>
          </div>
        </div>

        {historyError ? <ApiErrorMessage error={historyError} /> : null}
        {regressionsError ? <ApiErrorMessage error={regressionsError} /> : null}

        <div className="rounded-xl border border-border/70 bg-card/50 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-2 border-b border-border/60">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Regression Watch
            </h3>
            <span className="text-[11px] text-muted-foreground">
              {regressions.length} signal{regressions.length === 1 ? "" : "s"}
            </span>
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
                    {row.system ? (
                      <span className="text-[11px] text-muted-foreground">[{row.system}]</span>
                    ) : null}
                    <span
                      className={cn(
                        "inline-flex h-5 items-center rounded-full px-2 text-[11px] font-medium",
                        row.severity === "high"
                          ? "bg-status-error-bg/15 text-status-error"
                          : "bg-status-warning-bg/15 text-status-warning",
                      )}
                    >
                      {row.severity}
                    </span>
                  </div>
                  {row.signals.map((signal) => (
                    <p key={`${row.operation}-${signal.kind}`} className="text-[11px] text-muted-foreground">
                      {signal.message}
                    </p>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>

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
            ) : historyEvents.map((event) => {
              const selected = selectedHistoryEvent?.id === event.id;
              return (
                <button
                  key={event.id}
                  type="button"
                  onClick={() => setSelectedHistoryEventId(event.id)}
                  className={cn(
                    "grid w-full grid-cols-[140px_1fr_100px_100px] gap-3 px-4 py-3 text-xs text-left transition-colors",
                    "hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    selected && "bg-muted/50",
                  )}
                >
                  <span className="text-muted-foreground">{formatRelativeTime(event.timestamp)}</span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <ChevronRight
                        className={cn(
                          "h-3.5 w-3.5 text-muted-foreground transition-transform",
                          selected && "rotate-90",
                        )}
                      />
                      <span className="truncate font-medium">{event.operation}</span>
                    </div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      {event.result?.summary || "No summary"}
                      {event.requestId ? ` · ${event.requestId}` : ""}
                    </div>
                  </div>
                  <span
                    className={cn(
                      "inline-flex h-5 items-center rounded-full px-2 text-[11px] font-medium w-fit",
                      event.status === "success"
                        ? "bg-status-success-bg/15 text-status-success"
                        : event.status === "running" || event.status === "queued"
                        ? "bg-accent/15 text-accent"
                        : event.status === "cancelled"
                        ? "bg-status-warning-bg/15 text-status-warning"
                        : "bg-status-error-bg/15 text-status-error",
                    )}
                  >
                    {event.status}
                  </span>
                  <span className="text-muted-foreground tabular-nums">
                    {typeof event.durationMs === "number" ? `${event.durationMs} ms` : "—"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {selectedHistoryEvent ? (
          <div className="rounded-xl border border-border/70 bg-card/50 p-4 shadow-sm space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-semibold">{selectedHistoryEvent.operation}</h3>
                <p className="text-xs text-muted-foreground">
                  {selectedHistoryEvent.timestamp} · {selectedHistoryEvent.eventType}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void replaySelectedOperation()}
                  disabled={
                    replayInFlightEventId === selectedHistoryEvent.id ||
                    selectedHistoryEvent.status === "running" ||
                    selectedHistoryEvent.status === "queued"
                  }
                  className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
                  <RotateCcw className={cn("h-3 w-3", replayInFlightEventId === selectedHistoryEvent.id && "animate-spin")} />
                  Replay
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedHistoryEventId(null)}
                  className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                  Close
                </button>
              </div>
            </div>

            {replayNotice ? (
              <div className="rounded-md border border-status-success-border/40 bg-status-success-bg/10 p-2 text-[11px] text-status-success">
                {replayNotice}
              </div>
            ) : null}
            {replayError ? <ApiErrorMessage error={replayError} /> : null}

            <div className="grid gap-2 text-xs md:grid-cols-2">
              <DetailItem label="Status" value={selectedHistoryEvent.status} />
              <DetailItem label="System" value={selectedHistoryEvent.system || "—"} />
              <DetailItem label="Duration" value={typeof selectedHistoryEvent.durationMs === "number" ? `${selectedHistoryEvent.durationMs} ms` : "—"} />
              <DetailItem label="Job ID" value={selectedHistoryEvent.jobId || "—"} mono />
              <DetailItem label="Request ID" value={selectedHistoryEvent.requestId || "—"} mono />
              <DetailItem label="Replay Of" value={selectedHistoryEvent.sourceEventId || "—"} mono />
              <DetailItem label="Input Hash" value={selectedHistoryEvent.inputHash || "—"} mono />
              <DetailItem label="Output Hash" value={selectedHistoryEvent.outputHash || "—"} mono />
              <DetailItem
                label="Result Code"
                value={
                  selectedHistoryEvent.result?.code === null || selectedHistoryEvent.result?.code === undefined
                    ? "—"
                    : String(selectedHistoryEvent.result.code)
                }
              />
            </div>

            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Result</p>
              <pre className="max-h-56 overflow-auto rounded-md border border-border/70 bg-muted/30 p-3 text-[11px] leading-relaxed">
                {JSON.stringify(selectedHistoryEvent.result || {}, null, 2)}
              </pre>
            </div>
          </div>
        ) : null}
      </section>

      {/* ── Data & Indexing ─────────────────────────────────────────────── */}
      <section className="space-y-3 pt-2 border-t border-border/40">
        <SectionHeader
          icon={<Database className="h-3.5 w-3.5" />}
          title="Data & Indexing"
          badge="Artefactos"
          description="Regenera los índices y artefactos derivados de tokens y componentes."
        />
        <div className="space-y-2">
          <OperationRow
            id="refresh-registry"
            label="Refresh Component Registry"
            description="Reconstruye component-registry.json escaneando specs y docs locales."
            endpoint="/api/refresh-registry"
            onRunSuccess={refreshStatuses}
          />
          <OperationRow
            id="usage-index"
            label="Rebuild Usage Index"
            description="Indexa referencias en specs y CSS para trazar dónde se usa cada token."
            endpoint="/api/refresh-token-usage-index"
            onRunSuccess={refreshStatuses}
          />
          <OperationRow
            id="token-health"
            label="Recompute Token Health"
            description="Analiza salud de tokens: aliases rotos, tokens sin uso, estado de resolución."
            endpoint="/api/refresh-token-health"
            onRunSuccess={refreshStatuses}
          />
          <OperationRow
            id="health-snapshot"
            label="Capture Health Snapshot"
            description="Guarda el estado actual de salud en el historial de tendencias."
            endpoint="/api/capture-health-snapshot"
            onRunSuccess={refreshStatuses}
          />
          <OperationRow
            id="rebuild-token-graph"
            label="Rebuild Token Graph"
            description="Recomputa el grafo de dependencias entre tokens, detectando ciclos."
            endpoint="/api/refresh-token-graph"
            onRunSuccess={refreshStatuses}
          />
        </div>
      </section>

      {/* ── Diagnostics ───────────────────────────────────────────────── */}
      <section className="space-y-3 pt-2 border-t border-border/40">
        <SectionHeader
          icon={<FlaskConical className="h-3.5 w-3.5" />}
          title="Diagnostics"
          badge="Análisis"
          description="Reportes de calidad, deuda de naming y estado de componentes."
        />
        <div className="space-y-2">
          <OperationRow
            id="refresh-naming-debt"
            label="Refresh Naming Debt"
            description="Recomputa violaciones de calidad de nombres en todas las colecciones."
            endpoint="/api/refresh-naming-debt"
          />
          <OperationRow
            id="refresh-components-health"
            label="Refresh Components Health"
            description="Genera el reporte de salud de componentes: pipeline, docs, readiness."
            endpoint="/api/refresh-components-health"
          />
        </div>
      </section>

      {/* ── Workflows ─────────────────────────────────────────────────── */}
      <section className="space-y-3 pt-2 border-t border-border/40">
        <SectionHeader
          icon={<Layers className="h-3.5 w-3.5" />}
          title="Workflows"
          badge="Pipeline"
          description="Orquestación de pipelines complejos con parámetros configurables y streaming en vivo."
        />
        <PipelineForm
          id="ds-pipeline"
          label="Run Component Pipeline"
          description="Orquesta el pipeline completo: Spec → Markdown."
          endpoint="/api/run/ds:pipeline"
          onRunSuccess={refreshStatuses}
        />
        <CaptureForm
          id="capture-figma"
          label="Capture Figma Screenshot"
          description="Captura la visual proof de un nodo Figma por URL y la asocia al componente."
          endpoint="/api/capture-figma-screenshot"
          onRunSuccess={refreshStatuses}
        />
        <FigmaTokenSyncForm
          id="figma-token-sync"
          label="Sync Figma Variables → Tokens"
          description="Importa variables locales de Figma, escribe los JSON en input/ y compila a CSS custom properties."
          endpoint="/api/sync-figma-tokens"
          onRunSuccess={refreshStatuses}
        />
      </section>
    </div>
  );
}

function DetailItem({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="space-y-0.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("truncate text-sm", mono && "font-mono text-[12px]")}>{value}</p>
    </div>
  );
}

// ─── Section header helper ─────────────────────────────────────────────────────

function SectionHeader({
  icon,
  title,
  badge,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  badge: string;
  description: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          {icon}
          <h2 className="text-xs font-semibold uppercase tracking-wider">{title}</h2>
        </div>
        <span className="text-[11px] text-muted-foreground px-2 py-0.5 rounded-full bg-muted">
          {badge}
        </span>
      </div>
      <p className="text-[12px] text-muted-foreground/70">{description}</p>
    </div>
  );
}
