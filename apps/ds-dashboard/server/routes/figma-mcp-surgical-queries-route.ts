/**
 * Figma MCP Surgical Queries Routes
 *
 * Handles get-children, search-styles, search-variables requests.
 */

import type { Context } from 'hono';
import type { ConnInfo } from '@hono/node-server/conninfo';
import { getConnInfo } from '@hono/node-server/conninfo';
import {
  getChildrenViaMcp,
  searchStylesViaMcp,
  searchVariablesViaMcp,
  type GetChildrenOptions,
  type SearchStylesOptions,
  type SearchVariablesOptions,
  type SurgicalQueryResult,
  type SurgicalQueryError,
} from '../../../../tooling/src/services/figma-mcp-surgical-queries.js';
import { isLoopbackAddress } from '../lib/loopback-utils.ts';

export interface FigmaMcpSurgicalQueriesRouteDeps {
  getConnInfoFn?: (c: Context) => ConnInfo;
  internalToken?: string;
  getChildrenViaMcpFn?: typeof getChildrenViaMcp;
  searchStylesViaMcpFn?: typeof searchStylesViaMcp;
  searchVariablesViaMcpFn?: typeof searchVariablesViaMcp;
}

/**
 * Check if a request is authorized for MCP management endpoints.
 * Fail-closed: empty remoteAddress requires valid token.
 */
function isAuthorized(c: Context, internalToken: string | undefined, getConnInfoFn: (c: Context) => ConnInfo): boolean {
  const connInfo = getConnInfoFn(c);
  const remoteAddress = String(connInfo?.remote?.address || '').trim();
  
  if (remoteAddress && isLoopbackAddress(remoteAddress)) {
    return true;
  }
  
  if (!internalToken) {
    return false;
  }
  
  const receivedToken = String(c.req.header('x-ds-dashboard-internal-token') || '').trim();
  return receivedToken === internalToken;
}

// ============================================================================
// GET /api/figma-mcp/get-children
// ============================================================================

interface GetChildrenRequest {
  parentId?: unknown;
  fileUrl?: unknown;
  limit?: unknown;
  cursor?: unknown;
}

/**
 * POST /api/figma-mcp/get-children
 * 
 * Get children of a specific node.
 */
export async function handleGetChildren(c: Context, deps: FigmaMcpSurgicalQueriesRouteDeps): Promise<Response> {
  const getConnInfoFn = deps.getConnInfoFn ?? getConnInfo;
  const internalToken = deps.internalToken ?? process.env.DS_DASHBOARD_INTERNAL_TOKEN;

  if (!isAuthorized(c, internalToken, getConnInfoFn)) {
    return c.json(
      {
        ok: false,
        code: 'get_children.forbidden_remote',
        message: 'Endpoint allowed only from loopback or with internal token.',
      },
      403
    );
  }

  let body: GetChildrenRequest;
  try {
    body = (await c.req.json()) as GetChildrenRequest;
  } catch {
    return c.json(
      {
        ok: false,
        code: 'get_children.invalid_body',
        message: 'Invalid JSON body.',
      },
      400
    );
  }

  if (!body.parentId || typeof body.parentId !== 'string') {
    return c.json(
      {
        ok: false,
        code: 'get_children.parent_missing',
        message: 'parentId is required and must be a string.',
      },
      400
    );
  }

  const options: GetChildrenOptions = {
    parentId: body.parentId,
    fileUrl: typeof body.fileUrl === 'string' ? body.fileUrl : undefined,
    limit: body.limit !== undefined ? Number(body.limit) : undefined,
    cursor: typeof body.cursor === 'string' ? body.cursor : undefined,
    env: process.env,
  };

  const queryFn = deps.getChildrenViaMcpFn ?? getChildrenViaMcp;
  const result = await queryFn(options);

  if (!result.ok) {
    const statusCode = result.code.startsWith('get_children.parent') || result.code === 'get_children.invalid_body' ? 400 : 500;
    return c.json(result, statusCode);
  }

  return c.json(result, 200);
}

// ============================================================================
// POST /api/figma-mcp/search-styles
// ============================================================================

interface SearchStylesRequest {
  nameContains?: unknown;
  styleType?: unknown;
  fileUrl?: unknown;
  limit?: unknown;
}

/**
 * POST /api/figma-mcp/search-styles
 * 
 * Search styles by name.
 */
