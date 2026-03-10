/**
 * Tests for Figma MCP Design System Kit Route
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { Hono } from 'hono';

import { registerFigmaMcpDesignSystemKitRoute, type FigmaMcpDesignSystemKitRouteDeps } from './figma-mcp-design-system-kit-route.ts';
import type { DesignSystemKitResult } from '../../../../tooling/src/services/figma-mcp-variables.js';

function createTestApp(overrides: Partial<FigmaMcpDesignSystemKitRouteDeps> = {}): Hono {
  const app = new Hono();
  registerFigmaMcpDesignSystemKitRoute(app, {
    getConnInfoFn: () => ({ remote: { address: '127.0.0.1' } }),
    internalToken: 'test-token',
    ...overrides,
  });
  return app;
}

test('design-system-kit-route: GET returns 403 for non-loopback without token', async () => {
  const app = createTestApp({
    getConnInfoFn: () => ({ remote: { address: '10.20.30.40' } }),
  });

  const response = await app.request('/api/figma-mcp/design-system-kit', { method: 'GET' });

  assert.equal(response.status, 403);
  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.code, 'kit.forbidden_remote');
});

test('design-system-kit-route: GET returns ok:true with kit data on success', async () => {
  const mockResult: DesignSystemKitResult = {
    ok: true,
    tokens: { variables: {}, variableCollections: {} },
    styles: [],
    elapsedMs: 42,
  };

  const app = createTestApp({
    fetchDesignSystemKitFn: async () => mockResult,
  });

  const response = await app.request('/api/figma-mcp/design-system-kit', {
    method: 'GET',
    headers: { 'x-ds-dashboard-internal-token': 'test-token' },
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.elapsedMs, 42);
});

test('design-system-kit-route: GET returns ok:false with code when service fails', async () => {
  const app = createTestApp({
    fetchDesignSystemKitFn: async () => ({ ok: false, code: 'kit.timeout', message: 'Timed out', retryable: true }),
  });

  const response = await app.request('/api/figma-mcp/design-system-kit', {
    method: 'GET',
    headers: { 'x-ds-dashboard-internal-token': 'test-token' },
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.code, 'kit.timeout');
});

test('design-system-kit-route: GET passes format and include query params to service', async () => {
  let capturedFormat: string | undefined;
  let capturedInclude: string[] | undefined;

  const app = createTestApp({
    fetchDesignSystemKitFn: async (args) => {
      capturedFormat = args.format;
      capturedInclude = args.include;
      return { ok: true, tokens: { variables: {}, variableCollections: {} }, styles: [], elapsedMs: 10 };
    },
  });

  const response = await app.request('/api/figma-mcp/design-system-kit?format=compact&include=tokens,components', {
    method: 'GET',
    headers: { 'x-ds-dashboard-internal-token': 'test-token' },
  });

  assert.equal(response.status, 200);
  assert.equal(capturedFormat, 'compact');
  assert.deepEqual(capturedInclude, ['tokens', 'components']);
});

test('design-system-kit-route: GET allows loopback without token', async () => {
  const app = createTestApp({
    getConnInfoFn: () => ({ remote: { address: '127.0.0.1' } }),
    fetchDesignSystemKitFn: async () => ({ ok: false, code: 'kit.not_connected', message: 'Not connected' }),
  });

  const response = await app.request('/api/figma-mcp/design-system-kit', { method: 'GET' });

  assert.notEqual(response.status, 403);
  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.code, 'kit.not_connected');
});
