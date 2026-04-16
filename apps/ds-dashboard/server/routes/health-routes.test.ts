import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Hono } from 'hono';

import { registerHealthRoutes } from './health-routes.js';

function createFailJson() {
  return (c: any, statusCode: number, args: any) =>
    c.json(
      {
        ok: false,
        code: args.code,
        message: args.userMessage,
      },
      statusCode,
    );
}

function createApp(overrides: Partial<any> = {}) {
  const app = new Hono();
  registerHealthRoutes(app, {
    failJson: createFailJson(),
    getSystemContext: () => ({
      systemId: 'sys-01',
      tokenRegistryPath: '/db/token-registry',
      tokenUsageIndexPath: '/db/token-usage-index',
      tokenGraphVizPath: '/db/token-graph',
      wcagPairsPath: '/cfg/wcag-pairs',
      componentRegistryPath: '/db/component-registry',
    }),
    healthRepo: {
      getSnapshot: () => null,
      getHistory: () => [],
      ...overrides.healthRepo,
    },
  });
  return app;
}

describe('health-routes', () => {
  it('/api/token-health returns empty bootstrap payload when snapshot missing', async () => {
    const app = createApp();
    const res = await app.request('/api/token-health');
    assert.equal(res.status, 200);
    const payload = (await res.json()) as any;
    assert.equal(payload.ok, false);
    assert.equal(payload.bootstrapped, true);
  });

  it('/api/health-history returns DB-backed snapshots', async () => {
    const app = createApp({
      healthRepo: {
        getHistory: () => [
          {
            entryJson: {
              captured_at: new Date().toISOString(),
              metrics: {},
              fingerprints: {},
              meta: {},
            },
          },
        ],
      },
    });
    const res = await app.request('/api/health-history?range=7d');
    assert.equal(res.status, 200);
    const payload = (await res.json()) as any;
    assert.equal(payload.ok, true);
    assert.equal(Array.isArray(payload.snapshots), true);
    assert.equal(payload.snapshots.length, 1);
  });
});
