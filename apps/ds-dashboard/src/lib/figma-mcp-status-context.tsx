import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { deriveMcpConnectionState, type McpConnectionState } from '@flujo/shared';

import {
  getFigmaMcpCapabilities,
  getFigmaMcpHeartbeat,
  type FigmaMcpHeartbeatResult,
} from '@/lib/api';
import {
  MCP_BACKOFF_MAX_MS,
  MCP_HEARTBEAT_POLL_INTERVAL_MS,
  MCP_INITIAL_CONFIGURED_PORT,
  MCP_STATUS_POLL_INTERVAL_MS,
  MCP_STATUS_REQUEST_TIMEOUT_MS,
} from '@/lib/mcp-polling-config';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FigmaMcpStatusContextValue {
  connectionState: McpConnectionState;
  heartbeat: FigmaMcpHeartbeatResult | null;
  /** Trigger an immediate capabilities re-fetch (e.g. after a user action). */
  refresh: () => void;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const FigmaMcpStatusContext = createContext<FigmaMcpStatusContextValue | null>(null);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createInitialConnectionState(): McpConnectionState {
  return deriveMcpConnectionState(
    {
      ok: false,
      code: 'capabilities.timeout',
      message: 'Checking MCP status',
    },
    MCP_INITIAL_CONFIGURED_PORT,
  );
}

function nextBackoffMs(current: number): number {
  return Math.min(current * 2, MCP_BACKOFF_MAX_MS);
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function FigmaMcpStatusProvider({ children }: { children: ReactNode }) {
  const [connectionState, setConnectionState] = useState<McpConnectionState>(
    createInitialConnectionState,
  );
  const [heartbeat, setHeartbeat] = useState<FigmaMcpHeartbeatResult | null>(null);

  // Refs shared across closures to avoid stale captures
  const isFetchingCapRef = useRef(false);
  const isFetchingHbRef = useRef(false);
  const lastKnownPortRef = useRef(MCP_INITIAL_CONFIGURED_PORT);
  const capBackoffRef = useRef(MCP_STATUS_POLL_INTERVAL_MS);
  const capTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hbTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ----- capabilities -------------------------------------------------------

  const fetchCapabilities = useCallback(async () => {
    if (isFetchingCapRef.current) return;
    isFetchingCapRef.current = true;
    try {
      const payload = await getFigmaMcpCapabilities(MCP_STATUS_REQUEST_TIMEOUT_MS);
      const next = deriveMcpConnectionState(payload, lastKnownPortRef.current);
      if (next.connectedPort !== null) lastKnownPortRef.current = next.connectedPort;
      else if (next.configuredPort > 0) lastKnownPortRef.current = next.configuredPort;

      setConnectionState(next);

      // Reset backoff on any successful response (even disconnected — it means
      // the server is reachable); only back off on timeout-like states.
      if (next.state !== 'connecting') {
        capBackoffRef.current = MCP_STATUS_POLL_INTERVAL_MS;
      } else {
        capBackoffRef.current = nextBackoffMs(capBackoffRef.current);
      }
    } finally {
      isFetchingCapRef.current = false;
    }
  }, []);

  // ----- heartbeat ----------------------------------------------------------

  const fetchHeartbeat = useCallback(async () => {
    if (isFetchingHbRef.current) return;
    isFetchingHbRef.current = true;
    try {
      const payload = await getFigmaMcpHeartbeat();
      setHeartbeat(payload);
    } catch {
      setHeartbeat({
        ok: false,
        alive: false,
        ageMs: null,
        lastSeenAt: null,
        sourceFileKey: null,
        sourceDocName: null,
      });
    } finally {
      isFetchingHbRef.current = false;
    }
  }, []);

  // ----- refresh (manual trigger) ------------------------------------------

  const refresh = useCallback(() => {
    capBackoffRef.current = MCP_STATUS_POLL_INTERVAL_MS;
    void fetchCapabilities();
    void fetchHeartbeat();
  }, [fetchCapabilities, fetchHeartbeat]);

  // ----- polling loop (visibility-aware) ------------------------------------

  useEffect(() => {
    let disposed = false;

    const scheduleCap = () => {
      if (disposed) return;
      capTimerRef.current = setTimeout(async () => {
        if (disposed || document.hidden) {
          scheduleCap();
          return;
        }
        await fetchCapabilities();
        scheduleCap();
      }, capBackoffRef.current);
    };

    const scheduleHb = () => {
      if (disposed) return;
      hbTimerRef.current = setTimeout(async () => {
        if (disposed || document.hidden) {
          scheduleHb();
          return;
        }
        await fetchHeartbeat();
        scheduleHb();
      }, MCP_HEARTBEAT_POLL_INTERVAL_MS);
    };

    // Immediate first fetch, then schedule loops
    void fetchCapabilities().then(scheduleCap);
    void fetchHeartbeat().then(scheduleHb);

    // Resume immediately when the tab becomes visible again
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        if (capTimerRef.current !== null) clearTimeout(capTimerRef.current);
        if (hbTimerRef.current !== null) clearTimeout(hbTimerRef.current);
        capBackoffRef.current = MCP_STATUS_POLL_INTERVAL_MS;
        void fetchCapabilities().then(scheduleCap);
        void fetchHeartbeat().then(scheduleHb);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (capTimerRef.current !== null) clearTimeout(capTimerRef.current);
      if (hbTimerRef.current !== null) clearTimeout(hbTimerRef.current);
    };
  }, [fetchCapabilities, fetchHeartbeat]);

  return (
    <FigmaMcpStatusContext.Provider value={{ connectionState, heartbeat, refresh }}>
      {children}
    </FigmaMcpStatusContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Consumer hook
// ---------------------------------------------------------------------------

export function useFigmaMcpStatus(): FigmaMcpStatusContextValue {
  const ctx = useContext(FigmaMcpStatusContext);
  if (!ctx) {
    throw new Error('useFigmaMcpStatus must be used inside <FigmaMcpStatusProvider>');
  }
  return ctx;
}
