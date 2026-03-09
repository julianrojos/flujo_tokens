/**
 * Tests for Figma MCP Reset Route
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import type { Context } from 'hono';
import { Hono } from 'hono';

import { registerFigmaMcpResetRoute, type FigmaMcpResetRouteDeps } from './figma-mcp-reset-route.ts';

function createTestApp(overrides: Partial<FigmaMcpResetRouteDeps> = {}): Hono {
  const app = new Hono();
  registerFigmaMcpResetRoute(app, overrides);
  return app;
}

test('figma-mcp-reset-route: requires explicit confirmation', async () => {
  const app = createTestApp({
    getConnInfoFn: () => ({ remote: { address: '127.0.0.1' } }),
  });

  const response = await app.request('/api/figma-mcp/reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });

  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.code, 'mcp_reset.confirmation_required');
});

test('figma-mcp-reset-route: blocks non-loopback clients', async () => {
  let disposeCalled = false;
  const app = createTestApp({
    getConnInfoFn: () => ({ remote: { address: '10.20.30.40' } }),
    disposeFigmaMcpPingServiceFn: () => {
      disposeCalled = true;
    },
  });

  const response = await app.request('/api/figma-mcp/reset', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-ds-mcp-reset-confirm': 'true',
    },
    body: JSON.stringify({ confirmGlobalReset: true }),
  });

  assert.equal(response.status, 403);
  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.code, 'mcp_reset.forbidden_remote');
  assert.equal(disposeCalled, false);
});

test('figma-mcp-reset-route: blocks requests with missing remote address', async () => {
  let disposeCalled = false;
  const app = createTestApp({
    getConnInfoFn: () => ({ remote: { address: '' } }),
    disposeFigmaMcpPingServiceFn: () => {
      disposeCalled = true;
    },
  });

  const response = await app.request('/api/figma-mcp/reset', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-ds-mcp-reset-confirm': 'true',
    },
    body: JSON.stringify({ confirmGlobalReset: true }),
  });

  assert.equal(response.status, 403);
  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.code, 'mcp_reset.forbidden_remote');
  assert.equal(disposeCalled, false);
});

test('figma-mcp-reset-route: resets when confirmation and loopback checks pass', async () => {
  const calls = {
    dispose: 0,
    warmup: 0,
  };

  const app = createTestApp({
    getConnInfoFn: () => ({ remote: { address: '127.0.0.1' } }),
    disposeFigmaMcpPingServiceFn: () => {
      calls.dispose += 1;
    },
    warmupFigmaMcpPingServiceFn: () => {
      calls.warmup += 1;
    },
    sleepMs: 0,
  });

  const response = await app.request('/api/figma-mcp/reset', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-ds-mcp-reset-confirm': 'true',
    },
    body: JSON.stringify({ confirmGlobalReset: true }),
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.restarting, true);
  assert.equal(calls.dispose, 1);
  assert.equal(calls.warmup, 1);
});
