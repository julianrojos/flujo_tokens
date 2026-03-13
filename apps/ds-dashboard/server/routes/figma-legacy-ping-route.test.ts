/**
 * Tests for Figma MCP Ping Route (Deprecated)
 * 
 * This endpoint is deprecated and returns 410 Gone.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { Hono } from 'hono';

import { registerFigmaMcpPingRoute } from './figma-legacy-ping-route.ts';

function createTestApp(): Hono {
  const app = new Hono();
  registerFigmaMcpPingRoute(app);
  return app;
}

test('figma-mcp-ping-route (deprecated): POST returns 410 Gone', async () => {
  const app = createTestApp();

  const response = await app.request('/api/figma-mcp/ping', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ figmaUrl: 'https://www.figma.com/design/abc/Test' }),
  });

  assert.equal(response.status, 410);
  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.code, 'legacy_endpoint_removed');
  assert.ok(payload.message.includes('removed'));
  assert.equal(payload.deprecated, true);
  assert.ok(payload.migration);
  assert.equal(payload.migration.directMode, true);
});
