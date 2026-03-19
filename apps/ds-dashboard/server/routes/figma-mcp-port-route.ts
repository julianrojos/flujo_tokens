/**
 * Figma MCP Port Route
 *
 * Read-only endpoint for current MCP port state.
 */

import type { Context } from 'hono';
import type { ConnInfo } from '@hono/node-server/conninfo';
import { getConnInfo } from '@hono/node-server/conninfo';
import { getFigmaMcpRuntimeState } from '../services/figma-mcp-runtime-state.ts';
import { isLoopbackAddress } from '../lib/loopback-utils.ts';

export interface FigmaMcpPortRouteDeps {
  getConnInfoFn?: (c: Context) => ConnInfo;
  internalToken?: string;
}

/**
 * Check if a request is authorized for MCP management endpoints.
 */
function isAuthorized(
  c: Context,
  internalToken: string | undefined,
  getConnInfoFn: (c: Context) => ConnInfo
): boolean {
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
 * GET /api/figma-mcp/port
 *
 * Returns current MCP runtime state (read-only).
 */
export async function handleGetFigmaMcpPort(c: Context, deps: FigmaMcpPortRouteDeps): Promise<Response> {
  const getConnInfoFn = deps.getConnInfoFn ?? getConnInfo;
  const internalToken = deps.internalToken ?? process.env.DS_DASHBOARD_INTERNAL_TOKEN;

  // Authorization check: fail-closed
  if (!isAuthorized(c, internalToken, getConnInfoFn)) {
    return c.json(
      {
        ok: false,
        code: 'port.forbidden_remote',
        message: 'Endpoint allowed only from loopback or with internal token.',
      },
      403
    );
  }

  const state = getFigmaMcpRuntimeState();

  return c.json({
    ok: true,
    activePort: state.activePort,
    allowedRange: state.allowedRange,
    lastChangeAt: state.lastChangeAt,
  });
}

export function registerFigmaMcpPortRoute(
  app: {
    get: (path: string, handler: (c: Context) => Response | Promise<Response>) => void;
  },
  deps: FigmaMcpPortRouteDeps = {}
): void {
  app.get('/api/figma-mcp/port', (c) => handleGetFigmaMcpPort(c, deps));
}
