/**
 * Port Switcher Component
 *
 * Allows users to switch MCP port and see real-time status.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getPluginMcpClient, type ConnectionState } from '../../services/mcp-client';

const ALLOWED_PORTS = [9223, 9224, 9225, 9226, 9227, 9228, 9229, 9230, 9231, 9232];
const MIN_ALLOWED_PORT = ALLOWED_PORTS.reduce((min, port) => (port < min ? port : min), ALLOWED_PORTS[0]);
const MAX_ALLOWED_PORT = ALLOWED_PORTS.reduce((max, port) => (port > max ? port : max), ALLOWED_PORTS[0]);

interface PortSwitcherProps {
  onPortChanged?: (newPort: number) => void;
  onError?: (error: string) => void;
}

type SwitchState = 'idle' | 'switching' | 'verifying' | 'reconnecting' | 'done' | 'error';

export const PortSwitcher: React.FC<PortSwitcherProps> = ({
  onPortChanged,
  onError,
}) => {
  const [selectedPort, setSelectedPort] = useState<number>(9223);
  const [connectionState, setConnectionState] = useState<ConnectionState | null>(null);
  const [switchState, setSwitchState] = useState<SwitchState>('idle');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [countdown, setCountdown] = useState<number>(0);

  // Track component mount status to prevent state updates after unmount
  const isMountedRef = useRef(true);

  const mcpClient = getPluginMcpClient();

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Fetch initial connection state
  const fetchConnectionState = useCallback(async () => {
    try {
      const capabilities = await mcpClient.getCapabilities({ forceRefresh: true });
      const state = mcpClient.computeConnectionState(capabilities);
      if (isMountedRef.current) {
        setConnectionState(state);
        if (capabilities.ok) {
          setSelectedPort(state.configuredPort);
        }
      }
    } catch (error) {
      if (isMountedRef.current) {
        setConnectionState({
          configuredPort: mcpClient.getLastKnownConfiguredPort(),
          connectedPort: null,
          state: 'disconnected',
          cause: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }, [mcpClient]);

  useEffect(() => {
    fetchConnectionState();
  }, [fetchConnectionState]);

  // Handle port switch
  const handleSwitchPort = async () => {
    // Prevent concurrent switches, but allow retry after error
    if (switchState === 'switching' || switchState === 'verifying' || switchState === 'reconnecting') return;

    setSwitchState('switching');
    setStatusMessage('Switching port...');

    let intervalId: ReturnType<typeof setInterval> | null = null;

    try {
      // Step 1: Request port switch
      const switchResult = await mcpClient.switchPort(selectedPort);

      // Check if component is still mounted after async operation
      if (!isMountedRef.current) return;

      if (!switchResult.ok) {
        setSwitchState('error');
        setStatusMessage(`Switch failed: ${switchResult.message}`);
        onError?.(switchResult.message);
        return;
      }

      // Step 2: Verify switch
      setSwitchState('verifying');
      setStatusMessage('Verifying port switch...');

      // Step 3: Poll until stable (with countdown)
      setSwitchState('reconnecting');
      setStatusMessage('Waiting for reconnection...');

      const maxWait = 30; // 30 seconds
      setCountdown(maxWait);

      // Setup countdown interval
      intervalId = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      const pollResult = await mcpClient.pollUntilStable(selectedPort, 30_000, 2_000);

      // Check if component is still mounted after long polling operation
      if (!isMountedRef.current) {
        if (intervalId !== null) {
          clearInterval(intervalId);
        }
        return;
      }

      if (pollResult.success) {
        setSwitchState('done');
        setStatusMessage(`Successfully switched to port ${selectedPort}`);
        onPortChanged?.(selectedPort);

        // Reset to idle after 3 seconds
        setTimeout(() => {
          if (isMountedRef.current) {
            setSwitchState('idle');
            setStatusMessage('');
            fetchConnectionState();
          }
        }, 3000);
      } else {
        setSwitchState('error');
        setStatusMessage(`Reconnection timeout. Current state: ${pollResult.finalState.state}`);
        onError?.('Reconnection timeout');
      }
    } catch (error) {
      // Check if component is still mounted before setting error state
      if (!isMountedRef.current) return;
      
      setSwitchState('error');
      setStatusMessage(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      onError?.(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      // Cleanup countdown interval
      if (intervalId !== null) {
        clearInterval(intervalId);
      }
    }
  };

  // Get state color
  const getStateColor = () => {
    switch (connectionState?.state) {
      case 'connected': return '#4CAF50'; // Green
      case 'disconnected': return '#F44336'; // Red
      case 'mismatch': return '#FF9800'; // Orange
      case 'fallback': return '#2196F3'; // Blue
      default: return '#9E9E9E'; // Gray
    }
  };

  const getStateLabel = () => {
    switch (connectionState?.state) {
      case 'connected': return 'Connected';
      case 'disconnected': return 'Disconnected';
      case 'mismatch': return 'Port Mismatch';
      case 'fallback': return 'Fallback';
      default: return 'Unknown';
    }
  };

  const isSwitching = switchState !== 'idle' && switchState !== 'done' && switchState !== 'error';

  return (
    <div style={{ padding: '16px', fontFamily: 'system-ui, sans-serif' }}>
      <h3 style={{ margin: '0 0 16px 0', fontSize: '14px', fontWeight: 600 }}>
        MCP Port Configuration
      </h3>

      {/* Connection Status */}
      {connectionState && (
        <div style={{
          padding: '12px',
          borderRadius: '8px',
          backgroundColor: getStateColor() + '15', // 15% opacity
          border: `1px solid ${getStateColor()}`,
          marginBottom: '16px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', fontWeight: 500, color: getStateColor() }}>
              ● {getStateLabel()}
            </span>
            <span style={{ fontSize: '11px', color: '#666' }}>
              Port: {connectionState.connectedPort ?? '—'}
            </span>
          </div>
          {connectionState.cause && (
            <p style={{
              margin: '8px 0 0 0',
              fontSize: '11px',
              color: '#666',
            }}>
              {connectionState.cause}
            </p>
          )}
        </div>
      )}

      {/* Port Selector */}
      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '8px' }}>
          Target Port
        </label>
        <select
          value={selectedPort}
          onChange={(e) => setSelectedPort(Number(e.target.value))}
          disabled={isSwitching}
          style={{
            width: '100%',
            padding: '8px 12px',
            fontSize: '14px',
            borderRadius: '6px',
            border: '1px solid #ddd',
            backgroundColor: isSwitching ? '#f5f5f5' : 'white',
            cursor: isSwitching ? 'not-allowed' : 'pointer',
          }}
        >
          {ALLOWED_PORTS.map((port) => (
            <option key={port} value={port}>
              {port} {port === connectionState?.configuredPort ? '(current)' : ''}
            </option>
          ))}
        </select>
        <p style={{ fontSize: '11px', color: '#999', margin: '4px 0 0 0' }}>
          Allowed range: {MIN_ALLOWED_PORT} - {MAX_ALLOWED_PORT}
        </p>
      </div>

      {/* Switch Button */}
      <button
        onClick={handleSwitchPort}
        disabled={isSwitching || selectedPort === connectionState?.configuredPort}
        style={{
          width: '100%',
          padding: '10px 16px',
          fontSize: '14px',
          fontWeight: 500,
          borderRadius: '6px',
          border: 'none',
          backgroundColor: isSwitching
            ? '#e0e0e0'
            : selectedPort === connectionState?.configuredPort
            ? '#e0e0e0'
            : '#1976D2',
          color: isSwitching || selectedPort === connectionState?.configuredPort
            ? '#999'
            : 'white',
          cursor: isSwitching || selectedPort === connectionState?.configuredPort
            ? 'not-allowed'
            : 'pointer',
          transition: 'all 0.2s',
        }}
      >
        {switchState === 'idle' && 'Switch Port'}
        {switchState === 'switching' && 'Switching...'}
        {switchState === 'verifying' && 'Verifying...'}
        {switchState === 'reconnecting' && `Reconnecting (${countdown}s)`}
        {switchState === 'done' && '✓ Success'}
        {switchState === 'error' && '✗ Failed'}
      </button>

      {/* Status Message */}
      {statusMessage && (
        <p style={{
          margin: '12px 0 0 0',
          fontSize: '12px',
          color: switchState === 'error' ? '#F44336' : '#666',
          textAlign: 'center',
        }}>
          {statusMessage}
        </p>
      )}

      {/* Help Text */}
      {switchState === 'done' && (
        <p style={{
          margin: '12px 0 0 0',
          fontSize: '11px',
          color: '#4CAF50',
          textAlign: 'center',
        }}>
          ✓ Port switched successfully. MCP may need a few seconds to relink.
        </p>
      )}

      {switchState === 'error' && (
        <p style={{
          margin: '12px 0 0 0',
          fontSize: '11px',
          color: '#FF9800',
          textAlign: 'center',
        }}>
          Tip: Keep this plugin open in Figma, then retry.
        </p>
      )}
    </div>
  );
};

export default PortSwitcher;
