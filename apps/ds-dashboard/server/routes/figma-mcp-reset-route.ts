/**
 * Figma MCP Reset Route
 *
 * Handles reset requests for the Figma MCP service.
 */

import type { Context } from 'hono';
import type { ConnInfo } from '@hono/node-server/conninfo';
import { getConnInfo } from '@hono/node-server/conninfo';
import {
  disposeFigmaMcpPingService,
  warmupFigmaMcpPingService,
} from '../services/figma-mcp-ping-service.ts';
import { isLoopbackAddress } from '../lib/loopback-utils.ts';

export interface FigmaMcpResetRouteDeps {
  getConnInfoFn?: (c: Context) => ConnInfo;
  disposeFigmaMcpPingServiceFn?: () => void;
  warmupFigmaMcpPingServiceFn?: (args?: { env?: NodeJS.ProcessEnv }) => void;
  sleepMs?: number;
}

async function readResetBody(c: Context): Promise<Record<string, unknown>> {
  try {
    const body = await c.req.json();
    if (body && typeof body === 'object' && !Array.isArray(body)) {
      return body;
    }
  } catch {
    // no-op
  }
  return {};
}

/**
 * POST /api/figma-mcp/reset
 *
 * Resets MCP bridge sessions for this local dashboard instance.
 * Requires explicit confirmation in request body/header to avoid accidental
 * destructive calls from generic clients.
 */
export async function handleFigmaMcpResetRoute(
  c: Context,
  deps: FigmaMcpResetRouteDeps = {}
): Promise<Response> {
  const getConnInfoFn = deps.getConnInfoFn ?? getConnInfo;
  const disposeFn = deps.disposeFigmaMcpPingServiceFn ?? disposeFigmaMcpPingService;
  const warmupFn = deps.warmupFigmaMcpPingServiceFn ?? warmupFigmaMcpPingService;
  const sleepMs = deps.sleepMs ?? 800;

  const connInfo = getConnInfoFn(c);
  const remoteAddress = String(connInfo?.remote?.address || '').trim();
  if (!remoteAddress || !isLoopbackAddress(remoteAddress)) {
    return c.json(
      {
        ok: false,
        restarting: false,
        code: 'mcp_reset.forbidden_remote',
        message: 'MCP reset is allowed only from loopback clients.',
      },
      403,
    );
  }

  const body = await readResetBody(c);
  const confirmedInBody = body.confirmGlobalReset === true;
  const confirmedInHeader = c.req.header('x-ds-mcp-reset-confirm') === 'true';
  if (!confirmedInBody || !confirmedInHeader) {
    return c.json(
      {
        ok: false,
        restarting: false,
        code: 'mcp_reset.confirmation_required',
        message: 'Reset confirmation missing. Send confirmGlobalReset=true and x-ds-mcp-reset-confirm=true.',
      },
      400,
    );
  }

  // Reset only the MCP client process owned by this dashboard server.
  // We intentionally avoid global process kills (`pkill -f`) because they can
  // terminate MCP sessions started by other tabs/apps on the same machine.
  disposeFn();
  await new Promise((resolve) => setTimeout(resolve, sleepMs));
  warmupFn();

  return c.json({
    ok: true,
    restarting: true,
    message: 'Local MCP session restarted. Reopen the bridge plugin in Figma, then test the connection.',
  });
}

export function registerFigmaMcpResetRoute(
  app: { post: (path: string, handler: (c: Context) => Response | Promise<Response>) => void },
  deps: FigmaMcpResetRouteDeps = {}
): void {
  app.post('/api/figma-mcp/reset', (c) => handleFigmaMcpResetRoute(c, deps));
}
