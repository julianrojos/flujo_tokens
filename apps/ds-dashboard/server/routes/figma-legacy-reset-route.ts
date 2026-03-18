/**
 * Figma MCP Reset Route
 *
 * DEPRECATED: Legacy MCP reset endpoint.
 * In direct-only mode, this endpoint returns unsupported.
 */

import type { Context } from 'hono';
import { getConnInfo } from '@hono/node-server/conninfo';
import { isLoopbackAddress } from '../lib/loopback-utils.ts';

export interface FigmaMcpResetRouteDeps {
  getConnInfoFn?: (c: Context) => ReturnType<typeof getConnInfo>;
}

/**
 * POST /api/figma-mcp/reset
 *
 * DEPRECATED: Legacy endpoint. Returns unsupported in direct-only mode.
 */
export async function handleFigmaMcpResetRoute(c: Context, _deps: FigmaMcpResetRouteDeps = {}): Promise<Response> {
  const getConnInfoFn = _deps.getConnInfoFn ?? getConnInfo;
  const connInfo = getConnInfoFn(c);
  const remoteAddress = String(connInfo?.remote?.address || '').trim();
  
  // Only allow from loopback
  if (!remoteAddress || !isLoopbackAddress(remoteAddress)) {
    return c.json(
      {
        ok: false,
        restarting: false,
        code: 'mcp_reset.forbidden_remote',
        message: 'MCP reset is allowed only from loopback clients.',
      },
      403
    );
  }

  return c.json(
    {
      ok: false,
      restarting: false,
      code: 'legacy_endpoint_removed',
      message: 'Legacy MCP reset endpoint has been removed. Direct WebSocket mode does not require reset. Simply reload the Figma plugin if needed.',
      deprecated: true,
    },
    410 // Gone
  );
}

export function registerFigmaMcpResetRoute(
  app: { post: (path: string, handler: (c: Context) => Response | Promise<Response>) => void },
  deps: FigmaMcpResetRouteDeps = {}
): void {
  app.post('/api/figma-mcp/reset', (c) => handleFigmaMcpResetRoute(c, deps));
}
