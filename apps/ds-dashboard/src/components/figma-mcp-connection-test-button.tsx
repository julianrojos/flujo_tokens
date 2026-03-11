import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  ApiError,
  pingFigmaMcp,
  reconcileFigmaMcp,
  type FigmaMcpReconcileResult,
  type FigmaMcpPingResult,
} from "@/lib/api";
import { cn } from "@/lib/utils";

interface FigmaMcpConnectionTestButtonProps {
  figmaUrl?: string;
  figmaToken?: string;
  className?: string;
  buttonLabel?: string;
  disabled?: boolean;
  size?: "default" | "sm";
  showDetectedCounts?: boolean;
  suggestResolve?: boolean;
}

const RESET_POLL_INTERVAL_MS = 2_000;
const RESET_POLL_TIMEOUT_MS = 25_000;
// Longer budget for auto-wait: user needs time to switch to Figma and reopen
// the bridge plugin before we give up.
const WAIT_POLL_TIMEOUT_MS = 30_000;
const MAX_POLL_REQUEST_TIMEOUT_MS = 10_000;
const RECOVERY_STEPS = [
  "Reset MCP",
  "Wait for reconnection",
  "Reopen bridge plugin",
] as const;

function remainingSeconds(deadlineMs: number | null, nowMs: number): number {
  if (!deadlineMs) return 0;
  return Math.max(0, Math.ceil((deadlineMs - nowMs) / 1_000));
}

