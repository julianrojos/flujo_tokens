/**
 * Figma MCP Token Bindings Route
 *
 * Handles variable binding operations via direct plugin WebSocket bridge.
 * Direct-only mode: no legacy MCP stdio paths.
 * Write operations are NOT cached.
 *
 * Endpoints:
 *   POST /api/figma-mcp/bind-variable – Bind a variable to a node field
 *   POST /api/figma-mcp/unbind-variable – Unbind a variable from a node field
 *   POST /api/figma-mcp/apply-tokens – Batch apply token bindings (with dryRun support)
 *
 * Auth:
 *   Allowed from loopback addresses or with trusted internal token.
 */

import type { Context } from 'hono';
import type { ConnInfo } from '@hono/node-server/conninfo';
import { getConnInfo } from '@hono/node-server/conninfo';
import { isLoopbackAddress } from '../lib/loopback-utils.ts';
import {
  bindVariableDirect,
  unbindVariableDirect,
  applyTokensDirect,
} from '../services/figma-direct-bridge-service.ts';
import { resolveFileKeyFromManager } from '../lib/filekey-utils.ts';

export interface FigmaMcpTokenBindingsRouteDeps {
  readJsonBody?: (c: Context) => Promise<Record<string, unknown>>;
  getConnInfoFn?: (c: Context) => ConnInfo;
  internalToken?: string;
}

function isTrustedInternalRequest(c: Context, deps: FigmaMcpTokenBindingsRouteDeps): boolean {
  const expectedToken = String(deps?.internalToken ?? process.env.DS_DASHBOARD_INTERNAL_TOKEN ?? '').trim();
  if (!expectedToken) return false;
  const receivedToken = String(c.req.header('x-ds-dashboard-internal-token') || '').trim();
  return Boolean(receivedToken) && receivedToken === expectedToken;
}

interface HandlerBody {
  figmaUrl?: string;
  [key: string]: unknown;
}

/**
 * POST /api/figma-mcp/bind-variable
 *
 * Body:
 *   figmaUrl?: string – Figma file URL
 *   nodeId: string – Target node ID
 *   variableId: string – Variable ID to bind
 *   field: string – Field name (e.g., 'fills', 'strokes', 'opacity', 'cornerRadius')
 *   paintIndex?: number – Paint index for fills/strokes (default: 0)
 *   paintField?: 'color' | 'opacity' – Paint field to bind (default: 'color')
 *
 * Response:
 *   { success: true, nodeId, field, variableId }
 */
async function handleBindVariable(c: Context, deps: FigmaMcpTokenBindingsRouteDeps): Promise<Response> {
  const readJsonBody = deps.readJsonBody ?? (async (ctx: Context) => await ctx.req.json());

  let body: HandlerBody = {};
  try {
    body = await readJsonBody(c);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json(
      {
        ok: false,
        code: 'mcp_token_bindings.invalid_body',
        message: `Invalid JSON in request body: ${message}`,
      },
      400,
    );
  }

  const figmaUrl = String(body.figmaUrl || '').trim() || undefined;
  const resolved = resolveFileKeyFromManager(figmaUrl, {
    ambiguous: 'mcp_token_bindings.ambiguous_file_key',
    noSocket: 'mcp_token_bindings.no_socket',
    ambiguousMessage: 'Multiple plugin connections detected. Provide a figmaUrl.',
    noSocketMessage: 'No plugin connection available.',
  });

  if ('ok' in resolved && !resolved.ok) {
    return c.json(resolved, 200);
  }

  const fileKey = resolved.fileKey;

  // Validate required params
  if (!body.nodeId || typeof body.nodeId !== 'string') {
    return c.json(
      {
        ok: false,
        code: 'mcp_token_bindings.invalid_params',
        message: 'Missing or invalid nodeId parameter',
      },
      400,
    );
  }

  if (!body.variableId || typeof body.variableId !== 'string') {
    return c.json(
      {
        ok: false,
        code: 'mcp_token_bindings.invalid_params',
        message: 'Missing or invalid variableId parameter',
      },
      400,
    );
  }

  if (!body.field || typeof body.field !== 'string') {
    return c.json(
      {
        ok: false,
        code: 'mcp_token_bindings.invalid_params',
        message: 'Missing or invalid field parameter',
      },
      400,
    );
  }

  try {
    const result = await bindVariableDirect(fileKey, {
      nodeId: body.nodeId,
      variableId: body.variableId,
      field: body.field,
      paintIndex: body.paintIndex as number | undefined,
      paintField: body.paintField as 'color' | 'opacity' | undefined,
    });

    return c.json({ ok: true, ...result }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes('ws.request.no_socket_for_file')) {
      return c.json(
        {
          ok: false,
          code: 'mcp_token_bindings.no_socket',
          message: 'No plugin connection available.',
        },
        200
      );
    }

    return c.json(
      {
        ok: false,
        code: 'mcp_token_bindings.direct_failed',
        message,
      },
      200
    );
  }
}

