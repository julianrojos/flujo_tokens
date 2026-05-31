import { useState, useRef, useCallback, useEffect } from "react";
import { getActiveSystemId } from "@/lib/api";
import {
  buildOperationSystemHeaders,
  resolveOperationSystemId,
} from "@/hooks/use-operation-runner-logic";

export type RunStatus = "idle" | "running" | "success" | "error";

export interface LogLine {
  text: string;
  kind: "stdout" | "stderr" | "system";
}

export interface OperationRunnerState {
  status: RunStatus;
  isRunning: boolean;
  logLines: LogLine[];
  summary: string;
  lastRunAt: string | undefined;
  elapsedMs: number | undefined;
}

export interface OperationRunnerActions {
  run: (params?: Record<string, unknown>) => Promise<void>;
  clearLogs: () => void;
}

export interface OperationRunnerOptions {
  systemId?: string;
}

const STORAGE_KEY_PREFIX = "ops:lastRunAt:";
const JOB_POLL_INTERVAL_MS = 900;
const JOB_WAIT_TIMEOUT_MS = 20 * 60 * 1000;

function createAbortError(): Error {
  const error = new Error("Aborted");
  error.name = "AbortError";
  return error;
}

function buildStorageKey(systemId: string | undefined, operationId: string): string {
  const storageScope = String(systemId || "global").trim() || "global";
  return `${STORAGE_KEY_PREFIX}${storageScope}:${operationId}`;
}

// Strip ANSI escape codes for clean text output
export function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "").replace(/\x1b\[[0-9;]*[A-Za-z]/g, "");
}

// Detect if a stripped line looks like stderr (error keywords)
function detectKind(text: string): LogLine["kind"] {
  const lower = text.toLowerCase();
  if (
    lower.includes("error") ||
    lower.includes("fail") ||
    lower.includes("exception") ||
    lower.includes("fatal") ||
    lower.startsWith("[error]")
  )
    return "stderr";
  return "stdout";
}

