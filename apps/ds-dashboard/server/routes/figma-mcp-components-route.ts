/**
 * Figma MCP Components Route
 *
 * Handles component querying and token-coverage auditing via direct plugin WebSocket bridge.
 * Direct-only mode: no legacy MCP stdio paths.
 *
 * Endpoints:
 *   POST /api/figma-mcp/search-components – Search components by name
 *   POST /api/figma-mcp/component-spec – Get detailed component spec
 *   POST /api/figma-mcp/component-images – Batch export component images
 *   POST /api/figma-mcp/audit-token-coverage – Audit token binding coverage
 *
 * Auth:
 *   Allowed from loopback addresses or with trusted internal token.
 */

import type { Context } from 'hono';
import type { ConnInfo } from '@hono/node-server/conninfo';
import { getConnInfo } from '@hono/node-server/conninfo';
import { isLoopbackAddress } from '../lib/loopback-utils.ts';
import {
  searchComponentsDirect,
  getComponentSpecDirect,
  getComponentImageDirect,
  auditTokenCoverageDirect,
} from '../services/figma-direct-bridge-service.ts';
import { resolveFileKeyFromManager } from '../lib/filekey-utils.ts';

export interface FigmaMcpComponentsRouteDeps {
  readJsonBody?: (c: Context) => Promise<Record<string, unknown>>;
  getConnInfoFn?: (c: Context) => ConnInfo;
  internalToken?: string;
}

