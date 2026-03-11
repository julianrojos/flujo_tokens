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
import { isLoopbackAddress } from '../lib/loopback-utils.ts';
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

    if (!pingResult.connected) {
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
    const toolsResult = await listToolsFn();

    // Build capabilities from real tools
    const tools: string[] = [];
    const supports = {
      searchNodes: false,
      getChildren: false,
      searchStyles: false,
      searchVariables: false,
      portSwitch: true,
    };

    let toolsDiscoveryError: string | undefined;
    if (toolsResult.ok) {
      for (const tool of toolsResult.tools) {
        tools.push(tool.name);

        // Map tool names to capabilities
        if (tool.name === 'figma_search_nodes') supports.searchNodes = true;
        if (tool.name === 'figma_list_nodes' || tool.name === 'figma_get_children') supports.getChildren = true;
        if (tool.name === 'figma_search_styles' || tool.name === 'figma_get_styles') supports.searchStyles = true;
        if (tool.name === 'figma_search_variables' || tool.name === 'figma_get_variables') supports.searchVariables = true;
      }
    } else {
      toolsDiscoveryError = String(toolsResult.message || toolsResult.code || 'Failed to list MCP tools.');
    }
    // If listTools failed we still return ok:true — the ping already confirmed
    // the MCP connection is healthy.  The caller can act on an empty tools list
    // without showing a false "disconnected" state to the designer.

    // Build capabilities response
    const response: CapabilitiesResponse = {
      ok: true,
      tools,
      ...(toolsDiscoveryError ? { toolsDiscoveryError } : {}),
      supports,
      mcp: {
        connected: true,
        code: pingResult.code || 'mcp.connected',
        message: pingResult.message || 'MCP client is healthy.',
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
