/**
 * Figma MCP Reconcile Route
 *
 * DEPRECATED: Legacy MCP reconcile endpoint.
 * In direct-only mode, this endpoint returns unsupported.
 * Direct WebSocket mode self-heals automatically.
 */

import type { Context } from 'hono';
import type { ConnInfo } from '@hono/node-server/conninfo';
import { getConnInfo } from '@hono/node-server/conninfo';
import { isLoopbackAddress } from '../lib/loopback-utils.ts';

export interface FigmaMcpReconcileRouteDeps {
  getConnInfoFn?: (c: Context) => ConnInfo;
}

interface ReconcileRouteResponse {
  ok: boolean;
  connected: boolean;
  code?: string;
  message: string;
  attemptedReset: boolean;
  restarting: boolean;
  phase: 'legacy_removed' | 'input_error';
}

/**
 * POST /api/figma-mcp/reconcile
 *
 * DEPRECATED: Legacy endpoint. Returns unsupported in direct-only mode.
 * Direct WebSocket mode self-heals automatically via reconnection logic.
 */
export async function handleFigmaMcpReconcileRoute(c: Context, _deps: FigmaMcpReconcileRouteDeps = {}): Promise<Response> {
  const getConnInfoFn = _deps.getConnInfoFn ?? getConnInfo;
  const connInfo = getConnInfoFn(c);
  const remoteAddress = String(connInfo?.remote?.address || '').trim();
  
  // Only allow from loopback
  if (!remoteAddress || !isLoopbackAddress(remoteAddress)) {
    return c.json(
      {
        ok: false,
        connected: false,
        code: 'mcp_reconcile.forbidden_remote',
        message: 'MCP reconcile is allowed only from loopback clients.',
        attemptedReset: false,
        restarting: false,
        phase: 'input_error',
      },
      403
    );
  }

  const response: ReconcileRouteResponse = {
    ok: false,
    connected: false,
    code: 'legacy_endpoint_removed',
    message: 'Legacy MCP reconcile endpoint has been removed. Direct WebSocket mode self-heals automatically. If connection fails, simply reload the Figma plugin.',
    attemptedReset: false,
    restarting: false,
    phase: 'legacy_removed',
  };

  return c.json(response, 410); // Gone
}

export function registerFigmaMcpReconcileRoute(
  app: { post: (path: string, handler: (c: Context) => Response | Promise<Response>) => void },
  deps: FigmaMcpReconcileRouteDeps = {}
): void {
  app.post('/api/figma-mcp/reconcile', (c) => handleFigmaMcpReconcileRoute(c, deps));
}