function isTrustedInternalRequest(c: Context, deps: FigmaMcpComponentsRouteDeps): boolean {
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
 * POST /api/figma-mcp/search-components
 *
 * Body:
 *   figmaUrl?: string – Figma file URL to scope the search
 *   nameContains?: string – Case-insensitive substring filter
 *   namePattern?: string – Regex pattern filter
 *   includeVariants?: boolean – Include variant COMPONENTs (default: false)
 *   limit?: number – Max results (default: 50, max: 200)
 *   compact?: boolean – Return compact format (default: true)
 *
 * Response:
 *   { success: true, components: [...], count: number, truncated: boolean }
 */
async function handleSearchComponents(c: Context, deps: FigmaMcpComponentsRouteDeps): Promise<Response> {
  const readJsonBody = deps.readJsonBody ?? (async (ctx: Context) => await ctx.req.json());

  let body: HandlerBody = {};
  try {
    body = await readJsonBody(c);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json(
      {
        ok: false,
        code: 'mcp_components.invalid_body',
        message: `Invalid JSON in request body: ${message}`,
      },
      400,
    );
  }

  const figmaUrl = String(body.figmaUrl || '').trim() || undefined;
  const resolved = resolveFileKeyFromManager(figmaUrl, {
    ambiguous: 'mcp_components.ambiguous_file_key',
    noSocket: 'mcp_components.no_socket',
    ambiguousMessage: 'Multiple plugin connections for different files detected. Provide a figmaUrl to specify which file to search.',
    noSocketMessage: 'No plugin connection available. Open the Figma plugin and ensure it is connected.',
  });

  if ('ok' in resolved && !resolved.ok) {
    return c.json(resolved, 200);
  }

  const fileKey = resolved.fileKey;

  try {
    const result = await searchComponentsDirect(fileKey, {
      nameContains: body.nameContains as string | undefined,
      namePattern: body.namePattern as string | undefined,
      includeVariants: body.includeVariants as boolean | undefined,
      limit: body.limit as number | undefined,
      compact: body.compact as boolean | undefined,
    });

    return c.json({ ok: true, ...result }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes('ws.request.no_socket_for_file')) {
      return c.json(
        {
          ok: false,
          code: 'mcp_components.no_socket',
          message: 'No plugin connection available. Open the Figma plugin and ensure it is connected.',
        },
        200
      );
    }

    return c.json(
      {
        ok: false,
        code: 'mcp_components.direct_failed',
        message,
      },
      200
    );
  }
}

/**
 * POST /api/figma-mcp/component-spec
 *
 * Body:
 *   figmaUrl?: string – Figma file URL
 *   nodeId: string – Component or ComponentSet nodeId
 *   depth?: number – Anatomy depth (default: 3, -1 = unlimited)
 *   compact?: boolean – Compact anatomy (default: false)
 *
 * Response:
 *   { success: true, nodeId, name, type, description, anatomy, variants?, variantAxes?, props, states, tokenBindings }
 */
async function handleGetComponentSpec(c: Context, deps: FigmaMcpComponentsRouteDeps): Promise<Response> {
  const readJsonBody = deps.readJsonBody ?? (async (ctx: Context) => await ctx.req.json());

  let body: HandlerBody = {};
  try {
    body = await readJsonBody(c);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json(
      {
        ok: false,
        code: 'mcp_components.invalid_body',
        message: `Invalid JSON in request body: ${message}`,
      },
      400,
    );
  }

  const figmaUrl = String(body.figmaUrl || '').trim() || undefined;
  const resolved = resolveFileKeyFromManager(figmaUrl, {
    ambiguous: 'mcp_components.ambiguous_file_key',
    noSocket: 'mcp_components.no_socket',
    ambiguousMessage: 'Multiple plugin connections for different files detected. Provide a figmaUrl.',
    noSocketMessage: 'No plugin connection available. Open the Figma plugin.',
  });

  if ('ok' in resolved && !resolved.ok) {
    return c.json(resolved, 200);
  }

  const fileKey = resolved.fileKey;

  if (!body.nodeId || typeof body.nodeId !== 'string') {
    return c.json(
      {
        ok: false,
        code: 'mcp_components.invalid_params',
        message: 'Missing or invalid nodeId parameter',
      },
      400,
    );
  }

  try {
    const result = await getComponentSpecDirect(fileKey, {
      nodeId: body.nodeId,
      depth: body.depth as number | undefined,
      compact: body.compact as boolean | undefined,
    });

    return c.json({ ok: true, ...result }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes('ws.request.no_socket_for_file')) {
      return c.json(
        {
          ok: false,
          code: 'mcp_components.no_socket',
          message: 'No plugin connection available.',
        },
        200
      );
    }

    return c.json(
      {
        ok: false,
        code: 'mcp_components.direct_failed',
        message,
      },
      200
    );
  }
}

/**
 * POST /api/figma-mcp/component-images
 *
 * Body:
 *   figmaUrl?: string – Figma file URL
 *   nodeIds: string[] – Array of nodeIds (max 20)
 *   format?: 'PNG' | 'JPG' | 'SVG' – Export format (default: 'PNG')
 *   scale?: number – Export scale (default: 2)
 *
 * Response:
 *   { success: boolean, images: [...], count: number, errors: number }
 *   Partial success: success=true if at least one image succeeded
 */
async function handleGetComponentImages(c: Context, deps: FigmaMcpComponentsRouteDeps): Promise<Response> {
  const readJsonBody = deps.readJsonBody ?? (async (ctx: Context) => await ctx.req.json());

  let body: HandlerBody = {};
  try {
    body = await readJsonBody(c);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json(
      {
        ok: false,
        code: 'mcp_components.invalid_body',
        message: `Invalid JSON in request body: ${message}`,
      },
      400,
    );
  }

  const figmaUrl = String(body.figmaUrl || '').trim() || undefined;
  const resolved = resolveFileKeyFromManager(figmaUrl, {
    ambiguous: 'mcp_components.ambiguous_file_key',
    noSocket: 'mcp_components.no_socket',
    ambiguousMessage: 'Multiple plugin connections detected. Provide a figmaUrl.',
    noSocketMessage: 'No plugin connection available.',
  });

  if ('ok' in resolved && !resolved.ok) {
    return c.json(resolved, 200);
  }

  const fileKey = resolved.fileKey;

  if (!Array.isArray(body.nodeIds)) {
    return c.json(
      {
        ok: false,
        code: 'mcp_components.invalid_params',
        message: 'nodeIds must be an array',
      },
      400,
    );
  }

  // Allow empty nodeIds array - let the handler return success with empty results
  const nodeIds = body.nodeIds as string[];

  try {
    const result = await getComponentImageDirect(fileKey, {
      nodeIds,
      format: body.format as 'PNG' | 'JPG' | 'SVG' | undefined,
      scale: body.scale as number | undefined,
    });

    return c.json({ ok: true, ...result }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes('ws.request.no_socket_for_file')) {
      return c.json(
        {
          ok: false,
          code: 'mcp_components.no_socket',
          message: 'No plugin connection available.',
        },
        200
      );
    }

    return c.json(
      {
        ok: false,
        code: 'mcp_components.direct_failed',
        message,
      },
      200
    );
  }
}

/**
 * POST /api/figma-mcp/audit-token-coverage
 *
 * Body:
 *   figmaUrl?: string – Figma file URL
 *   nodeId: string – Component or ComponentSet nodeId
 *   maxNodes?: number – Max nodes to traverse (default: 500, max: 2000)
 *
 * Response:
 *   { success: true, nodeId, totalNodes, nodesWithBindings, coveragePercent, truncated, unboundNodes, fieldCoverage }
 */
async function handleAuditTokenCoverage(c: Context, deps: FigmaMcpComponentsRouteDeps): Promise<Response> {
  const readJsonBody = deps.readJsonBody ?? (async (ctx: Context) => await ctx.req.json());

  let body: HandlerBody = {};
  try {
    body = await readJsonBody(c);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json(
      {
        ok: false,
        code: 'mcp_components.invalid_body',
        message: `Invalid JSON in request body: ${message}`,
      },
      400,
    );
  }

  const figmaUrl = String(body.figmaUrl || '').trim() || undefined;
  const resolved = resolveFileKeyFromManager(figmaUrl, {
    ambiguous: 'mcp_components.ambiguous_file_key',
    noSocket: 'mcp_components.no_socket',
    ambiguousMessage: 'Multiple plugin connections detected. Provide a figmaUrl.',
    noSocketMessage: 'No plugin connection available.',
  });

  if ('ok' in resolved && !resolved.ok) {
    return c.json(resolved, 200);
  }

  const fileKey = resolved.fileKey;

  if (!body.nodeId || typeof body.nodeId !== 'string') {
    return c.json(
      {
        ok: false,
        code: 'mcp_components.invalid_params',
        message: 'Missing or invalid nodeId parameter',
      },
      400,
    );
  }

  try {
    const result = await auditTokenCoverageDirect(fileKey, {
      nodeId: body.nodeId,
      maxNodes: body.maxNodes as number | undefined,
    });

    return c.json({ ok: true, ...result }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes('ws.request.no_socket_for_file')) {
      return c.json(
        {
          ok: false,
          code: 'mcp_components.no_socket',
          message: 'No plugin connection available.',
        },
        200
      );
    }

    return c.json(
      {
        ok: false,
        code: 'mcp_components.direct_failed',
        message,
      },
      200
    );
  }
}

export function registerFigmaMcpComponentsRoutes(
  app: { post: (path: string, handler: (c: Context) => Response | Promise<Response>) => void },
  deps: FigmaMcpComponentsRouteDeps
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
          code: 'mcp_components.forbidden_remote',
          message: 'MCP components endpoint is allowed only from loopback clients or trusted internal requests.',
        },
        403,
      );
    }
    return null;
  };

  app.post('/api/figma-mcp/search-components', (c) => {
    const authError = authGuard(c);
    if (authError) return authError;
    return handleSearchComponents(c, deps);
  });

  app.post('/api/figma-mcp/component-spec', (c) => {
    const authError = authGuard(c);
    if (authError) return authError;
    return handleGetComponentSpec(c, deps);
  });

  app.post('/api/figma-mcp/component-images', (c) => {
    const authError = authGuard(c);
    if (authError) return authError;
    return handleGetComponentImages(c, deps);
  });

  app.post('/api/figma-mcp/audit-token-coverage', (c) => {
    const authError = authGuard(c);
    if (authError) return authError;
    return handleAuditTokenCoverage(c, deps);
  });
}
