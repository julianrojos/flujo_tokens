/**
 * Figma MCP Reconcile Route
 *
 * Attempts to self-heal common MCP disconnected states by restarting the
 * local shared MCP session and returning a normalized final connectivity state.
 */

import type { Context } from 'hono';
import type { ConnInfo } from '@hono/node-server/conninfo';
import { getConnInfo } from '@hono/node-server/conninfo';

import { resolveEnvRef } from '../lib/env-ref-utils.ts';
import { isLoopbackAddress } from '../lib/loopback-utils.ts';
import {
  disposeFigmaMcpPingService,
  pingFigmaMcpService,
  terminateCompetingFigmaMcpProcessesService,
  warmupFigmaMcpPingService,
  type FigmaMcpPingServiceResult,
} from '../services/figma-mcp-ping-service.ts';

const DEFAULT_RECONCILE_SLEEP_MS = 800;

interface ParsedFigmaUrl {
  ok: boolean;
  hostValid: boolean;
}

interface NormalizedMcpPayload {
  ok: boolean;
  connected: boolean;
  code?: string;
  message: string;
  collectionsDetected?: number;
  variablesDetected?: number;
  everConnected: boolean;
  currentPort?: number;
}

interface ReconcileRouteResponse extends NormalizedMcpPayload {
  attemptedReset: boolean;
  restarting: boolean;
  phase:
    | 'already_connected'
    | 'connected_after_reset'
    | 'waiting_for_bridge'
    | 'not_recoverable'
    | 'input_error';
}

interface ReconcileBody {
  figmaUrl?: unknown;
  figmaToken?: unknown;
  confirmReconcile?: unknown;
  confirmGlobalReset?: unknown;
}

const NON_RECOVERABLE_CODES = new Set<string>([
  'mcp_reconcile.env_var_not_set',
  'mcp_reconcile.invalid_url',
  'mcp_reconcile.invalid_host',
  'mcp_ping.env_var_not_set',
  'mcp_ping.invalid_url',
  'mcp_ping.invalid_host',
]);

export interface FigmaMcpReconcileRouteDeps {
  getConnInfoFn?: (c: Context) => ConnInfo;
  internalToken?: string;
  pingFigmaMcpServiceFn?: (args: {
    figmaUrl?: string;
    figmaToken?: string;
  }) => Promise<FigmaMcpPingServiceResult>;
  disposeFigmaMcpPingServiceFn?: () => void;
  warmupFigmaMcpPingServiceFn?: (args?: { env?: NodeJS.ProcessEnv }) => void;
  terminateCompetingFigmaMcpProcessesFn?: () => Promise<void> | void;
  sleepMs?: number;
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

function parseFigmaUrl(figmaUrl: string): ParsedFigmaUrl {
  try {
    const parsed = new URL(figmaUrl);
    const host = String(parsed.hostname || '').trim().toLowerCase();
    const hostValid = host === 'figma.com' || host.endsWith('.figma.com');
    return { ok: true, hostValid };
  } catch {
    return { ok: false, hostValid: false };
  }
}

function normalizeMcpPayload(payload: unknown): NormalizedMcpPayload {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {
      ok: false,
      connected: false,
      code: 'mcp_ping.invalid_payload',
      message: 'MCP ping returned an invalid payload.',
      everConnected: false,
    };
  }
  const p = payload as Record<string, unknown>;
  return {
    ok: p['ok'] !== false,
    connected: p['connected'] === true,
    code: typeof p['code'] === 'string' ? p['code'] : undefined,
    message: typeof p['message'] === 'string' ? p['message'] : '',
    collectionsDetected:
      typeof p['collectionsDetected'] === 'number' ? p['collectionsDetected'] : undefined,
    variablesDetected:
      typeof p['variablesDetected'] === 'number' ? p['variablesDetected'] : undefined,
    everConnected: typeof p['everConnected'] === 'boolean' ? p['everConnected'] : false,
    currentPort: typeof p['currentPort'] === 'number' ? p['currentPort'] : undefined,
  };
}

async function readReconcileBody(c: Context): Promise<ReconcileBody> {
  try {
    const body = await c.req.json();
    if (body && typeof body === 'object' && !Array.isArray(body)) {
      return body as ReconcileBody;
    }
  } catch {
    // no-op
  }
  return {};
}

async function runNormalizedPing(
  pingFn: (args: { figmaUrl?: string; figmaToken?: string }) => Promise<FigmaMcpPingServiceResult>,
  args: { figmaUrl?: string; figmaToken?: string },
): Promise<NormalizedMcpPayload> {
  try {
    const payload = await pingFn(args);
    return normalizeMcpPayload(payload);
  } catch (error) {
    return {
      ok: false,
      connected: false,
      code: 'mcp_ping.command_failed',
      message: error instanceof Error ? error.message : String(error),
      everConnected: false,
    };
  }
}

function withReconcileState(
  payload: NormalizedMcpPayload,
  args: {
    attemptedReset: boolean;
    restarting: boolean;
    phase: ReconcileRouteResponse['phase'];
  },
): ReconcileRouteResponse {
  return {
    ...payload,
    attemptedReset: args.attemptedReset,
    restarting: args.restarting,
    phase: args.phase,
  };
}

/**
 * POST /api/figma-mcp/reconcile
 *
 * Requires explicit confirmation:
 * - body.confirmReconcile=true (or legacy body.confirmGlobalReset=true)
 * - header x-ds-mcp-reconcile-confirm=true (or legacy x-ds-mcp-reset-confirm=true)
 */
