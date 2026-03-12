/**
 * Tests for Figma MCP Reconcile Route (Deprecated)
 * 
 * This endpoint is deprecated and returns 410 Gone.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { Hono } from 'hono';

import { registerFigmaMcpReconcileRoute } from './figma-legacy-reconcile-route.ts';

function createTestApp(): Hono {
  const app = new Hono();
  registerFigmaMcpReconcileRoute(app, {
    getConnInfoFn: () => ({ remote: { address: '127.0.0.1' } }),
  });
  return app;
}

test('figma-mcp-reconcile-route (deprecated): POST returns 403 from non-loopback', async () => {
  const app = new Hono();
  registerFigmaMcpReconcileRoute(app, {
    getConnInfoFn: () => ({ remote: { address: '10.20.30.40' } }),
  });

  const response = await app.request('/api/figma-mcp/reconcile', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ figmaUrl: 'https://www.figma.com/design/abc/Test' }),
  });

  assert.equal(response.status, 403);
});

test('figma-mcp-reconcile-route (deprecated): POST returns 410 Gone from loopback', async () => {
  const app = createTestApp();

  const response = await app.request('/api/figma-mcp/reconcile', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ figmaUrl: 'https://www.figma.com/design/abc/Test' }),
  });

  assert.equal(response.status, 410);
  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.code, 'legacy_endpoint_removed');
  assert.ok(payload.message.includes('removed'));
  assert.equal(payload.phase, 'legacy_removed');
});
