/**
 * Figma MCP Capabilities Route
 *
 * Discovers available bridge tools and connection state.
 * Direct-only mode: uses WebSocket bridge to plugin. No legacy MCP fallback.
 */

import type { Context } from 'hono';
import { getConnInfo } from '@hono/node-server/conninfo';

// Define ConnInfo interface locally to avoid import issues
interface ConnInfo {
  remote?: {
    address?: string;
  };
}
import { getActiveMcpPort } from '../services/figma-mcp-runtime-state.ts';
import { getFigmaMcpHeartbeatStatus } from '../services/figma-mcp-heartbeat-state.ts';
import { getPluginConnectionManager } from '../services/plugin-connection-manager.ts';
import { isLoopbackRequest } from '../lib/loopback-utils.ts';
import { resolveLiveness, resolveDisconnectionCause } from '../lib/resolve-liveness.ts';
import { fetchBridgeCapabilitiesDirect } from '../services/figma-direct-bridge-service.ts';
import { mapBridgeMethodsToCapabilities, type BridgeCapabilities } from '../lib/map-bridge-methods-to-capabilities.ts';
import { buildServerMeta, type ServerMeta } from '../lib/server-meta.ts';

export interface FigmaMcpCapabilitiesRouteDeps {
  getConnInfoFn?: (c: Context) => ConnInfo;
  internalToken?: string;
  getFigmaMcpHeartbeatStatusFn?: () => { alive: boolean };
}

const ALLOWED_PORTS = [9223, 9224, 9225, 9226, 9227, 9228, 9229, 9230, 9231, 9232];

interface CapabilitiesResponse {
  ok: true;
  tools: string[];
  toolsDiscoveryError?: string;
  transport: {
    mode: 'direct' | 'ws' | 'none';
    /** Active direct WS connections */
    wsAlive: boolean;
    /** Legacy HTTP heartbeat alive (always false in direct-only) */
    heartbeatAlive: boolean;
    /** Source of liveness determination */
    livenessSource?: 'ws' | 'legacy' | 'hybrid' | 'none';
  };
  disconnectionCause?: {
    code: string;
    message: string;
  };
  /**
   * @deprecated Deprecated flags. Use supportsV2 for clearer semantics.
   */
  supports: {
    searchNodes: boolean;
    getChildren: boolean;
    searchStyles: boolean;
    searchVariables: boolean;
    portSwitch: boolean;
  };
  /**
   * V2 supports flags with explicit semantic names (always present).
   * Each flag indicates "has capability to retrieve X" not "has search-by-pattern operation".
   */
  supportsV2: {
    /** Plugin supports GET_FILE_INFO - can retrieve file/document metadata */
    hasFileInfo: boolean;
    /** Plugin supports GET_COMPONENT - can retrieve component details */
    hasComponent: boolean;
    /** Plugin supports GET_LOCAL_STYLES - can retrieve local styles */
    hasLocalStyles: boolean;
    /** Plugin supports GET_VARIABLES_DATA - can retrieve variables data */
    hasVariablesData: boolean;
    /** Port switching capability (deprecated in direct-only mode) */
    hasPortSwitch: boolean;
  };
  mcp: {
    connected: boolean;
    code: string;
    message: string;
    currentPort: number;
    portFallbackUsed: boolean;
    availablePorts: number[];
    activePort: number;
  };
  /** Server meta with schema version and active capabilities */
  meta?: ServerMeta;
}

/**
 * GET /api/figma-mcp/capabilities
 *
 * Direct-only: uses WebSocket bridge to plugin. No legacy MCP fallback.
 */
