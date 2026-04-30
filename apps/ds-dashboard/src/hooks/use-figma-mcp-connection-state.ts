import { useCallback, useEffect, useRef, useState } from 'react';

import {
  deriveMcpConnectionState,
  type McpConnectionState,
} from '@flujo/shared';
import { getFigmaMcpCapabilities } from '@/lib/api';

const STATUS_POLL_INTERVAL_MS = 8_000;
const STATUS_REQUEST_TIMEOUT_MS = 6_000;
const INITIAL_CONFIGURED_PORT = 9223;

function createInitialConnectionState(): McpConnectionState {
  return deriveMcpConnectionState(
    {
      ok: false,
      code: 'capabilities.timeout',
      message: 'Checking MCP status',
    },
    INITIAL_CONFIGURED_PORT,
  );
}

export function useFigmaMcpConnectionState(): McpConnectionState {
  const [connectionState, setConnectionState] = useState<McpConnectionState>(
    createInitialConnectionState,
  );
  const isFetchingRef = useRef(false);
  const lastKnownConfiguredPortRef = useRef(INITIAL_CONFIGURED_PORT);

  const refresh = useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    try {
      const payload = await getFigmaMcpCapabilities(STATUS_REQUEST_TIMEOUT_MS);
      const nextState = deriveMcpConnectionState(
        payload,
        lastKnownConfiguredPortRef.current,
      );
      if (nextState.configuredPort > 0) {
        lastKnownConfiguredPortRef.current = nextState.configuredPort;
      }
      setConnectionState(nextState);
    } finally {
      isFetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    void refresh();
    const intervalId = globalThis.setInterval(() => {
      void refresh();
    }, STATUS_POLL_INTERVAL_MS);

    return () => {
      globalThis.clearInterval(intervalId);
    };
  }, [refresh]);

  return connectionState;
}
