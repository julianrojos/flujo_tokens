/**
 * Tests for Figma MCP Variables Route (Direct-Only Mode)
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import type { Context } from 'hono';
import { Hono } from 'hono';

import { registerFigmaMcpVariablesRoute, type FigmaMcpVariablesRouteDeps } from './figma-mcp-variables-route.ts';
import { getPluginConnectionManager, resetPluginConnectionManager } from '../services/plugin-connection-manager.ts';

test.beforeEach(() => {
  resetPluginConnectionManager();
});

test.afterEach(() => {
  resetPluginConnectionManager();
});

function createTestApp(overrides: Partial<FigmaMcpVariablesRouteDeps> = {}): Hono {
  const app = new Hono();
  registerFigmaMcpVariablesRoute(app, {
    readJsonBody: async (c: Context) => await c.req.json(),
    getConnInfoFn: () => ({ remote: { address: '127.0.0.1' } }),
    ...overrides,
  });
  return app;
}

test('figma-mcp-variables-route (direct-only): blocks non-loopback clients', async () => {
  const app = createTestApp({
    getConnInfoFn: () => ({ remote: { address: '10.20.30.40' } }),
  });

  const response = await app.request('/api/figma-mcp-variables', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ figmaUrl: 'https://www.figma.com/design/abc/Test' }),
  });

  assert.equal(response.status, 403);
  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.code, 'mcp_variables.forbidden_remote');
});

test('figma-mcp-variables-route (direct-only): blocks requests with missing remote address when no trusted token is present', async () => {
  const app = createTestApp({
    getConnInfoFn: () => ({ remote: { address: '' } }),
  });

  const response = await app.request('/api/figma-mcp-variables', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ figmaUrl: 'https://www.figma.com/design/abc/Test' }),
  });

  assert.equal(response.status, 403);
  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.code, 'mcp_variables.forbidden_remote');
});

test('figma-mcp-variables-route (direct-only): allows loopback without token', async () => {
  const app = createTestApp();

  const response = await app.request('/api/figma-mcp-variables', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ figmaUrl: 'https://www.figma.com/design/abc/Test' }),
  });

  // Should not be 403 - will be 200 with either success or no_socket error
  assert.notEqual(response.status, 403);
});

test('figma-mcp-variables-route (direct-only): allows with valid internal token', async () => {
  const app = createTestApp({
    getConnInfoFn: () => ({ remote: { address: '10.20.30.40' } }),
    internalToken: 'secret-token',
  });

  const response = await app.request('/api/figma-mcp-variables', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-ds-dashboard-internal-token': 'secret-token',
    },
    body: JSON.stringify({ figmaUrl: 'https://www.figma.com/design/abc/Test' }),
  });

  // Should not be 403
  assert.notEqual(response.status, 403);
});

test('figma-mcp-variables-route (direct-only): returns no_socket error when no plugin connected', async () => {
  const app = createTestApp();

  const response = await app.request('/api/figma-mcp-variables', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ figmaUrl: 'https://www.figma.com/design/abc/Test' }),
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.code, 'mcp_variables.no_socket');
  assert.ok(payload.message.includes('No plugin connection'));
});
