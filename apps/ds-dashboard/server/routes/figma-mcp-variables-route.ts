/**
 * Figma MCP Variables Route
 *
 * Handles fetching Figma local variables using the shared MCP client.
 */

import type { Context } from 'hono';
import type { ConnInfo } from '@hono/node-server/conninfo';
import { getConnInfo } from '@hono/node-server/conninfo';
import {
  fetchFigmaMcpVariablesService,
  disposeFigmaMcpPingService,
  type FigmaMcpVariablesServiceArgs,
  type FigmaMcpVariablesServiceResult,
} from '../services/figma-mcp-ping-service.ts';
import { isLoopbackAddress } from '../lib/loopback-utils.ts';
import { getTransportMode } from '../lib/transport-mode.ts';
import { fetchVariablesDirect } from '../services/figma-direct-bridge-service.ts';
import { getShadowModeExecutor } from '../services/shadow-parity.ts';
import { getPluginConnectionManager } from '../services/plugin-connection-manager.ts';

export interface FigmaMcpVariablesRouteDeps {
  readJsonBody?: (c: Context) => Promise<Record<string, unknown>>;
  fetchFigmaMcpVariablesFn?: (
    args: FigmaMcpVariablesServiceArgs
  ) => Promise<FigmaMcpVariablesServiceResult>;
  disposeFigmaMcpPingServiceFn?: () => void;
  getFigmaMcpHeartbeatStatusFn?: () => { alive: boolean };
  getConnInfoFn?: (c: Context) => ConnInfo;
  internalToken?: string;
}

function isTrustedInternalRequest(c: Context, deps: FigmaMcpVariablesRouteDeps): boolean {
  const expectedToken = String(deps?.internalToken ?? process.env.DS_DASHBOARD_INTERNAL_TOKEN ?? '').trim();
  if (!expectedToken) return false;
  const receivedToken = String(c.req.header('x-ds-dashboard-internal-token') || '').trim();
  return Boolean(receivedToken) && receivedToken === expectedToken;
}

function isRecoverableMcpVariablesFailure(message: string): boolean {
  const text = String(message || '').toLowerCase();
  return (
    text.includes('not connected') ||
    text.includes('no connection') ||
    text.includes('disconnected') ||
    text.includes('mcp.not_connected') ||
    text.includes('stdin stream is closed') ||
    text.includes('write after end') ||
    text.includes('epipe') ||
    text.includes('econnreset') ||
    text.includes('timed out')
  );
}

function shouldDisposeBeforeRetry(message: string): boolean {
  const text = String(message || '').toLowerCase();
  return (
    text.includes('stdin stream is closed') ||
    text.includes('write after end') ||
    text.includes('epipe') ||
    text.includes('econnreset') ||
    text.includes('exited before responding') ||
    text.includes('failed to start mcp server process')
  );
}

