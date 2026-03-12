/**
 * App — Design System Panel
 *
 * Main layout, designer-first:
 *   StatusIndicator  — large connection semaphore
 *   KitSummary       — token/style counts
 *   SyncButton       — CTA to sync tokens
 *   AdvancedSection  — collapsible: ConnectionStatus + PortSwitcher
 *
 * Bridge integration:
 *   - MCP status is fetched from dashboard capabilities
 *   - Header and detailed panels share the same source of truth
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { StatusIndicator } from './components/StatusIndicator';
import { KitSummary } from './components/KitSummary';
import { SyncButton } from './components/SyncButton';
import { AdvancedSection } from './components/AdvancedSection';
import { getPluginMcpClient, type ConnectionState } from '../services/mcp-client';
import { getWSRuntime } from '../bridge/ws-runtime';
import { DEFAULT_DIRECT_WS_URL, DEFAULT_TRANSPORT_MODE } from '../bridge/constants';
import { COLOR, FONT, SPACE, UI_WIDTH } from './styles/tokens';

interface InitMessage { type: 'INIT'; docName: string; fileKey?: string | null }
const PLUGIN_VERSION = '1.0.0';
const PLUGIN_BUILD = 'heartbeat-v3-ws';

const App: React.FC = () => {
  const [docName, setDocName] = useState('');
  const [fileKey, setFileKey] = useState<string | null>(null);
  const [connectionState, setConnState] = useState<ConnectionState | null>(null);
  const [kitRefreshSignal, setKitReset] = useState(0);

  const client = getPluginMcpClient();
  // Guards against concurrent capabilities requests stacking up when MCP
  // takes longer than the 10 s polling interval to respond.
  const fetchingRef = useRef(false);
  // Mutex to prevent concurrent heartbeat requests.
  const heartbeatInFlightRef = useRef(false);

  const getHeaderStatus = (state: ConnectionState | null) => {
    switch (state?.state) {
      case 'connected':
        return { label: 'MCP Connected', color: '#18a957' };
      case 'fallback':
        return { label: 'MCP Fallback Port', color: '#2196f3' };
      case 'mismatch':
        return { label: 'MCP Port Mismatch', color: '#ff9800' };
      case 'disconnected':
        return { label: 'MCP Disconnected', color: '#f24822' };
      default:
        return { label: 'Checking MCP...', color: '#9e9e9e' };
    }
  };

  const headerStatus = getHeaderStatus(connectionState);

  const fetchStatus = useCallback(async () => {
    // Prevent multiple in-flight capabilities requests from stacking up.
    // Capabilities can take up to 60 s when the MCP is reconnecting; without
    // this guard a new request would start every 10 s, flooding the stdio client.
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      // Use cache during auto-refresh to reduce pressure on MCP stdio.
      // Force refresh only on initial load or explicit user actions.
      const caps = await client.getCapabilities({ forceRefresh: false });
      setConnState(client.computeConnectionState(caps));
    } catch {
      setConnState({ configuredPort: client.getLastKnownConfiguredPort(), connectedPort: null, state: 'disconnected' });
    } finally {
      fetchingRef.current = false;
    }
  }, [client]);

  // Initial fetch + 10-second auto-refresh
  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, 10_000);
    return () => clearInterval(id);
  }, [fetchStatus]);

  // Receive INIT from code.ts with document name
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data?.pluginMessage as InitMessage | undefined;
      if (msg?.type === 'INIT') {
        setDocName(msg.docName);
        setFileKey(msg.fileKey ?? null);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // Plugin heartbeat: lets dashboard know this plugin session is alive.
  useEffect(() => {
    let disposed = false;

    const sendHeartbeat = async () => {
      if (disposed || heartbeatInFlightRef.current) return;
      heartbeatInFlightRef.current = true;
      try {
        await client.sendHeartbeat({
          fileKey,
          docName,
          pluginVersion: PLUGIN_VERSION,
          pluginBuild: PLUGIN_BUILD,
          timestamp: Date.now(),
        });
      } finally {
        heartbeatInFlightRef.current = false;
      }
    };

    void sendHeartbeat();
    const id = setInterval(() => {
      void sendHeartbeat();
    }, 8_000);

    return () => {
      disposed = true;
      clearInterval(id);
    };
  }, [client, docName, fileKey]);

  // Start the WebSocket bridge runtime so MCP can detect this open plugin session.
  useEffect(() => {
    // Allow directWsUrl to be configured via global config (for multi-instance deployments)
    // Falls back to default from constants if not configured
    const directWsUrl = (window as any).FIGMA_PLUGIN_CONFIG?.directWsUrl || DEFAULT_DIRECT_WS_URL;

    const runtime = getWSRuntime({
      transportMode: DEFAULT_TRANSPORT_MODE,
      directWsUrl,
      pluginVersion: PLUGIN_VERSION,
      pluginBuild: PLUGIN_BUILD,
    });
    let disposed = false;

    runtime
      .start()
      .then(async () => {
        if (disposed) return;
        await runtime.initiateHandshake();
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        parent.postMessage({ pluginMessage: { type: 'ERROR', error: `Bridge runtime: ${message}` } }, '*');
      });

    return () => {
      disposed = true;
      runtime.stop();
    };
  }, []);

  const handlePortChanged = (port: number) => {
    parent.postMessage({ pluginMessage: { type: 'PORT_CHANGED', port } }, '*');
    fetchStatus();
  };

  const handleError = (error: string) => {
    parent.postMessage({ pluginMessage: { type: 'ERROR', error } }, '*');
  };

  return (
    <div style={{ width: UI_WIDTH, backgroundColor: COLOR.bg, fontFamily: FONT.family, display: 'flex', flexDirection: 'column' }}>

      {/* Header with bridge status indicator */}
      <header style={{ padding: `${SPACE.md}px ${SPACE.lg}px`, backgroundColor: COLOR.surface, borderBottom: `1px solid ${COLOR.border}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 style={{ margin: 0, fontSize: FONT.size.xl, fontWeight: FONT.weight.semibold, color: COLOR.textPrimary, fontFamily: FONT.family, letterSpacing: '-0.01em' }}>
            Design System
          </h1>
          {/* Bridge status mini-indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm }}>
            <span style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: headerStatus.color,
              boxShadow: `0 0 4px ${headerStatus.color}66`,
            }} />
            <span style={{ fontSize: FONT.size.xs, color: COLOR.textSecondary }}>
              {headerStatus.label}
            </span>
          </div>
        </div>
      </header>

      {/* Large status dot */}
      <StatusIndicator
        connectionState={connectionState}
        docName={docName}
      />

      <div style={{ height: 1, backgroundColor: COLOR.border, margin: `0 ${SPACE.lg}px` }} />

      {/* Token/style summary */}
      <div style={{ padding: `${SPACE.md}px 0` }}>
        <KitSummary refreshSignal={kitRefreshSignal} />
      </div>

      {/* Sync CTA */}
      <SyncButton
        onSyncComplete={() => setKitReset((n) => n + 1)}
        onSyncError={handleError}
      />

      {/* Advanced (collapsible) */}
      <AdvancedSection onPortChanged={handlePortChanged} onError={handleError} />

    </div>
  );
};

export default App;
