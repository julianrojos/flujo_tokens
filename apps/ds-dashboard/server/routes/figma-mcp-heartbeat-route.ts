import type { Context } from 'hono';
import type { ConnInfo } from '@hono/node-server/conninfo';
import { getConnInfo } from '@hono/node-server/conninfo';
import { isLoopbackAddress } from '../lib/loopback-utils.ts';
import {
  getFigmaMcpHeartbeatStatus,
  recordFigmaMcpHeartbeat,
} from '../services/figma-mcp-heartbeat-state.ts';

export interface FigmaMcpHeartbeatRouteDeps {
  getConnInfoFn?: (c: Context) => ConnInfo;
  internalToken?: string;
  nowMsFn?: () => number;
}

function isAuthorized(
  c: Context,
  internalToken: string | undefined,
  getConnInfoFn: (c: Context) => ConnInfo,
): boolean {
  const connInfo = getConnInfoFn(c);
  const remoteAddress = String(connInfo?.remote?.address || '').trim();

  if (remoteAddress && isLoopbackAddress(remoteAddress)) {
    return true;
  }
  if (!internalToken) return false;
  const receivedToken = String(c.req.header('x-ds-dashboard-internal-token') || '').trim();
  return receivedToken === internalToken;
}

/**
 * POST /api/figma-mcp/heartbeat
 */
export async function handlePostFigmaMcpHeartbeat(
  c: Context,
  deps: FigmaMcpHeartbeatRouteDeps = {},
): Promise<Response> {
  const getConnInfoFn = deps.getConnInfoFn ?? getConnInfo;
  const internalToken = deps.internalToken ?? process.env.DS_DASHBOARD_INTERNAL_TOKEN;
  const nowMsFn = deps.nowMsFn ?? (() => Date.now());

  if (!isAuthorized(c, internalToken, getConnInfoFn)) {
    return c.json(
      {
        ok: false,
        code: 'heartbeat.forbidden_remote',
        message: 'Endpoint allowed only from loopback or with internal token.',
      },
      403,
    );
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = (await c.req.json()) as Record<string, unknown>;
  } catch {
    payload = {};
  }

  const seenAtRaw = Number(payload.timestamp);
  const seenAt = Number.isFinite(seenAtRaw) && seenAtRaw > 0 ? Math.floor(seenAtRaw) : nowMsFn();

  recordFigmaMcpHeartbeat({
    seenAt,
    fileKey: typeof payload.fileKey === 'string' || payload.fileKey === null ? payload.fileKey : null,
    docName: typeof payload.docName === 'string' || payload.docName === null ? payload.docName : null,
    pluginVersion:
      typeof payload.pluginVersion === 'string' || payload.pluginVersion === null
        ? payload.pluginVersion
        : null,
    pluginBuild:
      typeof payload.pluginBuild === 'string' || payload.pluginBuild === null
        ? payload.pluginBuild
        : null,
  });

  const status = getFigmaMcpHeartbeatStatus(nowMsFn());
  return c.json(
    {
      ok: true,
      ...status,
    },
    200,
  );
}

/**
 * GET /api/figma-mcp/heartbeat
 */
export async function handleGetFigmaMcpHeartbeat(
  c: Context,
  deps: FigmaMcpHeartbeatRouteDeps = {},
): Promise<Response> {
  const getConnInfoFn = deps.getConnInfoFn ?? getConnInfo;
  const internalToken = deps.internalToken ?? process.env.DS_DASHBOARD_INTERNAL_TOKEN;
  const nowMsFn = deps.nowMsFn ?? (() => Date.now());

  if (!isAuthorized(c, internalToken, getConnInfoFn)) {
    return c.json(
      {
        ok: false,
        code: 'heartbeat.forbidden_remote',
        message: 'Endpoint allowed only from loopback or with internal token.',
      },
      403,
    );
  }

  return c.json(
    {
      ok: true,
      ...getFigmaMcpHeartbeatStatus(nowMsFn()),
    },
    200,
  );
}

export function registerFigmaMcpHeartbeatRoute(
  app: { post: (path: string, handler: (c: Context) => Response | Promise<Response>) => void; get: (path: string, handler: (c: Context) => Response | Promise<Response>) => void },
  deps: FigmaMcpHeartbeatRouteDeps = {},
): void {
  app.post('/api/figma-mcp/heartbeat', (c) => handlePostFigmaMcpHeartbeat(c, deps));
  app.get('/api/figma-mcp/heartbeat', (c) => handleGetFigmaMcpHeartbeat(c, deps));
}