export async function handleGetFigmaMcpCapabilities(c: Context, deps: FigmaMcpCapabilitiesRouteDeps): Promise<Response> {
  const getConnInfoFn = deps.getConnInfoFn ?? getConnInfo;
  const internalToken = deps.internalToken ?? process.env.DS_DASHBOARD_INTERNAL_TOKEN;
  const getHeartbeatStatusFn = deps.getFigmaMcpHeartbeatStatusFn ?? (() => getFigmaMcpHeartbeatStatus());

  const connInfo = getConnInfoFn(c);
  // Unified loopback detection using helper with resolved connInfo
  const isLoopback = isLoopbackRequest(c, connInfo);

  // Authorization: loopback or internal token
  if (!isLoopback) {
    const receivedToken = String(c.req.header('x-ds-dashboard-internal-token') || '').trim();
    const hasValidToken = Boolean(internalToken && receivedToken && receivedToken === internalToken);
    if (!hasValidToken) {
      return c.json(
        {
          ok: false,
          code: 'capabilities.forbidden_remote',
          message: 'Endpoint only accessible from loopback or with internal token.',
        },
        403
      );
    }
  }

  const currentPort = getActiveMcpPort();

  // Get connection state from PluginConnectionManager
  const manager = getPluginConnectionManager();
  const wsAlive = manager.getConnectionCount() > 0;
  const heartbeatAlive = getHeartbeatStatusFn().alive;

  // Direct-only mode: always 'direct'
  const transportMode: 'direct' = 'direct';

  // Use pure function for liveness resolution
  const liveness = resolveLiveness({
    mode: transportMode,
    wsAlive,
    heartbeatAlive,
    pingConnected: false, // No legacy ping in direct-only
  });

  // Fetch capabilities from plugin via direct WebSocket
  let tools: string[] = [];
  let toolsDiscoveryError: string | undefined;
  let capabilities: BridgeCapabilities | null = null;

  if (wsAlive) {
    try {
      const capabilitiesResult = await fetchBridgeCapabilitiesDirect();
      tools = capabilitiesResult.supportedMethods;
      capabilities = mapBridgeMethodsToCapabilities(tools);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toolsDiscoveryError = `Failed to fetch capabilities: ${message}`;
      // Keep capabilities as null - don't assume capabilities
    }
  } else {
    toolsDiscoveryError = 'No plugin connection available';
  }

  // Use mapped capabilities or defaults
  const supports = capabilities?.supports ?? {
    searchNodes: false,
    getChildren: false,
    searchStyles: false,
    searchVariables: false,
    portSwitch: false,
  };
  const supportsV2 = capabilities?.supportsV2 ?? {
    hasFileInfo: false,
    hasComponent: false,
    hasLocalStyles: false,
    hasVariablesData: false,
    hasPortSwitch: false,
  };

  // Use pure function for disconnection cause
  const disconnectionCauseResult = resolveDisconnectionCause(liveness, {
    mode: transportMode,
    wsAlive,
    heartbeatAlive,
    pingConnected: false,
  }, undefined);

  const mcpCode = liveness.alive
    ? 'ws.connected'
    : (liveness.source === 'none' ? 'ws.not_connected' : 'ws.disconnected');
  const mcpMessage = liveness.alive
    ? 'Connected via direct WebSocket session.'
    : 'No direct WebSocket connection available. Open the Figma plugin.';

  const response: CapabilitiesResponse = {
    ok: true,
    tools,
    ...(toolsDiscoveryError ? { toolsDiscoveryError } : {}),
    transport: {
      mode: transportMode as 'direct' | 'ws' | 'none',
      wsAlive,
      heartbeatAlive,
      livenessSource: liveness.source,
    },
    ...(disconnectionCauseResult.code !== 'none' ? { disconnectionCause: disconnectionCauseResult } : {}),
    supports,
    supportsV2,
    mcp: {
      connected: liveness.alive,
      code: mcpCode,
      message: mcpMessage,
      currentPort,
      portFallbackUsed: false,
      availablePorts: ALLOWED_PORTS,
      activePort: currentPort,
    },
    meta: buildServerMeta(),
  };

  return c.json(response, 200);
}

export function registerFigmaMcpCapabilitiesRoute(
  app: { get: (path: string, handler: (c: Context) => Response | Promise<Response>) => void },
  deps: FigmaMcpCapabilitiesRouteDeps = {}
): void {
  app.get('/api/figma-mcp/capabilities', (c) => handleGetFigmaMcpCapabilities(c, deps));
}
