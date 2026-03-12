/**
 * Tests for Figma MCP Design System Kit Route (Direct-Only Mode)
 * 
 * Note: Tests for successful plugin communication require complex async mocking.
 * Those scenarios are covered by E2E tests with real plugin.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { Hono } from 'hono';

import { registerFigmaMcpDesignSystemKitRoute, type FigmaMcpDesignSystemKitRouteDeps } from './figma-mcp-design-system-kit-route.ts';

function createTestApp(overrides: Partial<FigmaMcpDesignSystemKitRouteDeps> = {}): Hono {
  const app = new Hono();
  registerFigmaMcpDesignSystemKitRoute(app, {
    getConnInfoFn: () => ({ remote: { address: '127.0.0.1' } }),
    internalToken: 'test-token',
    ...overrides,
  });
  return app;
}

test('design-system-kit-route (direct-only): GET returns 403 for non-loopback without token', async () => {
  const app = createTestApp({
    getConnInfoFn: () => ({ remote: { address: '10.20.30.40' } }),
  });

  const response = await app.request('/api/figma-mcp/design-system-kit', { method: 'GET' });

  assert.equal(response.status, 403);
  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.code, 'kit.forbidden_remote');
});

test('design-system-kit-route (direct-only): GET allows loopback without token', async () => {
  const app = createTestApp();

  const response = await app.request('/api/figma-mcp/design-system-kit', {
    method: 'GET',
  });

  // Should not be 403 - will be 200 with either success or no_socket error
  assert.notEqual(response.status, 403);
});

test('design-system-kit-route (direct-only): GET allows with valid internal token', async () => {
  const app = createTestApp({
    getConnInfoFn: () => ({ remote: { address: '10.20.30.40' } }),
  });

  const response = await app.request('/api/figma-mcp/design-system-kit', {
    method: 'GET',
    headers: {
      'x-forwarded-for': '10.20.30.40',
      'x-ds-dashboard-internal-token': 'test-token',
    },
  });

  // Should not be 403
  assert.notEqual(response.status, 403);
});

test('design-system-kit-route (direct-only): GET returns no_socket when no plugin connected', async () => {
  const app = createTestApp();

  const response = await app.request('/api/figma-mcp/design-system-kit', {
    method: 'GET',
    query: { fileUrl: 'https://www.figma.com/design/abc/Test' },
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.code, 'kit.no_socket');
  assert.ok(payload.message.includes('No plugin connection'));
});

test('design-system-kit-route (direct-only): GET handles query parameters', async () => {
  const app = createTestApp();

  const response = await app.request('/api/figma-mcp/design-system-kit', {
    method: 'GET',
    query: {
      fileUrl: 'https://www.figma.com/design/test123/Test',
      format: 'summary',
      include: 'tokens,styles',
    },
  });

  // Should not be 403 - will be 200 with either success or no_socket error
  assert.notEqual(response.status, 403);
});
