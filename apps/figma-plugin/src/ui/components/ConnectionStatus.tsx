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

export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({
  autoRefresh = true,
  refreshIntervalMs = 10_000,
  onRefresh,
}) => {
  const [connectionState, setConnectionState] = useState<ConnectionState | null>(null);
  const [capabilities, setCapabilities] = useState<McpCapabilities | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const mcpClient = getPluginMcpClient();

  const fetchStatus = useCallback(async () => {
    setIsLoading(true);
    try {
      const caps = await mcpClient.getCapabilities();
      if (caps.ok) {
        setCapabilities(caps);
        const state = mcpClient.computeConnectionState(caps);
        setConnectionState(state);
        setLastUpdated(new Date());
        onRefresh?.();
      } else {
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
  }, [mcpClient, onRefresh]);

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
          action: 'Make sure the dashboard server is running and Desktop Bridge is open in Figma.',
        };
      
      case 'mismatch':
        return {
          title: 'Port mismatch detected',
          message: connectionState.cause,
          action: 'Use the Port Switcher to align dashboard port with Bridge connection, or restart Desktop Bridge.',
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
        <button
          onClick={fetchStatus}
          disabled={isLoading}
          style={{
            padding: '4px 8px',
            fontSize: '11px',
            borderRadius: '4px',
            border: '1px solid #ddd',
            backgroundColor: 'white',
            cursor: isLoading ? 'not-allowed' : 'pointer',
            opacity: isLoading ? 0.5 : 1,
          }}
        >
          {isLoading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

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
