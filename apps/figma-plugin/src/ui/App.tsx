/**
 * App — Design System Panel
 *
 * Main layout, designer-first:
 *   StatusIndicator  — large connection semaphore
 *   KitSummary       — token/style counts
 *   SyncButton       — CTA to sync tokens
 *   AdvancedSection  — collapsible: ConnectionStatus + PortSwitcher
 */

import React, { useState, useEffect, useCallback } from 'react';
import { StatusIndicator } from './components/StatusIndicator';
import { KitSummary } from './components/KitSummary';
import { SyncButton } from './components/SyncButton';
import { AdvancedSection } from './components/AdvancedSection';
import { getPluginMcpClient, type ConnectionState } from '../services/mcp-client';
import { COLOR, FONT, SPACE, UI_WIDTH } from './styles/tokens';

interface InitMessage { type: 'INIT'; docName: string }

const App: React.FC = () => {
  const [docName, setDocName] = useState('');
  const [connectionState, setConnState] = useState<ConnectionState | null>(null);
  const [isConnLoading, setLoading] = useState(true);
  const [kitRefreshSignal, setKitReset] = useState(0);

  const client = getPluginMcpClient();

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const caps = await client.getCapabilities({ forceRefresh: true });
      setConnState(client.computeConnectionState(caps));
    } catch {
      setConnState({ configuredPort: 9223, connectedPort: null, state: 'disconnected' });
    } finally {
      setLoading(false);
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
      if (msg?.type === 'INIT') setDocName(msg.docName);
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
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

      {/* Header */}
      <header style={{ padding: `${SPACE.md}px ${SPACE.lg}px`, backgroundColor: COLOR.surface, borderBottom: `1px solid ${COLOR.border}` }}>
        <h1 style={{ margin: 0, fontSize: FONT.size.xl, fontWeight: FONT.weight.semibold, color: COLOR.textPrimary, fontFamily: FONT.family, letterSpacing: '-0.01em' }}>
          Design System
        </h1>
      </header>

      {/* Large status dot */}
      <StatusIndicator
        connectionState={connectionState}
        docName={docName}
        isLoading={isConnLoading}
        onRefresh={fetchStatus}
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