export function useOperationRunner(
  operationId: string,
  endpoint: string,
  onRunSuccess?: () => void,
  options?: OperationRunnerOptions,
): [OperationRunnerState, OperationRunnerActions] {
  const storedKey = buildStorageKey(options?.systemId, operationId);

  const [status, setStatus] = useState<RunStatus>("idle");
  const [logLines, setLogLines] = useState<LogLine[]>([]);
  const [summary, setSummary] = useState<string>("");
  const [lastRunAt, setLastRunAt] = useState<string | undefined>(() => {
    try {
      return localStorage.getItem(storedKey) ?? undefined;
    } catch {
      return undefined;
    }
  });
  const [elapsedMs, setElapsedMs] = useState<number | undefined>(undefined);

  const startTimeRef = useRef<number | undefined>(undefined);
  const abortControllerRef = useRef<AbortController | null>(null);
  const pollingTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const runIdRef = useRef(0);

  const clearPollingTimer = useCallback(() => {
    if (pollingTimerRef.current === null) return;
    window.clearTimeout(pollingTimerRef.current);
    pollingTimerRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      runIdRef.current += 1;
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      clearPollingTimer();
    };
  }, [clearPollingTimer]);

  const run = useCallback(
    async (params?: Record<string, unknown>) => {
      abortControllerRef.current?.abort();
      clearPollingTimer();

      const controller = new AbortController();
      abortControllerRef.current = controller;
      const runId = runIdRef.current + 1;
      runIdRef.current = runId;

      const isStaleRun = () =>
        runIdRef.current !== runId || controller.signal.aborted;
      const throwIfStale = () => {
        if (isStaleRun()) {
          throw createAbortError();
        }
      };

      setStatus("running");
      setLogLines([]);
      setSummary("");
      setElapsedMs(undefined);
      startTimeRef.current = Date.now();

      try {
        const systemId = resolveOperationSystemId({
          overrideSystemId: options?.systemId,
          activeSystemId: getActiveSystemId(),
        });
        const systemHeaders: HeadersInit = buildOperationSystemHeaders(systemId);

        const pushLogLines = (rawText: unknown, forcedKind?: LogLine["kind"]) => {
          const clean = stripAnsi(String(rawText ?? ""));
          if (!clean.trim()) return;
          const newLines: LogLine[] = [];
          for (const line of clean.split("\n")) {
            if (!line.trim()) continue;
            newLines.push({ text: line, kind: forcedKind || detectKind(line) });
          }
          if (newLines.length > 0) {
            setLogLines((prev) => [...prev, ...newLines]);
          }
        };

        const resolveLogKind = (rawKind: unknown): LogLine["kind"] | undefined => {
          const kind = String(rawKind ?? "").trim().toLowerCase();
          if (kind === "stdout" || kind === "stderr" || kind === "system") return kind;
          return undefined;
        };

        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...systemHeaders,
          },
          signal: controller.signal,
          body: params ? JSON.stringify(params) : undefined,
        });
        throwIfStale();

        const contentType = response.headers.get("Content-Type") ?? "";
        const isSSE = contentType.includes("text/event-stream");

        let isError = false;
        let finalSummary = "";
        let receivedEndEvent = false;

        const applyStreamEvent = (data: Record<string, unknown>) => {
          const type = String(data.type ?? "").trim().toLowerCase();
          if (!type) return;

          if (type === "status") {
            const nextStatus = String(data.status ?? "").trim().toLowerCase();
            if (nextStatus === "queued") {
              pushLogLines("Queued...", "system");
            } else if (nextStatus === "running") {
              pushLogLines("Starting execution...", "system");
            } else if (nextStatus === "cancelled") {
              pushLogLines("Operation canceled.", "system");
            }
            return;
          }

          if (type === "chunk") {
            pushLogLines(data.text ?? "", resolveLogKind(data.kind));
            return;
          }

          if (type === "error") {
            const message = String(data.message ?? "Unknown error").trim();
            pushLogLines(message, "stderr");
            isError = true;
            finalSummary = message || "Unknown error";
            return;
          }

          if (type === "end") {
            const code = Number(data.code);
            const endStatus = String(data.status ?? "").trim().toLowerCase();
            const hasNumericCode = Number.isFinite(code);
            const failedByStatus = endStatus === "error" || endStatus === "cancelled";
            const failedByCode = hasNumericCode ? code !== 0 : false;
            const failed = failedByStatus || failedByCode;
            const endSummary = String(data.summary ?? data.message ?? "").trim();

            isError = failed;
            finalSummary =
              endSummary ||
              (failed
                ? hasNumericCode
                  ? `Failed with code ${code}`
                  : "Unknown error"
                : "Completed successfully");
            receivedEndEvent = true;
          }
        };

        const processSseBlock = (block: string) => {
          const lines = block.split(/\r?\n/);
          const dataLines: string[] = [];
          for (const line of lines) {
            if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
          }
          if (dataLines.length === 0) return;

          const payload = dataLines.join("\n");
          try {
            const parsed = JSON.parse(payload);
            if (parsed && typeof parsed === "object") {
              applyStreamEvent(parsed as Record<string, unknown>);
              return;
            }
          } catch {
            // ignore and fall back to raw text
          }

          pushLogLines(payload, "stdout");
        };

        const consumeSse = async (streamResponse: Response) => {
          if (!streamResponse.ok) {
            throw new Error(`HTTP ${streamResponse.status}: ${streamResponse.statusText}`);
          }

          const reader = streamResponse.body?.getReader();
          const decoder = new TextDecoder();
          if (!reader) throw new Error("No readable stream from response.");

          try {
            let buffer = "";
            while (true) {
              throwIfStale();
              const { value, done } = await reader.read();
              if (done) break;
              if (value) {
                buffer += decoder.decode(value, { stream: true });
                let splitAt = buffer.indexOf("\n\n");
                while (splitAt >= 0) {
                  const eventBlock = buffer.slice(0, splitAt);
                  buffer = buffer.slice(splitAt + 2);
                  processSseBlock(eventBlock);
                  splitAt = buffer.indexOf("\n\n");
                }
              }
            }

            const remaining = buffer.trim();
            if (remaining) processSseBlock(remaining);
          } finally {
            try {
              await reader.cancel();
            } catch {
              // ignore cleanup errors
            }
          }
        };

        const pollQueuedJob = async (statusUrl: string) => {
          let cursor = 0;
          const deadline = Date.now() + JOB_WAIT_TIMEOUT_MS;

          while (Date.now() < deadline) {
            const separator = statusUrl.includes("?") ? "&" : "?";
            const url = `${statusUrl}${separator}since=${cursor}`;
            const pollResponse = await fetch(url, {
              headers: {
                Accept: "application/json",
                ...systemHeaders,
              },
              signal: controller.signal,
            });
            throwIfStale();
            if (!pollResponse.ok) {
              throw new Error(`Polling failed: HTTP ${pollResponse.status}`);
            }

            const payload = (await pollResponse.json().catch(() => ({}))) as Record<string, unknown>;
            const events = Array.isArray(payload.events) ? payload.events : [];
            for (const event of events) {
              if (!event || typeof event !== "object") continue;
              const row = event as Record<string, unknown>;
              applyStreamEvent(row);
              const seq = Number(row.seq);
              if (Number.isFinite(seq) && seq > cursor) cursor = seq;
            }

            const nextCursor = Number(payload.nextCursor);
            if (Number.isFinite(nextCursor) && nextCursor > cursor) cursor = nextCursor;

            const job = payload.job && typeof payload.job === "object"
              ? (payload.job as Record<string, unknown>)
              : null;
            const jobStatus = String(job?.status ?? "").trim().toLowerCase();
            if (jobStatus === "success" || jobStatus === "error" || jobStatus === "cancelled") {
              if (!receivedEndEvent) {
                const result =
                  job?.result && typeof job.result === "object"
                    ? (job.result as Record<string, unknown>)
                    : null;
                const derivedSummary = String(result?.summary ?? "").trim();
                isError = jobStatus !== "success";
                finalSummary = derivedSummary || (isError ? "Unknown error" : "Completed successfully");
                receivedEndEvent = true;
              }
              return;
            }

            await new Promise<void>((resolve, reject) => {
              const timeoutId = window.setTimeout(() => {
                pollingTimerRef.current = null;
                controller.signal.removeEventListener("abort", onAbort);
                resolve();
              }, JOB_POLL_INTERVAL_MS);
              pollingTimerRef.current = timeoutId;

              const onAbort = () => {
                window.clearTimeout(timeoutId);
                pollingTimerRef.current = null;
                reject(createAbortError());
              };

              if (controller.signal.aborted) {
                onAbort();
                return;
              }

              controller.signal.addEventListener("abort", onAbort, { once: true });
            });
          }

          throw new Error("Timeout waiting for queued operation.");
        };

        if (isSSE) {
          await consumeSse(response);
          throwIfStale();
          if (!receivedEndEvent && !isError) {
            isError = true;
            finalSummary = "Stream ended without completion event";
          }
        } else {
          const data = await response.json().catch(() => ({} as Record<string, unknown>));
          const jobId = String(data.jobId ?? "").trim();

          if (response.ok && jobId) {
            const streamUrl = String(data.streamUrl ?? "").trim();
            const statusUrl = String(data.statusUrl ?? "").trim() || `/api/jobs/${encodeURIComponent(jobId)}`;

            if (streamUrl) {
              try {
                const streamResponse = await fetch(streamUrl, {
                  headers: {
                    Accept: "text/event-stream",
                    ...systemHeaders,
                  },
                  signal: controller.signal,
                });
                await consumeSse(streamResponse);
              } catch {
                throwIfStale();
                pushLogLines("SSE disconnected; continuing with polling.", "system");
              }
            }

            if (!receivedEndEvent) {
              await pollQueuedJob(statusUrl);
            }

            if (!receivedEndEvent && !isError) {
              isError = true;
              finalSummary = "The operation did not report a final status.";
            }
          } else {
            isError = !response.ok || data.ok === false;

            const out = stripAnsi(String(data.output ?? data.stdout ?? "")).trim();
            const err = stripAnsi(String(data.stderr ?? "")).trim();

            const batchLines: LogLine[] = [];
            if (out) {
              for (const line of out.split("\n")) {
                if (line.trim()) {
                  batchLines.push({ text: line, kind: detectKind(line) });
                }
              }
            }
            if (err) {
              for (const line of err.split("\n")) {
                if (line.trim()) {
                  batchLines.push({ text: line, kind: "stderr" });
                }
              }
            }
            if (batchLines.length > 0) {
              setLogLines((prev) => [...prev, ...batchLines]);
            }

            const exitCode = Number(data.code ?? data.exit_code);
            const syncError = typeof data.sync === "object" && data.sync !== null
              ? String((data.sync as Record<string, unknown>).error ?? "").trim()
              : "";
            const syncReason = typeof data.sync === "object" && data.sync !== null
              ? String((data.sync as Record<string, unknown>).reason ?? "").trim()
              : "";
            const topLevelError = String(data.error ?? "").trim();
            const topLevelMessage = String(data.message ?? "").trim();

            if (isError && !err) {
              const derived = topLevelMessage || topLevelError || syncError || syncReason;
              if (derived) {
                setLogLines((prev) => [...prev, { text: derived, kind: "stderr" }]);
              }
            }

            if (isError) {
              finalSummary =
                topLevelMessage ||
                topLevelError ||
                syncError ||
                (syncReason ? `Sync failed: ${syncReason}` : "") ||
                (Number.isFinite(exitCode) ? `Failed with code ${exitCode}` : "Unknown error");
            } else {
              finalSummary = "Completed successfully";
            }
          }
        }

        throwIfStale();
        const elapsed = Date.now() - (startTimeRef.current ?? Date.now());
        setElapsedMs(elapsed);
        setStatus(isError ? "error" : "success");
        setSummary(finalSummary);

        if (!isError) {
          const now = new Date().toISOString();
          setLastRunAt(now);
          try {
            localStorage.setItem(storedKey, now);
          } catch {
            // storage not available
          }
          onRunSuccess?.();
        }
      } catch (err: unknown) {
        if (isStaleRun() || (err instanceof Error && err.name === "AbortError")) {
          return;
        }
        const msg = err instanceof Error ? err.message : String(err);
        setStatus("error");
        setSummary(`Error: ${msg}`);
        setLogLines((prev) => [...prev, { text: msg, kind: "stderr" }]);
        setElapsedMs(Date.now() - (startTimeRef.current ?? Date.now()));
      } finally {
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }
        if (runIdRef.current === runId) {
          clearPollingTimer();
        }
      }
    },
    [clearPollingTimer, endpoint, options?.systemId, storedKey, onRunSuccess],
  );

  const clearLogs = useCallback(() => {
    setLogLines([]);
    setSummary("");
    setStatus("idle");
  }, []);

  return [
    {
      status,
      isRunning: status === "running",
      logLines,
      summary,
      lastRunAt,
      elapsedMs,
    },
    { run, clearLogs },
  ];
}
