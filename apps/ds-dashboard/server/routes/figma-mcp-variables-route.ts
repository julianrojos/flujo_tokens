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
import { getFigmaMcpHeartbeatStatus } from '../services/figma-mcp-heartbeat-state.ts';
import { isLoopbackAddress } from '../lib/loopback-utils.ts';

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
  const getHeartbeatStatusFn =
    deps.getFigmaMcpHeartbeatStatusFn ?? (() => getFigmaMcpHeartbeatStatus());
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

  try {
    let result: FigmaMcpVariablesServiceResult;
    try {
      result = await fetchFigmaMcpVariablesFn({ figmaUrl });
    } catch (firstError) {
      const firstMessage = firstError instanceof Error ? firstError.message : String(firstError);
      const heartbeatAlive = getHeartbeatStatusFn().alive;
      const disconnected = isRecoverableMcpVariablesFailure(firstMessage);
      if (!heartbeatAlive || !disconnected) {
        throw firstError;
      }
      disposePingFn();
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