export async function handleFigmaMcpReconcileRoute(
  c: Context,
  deps: FigmaMcpReconcileRouteDeps = {},
): Promise<Response> {
  const getConnInfoFn = deps.getConnInfoFn ?? getConnInfo;
  const internalToken = deps.internalToken ?? process.env.DS_DASHBOARD_INTERNAL_TOKEN;
  const pingFn = deps.pingFigmaMcpServiceFn ?? pingFigmaMcpService;
  const disposeFn = deps.disposeFigmaMcpPingServiceFn ?? disposeFigmaMcpPingService;
  const warmupFn = deps.warmupFigmaMcpPingServiceFn ?? warmupFigmaMcpPingService;
  const terminateCompetingFn =
    deps.terminateCompetingFigmaMcpProcessesFn ?? terminateCompetingFigmaMcpProcessesService;
  const sleepMs = deps.sleepMs ?? DEFAULT_RECONCILE_SLEEP_MS;

  if (!isAuthorized(c, internalToken, getConnInfoFn)) {
    return c.json(
      {
        ok: false,
        connected: false,
        code: 'mcp_reconcile.forbidden_remote',
        message: 'Endpoint allowed only from loopback or with internal token.',
        attemptedReset: false,
        restarting: false,
        phase: 'input_error',
      } satisfies Partial<ReconcileRouteResponse>,
      403,
    );
  }

  const body = await readReconcileBody(c);
  const confirmedInBody =
    body.confirmReconcile === true || body.confirmGlobalReset === true;
  const confirmedInHeader =
    c.req.header('x-ds-mcp-reconcile-confirm') === 'true' ||
    c.req.header('x-ds-mcp-reset-confirm') === 'true';
  if (!confirmedInBody || !confirmedInHeader) {
    return c.json(
      {
        ok: false,
        connected: false,
        code: 'mcp_reconcile.confirmation_required',
        message:
          'Reconcile confirmation missing. Send confirmReconcile=true and x-ds-mcp-reconcile-confirm=true.',
        attemptedReset: false,
        restarting: false,
        phase: 'input_error',
      } satisfies Partial<ReconcileRouteResponse>,
      400,
    );
  }

  const figmaUrl = String(body.figmaUrl || '').trim();
  const figmaTokenRaw = String(body.figmaToken || '').trim();
  const resolvedFigmaToken = figmaTokenRaw ? resolveEnvRef(figmaTokenRaw) : '';

  if (figmaTokenRaw && !resolvedFigmaToken) {
    return c.json(
      withReconcileState(
        {
          ok: false,
          connected: false,
          code: 'mcp_reconcile.env_var_not_set',
          message: 'The environment variable referenced by figmaToken is not set on the server.',
          everConnected: false,
        },
        { attemptedReset: false, restarting: false, phase: 'input_error' },
      ),
      200,
    );
  }

  if (figmaUrl) {
    const parsedUrl = parseFigmaUrl(figmaUrl);
    if (!parsedUrl.ok) {
      return c.json(
        withReconcileState(
          {
            ok: false,
            connected: false,
            code: 'mcp_reconcile.invalid_url',
            message: 'Invalid Figma URL.',
            everConnected: false,
          },
          { attemptedReset: false, restarting: false, phase: 'input_error' },
        ),
        200,
      );
    }
    if (!parsedUrl.hostValid) {
      return c.json(
        withReconcileState(
          {
            ok: false,
            connected: false,
            code: 'mcp_reconcile.invalid_host',
            message: 'URL host must be figma.com.',
            everConnected: false,
          },
          { attemptedReset: false, restarting: false, phase: 'input_error' },
        ),
        200,
      );
    }
  }

  const pingArgs = {
    figmaUrl: figmaUrl || undefined,
    figmaToken: resolvedFigmaToken || undefined,
  };

  const initialPing = await runNormalizedPing(pingFn, pingArgs);
  if (initialPing.connected) {
    return c.json(
      withReconcileState(initialPing, {
        attemptedReset: false,
        restarting: false,
        phase: 'already_connected',
      }),
      200,
    );
  }

  if (initialPing.code && NON_RECOVERABLE_CODES.has(initialPing.code)) {
    return c.json(
      withReconcileState(initialPing, {
        attemptedReset: false,
        restarting: false,
        phase: 'not_recoverable',
      }),
      200,
    );
  }

  const aggressiveCleanupRequested =
    body.confirmGlobalReset === true || initialPing.code === 'mcp.instance_mismatch';
  if (aggressiveCleanupRequested) {
    try {
      await terminateCompetingFn();
    } catch {
      // Best-effort cleanup only; keep reconcile flow moving.
    }
  }

  const warmupEnv = resolvedFigmaToken
    ? ({ ...process.env, FIGMA_ACCESS_TOKEN: resolvedFigmaToken } as NodeJS.ProcessEnv)
    : process.env;

  disposeFn();
  await new Promise((resolve) => setTimeout(resolve, sleepMs));
  warmupFn({ env: warmupEnv });

  const finalPing = await runNormalizedPing(pingFn, pingArgs);
  return c.json(
    withReconcileState(finalPing, {
      attemptedReset: true,
      restarting: true,
      phase: finalPing.connected ? 'connected_after_reset' : 'waiting_for_bridge',
    }),
    200,
  );
}

export function registerFigmaMcpReconcileRoute(
  app: { post: (path: string, handler: (c: Context) => Response | Promise<Response>) => void },
  deps: FigmaMcpReconcileRouteDeps = {},
): void {
  app.post('/api/figma-mcp/reconcile', (c) => handleFigmaMcpReconcileRoute(c, deps));
}
