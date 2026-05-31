import assert from 'node:assert/strict';
import test from 'node:test';

import { Hono } from 'hono';

import { registerTokenUsageIndexRoutes } from './token-usage-index-routes.ts';

function createFailJson() {
  return (c: any, statusCode: number, args: Record<string, unknown>) =>
    c.json(
      {
        ok: false,
        code: args.code,
        message: args.userMessage,
      },
      statusCode,
    );
}

function createApp(tokenRepo: any) {
  const app = new Hono();
  registerTokenUsageIndexRoutes(app, {
    failJson: createFailJson(),
    getSystemContext: () => ({ systemId: 'sys-01' }),
    tokenRepo,
  });
  return app;
}

test('token-usage-index-routes: /api/token-usage-index serves DB payload', async () => {
  const app = createApp({
    getTokenUsageIndex: () => ({
      ok: true,
      summary: {
        generatedAt: '',
        tokens_total: 1,
        tokens_with_usage: 1,
        tokens_without_usage: 0,
        usage_links_total: 1,
        usage_links_by_kind: { 'component-spec': 1 },
        unresolved_total: 0,
      },
      warnings: [],
      unresolved: [],
      entries: [],
      byPath: {},
      bySlashPath: {},
      byCssVar: {},
    }),
  });
  const res = await app.request('/api/token-usage-index');
  assert.equal(res.status, 200);
  const payload = (await res.json()) as any;
  assert.equal(payload.summary.tokens_total, 1);
});