function isDirectSocketRoutingFailure(message: string): boolean {
  const text = String(message || '').toLowerCase();
  return (
    text.includes('ws.request.no_socket_for_file') ||
    text.includes('ws.request.no_connection') ||
    text.includes('ws.request.socket_not_open') ||
    text.includes('ws.connection.closed')
  );
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
 * Fetches Figma local variables using the shared (long-lived) MCP client —
 * the one the MCP Management is already connected to.
 *
 * This endpoint is called by the tokens-from-figma sync subprocess when it
 * detects it is running inside the dashboard server context (via the
 * DS_DASHBOARD_INTERNAL_URL env var). It avoids the subprocess-port-mismatch
 * problem: subprocesses that spawn their own MCP Management process land on
 * fallback ports that the MCP Management has never seen.
 *
 * Body (JSON):
 *   figmaUrl?: string  – Figma file URL (used to scope the variable fetch)
 *
 * Response (JSON):
 *   { ok: true, meta: { variables: {...}, variableCollections: {...} } }
 *   { ok: false, code: string, message: string }
 */
export async function handleFigmaMcpVariablesRoute(
  c: Context,
  deps: FigmaMcpVariablesRouteDeps
): Promise<Response> {
  const readJsonBody = deps.readJsonBody ?? (async (ctx: Context) => await ctx.req.json());
  const fetchFigmaMcpVariablesFn = deps.fetchFigmaMcpVariablesFn ?? fetchFigmaMcpVariablesService;
  const disposePingFn = deps.disposeFigmaMcpPingServiceFn ?? disposeFigmaMcpPingService;
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

  // Get transport mode
  const transportMode = getTransportMode();

  let fileKey = figmaUrl ? extractFileKey(figmaUrl) : null;

  // In direct/shadow mode, fileKey is required to avoid ambiguous routing
  // EXCEPTION: allow missing fileKey when there's exactly one active WS connection
  if ((transportMode === 'direct' || transportMode === 'shadow') && !fileKey) {
    // Check if there's exactly one active WS connection we can use
    const manager = getPluginConnectionManager();
    const connectionCount = manager.getConnectionCount();
    const activeFileKeys = manager.getActiveFileKeys();
    
    // Only allow fileKey omission when there's exactly one connection AND one fileKey
    if (connectionCount === 1 && activeFileKeys.length === 1) {
      fileKey = activeFileKeys[0];
    } else if (connectionCount > 1 || activeFileKeys.length > 1) {
      // Multiple connections - ambiguous, require explicit fileKey
      return c.json(
        {
          ok: false,
          code: 'mcp_variables.missing_file_key',
          message: 'fileKey is required in direct/shadow mode when multiple connections are active. Provide a valid figmaUrl.',
          _transport: transportMode,
        },
        400
      );
    } else {
      // No connections at all - require fileKey
      return c.json(
        {
          ok: false,
          code: 'mcp_variables.missing_file_key',
          message: 'fileKey is required in direct/shadow mode. Provide a valid figmaUrl.',
          _transport: transportMode,
        },
        400
      );
    }
  }

  // Direct/Shadow mode: try direct WS path first. Only fallback to legacy
  // if error is a routing failure (socket not found/not open), indicating
  // the plugin is not connected. Other errors (plugin-side failures) fail
  // fast without fallback to avoid masking real issues.
  if (transportMode === 'direct' || transportMode === 'shadow') {
    try {
      const directResult = await fetchVariablesDirect(fileKey!);
      if (transportMode === 'shadow') {
        const shadow = getShadowModeExecutor();
        shadow.runShadow(
          'variables',
          fileKey,
          async () => directResult.meta,
          async () => (await fetchFigmaMcpVariablesFn({ figmaUrl })).meta
        );
      }
      return c.json({ ok: true, meta: directResult.meta }, 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const canFallbackToLegacy =
        transportMode === 'shadow' ||
        (transportMode === 'direct' && isDirectSocketRoutingFailure(message));

      if (canFallbackToLegacy) {
        console.warn('[figma-mcp-variables] Direct bridge unavailable, falling back to legacy MCP:', message);
      } else {
        // In direct mode, keep strict behavior for non-routing failures from plugin responses.
        return c.json(
          {
            ok: false,
            code: 'mcp_variables.direct_failed',
            message,
            _transport: 'direct',
          },
          200
        );
      }
    }
  }

  try {
    let result: FigmaMcpVariablesServiceResult;
    try {
      result = await fetchFigmaMcpVariablesFn({ figmaUrl });
    } catch (firstError) {
      const firstMessage = firstError instanceof Error ? firstError.message : String(firstError);
      const disconnected = isRecoverableMcpVariablesFailure(firstMessage);
      if (!disconnected) {
        throw firstError;
      }
      if (shouldDisposeBeforeRetry(firstMessage)) {
        disposePingFn();
      }
      result = await fetchFigmaMcpVariablesFn({ figmaUrl });
    }
    return c.json({ ok: true, meta: result.meta }, 200);
  } catch (error) {
    return c.json(
      {
        ok: false,
        code: 'mcp_variables.fetch_failed',
        message: error instanceof Error ? error.message : String(error),
      },
      200,
    );
  }
}

export function registerFigmaMcpVariablesRoute(
  app: { post: (path: string, handler: (c: Context) => Response | Promise<Response>) => void },
  deps: FigmaMcpVariablesRouteDeps
): void {
  app.post('/api/figma-mcp-variables', (c) => handleFigmaMcpVariablesRoute(c, deps));
}
