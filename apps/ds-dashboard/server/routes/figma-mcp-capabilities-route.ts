/**
 * Figma MCP Capabilities Route
 *
 * Discovers available MCP tools and connection state.
 */

import type { Context } from 'hono';
import type { ConnInfo } from '@hono/node-server/conninfo';
import { getConnInfo } from '@hono/node-server/conninfo';
import {
  pingFigmaMcpService,
  listMcpToolsService,
  disposeFigmaMcpPingService,
  terminateCompetingFigmaMcpProcessesService,
} from '../services/figma-mcp-ping-service.ts';
import { getActiveMcpPort } from '../services/figma-mcp-runtime-state.ts';
import { getFigmaMcpHeartbeatStatus } from '../services/figma-mcp-heartbeat-state.ts';
import { getPluginConnectionManager } from '../services/plugin-connection-manager.ts';
import { isLoopbackAddress } from '../lib/loopback-utils.ts';
import { resolveLiveness, resolveDisconnectionCause } from '../lib/resolve-liveness.ts';
import type { TransportMode } from '../lib/resolve-liveness.ts';
import { getTransportMode } from '../lib/transport-mode.ts';
import type { McpListToolsResult, McpListToolsError } from '../../../../tooling/src/services/figma-mcp-variables.js';

interface CapabilitiesPingResult {
  connected: boolean;
  currentPort?: number;
  message?: string;
  code?: string;
}

export interface FigmaMcpCapabilitiesRouteDeps {
  getConnInfoFn?: (c: Context) => ConnInfo;
  internalToken?: string;
  pingFigmaMcpServiceFn?: () => Promise<CapabilitiesPingResult>;
  listMcpToolsServiceFn?: () => Promise<McpListToolsResult | McpListToolsError>;
  disposeFigmaMcpPingServiceFn?: () => void;
  terminateCompetingFigmaMcpProcessesFn?: () => Promise<void>;
  getFigmaMcpHeartbeatStatusFn?: () => { alive: boolean };
}

const ALLOWED_PORTS = [9223, 9224, 9225, 9226, 9227, 9228, 9229, 9230, 9231, 9232];

