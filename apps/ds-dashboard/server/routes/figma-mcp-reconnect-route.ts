import type { Context } from 'hono';
import { getConnInfo } from '@hono/node-server/conninfo';

import { isLoopbackRequest } from '../lib/loopback-utils.ts';
import { getPluginConnectionManager } from '../services/plugin-connection-manager.ts';
import { resetFigmaMcpHeartbeatState } from '../services/figma-mcp-heartbeat-state.ts';
import { terminateCompetingFigmaMcpProcessesService } from '../services/figma-mcp-ping-service.ts';

interface ConnInfo {
  remote?: {
    address?: string;
  };
}

interface PluginConnectionManagerLike {
  forceReconnectAll: (reason?: string) => number;
}

export interface FigmaMcpReconnectRouteDeps {
  getConnInfoFn?: (c: Context) => ConnInfo;
  internalToken?: string;
  getPluginConnectionManagerFn?: () => PluginConnectionManagerLike;
  resetHeartbeatFn?: () => void;
  terminateCompetingFn?: () => Promise<void>;
}

/**
 * POST /api/figma-mcp/reconnect
 *
 * Forces plugin WS sessions to reconnect and clears stale heartbeat snapshot.
 * This gives "Resolve connection" an active recovery action (not just polling).
 */
export async function handlePostFigmaMcpReconnect(
  c: Context,
  deps: FigmaMcpReconnectRouteDeps = {},
): Promise<Response> {
  const getConnInfoFn = deps.getConnInfoFn ?? getConnInfo;
  const internalToken = deps.internalToken ?? process.env.DS_DASHBOARD_INTERNAL_TOKEN;
  const getPluginConnectionManagerFn = deps.getPluginConnectionManagerFn ?? getPluginConnectionManager;
  const resetHeartbeatFn = deps.resetHeartbeatFn ?? resetFigmaMcpHeartbeatState;
  const terminateCompetingFn = deps.terminateCompetingFn ?? terminateCompetingFigmaMcpProcessesService;
  const connInfo = getConnInfoFn(c);
  const isLoopback = isLoopbackRequest(c, connInfo);

  if (!isLoopback) {
    const receivedToken = String(c.req.header('x-ds-dashboard-internal-token') || '').trim();
    const hasValidToken = Boolean(internalToken && receivedToken && receivedToken === internalToken);
    if (!hasValidToken) {
      return c.json(
        {
          ok: false,
          code: 'reconnect.forbidden_remote',
          message: 'Endpoint only accessible from loopback or with internal token.',
        },
        403,
      );
    }
  }

  const manager = getPluginConnectionManagerFn();
  const closedConnections = manager.forceReconnectAll('api.reconnect');
  resetHeartbeatFn();

  // Best-effort cleanup of stale sibling MCP processes.
  let siblingCleanup = 'ok';
  try {
    await terminateCompetingFn();
  } catch (error) {
    siblingCleanup = error instanceof Error ? error.message : String(error);
  }

  return c.json(
    {
      ok: true,
      reconnected: true,
      closedConnections,
      siblingCleanup,
      message: closedConnections > 0
        ? `Requested reconnect for ${closedConnections} active plugin session(s).`
        : 'No active plugin sessions found; waiting for plugin to reconnect.',
    },
    200,
  );
}

export function registerFigmaMcpReconnectRoute(
  app: { post: (path: string, handler: (c: Context) => Response | Promise<Response>) => void },
  deps: FigmaMcpReconnectRouteDeps = {},
): void {
  app.post('/api/figma-mcp/reconnect', (c) => handlePostFigmaMcpReconnect(c, deps));
}
