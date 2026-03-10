/**
 * Figma MCP Search Nodes Route
 *
 * Handles surgical node search requests.
 */

import type { Context } from 'hono';
import type { ConnInfo } from '@hono/node-server/conninfo';
import { getConnInfo } from '@hono/node-server/conninfo';
import {
  searchFigmaNodesViaMcp,
  type SearchFigmaNodesOptions,
  type SearchFigmaNodesResult,
  type SearchFigmaNodesError,
} from '../../../../tooling/src/services/figma-mcp-search-nodes.js';
import { isLoopbackAddress } from '../lib/loopback-utils.ts';

export interface FigmaMcpSearchNodesRouteDeps {
  getConnInfoFn?: (c: Context) => ConnInfo;
  internalToken?: string;
  searchFigmaNodesViaMcpFn?: (
    options: SearchFigmaNodesOptions
  ) => Promise<SearchFigmaNodesResult | SearchFigmaNodesError>;
}

interface SearchNodesRequest {
  fileUrl?: unknown;
  parentId?: unknown;
  nameContains?: unknown;
  nodeTypes?: unknown;
  limit?: unknown;
  exactMatch?: unknown;
}

/**
 * Parse exactMatch boolean strictly.
 * Accepts: true, false, 'true', 'false'
 * Defaults to false for any other value.
 */
function parseExactMatch(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const lower = value.trim().toLowerCase();
    if (lower === 'true') return true;
    if (lower === 'false') return false;
  }
  return false;
}

/**
 * Check if a request is authorized for MCP management endpoints.
 * Fail-closed: empty remoteAddress requires valid token.
 */
function isAuthorized(c: Context, internalToken: string | undefined, getConnInfoFn: (c: Context) => ConnInfo): boolean {
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
 * POST /api/figma-mcp/search-nodes
 * 
 * Search Figma nodes by name without loading full tree.
 */
export async function handleSearchFigmaNodes(c: Context, deps: FigmaMcpSearchNodesRouteDeps): Promise<Response> {
  const getConnInfoFn = deps.getConnInfoFn ?? getConnInfo;
  const internalToken = deps.internalToken ?? process.env.DS_DASHBOARD_INTERNAL_TOKEN;

  // Authorization check: fail-closed
  if (!isAuthorized(c, internalToken, getConnInfoFn)) {
    return c.json(
      {
        ok: false,
        code: 'search.forbidden_remote',
        message: 'Endpoint allowed only from loopback or with internal token.',
      },
      403
    );
  }

  // Parse request body
  let body: SearchNodesRequest;
  try {
    body = (await c.req.json()) as SearchNodesRequest;
  } catch {
    return c.json(
      {
        ok: false,
        code: 'search.invalid_body',
        message: 'Invalid JSON body.',
      },
      400
    );
  }

  // Validate required field: nameContains
  if (!body.nameContains || typeof body.nameContains !== 'string') {
    return c.json(
      {
        ok: false,
        code: 'search.name_missing',
        message: 'nameContains is required and must be a string.',
      },
      400
    );
  }

  // Build search options
  const options: SearchFigmaNodesOptions = {
    nameContains: body.nameContains,
    fileUrl: typeof body.fileUrl === 'string' ? body.fileUrl : undefined,
    parentId: typeof body.parentId === 'string' ? body.parentId : undefined,
    nodeTypes: Array.isArray(body.nodeTypes) ? body.nodeTypes.map(String) : undefined,
    limit: body.limit !== undefined ? Number(body.limit) : undefined,
    exactMatch: parseExactMatch(body.exactMatch),
    env: process.env,
  };

  // Execute search with injected function or default
  const searchFn = deps.searchFigmaNodesViaMcpFn ?? searchFigmaNodesViaMcp;
  const result = await searchFn(options);

  if (!result.ok) {
    // Validation errors (400) vs server errors (500)
    const isValidationError = result.code === 'search.name_too_short' || 
                              result.code === 'search.invalid_limit' ||
                              result.code === 'search.name_missing' ||
                              result.code === 'search.invalid_body';
    const statusCode = isValidationError ? 400 : 500;
    return c.json(result, statusCode);
  }

  return c.json(result, 200);
}

export function registerFigmaMcpSearchNodesRoute(
  app: { post: (path: string, handler: (c: Context) => Response | Promise<Response>) => void },
  deps: FigmaMcpSearchNodesRouteDeps = {}
): void {
  app.post('/api/figma-mcp/search-nodes', (c) => handleSearchFigmaNodes(c, deps));
}
