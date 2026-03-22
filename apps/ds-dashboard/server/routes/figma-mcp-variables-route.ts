/**
 * Figma MCP Variables Route
 *
 * Handles fetching Figma local variables using direct plugin WebSocket bridge.
 * Direct-only mode: no legacy MCP stdio fallback.
 *
 * This endpoint is called by the tokens-from-figma sync subprocess when it
 * detects it is running inside the dashboard server context (via the
 * DS_DASHBOARD_INTERNAL_URL env var). It uses the direct WebSocket bridge
 * to communicate with the plugin, avoiding the subprocess-port-mismatch
 * problem.
 *
 * Methods:
 *   POST /api/figma-mcp-variables – Primary endpoint (body: JSON)
 *   GET  /api/figma-mcp/variables – Alias (query params only)
 *
 * Parameters:
 *   figmaUrl?: string – Figma file URL (used to scope the variable fetch)
 *   limit?: number – Pagination limit (default: 500, clamped to [1, 500])
 *   offset?: number – Pagination offset (default: 0)
 *   returnAsLinks?: boolean|string|number – If true/"1"/1, returns lightweight resource links
 *
 * Response (JSON):
 *   Success (returnAsLinks=false):
 *     {
 *       ok: true,
 *       meta: {
 *         variables: Record<string, Variable>,        – Paginated variables indexed by id
 *         variableCollections: Record<string, VariableCollection>  – All collections (not paginated)
 *       },
 *       pagination: { total: number, offset: number, limit: number, hasMore: boolean },
 *       serverMeta: { schemaVersion: string, capabilities: string[] }
 *     }
 *   Success (returnAsLinks=true):
 *     {
 *       ok: true,
 *       items: { type: 'resource_link', id: string, name: string, resolvedType?: string }[],
 *       pagination: { total: number, offset: number, limit: number, hasMore: boolean },
 *       serverMeta: { schemaVersion: string, capabilities: string[] }
 *     }
 *   Error:
 *     { ok: false, code: string, message: string }
 *
 * Error Codes:
 *   mcp_variables.forbidden_remote – Non-loopback request without trusted token
 *   mcp_variables.no_socket – No plugin connection available
 *   mcp_variables.ambiguous_file_key – Multiple files detected, figmaUrl required
 *   mcp_variables.invalid_body – Invalid JSON in POST body
 *   mcp_variables.direct_failed – Plugin fetch failed
 */

import type { Context } from 'hono';
import type { ConnInfo } from '@hono/node-server/conninfo';
import { getConnInfo } from '@hono/node-server/conninfo';
import { isLoopbackAddress } from '../lib/loopback-utils.ts';
import { fetchVariablesDirect } from '../services/figma-direct-bridge-service.ts';
import { parsePaginationParams, applyPagination, toResourceLinks } from '../lib/pagination-utils.ts';
import { buildServerMeta } from '../lib/server-meta.ts';
import { toDtcgTokenSet } from '../lib/dtcg-transform.ts';
import { resolveFileKeyFromManager, isFileKeySuccess } from '../lib/filekey-utils.ts';

export interface FigmaMcpVariablesRouteDeps {
  readJsonBody?: (c: Context) => Promise<Record<string, unknown>>;
  getConnInfoFn?: (c: Context) => ConnInfo;
  internalToken?: string;
  fetchVariablesDirect?: typeof import('../services/figma-direct-bridge-service').fetchVariablesDirect;
}

function isTrustedInternalRequest(c: Context, deps: FigmaMcpVariablesRouteDeps): boolean {
  const expectedToken = String(deps?.internalToken ?? process.env.DS_DASHBOARD_INTERNAL_TOKEN ?? '').trim();
  if (!expectedToken) return false;
  const receivedToken = String(c.req.header('x-ds-dashboard-internal-token') || '').trim();
  return Boolean(receivedToken) && receivedToken === expectedToken;
}

/**
 * Variables endpoint handler
 *
 * Routes:
 * - POST /api/figma-mcp-variables (primary)
 * - GET  /api/figma-mcp/variables (alias)
 *
 * Direct-only: uses WebSocket bridge to plugin. No legacy fallback.
 */
