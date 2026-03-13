/**
 * Figma MCP Variables Route
 *
 * Handles fetching Figma local variables using direct plugin WebSocket bridge.
 * Direct-only mode: no legacy MCP stdio fallback.
 *
 * This endpoint is called by the tokens-from-figma sync subprocess when it
 * detects it is running inside the dashboard server context (via the
 * DS_DASHBOARD_INTERNAL_URL env var). It uses the direct WebSocket bridge
 * to communicate with the plugin, avoiding the subprocess-port-mismatch
 * problem.
 *
 * Body (JSON):
 *   figmaUrl?: string  – Figma file URL (used to scope the variable fetch)
 *
 * Response (JSON):
 *   { ok: true, meta: { variables: {...}, variableCollections: {...} } }
 *   { ok: false, code: string, message: string }
 */

import type { Context } from 'hono';
import type { ConnInfo } from '@hono/node-server/conninfo';
import { getConnInfo } from '@hono/node-server/conninfo';
import { isLoopbackAddress } from '../lib/loopback-utils.ts';
import { fetchVariablesDirect } from '../services/figma-direct-bridge-service.ts';
import { getPluginConnectionManager } from '../services/plugin-connection-manager.ts';

export interface FigmaMcpVariablesRouteDeps {
  readJsonBody?: (c: Context) => Promise<Record<string, unknown>>;
  getConnInfoFn?: (c: Context) => ConnInfo;
  internalToken?: string;
}

function isTrustedInternalRequest(c: Context, deps: FigmaMcpVariablesRouteDeps): boolean {
  const expectedToken = String(deps?.internalToken ?? process.env.DS_DASHBOARD_INTERNAL_TOKEN ?? '').trim();
  if (!expectedToken) return false;
  const receivedToken = String(c.req.header('x-ds-dashboard-internal-token') || '').trim();
  return Boolean(receivedToken) && receivedToken === expectedToken;
}

/**
 * Extract fileKey from Figma URL
 */
function extractFileKey(url: string): string | null {
  try {
    // Match Figma URL patterns:
    // https://www.figma.com/file/FILEKEY/...
    // https://www.figma.com/design/FILEKEY/...
    const match = url.match(/figma\.com\/(?:file|design)\/([a-zA-Z0-9]+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * POST /api/figma-mcp-variables
 *
 * Direct-only: uses WebSocket bridge to plugin. No legacy fallback.
 */
export async function handleFigmaMcpVariablesRoute(
  c: Context,
  deps: FigmaMcpVariablesRouteDeps
): Promise<Response> {
  const readJsonBody = deps.readJsonBody ?? (async (ctx: Context) => await ctx.req.json());
  const getConnInfoFn = deps.getConnInfoFn ?? getConnInfo;

  const connInfo = getConnInfoFn(c);
  const remoteAddress = String(connInfo?.remote?.address || '').trim();
  const trustedInternal = isTrustedInternalRequest(c, deps);
  const isLoopback = remoteAddress ? isLoopbackAddress(remoteAddress) : false;
  if (!isLoopback && !trustedInternal) {
    return c.json(
      {
        ok: false,
        code: 'mcp_variables.forbidden_remote',
        message: 'MCP variables endpoint is allowed only from loopback clients or trusted internal requests.',
      },
      403,
    );
  }

  const body = await readJsonBody(c);
  const figmaUrl = String(body.figmaUrl || '').trim() || undefined;
  let fileKey = figmaUrl ? extractFileKey(figmaUrl) : null;

  // Direct-only mode: use direct WebSocket bridge
  // Ambiguity guard: when fileKey is not provided, check for multiple files
  if (!fileKey) {
    const manager = getPluginConnectionManager();
    const connectionCount = manager.getConnectionCount();
    const activeFileKeys = manager.getActiveFileKeys();

    if (connectionCount === 0) {
      return c.json(
        {
          ok: false,
          code: 'mcp_variables.no_socket',
          message: 'No plugin connection available. Open the Figma plugin and provide a figmaUrl.',
        },
        200
      );
    }

    // True ambiguity: multiple different files connected
    if (activeFileKeys.length > 1) {
      return c.json(
        {
          ok: false,
          code: 'mcp_variables.ambiguous_file_key',
          message: 'Multiple plugin connections for different files detected. Provide a figmaUrl to specify which file to fetch variables from.',
        },
        200
      );
    }

    // Auto-resolve: single fileKey from active connections
    if (activeFileKeys.length === 1) {
      fileKey = activeFileKeys[0];
    }
    // If activeFileKeys.length === 0 but connectionCount > 0:
    // - If connectionCount === 1: allow draft/unkeyed file (fileKey remains null)
    // - If connectionCount > 1: multiple unkeyed connections is ambiguous
    else if (connectionCount > 1) {
      return c.json(
        {
          ok: false,
          code: 'mcp_variables.ambiguous_file_key',
          message: 'Multiple plugin connections without fileKey detected. Provide a figmaUrl to specify which file to fetch variables from.',
        },
        200
      );
    }
    // else: connectionCount === 1 && activeFileKeys.length === 0 → draft file, allow with fileKey = null
  }

  try {
    const directResult = await fetchVariablesDirect(fileKey);
    return c.json({ ok: true, meta: directResult.meta }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    
    // Check for specific error conditions
    if (message.includes('ws.request.no_socket_for_file')) {
      return c.json(
        {
          ok: false,
          code: 'mcp_variables.no_socket',
          message: 'No plugin connection available. Open the Figma plugin and ensure it is connected.',
        },
        200
      );
    }
    
    return c.json(
      {
        ok: false,
        code: 'mcp_variables.direct_failed',
        message,
      },
      200
    );
  }
}

export function registerFigmaMcpVariablesRoute(
  app: { post: (path: string, handler: (c: Context) => Response | Promise<Response>) => void },
  deps: FigmaMcpVariablesRouteDeps
): void {
  app.post('/api/figma-mcp-variables', (c) => handleFigmaMcpVariablesRoute(c, deps));
}
