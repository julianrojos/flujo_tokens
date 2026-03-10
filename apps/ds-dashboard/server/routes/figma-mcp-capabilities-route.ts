/**
 * Figma MCP Capabilities Route
 *
 * Discovers available MCP tools and connection state.
 */

import type { Context } from 'hono';
import type { ConnInfo } from '@hono/node-server/conninfo';
import { getConnInfo } from '@hono/node-server/conninfo';
import { pingFigmaMcpService, listMcpToolsService } from '../services/figma-mcp-ping-service.ts';
import { getActiveMcpPort } from '../services/figma-mcp-runtime-state.ts';
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
}

const ALLOWED_PORTS = [9223, 9224, 9225, 9226, 9227];

interface CapabilitiesResponse {
  ok: true;
  tools: string[];
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
    const pingResult = await pingFn();
    
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
      // listTools failed - return error response
      return c.json(
        {
          ok: false,
          code: toolsResult.code ?? 'mcp.list_tools_failed',
          message: toolsResult.message ?? 'Failed to list MCP tools.',
        },
        200
      );
    }

    // Build capabilities response
    const response: CapabilitiesResponse = {
      ok: true,
      tools,
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
