import { useState, useRef, useCallback } from "react";
import { getActiveSystemId } from "@/lib/api";

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

const STORAGE_KEY_PREFIX = "ops:lastRunAt:";

// Strip ANSI escape codes for clean text output
export function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
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

export function formatRelativeTime(isoString?: string): string {
  if (!isoString) return "Nunca";
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return "Nunca";

  const diffMs = date.getTime() - Date.now();
  const absMs = Math.abs(diffMs);
  const past = diffMs < 0;

  const formatter = new Intl.RelativeTimeFormat("es", { numeric: "auto" });

  if (absMs < 60_000) {
    const secs = Math.round(absMs / 1000);
    return past ? `hace ${secs}s` : `en ${secs}s`;
  }
  if (absMs < 3_600_000) {
    const mins = Math.round(absMs / 60_000);
    return formatter.format(past ? -mins : mins, "minute");
  }
  if (absMs < 86_400_000) {
    const hours = Math.round(absMs / 3_600_000);
    return formatter.format(past ? -hours : hours, "hour");
  }
  const days = Math.round(absMs / 86_400_000);
  return formatter.format(past ? -days : days, "day");
}

export function useOperationRunner(
  operationId: string,
  endpoint: string,
  onRunSuccess?: () => void
): [OperationRunnerState, OperationRunnerActions] {
  const storedKey = STORAGE_KEY_PREFIX + operationId;

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

  const run = useCallback(
    async (params?: Record<string, unknown>) => {
      setStatus("running");
      setLogLines([]);
      setSummary("");
      setElapsedMs(undefined);
      startTimeRef.current = Date.now();

      try {
        const systemId = getActiveSystemId();
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(systemId ? { "x-ds-system": systemId } : {})
          },
          body: params ? JSON.stringify(params) : undefined,
        });

        const contentType = response.headers.get("Content-Type") ?? "";
        const isSSE = contentType.includes("text/event-stream");

        let isError = false;
        let finalSummary = "";
        let receivedEndEvent = false;

        if (isSSE) {
          // ── SSE streaming mode ─────────────────────────────────────────
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          const reader = response.body?.getReader();
          const decoder = new TextDecoder();
          if (!reader) throw new Error("No readable stream from response");

          let done = false;
          let buffer = "";

          while (!done) {
            const { value, done: readerDone } = await reader.read();
            done = readerDone;
            if (value) {
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split("\n");
              buffer = lines.pop() ?? "";

              for (const line of lines) {
                if (!line.trim()) continue;
                if (line.startsWith("data: ")) {
                  try {
                    const data = JSON.parse(line.slice(6));
                    if (data.type === "chunk") {
                      const clean = stripAnsi(data.text ?? "");
                      if (clean.trim()) {
                        setLogLines((prev) => [
                          ...prev,
                          { text: clean, kind: detectKind(clean) },
                        ]);
                      }
                    } else if (data.type === "error") {
                      const msg = stripAnsi(data.message ?? "Unknown error");
                      setLogLines((prev) => [...prev, { text: msg, kind: "stderr" }]);
                      isError = true;
                      finalSummary = msg;
                      receivedEndEvent = true;
                    } else if (data.type === "end") {
                      receivedEndEvent = true;
                      isError = data.code !== 0;
                      finalSummary = isError
                        ? `Falló con código ${data.code}`
                        : "Completado correctamente";
                    }
                  } catch {
                    const clean = stripAnsi(line.replace(/^data:\s*/, ""));
                    if (clean.trim()) {
                      setLogLines((prev) => [...prev, { text: clean, kind: "stdout" }]);
                    }
                  }
                }
              }
            }
          }

          if (!receivedEndEvent && !isError) {
            isError = true;
            finalSummary = "Stream ended without completion event";
          }
        } else {
          // ── JSON batch mode (runNpmScript) ─────────────────────────────
          const data = await response.json().catch(() => ({} as Record<string, unknown>));
          isError = !response.ok || data.ok === false;

          // Show stdout/stderr as log lines
          const out = stripAnsi(String(data.output ?? data.stdout ?? "")).trim();
          const err = stripAnsi(String(data.stderr ?? "")).trim();

          if (out) {
            for (const line of out.split("\n")) {
              if (line.trim()) {
                setLogLines((prev) => [...prev, { text: line, kind: detectKind(line) }]);
              }
            }
          }
          if (err) {
            for (const line of err.split("\n")) {
              if (line.trim()) {
                setLogLines((prev) => [...prev, { text: line, kind: "stderr" }]);
              }
            }
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
              (syncReason ? `Fallo de sync: ${syncReason}` : "") ||
              (Number.isFinite(exitCode) ? `Falló con código ${exitCode}` : "Error desconocido");
          } else {
            finalSummary = "Completado correctamente";
          }
        }

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
        const msg = err instanceof Error ? err.message : String(err);
        setStatus("error");
        setSummary(`Error: ${msg}`);
        setLogLines((prev) => [...prev, { text: msg, kind: "stderr" }]);
        setElapsedMs(Date.now() - (startTimeRef.current ?? Date.now()));
      }
    },
    [endpoint, storedKey, onRunSuccess]
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
