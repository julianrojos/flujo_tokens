import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  ApiError,
  pingFigmaMcp,
  reconnectFigmaMcp,
  type FigmaMcpPingResult,
} from '@/lib/api';
import { useFigmaMcpStatus } from '@/lib/figma-mcp-status-context';
import {
  EXPECTED_MCP_PLUGIN_VERSION,
  MCP_MAX_POLL_REQUEST_TIMEOUT_MS,
  MCP_RESET_POLL_INTERVAL_MS,
  MCP_RESET_POLL_TIMEOUT_MS,
  MCP_WAIT_POLL_TIMEOUT_MS,
} from '@/lib/mcp-polling-config';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseFigmaMcpConnectionTestProps {
  figmaUrl?: string;
  figmaToken?: string;
  disabled?: boolean;
  suggestResolve?: boolean;
}

export type ConnectionHealthTone = 'success' | 'warning' | 'error' | 'muted';

export interface ConnectionHealth {
  tone: ConnectionHealthTone;
  text: string;
}

export interface UseFigmaMcpConnectionTestReturn {
  // Loading / phase flags
  isLoading: boolean;
  isResetting: boolean;
  isWaiting: boolean;
  // Results
  result: FigmaMcpPingResult | null;
  // Modal
  isResolveModalOpen: boolean;
  resolveConfirmed: boolean;
  // Derived display values
  connectionHealth: ConnectionHealth;
  canResolve: boolean;
  isRecoveryActive: boolean;
  showRecoveryStepper: boolean;
  activeRecoveryStep: number;
  resetSecondsLeft: number;
  waitSecondsLeft: number;
  isNotConnected: boolean;
  isPluginVersionMismatch: boolean;
  hasTestedConnection: boolean;
  apiHealthHref: string;
  detectedPluginVersion: string | null;
  // Handlers
  handleTest: () => Promise<void>;
  handleResolveConnection: () => Promise<void>;
  openResolveModal: () => void;
  closeResolveModal: () => void;
  setResolveConfirmed: (value: boolean) => void;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function remainingSeconds(deadlineMs: number | null, nowMs: number): number {
  if (!deadlineMs) return 0;
  return Math.max(0, Math.ceil((deadlineMs - nowMs) / 1_000));
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useFigmaMcpConnectionTest({
  figmaUrl,
  figmaToken,
  disabled = false,
  suggestResolve = false,
}: UseFigmaMcpConnectionTestProps): UseFigmaMcpConnectionTestReturn {
  const { heartbeat } = useFigmaMcpStatus();

  const [isLoading, setIsLoading] = useState(false);
  const [isResolveModalOpen, setIsResolveModalOpen] = useState(false);
  const [resolveConfirmed, setResolveConfirmed] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isWaiting, setIsWaiting] = useState(false);
  const [resetDeadlineMs, setResetDeadlineMs] = useState<number | null>(null);
  const [waitDeadlineMs, setWaitDeadlineMs] = useState<number | null>(null);
  const [clockMs, setClockMs] = useState(() => Date.now());
  const [result, setResult] = useState<FigmaMcpPingResult | null>(null);
  const [hasTestedConnection, setHasTestedConnection] = useState(false);

  const pollingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollGenerationRef = useRef(0);

  const normalizedUrl = useMemo(() => String(figmaUrl || '').trim(), [figmaUrl]);
  const normalizedToken = useMemo(
    () => String(figmaToken || '').trim() || undefined,
    [figmaToken],
  );

  // ---- reset state when URL/token change ----------------------------------

  useEffect(() => {
    stopPolling();
    setIsLoading(false);
    setResult(null);
    setIsResetting(false);
    setIsWaiting(false);
    setResetDeadlineMs(null);
    setWaitDeadlineMs(null);
    setHasTestedConnection(false);
  }, [normalizedUrl, normalizedToken]);

  // ---- countdown clock ----------------------------------------------------

  useEffect(() => {
    if (!isResetting && !isWaiting) return;
    setClockMs(Date.now());
    const timer = setInterval(() => setClockMs(Date.now()), 300);
    return () => clearInterval(timer);
  }, [isResetting, isWaiting]);

  // ---- cleanup on unmount --------------------------------------------------

  useEffect(
    () => () => {
      stopPolling();
    },
    [],
  );

  // -------------------------------------------------------------------------
  // Internal: polling control
  // -------------------------------------------------------------------------

  function stopPolling() {
    pollGenerationRef.current += 1;
    if (pollingTimerRef.current !== null) {
      clearTimeout(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }
  }

  function buildPingArgs() {
    return {
      figmaUrl: normalizedUrl || undefined,
      figmaToken: normalizedToken,
    };
  }

  function startReconnectPoll({
    deadlineMs,
    timeoutResult,
  }: {
    deadlineMs: number;
    timeoutResult: FigmaMcpPingResult;
  }) {
    const generation = pollGenerationRef.current + 1;
    pollGenerationRef.current = generation;
    setIsWaiting(true);
    setWaitDeadlineMs(deadlineMs);

    const poll = async () => {
      if (generation !== pollGenerationRef.current) return;
      if (Date.now() >= deadlineMs) {
        setIsWaiting(false);
        setWaitDeadlineMs(null);
        setResult(timeoutResult);
        return;
      }

      try {
        const remainingMs = Math.max(1_000, deadlineMs - Date.now());
        const requestTimeoutMs = Math.min(remainingMs, MCP_MAX_POLL_REQUEST_TIMEOUT_MS);
        const payload = await pingFigmaMcp(buildPingArgs(), { timeoutMs: requestTimeoutMs });
        if (generation !== pollGenerationRef.current) return;
        if (payload.connected) {
          setIsWaiting(false);
          setWaitDeadlineMs(null);
          setResult(payload);
          return;
        }
        if (
          payload.code !== 'mcp.not_connected' &&
          payload.code !== 'mcp.timeout'
        ) {
          setIsWaiting(false);
          setWaitDeadlineMs(null);
          setResult(payload);
          return;
        }
      } catch {
        if (generation !== pollGenerationRef.current) return;
      }

      if (generation !== pollGenerationRef.current) return;
      pollingTimerRef.current = setTimeout(() => void poll(), MCP_RESET_POLL_INTERVAL_MS);
    };

    pollingTimerRef.current = setTimeout(() => void poll(), MCP_RESET_POLL_INTERVAL_MS);
  }

  // -------------------------------------------------------------------------
  // Exported handlers
  // -------------------------------------------------------------------------

  const handleTest = useCallback(async () => {
    stopPolling();
    const generation = pollGenerationRef.current;
    setHasTestedConnection(true);
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
          message: error.message || 'DS Graph connectivity test failed.',
        });
      } else {
        setResult({
          ok: false,
          connected: false,
          code: 'mcp_ping.client_error',
          message: 'Could not reach the server to test DS Graph connectivity.',
        });
      }
    } finally {
      if (generation === pollGenerationRef.current) setIsLoading(false);
    }
  }, [
    normalizedUrl,
    normalizedToken,
  ]);

  const handleResolveConnection = useCallback(async () => {
    stopPolling();
    const generation = pollGenerationRef.current;
    setIsResolveModalOpen(false);
    setResolveConfirmed(false);
    setIsLoading(false);
    setIsWaiting(false);
    setWaitDeadlineMs(null);
    setIsResetting(true);
    setResetDeadlineMs(Date.now() + MCP_RESET_POLL_TIMEOUT_MS);
    setResult(null);
    setHasTestedConnection(false);

    try {
      await reconnectFigmaMcp();
    } catch {
      // Best-effort: proceed to polling even if backend reconcile call fails.
    }

    if (generation !== pollGenerationRef.current) return;
    setIsResetting(false);
    setResetDeadlineMs(null);

    startReconnectPoll({
      deadlineMs: Date.now() + MCP_WAIT_POLL_TIMEOUT_MS,
      timeoutResult: {
        ok: false,
        connected: false,
        code: 'mcp.not_connected',
        message: 'No reconnection detected yet. Open the Figma plugin and retry.',
      },
    });
  }, [normalizedUrl, normalizedToken]);

  const openResolveModal = useCallback(() => {
    setResolveConfirmed(false);
    setIsResolveModalOpen(true);
  }, []);

  const closeResolveModal = useCallback(() => {
    setIsResolveModalOpen(false);
    setResolveConfirmed(false);
  }, []);

  // -------------------------------------------------------------------------
  // Derived display values
  // -------------------------------------------------------------------------

  const heartbeatAlive = heartbeat?.alive === true;
  const detectedPluginVersion =
    String(heartbeat?.pluginVersion || '').trim() || null;
  const isPluginVersionMismatch =
    heartbeatAlive &&
    detectedPluginVersion !== null &&
    detectedPluginVersion !== EXPECTED_MCP_PLUGIN_VERSION;

  const isNotConnected = result?.code === 'mcp.not_connected';
  const isTransportConnected = result?.connected === true;

  const connectionHealth = ((): ConnectionHealth => {
    if (isPluginVersionMismatch) {
      return {
        tone: 'warning',
        text: `Version mismatch: plugin ${detectedPluginVersion} vs expected ${EXPECTED_MCP_PLUGIN_VERSION}. Reimport the Figma plugin.`,
      };
    }
    if (isTransportConnected && heartbeatAlive) {
      return {
        tone: 'success',
        text: 'Healthy: plugin heartbeat + transport are active.',
      };
    }
    if (isTransportConnected && !heartbeatAlive) {
      return {
        tone: 'warning',
        text: 'Transport is connected, but plugin heartbeat is missing. Reload the Figma plugin.',
      };
    }
    if (heartbeatAlive && !result?.connected) {
      return {
        tone: 'warning',
        text: 'Plugin is alive, but transport is not connected yet.',
      };
    }
    if (!heartbeatAlive) {
      return {
        tone: 'warning',
        text: 'No live plugin heartbeat detected from Figma.',
      };
    }
    return { tone: 'muted', text: 'Run Test connection to refresh status.' };
  })();

  const canResolve =
    hasTestedConnection &&
    result?.connected !== true &&
    (suggestResolve || heartbeatAlive || isNotConnected || isPluginVersionMismatch);
  const isRecoveryActive = isResetting || isWaiting;
  const activeRecoveryStep = isResetting ? 0 : isWaiting ? 1 : -1;
  const resetSecondsLeft = remainingSeconds(resetDeadlineMs, clockMs);
  const waitSecondsLeft = remainingSeconds(waitDeadlineMs, clockMs);

  const apiHealthHref =
    typeof window === 'undefined'
      ? '/api/health'
      : `${window.location.origin}/api/health`;

  return {
    isLoading,
    isResetting,
    isWaiting,
    result,
    isResolveModalOpen,
    resolveConfirmed,
    connectionHealth,
    canResolve,
    isRecoveryActive,
    showRecoveryStepper: isRecoveryActive,
    activeRecoveryStep,
    resetSecondsLeft,
    waitSecondsLeft,
    isNotConnected,
    isPluginVersionMismatch,
    hasTestedConnection,
    apiHealthHref,
    detectedPluginVersion,
    handleTest,
    handleResolveConnection,
    openResolveModal,
    closeResolveModal,
    setResolveConfirmed,
  };
}
