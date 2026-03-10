/**
 * Bridge Status Hook
 *
 * React hook for managing the WebSocket bridge runtime from the plugin UI.
 */

import { useState, useEffect, useMemo } from 'react';
import type { BridgeStatus, BridgeConnectionState } from '../../bridge/protocol';
import { getWSRuntime } from '../../bridge/ws-runtime';

export interface BridgeUIState {
  state: BridgeConnectionState;
  configuredPort: number;
  connectedPort: number | null;
  cause?: string;
  isConnected: boolean;
  isConnecting: boolean;
  isHandshakeComplete: boolean;
}

const DEFAULT_BRIDGE_STATE: BridgeUIState = {
  state: 'disconnected',
  configuredPort: 9223,
  connectedPort: null,
  isConnected: false,
  isConnecting: false,
  isHandshakeComplete: false,
};

function toBridgeUiState(status: BridgeStatus, handshakeComplete: boolean): BridgeUIState {
  return {
    state: status.state,
    configuredPort: status.configuredPort,
    connectedPort: status.connectedPort,
    cause: status.cause,
    isConnected: status.state === 'connected',
    isConnecting: status.state === 'connecting' || status.state === 'handshaking',
    isHandshakeComplete: handshakeComplete,
  };
}

export function useBridgeStatus(): BridgeUIState {
  const runtime = useMemo(() => getWSRuntime(), []);
  const [bridgeState, setBridgeState] = useState<BridgeUIState>(DEFAULT_BRIDGE_STATE);

  useEffect(() => {
    let isDisposed = false;

    const applyStatus = (status: BridgeStatus) => {
      if (isDisposed) return;
      setBridgeState(toBridgeUiState(status, runtime.isHandshakeComplete()));
    };

    const unsubscribe = runtime.onStatus(applyStatus);
    applyStatus(runtime.getStatus());

    runtime
      .start()
      .then(async () => {
        if (isDisposed) return;
        await runtime.initiateHandshake();
        if (isDisposed) return;
        applyStatus(runtime.getStatus());
      })
      .catch((error) => {
        if (isDisposed) return;
        setBridgeState({
          ...DEFAULT_BRIDGE_STATE,
          cause: error instanceof Error ? error.message : String(error),
        });
      });

    return () => {
      isDisposed = true;
      unsubscribe();
      runtime.stop();
    };
  }, [runtime]);

  return bridgeState;
}

/**
 * Get human-readable label for bridge state.
 */
export function getBridgeStateLabel(state: BridgeConnectionState): string {
  switch (state) {
    case 'connected':
      return 'Plugin Bridge Connected';
    case 'connecting':
      return 'Bridge Connecting...';
    case 'handshaking':
      return 'Bridge Handshaking...';
    case 'disconnected':
      return 'Bridge Disconnected';
    case 'mismatch':
      return 'Port Mismatch';
    case 'fallback':
      return 'Fallback Mode';
    default:
      return 'Unknown';
  }
}

/**
 * Get color for bridge state.
 */
export function getBridgeStateColor(state: BridgeConnectionState): string {
  switch (state) {
    case 'connected':
      return '#18a957';
    case 'connecting':
    case 'handshaking':
      return '#f5a623';
    case 'disconnected':
      return '#f24822';
    case 'mismatch':
      return '#ff9800';
    case 'fallback':
      return '#2196f3';
    default:
      return '#9e9e9e';
  }
}
