/**
 * Figma MCP Port Route
 *
 * Handles hot port switching for MCP connections.
 */

import type { Context } from 'hono';
import type { ConnInfo } from '@hono/node-server/conninfo';
import { getConnInfo } from '@hono/node-server/conninfo';
import {
  disposeFigmaMcpPingService,
} from '../services/figma-mcp-ping-service.ts';
import {
  getFigmaMcpRuntimeState,
  isPortAllowed,
  beginPortSwitch,
  completePortSwitch,
  rollbackPortSwitch,
} from '../services/figma-mcp-runtime-state.ts';
import { isLoopbackAddress } from '../lib/loopback-utils.ts';
import { verifyMcpPort } from '../services/figma-mcp-port-verify.ts';

/**
 * Check if a request is authorized for MCP management endpoints.
 * Returns true if:
 * - Request is from loopback address, OR
 * - Request has valid internal token
 * Fail-closed: empty remoteAddress requires valid token.
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

export interface FigmaMcpPortRouteDeps {
  getConnInfoFn?: (c: Context) => ConnInfo;
  internalToken?: string;
  disposeFigmaMcpPingServiceFn?: () => void;
  verifyMcpPortFn?: (port: number, timeoutMs?: number) => Promise<boolean>;
}

interface PortSwitchRequest {
  port?: unknown;
}

/**
 * GET /api/figma-mcp/port
 * 
 * Returns current MCP runtime state.
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

  try {
    const state = getFigmaMcpRuntimeState();
    return c.json(
      {
        ok: true,
        activePort: state.activePort,
        allowedRange: state.allowedRange,
        lastChangeAt: state.lastChangeAt,
        isSwitching: state.isSwitching,
      },
      200
    );
  } catch {
    return c.json(
      {
        ok: false,
        code: 'port.state_read_failed',
        message: 'Failed to read MCP runtime state.',
      },
      500
    );
  }
}

/**
 * POST /api/figma-mcp/port
 * 
 * Switches MCP port at runtime.
 */
export async function handlePostFigmaMcpPort(c: Context, deps: FigmaMcpPortRouteDeps): Promise<Response> {
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

  // Parse request body
  let body: PortSwitchRequest;
  try {
    body = (await c.req.json()) as PortSwitchRequest;
  } catch {
    return c.json(
      {
        ok: false,
        code: 'port.invalid_body',
        message: 'Invalid JSON body.',
      },
      400
    );
  }

  // Validate port type
  if (body.port === undefined || body.port === null) {
    return c.json(
      {
        ok: false,
        code: 'port.missing',
        message: 'Port is required.',
      },
      400
    );
  }

  const requestedPort = Number(body.port);
  if (!Number.isInteger(requestedPort)) {
    return c.json(
      {
        ok: false,
        code: 'port.invalid_type',
        message: 'Port must be an integer.',
      },
      400
    );
  }

  const state = getFigmaMcpRuntimeState();

  // Validate port range
  if (!isPortAllowed(requestedPort, state.allowedRange)) {
    return c.json(
      {
        ok: false,
        code: 'port.out_of_range',
        message: `Port must be between ${state.allowedRange.start} and ${state.allowedRange.end}.`,
      },
      400
    );
  }

  // Check if same as active
  if (requestedPort === state.activePort) {
    return c.json(
      {
        ok: false,
        code: 'port.same_as_active',
        message: 'Port is already active.',
      },
      400
    );
  }

  // Begin atomic switch
  const beginResult = beginPortSwitch(requestedPort);
  if (!beginResult.ok) {
    return c.json(
      {
        ok: false,
        code: 'port.switch_in_progress',
        message: 'Port switch already in progress. Wait and retry.',
      },
      409
    );
  }

  const previousPort = beginResult.previousPort;

  // Execute switch: dispose → update env → verify
  try {
    const disposeFn = deps.disposeFigmaMcpPingServiceFn ?? disposeFigmaMcpPingService;
    const verifyFn = deps.verifyMcpPortFn ?? verifyMcpPort;
    const switchStartedAt = Date.now();

    disposeFn();

    // Update runtime env for future spawns
    process.env.FIGMA_WS_PORT = String(requestedPort);

    // Verify port is actually active (with timeout)
    const verified = await verifyFn(requestedPort, 5000);
    const elapsedMs = Date.now() - switchStartedAt;
    
    if (!verified) {
      // Structured error logging
      console.error(JSON.stringify({
        event: 'mcp_port_switch_failed',
        code: 'port.verify_failed',
        requestedPort,
        previousPort,
        elapsedMs,
        message: 'Port verification failed: MCP not responding on new port.',
      }));
      
      throw new Error('Port verification failed: MCP not responding on new port.');
    }

    // Complete switch
    completePortSwitch(requestedPort);

    // Success logging
    console.log(JSON.stringify({
      event: 'mcp_port_switch_success',
      requestedPort,
      previousPort,
      elapsedMs,
    }));

    return c.json(
      {
        ok: true,
        activePort: requestedPort,
        previousPort,
        message: 'MCP port switched successfully. Reconnect the MCP Management if needed.',
      },
      200
    );
  } catch (error) {
    // Rollback on failure
    rollbackPortSwitch(previousPort);
    process.env.FIGMA_WS_PORT = String(previousPort);
    
    // Structured error logging
    console.error(JSON.stringify({
      event: 'mcp_port_switch_rolled_back',
      code: 'port.switch_failed',
      requestedPort,
      previousPort,
      error: error instanceof Error ? error.message : String(error),
    }));

    return c.json(
      {
        ok: false,
        code: 'port.switch_failed',
        message: `Port switch failed: ${error instanceof Error ? error.message : String(error)}. Rolled back to ${previousPort}.`,
      },
      500
    );
  }
}

export function registerFigmaMcpPortRoute(
  app: {
    get: (path: string, handler: (c: Context) => Response | Promise<Response>) => void;
    post: (path: string, handler: (c: Context) => Response | Promise<Response>) => void;
  },
  deps: FigmaMcpPortRouteDeps = {}
): void {
  app.get('/api/figma-mcp/port', (c) => handleGetFigmaMcpPort(c, deps));
  app.post('/api/figma-mcp/port', (c) => handlePostFigmaMcpPort(c, deps));
}
