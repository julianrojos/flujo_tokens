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
  type FigmaMcpVariablesServiceArgs,
  type FigmaMcpVariablesServiceResult,
} from '../services/figma-mcp-ping-service.ts';
import { isLoopbackAddress } from '../lib/loopback-utils.ts';

export interface FigmaMcpVariablesRouteDeps {
  readJsonBody?: (c: Context) => Promise<Record<string, unknown>>;
  fetchFigmaMcpVariablesFn?: (
    args: FigmaMcpVariablesServiceArgs
  ) => Promise<FigmaMcpVariablesServiceResult>;
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
 * POST /api/figma-mcp-variables
 *
 * Fetches Figma local variables using the shared (long-lived) MCP client —
 * the one the bridge plugin is already connected to.
 *
 * This endpoint is called by the tokens-from-figma sync subprocess when it
 * detects it is running inside the dashboard server context (via the
 * DS_DASHBOARD_INTERNAL_URL env var). It avoids the subprocess-port-mismatch
 * problem: subprocesses that spawn their own figma-console-mcp land on
 * fallback ports that the bridge plugin has never seen.
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
    const result = await fetchFigmaMcpVariablesFn({ figmaUrl });
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
