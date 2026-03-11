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
const PORT_SCAN_ORDER = [9223, 9224, 9225, 9226, 9227, 9228, 9229, 9230, 9231, 9232];
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

  const mcpClient = getPluginMcpClient();

  const applyCapabilities = useCallback((caps: McpCapabilities) => {
    setCapabilities(caps);
    setLastErrorCode(null);
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
    setResolveMessage('Running MCP auto-repair…');
    setResolveCountdown(null);

    try {
      let sawPortMismatch = connectionState?.state === 'mismatch';
      let sawSessionUnlinked = false;
      const initialCaps = await mcpClient.getCapabilities({ forceRefresh: true });
      if (initialCaps.ok) {
        const initialState = applyCapabilities(initialCaps);
        if (initialState.state === 'mismatch') {
          sawPortMismatch = true;
        }
        if (initialState.state === 'connected' || initialState.state === 'fallback') {
          setResolveTone('success');
          setResolveMessage('Connection is already healthy.');
          return;
        }
      } else {
        setLastErrorCode(initialCaps.code);
        if (isSessionUnlinkedIssue(initialCaps.code, initialCaps.message)) {
          sawSessionUnlinked = true;
        }
        if (initialCaps.code === 'capabilities.fetch_failed') {
          setResolveTone('error');
          setResolveMessage(
            'Dashboard API is unreachable. Verify http://localhost:8787/api/health and reload MCP Management.',
          );
          return;
        }
        if (initialCaps.code === 'capabilities.timeout') {
          setResolveTone('warning');
          setResolveMessage(
            'MCP status request timed out. Keep MCP Management open and retry in a few seconds.',
          );
          return;
        }
      }

      setResolveMessage('Step 1/2: reconciling MCP session…');
      const reconcile = await mcpClient.reconcileConnection({
        confirmReconcile: true,
        confirmGlobalReset: true,
      });
      if (reconcile.connected) {
        setResolveTone('success');
        setResolveMessage('Connection restored after reconcile.');
        setResolveCountdown(null);
        await fetchStatus();
        return;
      }

      setResolveTone('warning');
      setResolveMessage(
        reconcile.message || 'Waiting for MCP to detect the Figma session after reconcile.',
      );
      const deadline = Date.now() + RECONCILE_POLL_TIMEOUT_MS;

      while (Date.now() < deadline) {
        const secondsLeft = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
        setResolveCountdown(secondsLeft);

        const caps = await mcpClient.getCapabilities({ forceRefresh: true });
        if (caps.ok) {
          const state = applyCapabilities(caps);
          if (state.state === 'mismatch') {
            sawPortMismatch = true;
          }
          if (state.state === 'connected' || state.state === 'fallback') {
            setResolveTone('success');
            setResolveMessage('Connection restored after reconcile.');
            setResolveCountdown(null);
            return;
          }
        } else {
          setLastErrorCode(caps.code);
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
        setResolveMessage(
          'Session is not linked to this Figma file yet. Keep MCP Management open in Figma and retry. Port scan skipped.',
        );
        return;
      }

      if (!sawPortMismatch) {
        setResolveTone('warning');
        setResolveCountdown(null);
        setResolveMessage(
          'No port mismatch detected. Port scan skipped to avoid unnecessary resets. Retry after reopening MCP Management in Figma.',
        );
        return;
      }

      setResolveMessage('Step 2/2: scanning MCP ports automatically…');
      setResolveCountdown(null);

      for (const port of PORT_SCAN_ORDER) {
        const switchResult = await mcpClient.switchPort(port);
        if (!switchResult.ok) continue;

        const poll = await mcpClient.pollUntilStable(port, 8_000, 1_500);
        if (
          poll.success ||
          ((poll.finalState.state === 'connected' || poll.finalState.state === 'fallback') &&
            poll.finalState.connectedPort === port)
        ) {
          setResolveTone('success');
          setResolveMessage(`Connection restored on port ${port}.`);
          await fetchStatus();
          return;
        }
      }

      setResolveTone('error');
      setResolveMessage('Auto-repair could not restore the connection.');
    } catch (error) {
      setResolveTone('error');
      setResolveCountdown(null);
      setResolveMessage(
        error instanceof Error ? error.message : 'Failed to run connection auto-repair.',
      );
    } finally {
      setIsResolving(false);
    }
  }, [applyCapabilities, fetchStatus, isResolving, mcpClient]);

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
      case 'disconnected': return '✗';
      case 'mismatch': return '⚠';
      case 'fallback': return '⟳';
      default: return '?';
    }
  };

  const getStatusColor = () => {
    if (isLoading) return '#9E9E9E';
    switch (connectionState?.state) {
      case 'connected': return '#4CAF50';
      case 'disconnected': return '#F44336';
      case 'mismatch': return '#FF9800';
      case 'fallback': return '#2196F3';
      default: return '#9E9E9E';
    }
  };

  const getActionableGuidance = () => {
    if (!connectionState) return null;

    switch (connectionState.state) {
      case 'connected':
        return {
          title: 'All systems operational',
          message: `MCP is connected on port ${connectionState.connectedPort}.`,
          action: null,
        };
      
      case 'disconnected':
        return {
          title: 'MCP disconnected',
          message: connectionState.cause || 'Unable to connect to MCP server.',
          action: 'Use "Fix connection", then keep this plugin open in Figma and retry.',
        };
      
      case 'mismatch':
        return {
          title: 'Port mismatch detected',
          message: connectionState.cause,
          action: 'Run "Fix connection" first, then use Port Switcher if mismatch persists.',
        };
      
      case 'fallback':
        return {
          title: 'Using fallback port',
          message: `Connected on port ${connectionState.connectedPort} (fallback).`,
          action: 'Consider switching to the primary port for optimal performance.',
        };
      
      default:
        return {
          title: 'Unknown state',
          message: 'Connection state could not be determined.',
          action: 'Try refreshing or check server logs.',
        };
    }
  };

  const guidance = getActionableGuidance();
  const dashboardReachable = lastErrorCode !== 'capabilities.fetch_failed';
  const bridgeConnected =
    connectionState?.state === 'connected' ||
    connectionState?.state === 'fallback' ||
    connectionState?.state === 'mismatch';
  const portsAligned =
    connectionState?.state === 'connected' || connectionState?.state === 'fallback';
  const step1Ready = dashboardReachable;
  const step1Summary = !dashboardReachable
    ? 'Dashboard API is unreachable from the plugin.'
    : lastErrorCode === 'capabilities.timeout'
      ? 'Dashboard is reachable, but MCP status timed out while reconnecting.'
    : bridgeConnected
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
            {connectionState?.state === 'connected' ? 'Connected' : 
             connectionState?.state === 'disconnected' ? 'Disconnected' :
             connectionState?.state === 'mismatch' ? 'Port Mismatch' :
             connectionState?.state === 'fallback' ? 'Fallback Mode' : 'Unknown'}
          </div>
          <div style={{ fontSize: '12px', color: '#666' }}>
            {connectionState?.connectedPort 
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
            <div>{bridgeConnected ? '✓' : '✗'} Figma session detected by MCP</div>
            <div>{portsAligned ? '✓' : '✗'} Port alignment (dashboard vs plugin)</div>
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
            Step 2: Repair session
          </h4>
          <button
            onClick={handleFixConnection}
            disabled={isResolving || isLoading || connectionState?.state === 'connected'}
            style={{
              width: '100%',
              padding: '8px 10px',
              fontSize: '12px',
              borderRadius: '6px',
              border: '1px solid #f0b24b',
              backgroundColor:
                isResolving || isLoading || connectionState?.state === 'connected'
                  ? '#f5f5f5'
                  : '#fff8ea',
              color:
                isResolving || isLoading || connectionState?.state === 'connected'
                  ? '#999'
                  : '#a05a00',
              cursor:
                isResolving || isLoading || connectionState?.state === 'connected'
                  ? 'not-allowed'
                  : 'pointer',
            }}
          >
            {isResolving
              ? `Fixing${resolveCountdown !== null ? ` (${resolveCountdown}s)` : '…'}`
              : 'Fix connection'}
          </button>
          <p style={{ margin: '8px 0 0 0', fontSize: '11px', color: '#6b7280' }}>
            {!step1Ready
              ? 'Will run diagnostics and stop quickly with a concrete API error if unreachable.'
              : connectionState?.state === 'mismatch'
                ? 'Auto-repair will reconcile first, then scan ports if needed.'
                : 'Auto-repair reconciles MCP state and scans ports only when needed.'}
          </p>
        </div>
      </div>

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
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <dt style={{ color: '#999' }}>Available Tools:</dt>
              <dd style={{ margin: 0, fontWeight: 500 }}>
                {capabilities.tools.length > 0
                  ? capabilities.tools.join(', ')
                  : 'None'}
              </dd>
            </div>
            {capabilities.toolsDiscoveryError && (
              <div style={{
                marginTop: '8px',
                padding: '8px',
                backgroundColor: '#FFF8E1',
                border: '1px solid #FFE0B2',
                borderRadius: '4px',
              }}>
                <span style={{ color: '#8A5A00', fontSize: '11px' }}>
                  ⚠️ Tools discovery warning: {capabilities.toolsDiscoveryError}
                </span>
              </div>
            )}
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

      {/* Actionable Guidance */}
      {guidance && (
        <div style={{
          padding: '12px',
          backgroundColor: guidance.action ? '#FFF3E0' : '#E8F5E9',
          borderRadius: '8px',
          border: `1px solid ${guidance.action ? '#FFB74D' : '#A5D6A7'}`,
        }}>
          <h4 style={{
            margin: '0 0 8px 0',
            fontSize: '12px',
            fontWeight: 600,
            color: guidance.action ? '#E65100' : '#1B5E20',
          }}>
            {guidance.title}
          </h4>
          <p style={{
            margin: '0 0 8px 0',
            fontSize: '12px',
            color: '#333',
          }}>
            {guidance.message}
          </p>
          {guidance.action && (
            <p style={{
              margin: 0,
              fontSize: '11px',
              color: '#666',
              fontStyle: 'italic',
            }}>
              💡 {guidance.action}
            </p>
          )}
        </div>
      )}

      {/* Available Features */}
      {capabilities && (
        <div style={{
          marginTop: '16px',
          padding: '12px',
          backgroundColor: 'white',
          borderRadius: '8px',
        }}>
          <h4 style={{ margin: '0 0 8px 0', fontSize: '12px', fontWeight: 600, color: '#666' }}>
            Available Features
          </h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {Object.entries(capabilities.supports).map(([feature, supported]) => (
              <span
                key={feature}
                style={{
                  padding: '4px 8px',
                  fontSize: '11px',
                  borderRadius: '4px',
                  backgroundColor: supported ? '#E8F5E9' : '#FFEBEE',
                  color: supported ? '#2E7D32' : '#C62828',
                  border: `1px solid ${supported ? '#A5D6A7' : '#FFCDD2'}`,
                }}
              >
                {supported ? '✓' : '✗'} {feature.replace(/([A-Z])/g, ' $1').trim()}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ConnectionStatus;