/**
 * POST /api/figma-mcp/unbind-variable
 *
 * Body:
 *   figmaUrl?: string – Figma file URL
 *   nodeId: string – Target node ID
 *   field: string – Field name to unbind
 *   paintIndex?: number – Paint index for fills/strokes (default: 0)
 *   paintField?: 'color' | 'opacity' – Paint field to unbind (default: 'color')
 *
 * Response:
 *   { success: true, nodeId, field }
 */
async function handleUnbindVariable(c: Context, deps: FigmaMcpTokenBindingsRouteDeps): Promise<Response> {
  const readJsonBody = deps.readJsonBody ?? (async (ctx: Context) => await ctx.req.json());

  let body: HandlerBody = {};
  try {
    body = await readJsonBody(c);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json(
      {
        ok: false,
        code: 'mcp_token_bindings.invalid_body',
        message: `Invalid JSON in request body: ${message}`,
      },
      400,
    );
  }

  const figmaUrl = String(body.figmaUrl || '').trim() || undefined;
  const resolved = resolveFileKeyFromManager(figmaUrl, {
    ambiguous: 'mcp_token_bindings.ambiguous_file_key',
    noSocket: 'mcp_token_bindings.no_socket',
    ambiguousMessage: 'Multiple plugin connections detected. Provide a figmaUrl.',
    noSocketMessage: 'No plugin connection available.',
  });

  if ('ok' in resolved && !resolved.ok) {
    return c.json(resolved, 200);
  }

  const fileKey = resolved.fileKey;

  // Validate required params
  if (!body.nodeId || typeof body.nodeId !== 'string') {
    return c.json(
      {
        ok: false,
        code: 'mcp_token_bindings.invalid_params',
        message: 'Missing or invalid nodeId parameter',
      },
      400,
    );
  }

  if (!body.field || typeof body.field !== 'string') {
    return c.json(
      {
        ok: false,
        code: 'mcp_token_bindings.invalid_params',
        message: 'Missing or invalid field parameter',
      },
      400,
    );
  }

  try {
    const result = await unbindVariableDirect(fileKey, {
      nodeId: body.nodeId,
      field: body.field,
      paintIndex: body.paintIndex as number | undefined,
      paintField: body.paintField as 'color' | 'opacity' | undefined,
    });

    return c.json({ ok: true, ...result }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes('ws.request.no_socket_for_file')) {
      return c.json(
        {
          ok: false,
          code: 'mcp_token_bindings.no_socket',
          message: 'No plugin connection available.',
        },
        200
      );
    }

    return c.json(
      {
        ok: false,
        code: 'mcp_token_bindings.direct_failed',
        message,
      },
      200
    );
  }
}

