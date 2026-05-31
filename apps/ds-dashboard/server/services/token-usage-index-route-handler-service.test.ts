import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { handleTokenUsageIndexRoute } from './token-usage-index-route-handler-service.ts';

function createContext(url: string) {
  const requestUrl = new URL(url);
  return {
    req: {
      header: () => 'sys-01',
      query: (key: string) => requestUrl.searchParams.get(key) ?? undefined,
    },
    json: (payload: unknown, status = 200) => ({ status, payload }),
  } as unknown as import('hono').Context;
}

describe('token-usage-index-route-handler-service', () => {
  it('returns usage index from tokenRepo', async () => {
    const ctx = createContext('http://localhost/api/token-usage-index');
    const res = (await handleTokenUsageIndexRoute(ctx, {
      failJson: (c, statusCode, args) => (c as any).json({ code: args.code }, statusCode),
      getSystemContext: () => ({ systemId: 'sys-01' }),
      tokenRepo: {
        getTokenUsageIndex: () => ({
          ok: true,
          summary: {
            generatedAt: '',
            tokens_total: 0,
            tokens_with_usage: 0,
            tokens_without_usage: 0,
            usage_links_total: 0,
            usage_links_by_kind: {},
            unresolved_total: 0,
          },
          warnings: [],
          unresolved: [],
          entries: [],
          byPath: {},
          bySlashPath: {},
          byCssVar: {},
        }),
      } as any,
    })) as any;
    assert.equal(res.status, 200);
  });
});
