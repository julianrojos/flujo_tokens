/**
 * Figma Plugin Debug Route
 *
 * Debug endpoint for WebSocket connections.
 * Protected like other MCP endpoints.
 */

import type { Context } from 'hono';
import { getConnInfo } from '@hono/node-server/conninfo';
import { checkDebugEndpointAuth } from '../lib/debug-endpoint-auth.ts';
import { getPluginConnectionManager } from '../services/plugin-connection-manager.ts';

export interface FigmaPluginDebugRouteDeps {
  internalToken?: string;
  getConnInfoFn?: (c: Context) => ReturnType<typeof getConnInfo>;
}

/**
 * GET /api/figma-plugin/debug
 *
 * Returns debug information about active plugin WebSocket connections.
 *
 * Authorization:
 * - Always allowed in development mode
 * - Allowed from loopback addresses
 * - Allowed with valid internal token
 */
export async function handleFigmaPluginDebug(c: Context, deps: FigmaPluginDebugRouteDeps): Promise<Response> {
  const internalToken = deps.internalToken ?? process.env.DS_DASHBOARD_INTERNAL_TOKEN;
  const getConnInfoFn = deps.getConnInfoFn ?? getConnInfo;
  const authResult = checkDebugEndpointAuth(c, internalToken, getConnInfoFn);

  if (!authResult.allowed) {
    return c.json(
      { ok: false, code: authResult.code, message: 'Debug endpoint only accessible from loopback, with internal token, or in development mode.' },
      403
    );
  }

  const manager = getPluginConnectionManager();
  const debugInfo = manager.getDebugInfo();
  return c.json({ ok: true, ...debugInfo });
}

export function registerFigmaPluginDebugRoute(
  app: { get: (path: string, handler: (c: Context) => Response | Promise<Response>) => void },
  deps: FigmaPluginDebugRouteDeps = {},
): void {
  app.get('/api/figma-plugin/debug', (c) => handleFigmaPluginDebug(c, deps));
}