/**
 * POST /api/figma-mcp/apply-tokens
 *
 * Body:
 *   figmaUrl?: string – Figma file URL
 *   items: Array<{
 *     nodeId: string,
 *     variableId: string,
 *     field: string,
 *     paintIndex?: number,
 *     paintField?: 'color' | 'opacity'
 *   }>
 *   dryRun?: boolean – If true, validate only without mutations (default: false)
 *
 * Response:
 *   { success: boolean, dryRun: boolean, items: [...], appliedCount: number, errorCount: number }
 *   Partial success: success=true if at least one item was applied (or all validated in dryRun)
 */
async function handleApplyTokens(c: Context, deps: FigmaMcpTokenBindingsRouteDeps): Promise<Response> {
  const readJsonBody = deps.readJsonBody ?? (async (ctx: Context) => await ctx.req.json());

  let body: HandlerBody = {};
  try {
    body = await readJsonBody(c);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json(
      {
        ok: false,
        code: 'mcp_token_bindings.invalid_body',
        message: `Invalid JSON in request body: ${message}`,
      },
      400,
    );
  }

  const figmaUrl = String(body.figmaUrl || '').trim() || undefined;
  const resolved = resolveFileKeyFromManager(figmaUrl, {
    ambiguous: 'mcp_token_bindings.ambiguous_file_key',
    noSocket: 'mcp_token_bindings.no_socket',
    ambiguousMessage: 'Multiple plugin connections detected. Provide a figmaUrl.',
    noSocketMessage: 'No plugin connection available.',
  });

  if ('ok' in resolved && !resolved.ok) {
    return c.json(resolved, 200);
  }

  const fileKey = resolved.fileKey;

  // Validate items array
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return c.json(
      {
        ok: false,
        code: 'mcp_token_bindings.invalid_params',
        message: 'Missing or empty items array',
      },
      400,
    );
  }

  try {
    const result = await applyTokensDirect(fileKey, {
      items: body.items as Array<{
        nodeId: string;
        variableId: string;
        field: string;
        paintIndex?: number;
        paintField?: 'color' | 'opacity';
      }>,
      dryRun: body.dryRun as boolean | undefined,
    });

    return c.json({ ok: true, ...result }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes('ws.request.no_socket_for_file')) {
      return c.json(
        {
          ok: false,
          code: 'mcp_token_bindings.no_socket',
          message: 'No plugin connection available.',
        },
        200
      );
    }

    return c.json(
      {
        ok: false,
        code: 'mcp_token_bindings.direct_failed',
        message,
      },
      200
    );
  }
}

export function registerFigmaMcpTokenBindingsRoutes(
  app: { post: (path: string, handler: (c: Context) => Response | Promise<Response>) => void },
  deps: FigmaMcpTokenBindingsRouteDeps
): void {
  // Use injected dependency or default
  const getConnInfoResolved = deps.getConnInfoFn ?? getConnInfo;

  // Validate auth for all routes
  const authGuard = (c: Context) => {
    const connInfo = getConnInfoResolved(c);
    const remoteAddress = String(connInfo?.remote?.address || '').trim();
    const trustedInternal = isTrustedInternalRequest(c, deps);
    const isLoopback = remoteAddress ? isLoopbackAddress(remoteAddress) : false;

    if (!isLoopback && !trustedInternal) {
      return c.json(
        {
          ok: false,
          code: 'mcp_token_bindings.forbidden_remote',
          message: 'MCP token bindings endpoint is allowed only from loopback clients or trusted internal requests.',
        },
        403,
      );
    }
    return null;
  };

  app.post('/api/figma-mcp/bind-variable', (c) => {
    const authError = authGuard(c);
    if (authError) return authError;
    return handleBindVariable(c, deps);
  });

  app.post('/api/figma-mcp/unbind-variable', (c) => {
    const authError = authGuard(c);
    if (authError) return authError;
    return handleUnbindVariable(c, deps);
  });

  app.post('/api/figma-mcp/apply-tokens', (c) => {
    const authError = authGuard(c);
    if (authError) return authError;
    return handleApplyTokens(c, deps);
  });
}