export function FigmaMcpConnectionTestButton({
  figmaUrl,
  figmaToken,
  className,
  buttonLabel = "Test MCP connection",
  disabled = false,
  size = "sm",
  showDetectedCounts = true,
  suggestResolve = false,
}: FigmaMcpConnectionTestButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isResolveModalOpen, setIsResolveModalOpen] = useState(false);
  const [resolveConfirmed, setResolveConfirmed] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isWaiting, setIsWaiting] = useState(false);
  const [resetDeadlineMs, setResetDeadlineMs] = useState<number | null>(null);
  const [waitDeadlineMs, setWaitDeadlineMs] = useState<number | null>(null);
  const [clockMs, setClockMs] = useState(() => Date.now());
  const [result, setResult] = useState<FigmaMcpPingResult | null>(null);
  const pollingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollGenerationRef = useRef(0);
  const normalizedUrl = useMemo(() => String(figmaUrl || "").trim(), [figmaUrl]);
  const normalizedToken = useMemo(
    () => String(figmaToken || "").trim() || undefined,
    [figmaToken],
  );

  useEffect(() => {
    stopPolling();
    setIsLoading(false);
    setResult(null);
    setIsResetting(false);
    setIsWaiting(false);
    setResetDeadlineMs(null);
    setWaitDeadlineMs(null);
  }, [normalizedUrl, normalizedToken]);

  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, []);

  useEffect(() => {
    if (!isResetting && !isWaiting) return;
    setClockMs(Date.now());
    const timer = setInterval(() => {
      setClockMs(Date.now());
    }, 300);
    return () => {
      clearInterval(timer);
    };
  }, [isResetting, isWaiting]);

  const buildPingArgs = () => ({
    figmaUrl: normalizedUrl || undefined,
    figmaToken: normalizedToken,
  });

  /**
   * Poll MCP ping while waiting for bridge plugin reconnection.
   *
   * Polls every RESET_POLL_INTERVAL_MS until:
   *   - connected  → stop waiting + setResult(connected payload)
   *   - hard error → stop waiting + setResult(error payload)
   *   - deadline   → stop waiting + setResult(timeoutResult)
   */
  const startReconnectPoll = ({
    deadlineMs,
    timeoutResult,
  }: {
    deadlineMs: number;
    timeoutResult: FigmaMcpPingResult;
  }) => {
    const generation = pollGenerationRef.current + 1;
    pollGenerationRef.current = generation;
    setIsWaiting(true);
    setWaitDeadlineMs(deadlineMs);

    const poll = async () => {
      if (generation !== pollGenerationRef.current) return;
      if (Date.now() >= deadlineMs) {
        if (generation !== pollGenerationRef.current) return;
        setIsWaiting(false);
        setWaitDeadlineMs(null);
        setResult(timeoutResult);
        return;
      }

      try {
        const remainingMs = Math.max(1_000, deadlineMs - Date.now());
        const requestTimeoutMs = Math.max(
          1_000,
          Math.min(remainingMs, MAX_POLL_REQUEST_TIMEOUT_MS),
        );
        const payload = await pingFigmaMcp(buildPingArgs(), {
          timeoutMs: requestTimeoutMs,
        });
        if (generation !== pollGenerationRef.current) return;
        if (payload.connected) {
          setIsWaiting(false);
          setWaitDeadlineMs(null);
          setResult(payload);
          return;
        }
        // Keep polling for transient not-connected states; bail on hard errors.
        if (
          payload.code !== "mcp.not_connected" &&
          payload.code !== "mcp.instance_mismatch" &&
          payload.code !== "mcp.timeout"
        ) {
          setIsWaiting(false);
          setWaitDeadlineMs(null);
          setResult(payload);
          return;
        }
      } catch {
        // Network error — keep going until deadline.
        if (generation !== pollGenerationRef.current) return;
      }

      if (generation !== pollGenerationRef.current) return;
      pollingTimerRef.current = setTimeout(() => void poll(), RESET_POLL_INTERVAL_MS);
    };

    pollingTimerRef.current = setTimeout(() => void poll(), RESET_POLL_INTERVAL_MS);
  };

  const stopPolling = () => {
    pollGenerationRef.current += 1;
    if (pollingTimerRef.current !== null) {
      clearTimeout(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }
  };

  const handleTest = async () => {
    stopPolling();
    const generation = pollGenerationRef.current;
    setIsResetting(false);
    setIsWaiting(false);
    setResetDeadlineMs(null);
    setWaitDeadlineMs(null);
    setIsLoading(true);
    setResult(null);
    try {
      const payload = await pingFigmaMcp(buildPingArgs());
      if (generation !== pollGenerationRef.current) return;
      setResult(payload);
    } catch (error) {
      if (generation !== pollGenerationRef.current) return;
      if (error instanceof ApiError) {
        setResult({
          ok: false,
          connected: false,
          code: error.code,
          message: error.message || "MCP connectivity test failed.",
        });
      } else {
        setResult({
          ok: false,
          connected: false,
          code: "mcp_ping.client_error",
          message: "Could not reach the server to test MCP connectivity.",
        });
      }
    } finally {
      if (generation === pollGenerationRef.current) {
        setIsLoading(false);
      }
    }
  };

  const handleResolveConnection = async () => {
    stopPolling();
    const generation = pollGenerationRef.current;
    setIsResolveModalOpen(false);
    setResolveConfirmed(false);
    setIsLoading(false);
    setIsWaiting(false);
    setWaitDeadlineMs(null);
    setIsResetting(true);
    setResetDeadlineMs(Date.now() + RESET_POLL_TIMEOUT_MS);
    setResult(null);

    let resetFailure: FigmaMcpPingResult | null = null;
    let reconcileResult: FigmaMcpReconcileResult | null = null;
    try {
      reconcileResult = await reconcileFigmaMcp({
        ...buildPingArgs(),
        confirmReconcile: true,
      });
    } catch (error) {
      if (error instanceof ApiError) {
        resetFailure = {
          ok: false,
          connected: false,
          code: error.code,
          message: error.message || "MCP reset failed.",
        };
      } else {
        resetFailure = {
          ok: false,
          connected: false,
          code: "mcp.reset_failed",
          message: "Could not reset MCP sessions. Try again.",
        };
      }
    }

    if (generation !== pollGenerationRef.current) return;
    setIsResetting(false);
    setResetDeadlineMs(null);
    if (resetFailure) {
      setResult(resetFailure);
      return;
    }
    if (reconcileResult?.connected) {
      setResult(reconcileResult);
      return;
    }
    if (
      reconcileResult?.phase === "input_error" ||
      reconcileResult?.phase === "not_recoverable"
    ) {
      setResult(reconcileResult);
      return;
    }

    startReconnectPoll({
      deadlineMs: Date.now() + WAIT_POLL_TIMEOUT_MS,
      timeoutResult: {
        ok: false,
        connected: false,
        code: "mcp.reset_timeout",
        message:
          "No reconnection detected yet. Reopen the bridge plugin in Figma, then run Resolve connection again.",
      },
    });
  };

  const isMismatch = result?.code === "mcp.instance_mismatch";
  const isNotConnected = result?.code === "mcp.not_connected";
  const isResetTimeout = result?.code === "mcp.reset_timeout";
  const canResolve = (!result?.connected && suggestResolve) || isMismatch || isNotConnected || isResetTimeout;
  const isRecoveryActive = isResetting || isWaiting;
  const showRecoveryStepper = isRecoveryActive || isResetTimeout;
  const activeRecoveryStep = isResetting ? 0 : isWaiting ? 1 : isResetTimeout ? 2 : -1;
  const resetSecondsLeft = remainingSeconds(resetDeadlineMs, clockMs);
  const waitSecondsLeft = remainingSeconds(waitDeadlineMs, clockMs);

  return (
    <div className={cn("min-w-0 space-y-1.5", className)}>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size={size}
          onClick={() => void handleTest()}
          disabled={disabled || isLoading || isResetting}
        >
          {isLoading ? "Testing MCP…" : buttonLabel}
        </Button>

        {canResolve && !isRecoveryActive ? (
          <Button
            type="button"
            variant="outline"
            size={size}
            onClick={() => {
              setResolveConfirmed(false);
              setIsResolveModalOpen(true);
            }}
            disabled={disabled || isLoading}
          >
            Resolve connection
          </Button>
        ) : null}
      </div>

      {showRecoveryStepper ? (
        <div className="space-y-1.5 rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5">
          <div className="space-y-1">
            {RECOVERY_STEPS.map((label, index) => {
              const isDone = activeRecoveryStep > index;
              const isActive = activeRecoveryStep === index;
              return (
                <div
                  key={label}
                  className={cn(
                    "flex items-center gap-2 text-[11px]",
                    isDone
                      ? "text-emerald-700 dark:text-emerald-400"
                      : isActive
                        ? "text-amber-700 dark:text-amber-400"
                        : "text-muted-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "inline-flex h-4 w-4 items-center justify-center rounded-full border text-[10px] font-semibold",
                      isDone
                        ? "border-emerald-600 bg-emerald-600 text-white dark:border-emerald-500 dark:bg-emerald-500"
                        : isActive
                          ? "border-amber-600 bg-amber-600 text-white dark:border-amber-500 dark:bg-amber-500"
                          : "border-muted-foreground/50",
                    )}
                  >
                    {index + 1}
                  </span>
                  <span>{label}</span>
                </div>
              );
            })}
          </div>

          {isResetting ? (
            <p className="break-words text-[11px] text-amber-700 dark:text-amber-400">
              ↺ Closing MCP sessions… retrying in {resetSecondsLeft}s.
            </p>
          ) : isWaiting ? (
            <p className="break-words text-[11px] text-amber-700 dark:text-amber-400">
              ⏳ Retrying connection… {waitSecondsLeft}s left. Reopen the bridge plugin in
              Figma now.
            </p>
          ) : (
            <p className="break-words text-[11px] text-amber-700 dark:text-amber-400">
              ⚠ No reconnection detected. Reopen the bridge plugin in Figma and click
              &nbsp;&ldquo;Resolve connection&rdquo; again.
            </p>
          )}
        </div>
      ) : null}

      {result && !showRecoveryStepper ? (
        result.ok && result.connected ? (
          <p className="break-words text-[11px] text-emerald-600 dark:text-emerald-400">
            ✓ MCP connected
            {showDetectedCounts &&
            typeof result.collectionsDetected === "number" &&
            typeof result.variablesDetected === "number"
              ? ` — ${result.collectionsDetected} collections, ${result.variablesDetected} variables detected`
              : ""}
          </p>
        ) : isMismatch ? (
          <p className="break-words text-[11px] text-amber-600 dark:text-amber-400">
            ⚠ {result.message}
          </p>
        ) : isNotConnected ? (
          <p className="break-words text-[11px] text-amber-600 dark:text-amber-400">
            {result.everConnected
              ? "⚠ Connection lost — reopen the bridge plugin in Figma to reconnect."
              : "⚠ Not connected yet — open the bridge plugin in Figma to get started."}
          </p>
        ) : (
          <p className="break-words text-[11px] text-red-600 dark:text-red-400">
            ✗ MCP not connected
            {result.message ? ` — ${result.message}` : ""}
          </p>
        )
      ) : null}

      {isResolveModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="figma-mcp-reset-confirm-title"
        >
          <div className="w-full max-w-lg rounded-xl border border-border bg-card p-5 shadow-xl">
            <h2 id="figma-mcp-reset-confirm-title" className="mb-2 text-lg font-semibold">
              Resolve MCP connection
            </h2>
            <p className="mb-4 text-sm text-muted-foreground">
              This will restart the <code>figma-console-mcp</code> session managed by this
              dashboard to force a clean reconnect.
            </p>

            <label className="mb-5 flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={resolveConfirmed}
                onChange={(event) => setResolveConfirmed(event.target.checked)}
                className="h-4 w-4"
              />
              <span>I understand the impact and want to continue</span>
            </label>

            <div className="flex items-center justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setIsResolveModalOpen(false);
                  setResolveConfirmed(false);
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={() => void handleResolveConnection()}
                disabled={!resolveConfirmed || disabled}
              >
                Resolve connection
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
