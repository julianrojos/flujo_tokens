import type { Context } from 'hono';

export interface TokenUsageIndexRouteHandlerDeps {
  failJson: (c: Context, statusCode: number, args: Record<string, unknown>) => unknown;
  getSystemContext: (
    systemHeader: string,
  ) => { systemId: string } | Promise<{ systemId: string }>;
  tokenRepo?: import('../db/token-repository.js').TokenRepository;
}

function missingRepo(c: Context, deps: TokenUsageIndexRouteHandlerDeps) {
  return deps.failJson(c, 500, {
    code: 'internal.token_repo_missing',
    userMessage: 'Token repository is not initialized.',
    recoverable: false,
  });
}

export async function handleTokenUsageIndexRoute(c: Context, deps: TokenUsageIndexRouteHandlerDeps): Promise<unknown> {
  const { getSystemContext, tokenRepo } = deps;
  if (!tokenRepo) return missingRepo(c, deps);
  const sysCtx = await getSystemContext(c.req.header('x-ds-system') ?? '');
  return c.json(await tokenRepo.getTokenUsageIndex(sysCtx.systemId));
}
