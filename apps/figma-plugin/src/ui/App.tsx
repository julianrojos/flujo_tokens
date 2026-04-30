/**
 * App — Design System Panel
 *
 * Main layout, designer-first:
 *   StatusIndicator  — large connection semaphore
 *
 * Bridge integration:
 *   - MCP status is fetched from dashboard capabilities
 *   - Header and detailed panels share the same source of truth
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { StatusIndicator } from './components/StatusIndicator';
import { getPluginMcpClient, type ConnectionState } from '../services/mcp-client';
import { getWSRuntime } from '../bridge/ws-runtime';
import { DEFAULT_TRANSPORT_MODE } from '../bridge/constants';
import {
  resolveFigmaPluginRuntimeConfig,
  type FigmaPluginRuntimeEnv,
} from '../config/runtime-config';
import { PLUGIN_VERSION, PLUGIN_BUILD } from '../version';
import { COLOR, FONT, UI_WIDTH } from './styles/tokens';

interface InitMessage { type: 'INIT'; docName: string; fileKey?: string | null }
type PluginUiMessage = InitMessage;
const SYNC_RETRY_DELAYS_MS = [1500, 4000] as const;

const App: React.FC = () => {
  const CONNECTING_GRACE_MS = 5_000;
  const runtimeEnv = (import.meta as ImportMeta & { env?: FigmaPluginRuntimeEnv }).env;
  const runtimeConfig = resolveFigmaPluginRuntimeConfig({
    env: runtimeEnv,
    globalConfig: (window as Window & { FIGMA_PLUGIN_CONFIG?: { apiBaseUrl?: string; directWsUrl?: string } }).FIGMA_PLUGIN_CONFIG ?? null,
  });
  const [docName, setDocName] = useState('');
  const [fileKey, setFileKey] = useState<string | null>(null);
  const [connectionState, setConnState] = useState<ConnectionState | null>(null);

  const client = getPluginMcpClient(runtimeConfig.apiBaseUrl);
  // Guards against concurrent capabilities requests stacking up when MCP
  // takes longer than the 10 s polling interval to respond.
  const fetchingRef = useRef(false);
  const connectingSinceRef = useRef<number | null>(null);
  // Mutex to prevent concurrent heartbeat requests.
  const heartbeatInFlightRef = useRef(false);
  // Token sync should run once per plugin session after a successful sync.
  const hasSyncedOnInitRef = useRef(false);
  const syncOnInitInFlightRef = useRef(false);
  const syncRetryAttemptRef = useRef(0);
  const syncRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  const runSyncOnInit = useCallback(() => {
    if (hasSyncedOnInitRef.current || syncOnInitInFlightRef.current) return;
    syncOnInitInFlightRef.current = true;

    const scheduleRetry = () => {
      if (hasSyncedOnInitRef.current) return;
      const retryIdx = syncRetryAttemptRef.current;
      if (retryIdx >= SYNC_RETRY_DELAYS_MS.length) return;
      const delayMs = SYNC_RETRY_DELAYS_MS[retryIdx];
      syncRetryAttemptRef.current += 1;
      if (syncRetryTimerRef.current) {
        clearTimeout(syncRetryTimerRef.current);
      }
      syncRetryTimerRef.current = setTimeout(() => {
        syncRetryTimerRef.current = null;
        runSyncOnInit();
      }, delayMs);
    };

    void client
      .syncTokens()
      .then((result) => {
        if (result.ok) {
          hasSyncedOnInitRef.current = true;
          syncRetryAttemptRef.current = 0;
          if (syncRetryTimerRef.current) {
            clearTimeout(syncRetryTimerRef.current);
            syncRetryTimerRef.current = null;
          }
          return;
        }
        const message = result.message ?? 'Failed to sync variables on plugin open.';
        parent.postMessage({ pluginMessage: { type: 'ERROR', error: message } }, '*');
        scheduleRetry();
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : 'Unknown error';
        parent.postMessage({ pluginMessage: { type: 'ERROR', error: message } }, '*');
        scheduleRetry();
      })
      .finally(() => {
        syncOnInitInFlightRef.current = false;
      });
  }, [client]);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data?.pluginMessage as PluginUiMessage | undefined;
      if (msg?.type === 'INIT') {
        setDocName(msg.docName);
        setFileKey(msg.fileKey ?? null);
        runSyncOnInit();
        return;
      }
    };
    window.addEventListener('message', handler);
    return () => {
      window.removeEventListener('message', handler);
      if (syncRetryTimerRef.current) {
        clearTimeout(syncRetryTimerRef.current);
        syncRetryTimerRef.current = null;
      }
    };
  }, [runSyncOnInit]);

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
    const runtime = getWSRuntime({
      transportMode: DEFAULT_TRANSPORT_MODE,
      directWsUrl: runtimeConfig.directWsUrl,
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
  }, [runtimeConfig.directWsUrl]);

  return (
    <div style={{ width: UI_WIDTH, backgroundColor: COLOR.bg, fontFamily: FONT.family, display: 'flex', flexDirection: 'column', textAlign: 'center' }}>
      {/* Large status dot */}
      <StatusIndicator
        connectionState={connectionState}
      />

    </div>
  );
};

export default App;
