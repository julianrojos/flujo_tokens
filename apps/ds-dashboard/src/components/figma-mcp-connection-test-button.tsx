import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  ApiError,
  getFigmaMcpDesignContextCompact,
  getFigmaMcpHeartbeat,
  pingFigmaMcp,
  type FigmaMcpDesignContextCompactResponse,
  type FigmaMcpHeartbeatResult,
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
  showDesignContextCompact?: boolean;
  onDesignContextCompactChange?: (result: FigmaMcpDesignContextCompactResponse | null) => void;
}

const RESET_POLL_INTERVAL_MS = 2_000;
const RESET_POLL_TIMEOUT_MS = 25_000;
// Longer budget for auto-wait: user needs time to switch to Figma and reopen
// the plugin before we give up.
const WAIT_POLL_TIMEOUT_MS = 30_000;
const MAX_POLL_REQUEST_TIMEOUT_MS = 10_000;
const RECOVERY_STEPS = [
  "Refresh MCP Management status",
  "Wait for reconnection",
  "Reopen MCP Management plugin in Figma",
] as const;
const EXPECTED_MCP_PLUGIN_VERSION = "1.0.0";

function remainingSeconds(deadlineMs: number | null, nowMs: number): number {
  if (!deadlineMs) return 0;
  return Math.max(0, Math.ceil((deadlineMs - nowMs) / 1_000));
}

