/**
 * Connection Status Component
 *
 * Displays detailed MCP connection state with actionable guidance.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { getPluginMcpClient, type ConnectionState, type McpCapabilities } from '../../services/mcp-client';

interface ConnectionStatusProps {
  autoRefresh?: boolean;
  refreshIntervalMs?: number;
  onRefresh?: () => void;
}

const RECONCILE_POLL_INTERVAL_MS = 2_000;
const RECONCILE_POLL_TIMEOUT_MS = 30_000;
const DASHBOARD_HEALTH_ENDPOINTS = [
  'http://localhost:8787/api/health',
  'http://127.0.0.1:8787/api/health',
] as const;
const DASHBOARD_HEALTH_HINT = DASHBOARD_HEALTH_ENDPOINTS.join(' or ');
type ResolveTone = 'neutral' | 'success' | 'warning' | 'error';

function isSessionUnlinkedIssue(code: string | null, message: string | null | undefined): boolean {
  if (code === 'mcp.not_connected') return true;
  const text = String(message || '').toLowerCase();
  return (
    text.includes('not connected to figma desktop') ||
    text.includes('mcp management or cdp unavailable')
  );
}

export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({
  autoRefresh = true,
  refreshIntervalMs = 10_000,
  onRefresh,
}) => {
  const [connectionState, setConnectionState] = useState<ConnectionState | null>(null);
  const [capabilities, setCapabilities] = useState<McpCapabilities | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isResolving, setIsResolving] = useState(false);
  const [resolveMessage, setResolveMessage] = useState<string | null>(null);
  const [resolveTone, setResolveTone] = useState<ResolveTone>('neutral');
  const [resolveCountdown, setResolveCountdown] = useState<number | null>(null);
  const [lastErrorCode, setLastErrorCode] = useState<string | null>(null);
  const [lastServerCode, setLastServerCode] = useState<string | null>(null);

  const mcpClient = getPluginMcpClient();

  const applyCapabilities = useCallback((caps: McpCapabilities) => {
    setCapabilities(caps);
    setLastErrorCode(null);
    setLastServerCode(typeof caps.disconnectionCause?.code === 'string' ? caps.disconnectionCause.code : null);
    const state = mcpClient.computeConnectionState(caps);
    setConnectionState(state);
    setLastUpdated(new Date());
    onRefresh?.();
    return state;
  }, [mcpClient, onRefresh]);

  const fetchStatus = useCallback(async () => {
    setIsLoading(true);
    try {
      const caps = await mcpClient.getCapabilities({ forceRefresh: true });
      if (caps.ok) {
        applyCapabilities(caps);
      } else {
        setLastErrorCode(caps.code);
        setLastServerCode(null);
        setCapabilities(null);
        setLastUpdated(null);
        setConnectionState({
          configuredPort: mcpClient.getLastKnownConfiguredPort(),
          connectedPort: null,
          state: 'disconnected',
          cause: caps.message,
        });
      }
    } catch (error) {
      setLastErrorCode('capabilities.fetch_failed');
      setLastServerCode(null);
      setCapabilities(null);
      setLastUpdated(null);
      setConnectionState({
        configuredPort: mcpClient.getLastKnownConfiguredPort(),
        connectedPort: null,
        state: 'disconnected',
        cause: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setIsLoading(false);
    }
  }, [applyCapabilities, mcpClient]);

  const handleFixConnection = useCallback(async () => {
    if (isResolving) return;
    setIsResolving(true);
    setResolveTone('warning');
    setResolveMessage('Retrying MCP connection…');
    setResolveCountdown(null);

    try {
      let sawSessionUnlinked = false;
      const initialCaps = await mcpClient.getCapabilities({ forceRefresh: true });
      if (initialCaps.ok) {
        const initialState = applyCapabilities(initialCaps);
        if (initialState.state === 'connected' || initialState.state === 'fallback') {
          setResolveTone('success');
          setResolveMessage('Connection is already healthy.');
          return;
        }
      } else {
        setLastErrorCode(initialCaps.code);
        setLastServerCode(null);
        if (isSessionUnlinkedIssue(initialCaps.code, initialCaps.message)) {
          sawSessionUnlinked = true;
        }
        if (initialCaps.code === 'capabilities.fetch_failed') {
          setResolveTone('error');
          setResolveMessage(
            `Dashboard API is unreachable. Verify ${DASHBOARD_HEALTH_HINT} and reload the plugin.`,
          );
          return;
        }
        if (initialCaps.code === 'capabilities.timeout') {
          setResolveTone('warning');
          setResolveMessage(
            'MCP status request timed out. Keep the plugin open and retry in a few seconds.',
          );
          return;
        }
      }

      setResolveMessage('Retrying for plugin connection…');
      const deadline = Date.now() + RECONCILE_POLL_TIMEOUT_MS;

      while (Date.now() < deadline) {
        const secondsLeft = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
        setResolveCountdown(secondsLeft);

        const caps = await mcpClient.getCapabilities({ forceRefresh: true });
        if (caps.ok) {
          const state = applyCapabilities(caps);
          if (state.state === 'connected' || state.state === 'fallback') {
            setResolveTone('success');
            setResolveMessage('Connection restored.');
            setResolveCountdown(null);
            return;
          }
        } else {
          setLastErrorCode(caps.code);
          setLastServerCode(null);
          if (isSessionUnlinkedIssue(caps.code, caps.message)) {
            sawSessionUnlinked = true;
          }
          setCapabilities(null);
          setLastUpdated(null);
          setConnectionState({
            configuredPort: mcpClient.getLastKnownConfiguredPort(),
            connectedPort: null,
            state: 'disconnected',
            cause: caps.message,
          });
        }

        await new Promise<void>((resolve) => {
          setTimeout(resolve, RECONCILE_POLL_INTERVAL_MS);
        });
      }

      if (sawSessionUnlinked) {
        setResolveTone('warning');
        setResolveCountdown(null);
        setResolveMessage('Session is not linked to this Figma file yet. Keep the plugin open in Figma and retry.');
        return;
      }

      setResolveTone('error');
      setResolveMessage('Retry could not restore the connection. Keep the plugin open and retry.');
    } catch (error) {
      setResolveTone('error');
      setResolveCountdown(null);
      setResolveMessage(
        error instanceof Error ? error.message : 'Failed to retry connection.',
      );
    } finally {
      setIsResolving(false);
    }
  }, [applyCapabilities, isResolving, mcpClient]);

  useEffect(() => {
    fetchStatus();

    if (autoRefresh) {
      const interval = setInterval(fetchStatus, refreshIntervalMs);
      return () => clearInterval(interval);
    }
    
    return undefined;
  }, [autoRefresh, refreshIntervalMs, fetchStatus]);

  const getStatusIcon = () => {
    if (isLoading) return '⟳';
    switch (connectionState?.state) {
      case 'connected': return '✓';
      case 'connecting': return '⟳';
      case 'disconnected': return '✗';
      case 'mismatch': return '✓';
      case 'fallback': return '✓';
      default: return '?';
    }
  };

  const getStatusColor = () => {
    if (isLoading) return '#9E9E9E';
    switch (connectionState?.state) {
      case 'connected': return '#4CAF50';
      case 'connecting': return '#F59E0B';
      case 'disconnected': return '#F44336';
      case 'mismatch': return '#4CAF50';
      case 'fallback': return '#4CAF50';
      default: return '#9E9E9E';
    }
  };

  const technicalCode =
    lastErrorCode ||
    lastServerCode ||
    (connectionState?.state === 'disconnected' ? 'mcp.not_connected' : null);
  const technicalMessage = connectionState?.cause ?? null;
  const dashboardReachable = lastErrorCode !== 'capabilities.fetch_failed';
  const mcpSessionVisible =
    connectionState?.state === 'connected' ||
    connectionState?.state === 'fallback' ||
    connectionState?.state === 'mismatch';
  const isConnecting = connectionState?.state === 'connecting' || isLoading || isResolving;
  const wsSessionActive = capabilities?.transport?.wsAlive === true;
  const step1Ready = dashboardReachable;
  const step1Summary = !dashboardReachable
    ? `Dashboard API is unreachable from the plugin. Check ${DASHBOARD_HEALTH_HINT}.`
    : lastErrorCode === 'capabilities.timeout'
      ? 'Dashboard is reachable, but MCP status timed out while reconnecting.'
    : mcpSessionVisible
      ? 'Transport is reachable and an MCP session is visible.'
      : 'Dashboard is reachable, but no MCP session is detected yet.';

  return (
    <div style={{
      padding: '16px',
      fontFamily: 'system-ui, sans-serif',
      backgroundColor: '#fafafa',
      borderRadius: '8px',
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '16px',
      }}>
        <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>
          MCP Connection Status
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={fetchStatus}
            disabled={isLoading || isResolving}
            style={{
              padding: '4px 8px',
              fontSize: '11px',
              borderRadius: '4px',
              border: '1px solid #ddd',
              backgroundColor: 'white',
              cursor: isLoading || isResolving ? 'not-allowed' : 'pointer',
              opacity: isLoading || isResolving ? 0.5 : 1,
            }}
          >
            {isLoading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {resolveMessage && (
        <div style={{
          padding: '10px 12px',
          borderRadius: '8px',
          border:
            resolveTone === 'success'
              ? '1px solid #A5D6A7'
              : resolveTone === 'error'
                ? '1px solid #FFCDD2'
                : '1px solid #FFE0B2',
          backgroundColor:
            resolveTone === 'success'
              ? '#E8F5E9'
              : resolveTone === 'error'
                ? '#FFEBEE'
                : '#FFF8E1',
          marginBottom: '16px',
        }}>
          <p style={{
            margin: 0,
            fontSize: '12px',
            color:
              resolveTone === 'success'
                ? '#1B5E20'
                : resolveTone === 'error'
                  ? '#B71C1C'
                  : '#8A5A00',
          }}>
            {resolveMessage}
          </p>
        </div>
      )}

      {/* Status Indicator */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '16px',
        backgroundColor: 'white',
        borderRadius: '8px',
        border: `2px solid ${getStatusColor()}`,
        marginBottom: '16px',
      }}>
        <span style={{
          fontSize: '24px',
          color: getStatusColor(),
          fontWeight: 'bold',
        }}>
          {getStatusIcon()}
        </span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '14px', fontWeight: 500, color: '#333' }}>
            {isConnecting
              ? 'Connecting'
              : connectionState?.state === 'disconnected'
                ? 'Disconnected'
                : 'Connected'}
          </div>
          <div style={{ fontSize: '12px', color: '#666' }}>
            {isConnecting
              ? 'Attempting to connect…'
              : connectionState?.connectedPort
                ? `Connected to port ${connectionState.connectedPort}`
                : 'Not connected'}
          </div>
        </div>
      </div>

      {/* Guided workflow */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{
          padding: '12px',
          backgroundColor: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          marginBottom: '8px',
        }}>
          <h4 style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#374151' }}>
            Step 1: Check transport
          </h4>
          <div style={{ fontSize: '12px', color: '#4b5563', display: 'grid', gap: '6px' }}>
            <div>{dashboardReachable ? '✓' : '✗'} Dashboard API reachable</div>
            <div>{mcpSessionVisible ? '✓' : '✗'} Figma session detected by MCP</div>
            <div>{wsSessionActive ? '✓' : '✗'} WebSocket session active</div>
          </div>
          <p style={{ margin: '8px 0 0 0', fontSize: '11px', color: '#6b7280' }}>
            {step1Summary}
          </p>
        </div>

        <div style={{
          padding: '12px',
          backgroundColor: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
        }}>
          <h4 style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#374151' }}>
            Step 2: Retry connection
          </h4>
          <button
            onClick={handleFixConnection}
            disabled={isResolving || isLoading || connectionState?.state !== 'disconnected'}
            style={{
              width: '100%',
              padding: '8px 10px',
              fontSize: '12px',
              borderRadius: '6px',
              border: '1px solid #f0b24b',
              backgroundColor:
                isResolving || isLoading || connectionState?.state !== 'disconnected'
                  ? '#f5f5f5'
                  : '#fff8ea',
              color:
                isResolving || isLoading || connectionState?.state !== 'disconnected'
                  ? '#999'
                  : '#a05a00',
              cursor:
                isResolving || isLoading || connectionState?.state !== 'disconnected'
                  ? 'not-allowed'
                  : 'pointer',
            }}
          >
            {isResolving
              ? `Retrying${resolveCountdown !== null ? ` (${resolveCountdown}s)` : '…'}`
              : 'Retry connection'}
          </button>
          <p style={{ margin: '8px 0 0 0', fontSize: '11px', color: '#6b7280' }}>
            {!step1Ready
              ? 'Will run diagnostics and stop quickly with a concrete API error if unreachable.'
              : 'Retries direct MCP session checks and reconnection.'}
          </p>
        </div>
      </div>

      {/* Technical diagnosis */}
      {(technicalCode || technicalMessage) && (
        <div style={{
          padding: '12px',
          backgroundColor: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          marginBottom: '16px',
        }}>
          <h4 style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#374151' }}>
            Diagnostic
          </h4>
          {technicalCode && (
            <div style={{ fontSize: '12px', color: '#374151', marginBottom: '4px' }}>
              code: <code style={{ fontSize: '11px' }}>{technicalCode}</code>
            </div>
          )}
          {technicalMessage && (
            <div style={{ fontSize: '12px', color: '#6b7280' }}>
              {technicalMessage}
            </div>
          )}
        </div>
      )}

      {/* Detailed Info */}
      {capabilities && (
        <div style={{
          padding: '12px',
          backgroundColor: 'white',
          borderRadius: '8px',
          marginBottom: '16px',
        }}>
          <h4 style={{ margin: '0 0 8px 0', fontSize: '12px', fontWeight: 600, color: '#666' }}>
            Details
          </h4>
          <dl style={{ margin: 0, fontSize: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <dt style={{ color: '#999' }}>Configured Port:</dt>
              <dd style={{ margin: 0, fontWeight: 500 }}>{capabilities.mcp.activePort}</dd>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <dt style={{ color: '#999' }}>Connected Port:</dt>
              <dd style={{ margin: 0, fontWeight: 500 }}>
                {capabilities.mcp.currentPort ?? '—'}
              </dd>
            </div>
            {lastUpdated && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #eee' }}>
                <dt style={{ color: '#999' }}>Last Updated:</dt>
                <dd style={{ margin: 0, color: '#666' }}>
                  {lastUpdated.toLocaleTimeString()}
                </dd>
              </div>
            )}
          </dl>
        </div>
      )}

    </div>
  );
};

export default ConnectionStatus;
