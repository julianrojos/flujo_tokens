/**
 * Figma MCP Ping Route
 *
 * DEPRECATED: Legacy MCP ping endpoint.
 * In direct-only mode, this endpoint returns unsupported.
 * Use /api/figma-mcp/capabilities for connection status.
 */

import type { Context } from 'hono';

export interface FigmaMcpPingRouteDeps {
  failJson?: (
    c: Context,
    statusCode: number,
    args: { code: string; userMessage: string; recoverable: boolean }
  ) => Response | Promise<Response>;
}

/**
 * POST /api/figma-mcp/ping
 *
 * DEPRECATED: Legacy endpoint. Returns unsupported in direct-only mode.
 */
export async function handleFigmaMcpPing(c: Context, _deps: FigmaMcpPingRouteDeps = {}): Promise<Response> {
  return c.json(
    {
      ok: false,
      code: 'legacy_endpoint_removed',
      message: 'Legacy MCP ping endpoint has been removed. Use direct WebSocket bridge mode. Open the Figma plugin and use /api/figma-mcp/capabilities to check connection status.',
      deprecated: true,
      migration: {
        directMode: true,
        capabilitiesEndpoint: '/api/figma-mcp/capabilities',
      },
    },
    410 // Gone
  );
}

export function registerFigmaMcpPingRoute(
  app: { post: (path: string, handler: (c: Context) => Response | Promise<Response>) => void },
  deps: FigmaMcpPingRouteDeps = {}
): void {
  app.post('/api/figma-mcp/ping', (c) => handleFigmaMcpPing(c, deps));
}