export function FigmaMcpConnectionTestButton({
  figmaUrl,
  figmaToken,
  className,
  buttonLabel = "Test connection",
  disabled = false,
  size = "sm",
  showDetectedCounts = true,
  suggestResolve = false,
  showDesignContextCompact = false,
  onDesignContextCompactChange,
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
  const [heartbeat, setHeartbeat] = useState<FigmaMcpHeartbeatResult | null>(null);
  const [isLoadingContext, setIsLoadingContext] = useState(false);
  const [contextResult, setContextResult] = useState<FigmaMcpDesignContextCompactResponse | null>(null);
  const pollingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contextGenerationRef = useRef(0);
  const pollGenerationRef = useRef(0);
  const normalizedUrl = useMemo(() => String(figmaUrl || "").trim(), [figmaUrl]);
  const normalizedToken = useMemo(
    () => String(figmaToken || "").trim() || undefined,
    [figmaToken],
  );
  const setDesignContextResult = useCallback(
    (payload: FigmaMcpDesignContextCompactResponse | null) => {
      setContextResult(payload);
      onDesignContextCompactChange?.(payload);
    },
    [onDesignContextCompactChange],
  );

  useEffect(() => {
    stopPolling();
    contextGenerationRef.current += 1;
    setIsLoading(false);
    setResult(null);
    setIsResetting(false);
    setIsWaiting(false);
    setResetDeadlineMs(null);
    setWaitDeadlineMs(null);
    setHeartbeat(null);
    setIsLoadingContext(false);
    setDesignContextResult(null);
  }, [normalizedUrl, normalizedToken, setDesignContextResult]);

  useEffect(() => {
    let disposed = false;

    const fetchHeartbeat = async () => {
      try {
        const payload = await getFigmaMcpHeartbeat();
        if (!disposed) setHeartbeat(payload);
      } catch {
        if (!disposed) {
          setHeartbeat({
            ok: false,
            alive: false,
            ageMs: null,
            lastSeenAt: null,
            sourceFileKey: null,
            sourceDocName: null,
          });
        }
      }
    };

    void fetchHeartbeat();
    const timer = setInterval(() => {
      void fetchHeartbeat();
    }, 8_000);

    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    return () => {
      stopPolling();
      contextGenerationRef.current += 1;
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

  const fetchDesignContextCompact = async () => {
    if (!showDesignContextCompact) return;
    const generation = contextGenerationRef.current + 1;
    contextGenerationRef.current = generation;
    setIsLoadingContext(true);
    try {
      const payload = await getFigmaMcpDesignContextCompact(
        {
          fileUrl: normalizedUrl || undefined,
        },
      );
      if (generation !== contextGenerationRef.current) return;
      setDesignContextResult(payload);
    } catch (error) {
      if (generation !== contextGenerationRef.current) return;
      if (error instanceof ApiError) {
        setDesignContextResult({
          ok: false,
          code: error.code,
          message: error.message || "Could not load compact design context.",
        });
      } else {
        setDesignContextResult({
          ok: false,
          code: "context_compact.client_error",
          message: "Could not load compact design context.",
        });
      }
    } finally {
      if (generation === contextGenerationRef.current) {
        setIsLoadingContext(false);
      }
    }
  };

  /**
   * Poll connection while waiting for plugin reconnection.
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
      if (payload.connected && showDesignContextCompact) {
        void fetchDesignContextCompact();
      } else if (!payload.connected && showDesignContextCompact) {
        contextGenerationRef.current += 1;
        setIsLoadingContext(false);
        setDesignContextResult(null);
      }
    } catch (error) {
      if (generation !== pollGenerationRef.current) return;
      if (error instanceof ApiError) {
        setResult({
          ok: false,
          connected: false,
          code: error.code,
          message: error.message || "MCP Management connectivity test failed.",
        });
      } else {
        setResult({
          ok: false,
          connected: false,
          code: "mcp_ping.client_error",
          message: "Could not reach the server to test MCP Management connectivity.",
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
    contextGenerationRef.current += 1;
    const generation = pollGenerationRef.current;
    setIsResolveModalOpen(false);
    setResolveConfirmed(false);
    setIsLoading(false);
    setIsWaiting(false);
    setWaitDeadlineMs(null);
    setIsResetting(true);
    setResetDeadlineMs(Date.now() + RESET_POLL_TIMEOUT_MS);
    setResult(null);
    setIsLoadingContext(false);
    setDesignContextResult(null);

    // Direct mode: skip reconcile (legacy endpoint returns 410) and go straight to polling
    if (generation !== pollGenerationRef.current) return;
    setIsResetting(false);
    setResetDeadlineMs(null);

    startReconnectPoll({
      deadlineMs: Date.now() + WAIT_POLL_TIMEOUT_MS,
      timeoutResult: {
        ok: false,
        connected: false,
        code: "mcp.not_connected",
        message: "No reconnection detected yet. Open the Figma plugin and retry.",
      },
    });
  };

  const isNotConnected = result?.code === "mcp.not_connected";
  const heartbeatAlive = heartbeat?.alive === true;
  const detectedPluginVersion = String(heartbeat?.pluginVersion || "").trim() || null;
  const isPluginVersionMismatch =
    heartbeatAlive &&
    detectedPluginVersion !== null &&
    detectedPluginVersion !== EXPECTED_MCP_PLUGIN_VERSION;

  const connectionHealth = (() => {
    if (isPluginVersionMismatch) {
      return {
        tone: "amber" as const,
        text: `Version mismatch: plugin ${detectedPluginVersion} vs expected ${EXPECTED_MCP_PLUGIN_VERSION}. Reimport the Figma plugin.`,
      };
    }
    if (result?.connected && !heartbeatAlive) {
      return {
        tone: "amber" as const,
        text: "Transport is connected, but plugin heartbeat is missing. Reload the Figma plugin.",
      };
    }
    if (result?.connected && heartbeatAlive) {
      return { tone: "green" as const, text: "Healthy: plugin heartbeat + transport are active." };
    }
    if (heartbeatAlive && !result?.connected) {
      return { tone: "amber" as const, text: "Plugin is alive, but transport is not connected yet." };
    }
    if (!heartbeatAlive) {
      return { tone: "amber" as const, text: "No live plugin heartbeat detected from Figma." };
    }
    return { tone: "muted" as const, text: "Run Test connection to refresh status." };
  })();
  const canResolve =
    result?.connected !== true &&
    (suggestResolve || !result || isNotConnected);
  const isRecoveryActive = isResetting || isWaiting;
  const showRecoveryStepper = isRecoveryActive;
  const activeRecoveryStep = isResetting ? 0 : isWaiting ? 1 : -1;
  const resetSecondsLeft = remainingSeconds(resetDeadlineMs, clockMs);
  const waitSecondsLeft = remainingSeconds(waitDeadlineMs, clockMs);
  const contextTokens = contextResult?.tokens?.items ?? [];
  const aliasCount = useMemo(
    () => contextTokens.filter((item) => item.isAlias).length,
    [contextTokens],
  );

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

        {showDesignContextCompact ? (
          <Button
            type="button"
            variant="outline"
            size={size}
            onClick={() => void fetchDesignContextCompact()}
            disabled={
              disabled ||
              isLoading ||
              isResetting ||
              isWaiting ||
              isLoadingContext ||
              result?.connected !== true
            }
          >
            {isLoadingContext ? "Inspecting selection…" : "Inspect selection"}
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
              ↺ Refreshing MCP Management status… retrying in {resetSecondsLeft}s.
            </p>
          ) : isWaiting ? (
            <p className="break-words text-[11px] text-amber-700 dark:text-amber-400">
              ⏳ Retrying connection… {waitSecondsLeft}s left. Open the MCP Management plugin now.
            </p>
          ) : (
            <p className="break-words text-[11px] text-amber-700 dark:text-amber-400">
              ⚠ No reconnection detected. Open the MCP Management plugin and click
              &nbsp;&ldquo;Resolve connection&rdquo; again.
            </p>
          )}
        </div>
      ) : null}

      <p
        className={cn(
          "break-words text-[11px]",
          connectionHealth.tone === "green"
            ? "text-emerald-600 dark:text-emerald-400"
            : connectionHealth.tone === "amber"
              ? "text-amber-600 dark:text-amber-400"
              : "text-muted-foreground",
        )}
      >
        {connectionHealth.text}
      </p>

      {result && !showRecoveryStepper ? (
        result.ok && result.connected ? (
          <p className="break-words text-[11px] text-emerald-600 dark:text-emerald-400">
            ✓ Connection successful
            {showDetectedCounts &&
            typeof result.collectionsDetected === "number" &&
            typeof result.variablesDetected === "number"
              ? ` — ${result.collectionsDetected} collections, ${result.variablesDetected} variables detected`
              : ""}
          </p>
        ) : isPluginVersionMismatch ? (
          <p className="break-words text-[11px] text-amber-600 dark:text-amber-400">
            ⚠ Plugin build mismatch. Reimport the MCP Management plugin so dashboard and plugin use the same protocol.
          </p>
        ) : isNotConnected ? (
          <p className="break-words text-[11px] text-amber-600 dark:text-amber-400">
            {result.everConnected
              ? "⚠ Connection lost — reopen the MCP Management plugin to reconnect."
              : (
                <>
                  ⚠ No plugin heartbeat received yet. If the MCP Management plugin is already open,
                  reload it, wait 5 seconds, and then verify the API at{" "}
                  <a
                    href="http://localhost:8787/api/health"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline decoration-dotted underline-offset-2"
                  >
                    http://localhost:8787/api/health ↗
                  </a>{" "}
                  (404 on / can be normal).
                </>
              )}
          </p>
        ) : (
          <p className="break-words text-[11px] text-red-600 dark:text-red-400">
            ✗ Connection failed
            {result.message ? ` — ${result.message}` : ""}
          </p>
        )
      ) : null}

      {showDesignContextCompact && (isLoadingContext || contextResult) ? (
        <div className="space-y-1.5 rounded-md border border-border/70 bg-muted/25 p-2.5 text-[11px]">
          {isLoadingContext ? (
            <p className="text-muted-foreground">Inspecting current Figma selection…</p>
          ) : contextResult?.ok === true ? (
            <>
              <p className="font-medium text-foreground/90">
                Selection context
                {contextResult.targetNodeId ? ` · ${contextResult.targetNodeId}` : ""}
              </p>
              <p className="text-muted-foreground">
                {contextResult.selection?.count ?? 0} selected
                {contextResult.selection?.page ? ` · ${contextResult.selection.page}` : ""}
                {contextResult.component
                  ? ` · ${contextResult.component.type} ${contextResult.component.name}`
                  : contextResult.node
                    ? ` · ${contextResult.node.type} ${contextResult.node.name}`
                    : ""}
              </p>
              <p className="text-muted-foreground">
                Token bindings: {contextResult.tokens?.count ?? 0}
                {aliasCount > 0 ? ` · aliases ${aliasCount}` : ""}
                {(contextResult.tokens?.missingCount ?? 0) > 0
                  ? ` · missing ${contextResult.tokens?.missingCount ?? 0}`
                  : ""}
                {(contextResult.tokens?.modeFallbackCount ?? 0) > 0
                  ? ` · mode fallback ${contextResult.tokens?.modeFallbackCount ?? 0}`
                  : ""}
              </p>
              {contextTokens.length > 0 ? (
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {contextTokens.slice(0, 6).map((token) => (
                    <span
                      key={`${token.id}:${token.modeId ?? "none"}`}
                      className={cn(
                        "rounded border px-1.5 py-0.5 font-mono",
                        token.isAlias
                          ? "border-amber-500/40 text-amber-700 dark:text-amber-400"
                          : "border-border text-muted-foreground",
                      )}
                    >
                      {token.name}
                    </span>
                  ))}
                  {contextTokens.length > 6 ? (
                    <span className="rounded border border-border px-1.5 py-0.5 text-muted-foreground">
                      +{contextTokens.length - 6} more
                    </span>
                  ) : null}
                </div>
              ) : null}
              {Array.isArray(contextResult.warnings) && contextResult.warnings.length > 0 ? (
                <p className="text-amber-700 dark:text-amber-400">
                  {contextResult.warnings[0]}
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-red-600 dark:text-red-400">
              Could not inspect selection
              {contextResult?.message ? ` — ${contextResult.message}` : ""}
            </p>
          )}
        </div>
      ) : null}

      {heartbeat ? (
        <p className="break-words text-[11px] text-muted-foreground">
          {heartbeat.lastSeenAt == null
            ? "Last plugin heartbeat: never received"
            : heartbeat.alive
            ? `Last plugin heartbeat: ${Math.max(0, Math.floor((Number(heartbeat.ageMs) || 0) / 1000))}s ago`
            : "Last plugin heartbeat: not recent"}
          {heartbeat.sourceDocName ? ` · ${heartbeat.sourceDocName}` : ""}
          {heartbeat.pluginVersion ? ` · plugin ${heartbeat.pluginVersion}` : ""}
        </p>
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
              Resolve connection
            </h2>
            <p className="mb-4 text-sm text-muted-foreground">
              This will refresh the plugin session state managed by this
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