export async function handleSearchStyles(c: Context, deps: FigmaMcpSurgicalQueriesRouteDeps): Promise<Response> {
  const getConnInfoFn = deps.getConnInfoFn ?? getConnInfo;
  const internalToken = deps.internalToken ?? process.env.DS_DASHBOARD_INTERNAL_TOKEN;

  if (!isAuthorized(c, internalToken, getConnInfoFn)) {
    return c.json(
      {
        ok: false,
        code: 'search_styles.forbidden_remote',
        message: 'Endpoint allowed only from loopback or with internal token.',
      },
      403
    );
  }

  let body: SearchStylesRequest;
  try {
    body = (await c.req.json()) as SearchStylesRequest;
  } catch {
    return c.json(
      {
        ok: false,
        code: 'search_styles.invalid_body',
        message: 'Invalid JSON body.',
      },
      400
    );
  }

  if (!body.nameContains || typeof body.nameContains !== 'string') {
    return c.json(
      {
        ok: false,
        code: 'search_styles.name_missing',
        message: 'nameContains is required and must be a string.',
      },
      400
    );
  }

  const options: SearchStylesOptions = {
    nameContains: body.nameContains,
    styleType: typeof body.styleType === 'string' ? body.styleType as SearchStylesOptions['styleType'] : undefined,
    fileUrl: typeof body.fileUrl === 'string' ? body.fileUrl : undefined,
    limit: body.limit !== undefined ? Number(body.limit) : undefined,
    env: process.env,
  };

  const queryFn = deps.searchStylesViaMcpFn ?? searchStylesViaMcp;
  const result = await queryFn(options);

  if (!result.ok) {
    const statusCode = result.code.startsWith('search_styles.name') || result.code === 'search_styles.invalid_body' ? 400 : 500;
    return c.json(result, statusCode);
  }

  return c.json(result, 200);
}

// ============================================================================
// POST /api/figma-mcp/search-variables
// ============================================================================

interface SearchVariablesRequest {
  nameContains?: unknown;
  collection?: unknown;
  mode?: unknown;
  fileUrl?: unknown;
  limit?: unknown;
}

/**
 * POST /api/figma-mcp/search-variables
 * 
 * Search variables by name with optional collection/mode filters.
 */
export async function handleSearchVariables(c: Context, deps: FigmaMcpSurgicalQueriesRouteDeps): Promise<Response> {
  const getConnInfoFn = deps.getConnInfoFn ?? getConnInfo;
  const internalToken = deps.internalToken ?? process.env.DS_DASHBOARD_INTERNAL_TOKEN;

  if (!isAuthorized(c, internalToken, getConnInfoFn)) {
    return c.json(
      {
        ok: false,
        code: 'search_variables.forbidden_remote',
        message: 'Endpoint allowed only from loopback or with internal token.',
      },
      403
    );
  }

  let body: SearchVariablesRequest;
  try {
    body = (await c.req.json()) as SearchVariablesRequest;
  } catch {
    return c.json(
      {
        ok: false,
        code: 'search_variables.invalid_body',
        message: 'Invalid JSON body.',
      },
      400
    );
  }

  if (!body.nameContains || typeof body.nameContains !== 'string') {
    return c.json(
      {
        ok: false,
        code: 'search_variables.name_missing',
        message: 'nameContains is required and must be a string.',
      },
      400
    );
  }

  const options: SearchVariablesOptions = {
    nameContains: body.nameContains,
    collection: typeof body.collection === 'string' ? body.collection : undefined,
    mode: typeof body.mode === 'string' ? body.mode : undefined,
    fileUrl: typeof body.fileUrl === 'string' ? body.fileUrl : undefined,
    limit: body.limit !== undefined ? Number(body.limit) : undefined,
    env: process.env,
  };

  const queryFn = deps.searchVariablesViaMcpFn ?? searchVariablesViaMcp;
  const result = await queryFn(options);

  if (!result.ok) {
    const statusCode = result.code.startsWith('search_variables.name') || result.code === 'search_variables.invalid_body' ? 400 : 500;
    return c.json(result, statusCode);
  }

  return c.json(result, 200);
}

// ============================================================================
// Route Registration
// ============================================================================

export function registerFigmaMcpSurgicalQueriesRoutes(
  app: { post: (path: string, handler: (c: Context) => Response | Promise<Response>) => void },
  deps: FigmaMcpSurgicalQueriesRouteDeps = {}
): void {
  app.post('/api/figma-mcp/get-children', (c) => handleGetChildren(c, deps));
  app.post('/api/figma-mcp/search-styles', (c) => handleSearchStyles(c, deps));
  app.post('/api/figma-mcp/search-variables', (c) => handleSearchVariables(c, deps));
}
