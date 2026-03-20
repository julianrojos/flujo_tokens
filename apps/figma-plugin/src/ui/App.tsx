/**
 * App — Design System Panel
 *
 * Main layout, designer-first:
 *   StatusIndicator  — large connection semaphore
 *   KitSummary       — token/style counts
 *   SyncButton       — CTA to update variables
 *   AdvancedSection  — collapsible: ConnectionStatus
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
import { PLUGIN_VERSION, PLUGIN_BUILD } from '../version';
import { COLOR, FONT, SPACE, UI_WIDTH } from './styles/tokens';

interface InitMessage { type: 'INIT'; docName: string; fileKey?: string | null }
interface DocumentChangeMessage { type: 'DOCUMENT_CHANGE' }
type PluginUiMessage = InitMessage | DocumentChangeMessage;

const App: React.FC = () => {
  const CONNECTING_GRACE_MS = 5_000;
  const [docName, setDocName] = useState('');
  const [fileKey, setFileKey] = useState<string | null>(null);
  const [connectionState, setConnState] = useState<ConnectionState | null>(null);
  const [kitRefreshSignal, setKitReset] = useState(0);
  const [variablesUpToDate, setVariablesUpToDate] = useState(false);
  const [variablesUpdatedAtMs, setVariablesUpdatedAtMs] = useState<number | null>(null);

  const client = getPluginMcpClient();
  // Guards against concurrent capabilities requests stacking up when MCP
  // takes longer than the 10 s polling interval to respond.
  const fetchingRef = useRef(false);
  const connectingSinceRef = useRef<number | null>(null);
  // Mutex to prevent concurrent heartbeat requests.
  const heartbeatInFlightRef = useRef(false);

  const fetchStatus = useCallback(async () => {
    // Prevent multiple in-flight capabilities requests from stacking up.
    // Capabilities can take up to 60 s when the MCP is reconnecting; without
    // this guard a new request would start every 10 s, flooding the stdio client.
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setConnState((prev) => {
      if (prev?.state === 'connected' || prev?.state === 'fallback' || prev?.state === 'mismatch') {
        return prev;
      }
      if (connectingSinceRef.current === null) {
        connectingSinceRef.current = Date.now();
      }
      return {
        configuredPort: client.getLastKnownConfiguredPort(),
        connectedPort: null,
        state: 'connecting',
      };
    });
    try {
      // Use cache during auto-refresh to reduce pressure on MCP stdio.
      // Force refresh only on initial load or explicit user actions.
      const caps = await client.getCapabilities({ forceRefresh: false });
      const nextState = client.computeConnectionState(caps);
      setConnState((prev) => {
        const now = Date.now();
        if (nextState.state === 'connecting' && connectingSinceRef.current === null) {
          connectingSinceRef.current = now;
        }
        if (nextState.state !== 'connecting') {
          const withinGrace =
            prev?.state === 'connecting' &&
            nextState.state === 'disconnected' &&
            connectingSinceRef.current !== null &&
            now - connectingSinceRef.current < CONNECTING_GRACE_MS;
          if (withinGrace) {
            return {
              ...prev,
              cause: nextState.cause,
            };
          }
          connectingSinceRef.current = null;
        }
        return nextState;
      });
    } catch {
      setConnState((prev) => {
        const now = Date.now();
        const withinGrace =
          prev?.state === 'connecting' &&
          connectingSinceRef.current !== null &&
          now - connectingSinceRef.current < CONNECTING_GRACE_MS;
        if (withinGrace) {
          return prev;
        }
        connectingSinceRef.current = null;
        return { configuredPort: client.getLastKnownConfiguredPort(), connectedPort: null, state: 'disconnected' };
      });
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
      const msg = event.data?.pluginMessage as PluginUiMessage | undefined;
      if (msg?.type === 'INIT') {
        setDocName(msg.docName);
        setFileKey(msg.fileKey ?? null);
        // New/renewed plugin session should always require a fresh variables pull.
        setVariablesUpToDate(false);
        setVariablesUpdatedAtMs(null);
        return;
      }
      if (msg?.type === 'DOCUMENT_CHANGE') {
        // Any document mutation means exported variables may be stale.
        setVariablesUpToDate(false);
        setVariablesUpdatedAtMs(null);
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

  const handleError = (error: string) => {
    parent.postMessage({ pluginMessage: { type: 'ERROR', error } }, '*');
  };

  return (
    <div style={{ width: UI_WIDTH, backgroundColor: COLOR.bg, fontFamily: FONT.family, display: 'flex', flexDirection: 'column' }}>
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
        onSyncComplete={() => {
          setKitReset((n) => n + 1);
          setVariablesUpToDate(true);
          setVariablesUpdatedAtMs(Date.now());
        }}
        onSyncError={handleError}
        isUpToDate={variablesUpToDate}
        upToDateAtMs={variablesUpdatedAtMs}
      />

      {/* Advanced (collapsible) */}
      <AdvancedSection />

    </div>
  );
};

export default App;