interface CapabilitiesResponse {
  ok: true;
  tools: string[];
  toolsDiscoveryError?: string;
  transport: {
    mode: TransportMode;
    /** Active direct WS connections */
    wsAlive: boolean;
    /** Legacy HTTP heartbeat alive */
    heartbeatAlive: boolean;
    /** Source of liveness determination */
    livenessSource?: 'ws' | 'legacy' | 'hybrid' | 'none';
  };
  disconnectionCause?: {
    code: string;
    message: string;
  };
  supports: {
    searchNodes: boolean;
    getChildren: boolean;
    searchStyles: boolean;
    searchVariables: boolean;
    portSwitch: boolean;
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
}

/**
 * Returns true when disposing (killing) the shared MCP process before retrying
 * is the right recovery strategy.
 *
 * mcp.not_connected   → figma-console-mcp is running but no Figma plugin has
 *   connected yet (normal during ws-runtime reconnect window).  Killing the
 *   process resets the WS server port and forces the plugin to rediscover it,
 *   making things worse.  Just retry — ensureMcpConnectivity will poll until
 *   the plugin reconnects.
 *
 * mcp.instance_mismatch → the dashboard's process is on a fallback port while
 *   the plugin is connected to a different instance.  Disposing our process and
 *   spawning a fresh one gives a chance to land on the same port.
 *   NOTE: We handle this separately by terminating competitors first, then retrying
 *   without disposing our process.
 *
 * process-level errors (EPIPE, stdin closed, etc.) → the stdio pipe is broken;
 *   disposing and respawning is the only option.  Note: pingSharedFigmaMcp
 *   already handles these internally, so this path rarely triggers here.
 */
function shouldDisposeBeforeRetry(pingResult: CapabilitiesPingResult): boolean {
  const code = String(pingResult.code || '').trim();
  const message = String(pingResult.message || '').toLowerCase();
  const isBrokenProcess =
    message.includes('stdin stream is closed') ||
    message.includes('write after end') ||
    message.includes('epipe') ||
    message.includes('econnreset') ||
    message.includes('exited before responding') ||
    message.includes('failed to start mcp server process');
  // Dispose ONLY for broken-process errors; NOT for mcp.not_connected or instance_mismatch.
  // instance_mismatch is handled by terminating competitors and retrying without dispose.
  return isBrokenProcess;
}

/**
 * Check if a request is authorized for MCP management endpoints.
 * Fail-closed: empty remoteAddress requires valid token.
 */
function isAuthorized(c: Context, internalToken: string | undefined, getConnInfoFn: (c: Context) => ConnInfo): boolean {
  const connInfo = getConnInfoFn(c);
  const remoteAddress = String(connInfo?.remote?.address || '').trim();

  // Loopback is always allowed
  if (remoteAddress && isLoopbackAddress(remoteAddress)) {
    return true;
  }

  // Non-loopback or empty remoteAddress requires valid token
  if (!internalToken) {
    return false;
  }

  const receivedToken = String(c.req.header('x-ds-dashboard-internal-token') || '').trim();
  return receivedToken === internalToken;
}

/**
 * GET /api/figma-mcp/capabilities
 * 
 * Returns available MCP tools and connection state.
 */
export async function handleGetFigmaMcpCapabilities(c: Context, deps: FigmaMcpCapabilitiesRouteDeps): Promise<Response> {
  const getConnInfoFn = deps.getConnInfoFn ?? getConnInfo;
  const internalToken = deps.internalToken ?? process.env.DS_DASHBOARD_INTERNAL_TOKEN;

  // Authorization check: fail-closed
  if (!isAuthorized(c, internalToken, getConnInfoFn)) {
    return c.json(
      {
        ok: false,
        code: 'capabilities.forbidden_remote',
        message: 'Endpoint allowed only from loopback or with internal token.',
      },
      403
    );
  }

  const transportMode = getTransportMode();
  const activePort = getActiveMcpPort();
  const envConfiguredPort = Number.parseInt(String(process.env.FIGMA_WS_PORT || activePort), 10);
  const currentPort = Number.isFinite(envConfiguredPort) ? envConfiguredPort : activePort;

  try {
    // Ping MCP to check connectivity
    const pingFn = deps.pingFigmaMcpServiceFn ?? pingFigmaMcpService;
    const disposePingFn = deps.disposeFigmaMcpPingServiceFn ?? disposeFigmaMcpPingService;
    const terminateCompetingFn = deps.terminateCompetingFigmaMcpProcessesFn ?? terminateCompetingFigmaMcpProcessesService;
    const getHeartbeatStatusFn =
      deps.getFigmaMcpHeartbeatStatusFn ?? (() => getFigmaMcpHeartbeatStatus());
    let pingResult = await pingFn();

    // Self-heal when the plugin heartbeat is alive but MCP is not connected.
    // Only dispose (kill + respawn) when that is actually the right strategy;
    // for mcp.not_connected we retry with the existing process so we don't
    // disrupt the ws-runtime reconnect window.
    if (!pingResult.connected) {
      const heartbeat = getHeartbeatStatusFn();
      const isProcessError = shouldDisposeBeforeRetry(pingResult);
      const code = String(pingResult.code || '').trim();
      const isInstanceMismatch = code === 'mcp.instance_mismatch';

      // Retry policy:
      // - heartbeat alive: plugin may still be in WS reconnect window
      // - process error: stdio/child process is broken, retry even if heartbeat expired
      // - instance_mismatch: competing MCP processes on different ports, clean up first
      if (heartbeat.alive || isProcessError || isInstanceMismatch) {
        if (isInstanceMismatch) {
          // Clean up competing MCP processes before retry to resolve port conflicts
          // Best-effort cleanup: if it fails, continue with retry anyway
          try {
            await terminateCompetingFn();
          } catch {
            // best-effort cleanup
          }
        }
        if (isProcessError) {
          disposePingFn();
        }
        pingResult = await pingFn();
      }
    }

    if (!pingResult.connected && transportMode === 'legacy') {
      return c.json(
        {
          ok: false,
          code: pingResult.code || 'mcp.not_connected',
          message: pingResult.message || 'MCP client not connected.',
        },
        200
      );
    }

    // List available tools
    const listToolsFn = deps.listMcpToolsServiceFn ?? listMcpToolsService;
    // In direct mode, try to get tools even if legacy ping is down - WS might be alive
    const shouldTryListTools = pingResult.connected || (transportMode === 'direct' || transportMode === 'shadow');
    
    let toolsResult: Awaited<ReturnType<typeof listToolsFn>>;
    if (shouldTryListTools) {
      // Wrap listToolsFn in local try/catch to prevent it from breaking the entire response
      // when WS is alive but legacy tools discovery fails
      try {
        toolsResult = await listToolsFn();
      } catch (toolsError) {
        console.warn('[capabilities] listToolsFn failed:', toolsError instanceof Error ? toolsError.message : toolsError);
        toolsResult = {
          ok: false,
          code: 'tools_list_failed',
          message: toolsError instanceof Error ? toolsError.message : String(toolsError),
        };
      }
    } else {
      toolsResult = { ok: false, code: pingResult.code ?? 'mcp.not_connected', message: pingResult.message ?? 'MCP not connected' };
    }

    // Build capabilities response - use resolveLiveness for single source of truth
    // Get real wsAlive from PluginConnectionManager (if available)
    let wsAlive = false;
    try {
      const manager = getPluginConnectionManager();
      wsAlive = manager.getConnectionCount() > 0;
    } catch {
      // Manager not available yet - stay with legacy mode
      wsAlive = false;
    }

    const heartbeatAlive = getHeartbeatStatusFn().alive;
    const pingConnected = pingResult.connected;

    // Use pure function for liveness resolution
    const liveness = resolveLiveness({
      mode: transportMode,
      wsAlive,
      heartbeatAlive,
      pingConnected,
    });

    // Build capabilities from real tools
    const tools: string[] = [];
    // Default supports to false (pessimistic) - we'll set to true only when we confirm real tools
    // This prevents promising operations that an older plugin might not support
    const supports = {
      searchNodes: false,
      getChildren: false,
      searchStyles: false,
      searchVariables: false,
      portSwitch: true,
    };

    let toolsDiscoveryError: string | undefined;
    if (toolsResult.ok && 'tools' in toolsResult && toolsResult.tools) {
      for (const tool of toolsResult.tools) {
        tools.push(tool.name);

        // Map tool names to capabilities
        if (tool.name === 'figma_search_nodes') supports.searchNodes = true;
        if (tool.name === 'figma_list_nodes' || tool.name === 'figma_get_children') supports.getChildren = true;
        if (tool.name === 'figma_search_styles' || tool.name === 'figma_get_styles') supports.searchStyles = true;
        if (tool.name === 'figma_search_variables' || tool.name === 'figma_get_variables') supports.searchVariables = true;
      }
    } else {
      // Prioritize message over code for human-readable error
      const errorCode = 'code' in toolsResult ? String(toolsResult.code || '') : '';
      const errorMessage = 'message' in toolsResult ? String(toolsResult.message || '') : '';
      toolsDiscoveryError = errorMessage || errorCode || 'Failed to list MCP tools.';
    }

    // Use pure function for disconnection cause
    const disconnectionCauseResult = resolveDisconnectionCause(liveness, {
      mode: transportMode,
      wsAlive,
      heartbeatAlive,
      pingConnected,
    }, pingResult.code);

    const mcpCode = pingConnected
      ? (pingResult.code || 'mcp.connected')
      : (liveness.alive ? 'ws.connected' : (pingResult.code || 'mcp.not_connected'));
    const mcpMessage = pingConnected
      ? (pingResult.message || 'MCP client is healthy.')
      : (liveness.alive ? 'Connected via direct WebSocket session.' : (pingResult.message || 'MCP client not connected.'));

    // Include liveness source in response
    const response: CapabilitiesResponse = {
      ok: true,
      tools,
      ...(toolsDiscoveryError ? { toolsDiscoveryError } : {}),
      transport: {
        mode: transportMode,
        wsAlive,
        heartbeatAlive,
        livenessSource: liveness.source,
      },
      ...(disconnectionCauseResult.code !== 'none' ? { disconnectionCause: disconnectionCauseResult } : {}),
      supports,
      mcp: {
        connected: liveness.alive,
        code: mcpCode,
        message: mcpMessage,
        currentPort: pingResult.currentPort ?? currentPort,
        portFallbackUsed: false,
        availablePorts: ALLOWED_PORTS,
        activePort,
      },
    };

    return c.json(response, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    // Classify error
    if (message.toLowerCase().includes('timeout')) {
      return c.json(
        {
          ok: false,
          code: 'mcp.timeout',
          message: 'MCP ping timed out.',
        },
        200
      );
    }

    return c.json(
      {
        ok: false,
        code: 'mcp.not_connected',
        message: `MCP connection check failed: ${message}`,
      },
      200
    );
  }
}

export function registerFigmaMcpCapabilitiesRoute(
  app: { get: (path: string, handler: (c: Context) => Response | Promise<Response>) => void },
  deps: FigmaMcpCapabilitiesRouteDeps = {}
): void {
  app.get('/api/figma-mcp/capabilities', (c) => handleGetFigmaMcpCapabilities(c, deps));
}