export async function handleFigmaMcpVariablesRoute(
  c: Context,
  deps: FigmaMcpVariablesRouteDeps
): Promise<Response> {
  const readJsonBody = deps.readJsonBody ?? (async (ctx: Context) => await ctx.req.json());
  const getConnInfoFn = deps.getConnInfoFn ?? getConnInfo;

  const connInfo = getConnInfoFn(c);
  const remoteAddress = String(connInfo?.remote?.address || '').trim();
  const trustedInternal = isTrustedInternalRequest(c, deps);
  const isLoopback = remoteAddress ? isLoopbackAddress(remoteAddress) : false;
  if (!isLoopback && !trustedInternal) {
    return c.json(
      {
        ok: false,
        code: 'mcp_variables.forbidden_remote',
        message: 'MCP variables endpoint is allowed only from loopback clients or trusted internal requests.',
      },
      403,
    );
  }

  // Support both GET (query) and POST (body) for figmaUrl
  // For GET requests, we need to handle the case where there's no body
  const queryParams = c.req.query();
  let body: Record<string, unknown> = {};
  const method = c.req.method.toUpperCase();

  // Only parse body for non-GET requests (POST, PUT, etc.)
  // GET requests should not have a body, so skip parsing
  if (method !== 'GET') {
    try {
      body = await readJsonBody(c);
    } catch (error) {
      // POST/PUT with invalid JSON should return explicit error
      const message = error instanceof Error ? error.message : String(error);
      return c.json(
        {
          ok: false,
          code: 'mcp_variables.invalid_body',
          message: `Invalid JSON in request body: ${message}`,
        },
        400,
      );
    }
  }
  const figmaUrl = String(body.figmaUrl || queryParams.figmaUrl || '').trim() || undefined;

  // Resolve fileKey with ambiguity guard using shared utility
  const resolved = resolveFileKeyFromManager(figmaUrl, {
    ambiguous: 'mcp_variables.ambiguous_file_key',
    noSocket: 'mcp_variables.no_socket',
    ambiguousMessage: 'Multiple plugin connections for different files detected. Provide a figmaUrl to specify which file to fetch variables from.',
    noSocketMessage: 'No plugin connection available. Open the Figma plugin and provide a figmaUrl.',
  });

  if (!isFileKeySuccess(resolved)) {
    return c.json(resolved, 200);
  }

  const fileKey = resolved.fileKey;

  // Parse pagination parameters from query and body (body takes precedence)
  // Build effective params: query params + body (body overrides query)
  const queryPaginationParams: Record<string, unknown> = {};
  if (queryParams.limit) queryPaginationParams.limit = queryParams.limit;
  if (queryParams.offset) queryPaginationParams.offset = queryParams.offset;
  if (queryParams.returnAsLinks) queryPaginationParams.returnAsLinks = queryParams.returnAsLinks;

  // Merge: body overrides query (body > query)
  const effectiveParams = { ...queryPaginationParams, ...body };
  const paginationParams = parsePaginationParams(effectiveParams);

  // Parse returnAsLinks: support boolean, string ("true"/"1"), number
  const returnAsLinksRaw = effectiveParams.returnAsLinks;
  const returnAsLinks = returnAsLinksRaw === true || returnAsLinksRaw === 'true' || returnAsLinksRaw === '1' || returnAsLinksRaw === 1;

  // Parse outputFormat for DTCG support
  const outputFormat = String(body.outputFormat ?? 'raw').trim().toLowerCase();

  try {
    const fetchVariables = deps.fetchVariablesDirect ?? fetchVariablesDirect;
    const directResult = await fetchVariables(fileKey);

    // Handle DTCG output format
    if (outputFormat === 'dtcg') {
      const dtcg = toDtcgTokenSet(
        directResult.meta.variables,
        directResult.meta.variableCollections
      );
      return c.json({
        ok: true,
        dtcg,
      }, 200);
    }

    // Standard response (backward compatible)
    const variables = Object.values(directResult.meta.variables ?? {});

    // Apply pagination to variables only
    const paginatedResult = applyPagination(variables, paginationParams);

    // Build response based on returnAsLinks flag
    let responseData: Record<string, unknown>;
    if (returnAsLinks) {
      responseData = {
        items: toResourceLinks(paginatedResult.items),
        pagination: {
          total: paginatedResult.total,
          offset: paginatedResult.offset,
          limit: paginatedResult.limit,
          hasMore: paginatedResult.hasMore,
        },
      };
    } else {
      // Convert paginated items back to object format
      const paginatedVariables = paginatedResult.items.reduce((acc, v) => {
        acc[v.id] = v;
        return acc;
      }, {} as Record<string, typeof paginatedResult.items[0]>);

      responseData = {
        // Preserve legacy contract: variableCollections as Record, not array
        meta: {
          variables: paginatedVariables,
          variableCollections: directResult.meta.variableCollections,
        },
        pagination: {
          total: paginatedResult.total,
          offset: paginatedResult.offset,
          limit: paginatedResult.limit,
          hasMore: paginatedResult.hasMore,
        },
      };
    }

    // Add server meta (using serverMeta to avoid collision with variables meta)
    const serverMeta = buildServerMeta();

    return c.json({ ok: true, ...responseData, serverMeta }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    // Check for specific error conditions
    if (message.includes('ws.request.no_socket_for_file')) {
      return c.json(
        {
          ok: false,
          code: 'mcp_variables.no_socket',
          message: 'No plugin connection available. Open the Figma plugin and ensure it is connected.',
        },
        200
      );
    }

    return c.json(
      {
        ok: false,
        code: 'mcp_variables.direct_failed',
        message,
      },
      200
    );
  }
}

export function registerFigmaMcpVariablesRoute(
  app: { post: (path: string, handler: (c: Context) => Response | Promise<Response>) => void; get?: (path: string, handler: (c: Context) => Response | Promise<Response>) => void },
  deps: FigmaMcpVariablesRouteDeps
): void {
  // POST: primary endpoint
  app.post('/api/figma-mcp-variables', (c) => handleFigmaMcpVariablesRoute(c, deps));
  // GET: alias for compatibility
  if (app.get) {
    app.get('/api/figma-mcp/variables', (c) => handleFigmaMcpVariablesRoute(c, deps));
  }
}
