import type { Context } from 'hono';

import {
  buildTokenGraphQueryPayload,
  normalizeTokenGraphDepth,
  normalizeTokenGraphDirection,
} from './token-graph-service.mjs';

export interface TokenGraphRouteHandlerDeps {
  failJson: (c: Context, statusCode: number, args: Record<string, unknown>) => unknown;
  getSystemContext: (systemHeader: string) => { systemId: string };
  tokenRepo?: import('../db/token-repository.js').TokenRepository;
}

function missingRepo(c: Context, deps: TokenGraphRouteHandlerDeps) {
  return deps.failJson(c, 500, {
    code: 'internal.token_repo_missing',
    userMessage: 'Token repository is not initialized.',
    recoverable: false,
  });
}

export async function handleTokenUsageIndexRoute(c: Context, deps: TokenGraphRouteHandlerDeps): Promise<unknown> {
  const { getSystemContext, tokenRepo } = deps;
  if (!tokenRepo) return missingRepo(c, deps);
  const sysCtx = getSystemContext(c.req.header('x-ds-system') ?? '');
  return c.json(tokenRepo.getTokenUsageIndex(sysCtx.systemId));
}

export async function handleTokenGraphRoute(c: Context, deps: TokenGraphRouteHandlerDeps): Promise<unknown> {
  const { getSystemContext, tokenRepo } = deps;
  if (!tokenRepo) return missingRepo(c, deps);
  const sysCtx = getSystemContext(c.req.header('x-ds-system') ?? '');
  const graph = tokenRepo.getTokenGraph(sysCtx.systemId);
  if (!graph) {
    return deps.failJson(c, 404, {
      code: 'token_graph.not_found',
      userMessage: 'Token graph not found. Run token graph refresh first.',
      recoverable: true,
    });
  }
  return c.json(graph);
}

export async function handleTokenGraphQueryRoute(c: Context, deps: TokenGraphRouteHandlerDeps): Promise<unknown> {
  const { getSystemContext, tokenRepo } = deps;
  if (!tokenRepo) return missingRepo(c, deps);
  const token = String(c.req.query('token') ?? c.req.query('tokenPath') ?? '').trim();
  if (!token) {
    return deps.failJson(c, 400, {
      code: 'validation.token_required',
      userMessage: 'token query param is required.',
      recoverable: true,
      context: { field: 'token' },
    });
  }
  const direction = normalizeTokenGraphDirection(c.req.query('direction'));
  const depth = normalizeTokenGraphDepth(c.req.query('depth'));
  const sysCtx = getSystemContext(c.req.header('x-ds-system') ?? '');
  const graph = tokenRepo.getTokenGraph(sysCtx.systemId);
  if (!graph) {
    return deps.failJson(c, 404, {
      code: 'token_graph.not_found',
      userMessage: 'Token graph not found. Run token graph refresh first.',
      recoverable: true,
    });
  }
  const payload = buildTokenGraphQueryPayload({ graph, token, direction, depth });
  if (!payload) {
    return deps.failJson(c, 404, {
      code: 'token_graph.token_not_found',
      userMessage: `Token '${token}' not found in token graph.`,
      recoverable: true,
      context: { token },
    });
  }
  return c.json(payload);
}
