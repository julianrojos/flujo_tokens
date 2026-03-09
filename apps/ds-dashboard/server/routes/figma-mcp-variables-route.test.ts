/**
 * Tests for Figma MCP Variables Route
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import type { Context } from 'hono';
import { Hono } from 'hono';

import { registerFigmaMcpVariablesRoute, type FigmaMcpVariablesRouteDeps } from './figma-mcp-variables-route.ts';

function createTestApp(overrides: Partial<FigmaMcpVariablesRouteDeps> = {}): Hono {
  const app = new Hono();
  registerFigmaMcpVariablesRoute(app, {
    readJsonBody: async (c: Context) => await c.req.json(),
    getConnInfoFn: () => ({ remote: { address: '127.0.0.1' } }),
    ...overrides,
  });
  return app;
}

test('figma-mcp-variables-route: blocks non-loopback clients', async () => {
  let fetchCalled = false;
  const app = createTestApp({
    getConnInfoFn: () => ({ remote: { address: '10.20.30.40' } }),
    fetchFigmaMcpVariablesFn: async () => {
      fetchCalled = true;
      return { meta: { variables: {}, variableCollections: {} } };
    },
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
  assert.equal(fetchCalled, false);
});

test('figma-mcp-variables-route: blocks requests with missing remote address when no trusted token is present', async () => {
  let fetchCalled = false;
  const app = createTestApp({
    getConnInfoFn: () => ({ remote: { address: '' } }),
    fetchFigmaMcpVariablesFn: async () => {
      fetchCalled = true;
      return { meta: { variables: {}, variableCollections: {} } };
    },
  });

  const response = await app.request('/api/figma-mcp-variables', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });

  assert.equal(response.status, 403);
  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.code, 'mcp_variables.forbidden_remote');
  assert.equal(fetchCalled, false);
});

test('figma-mcp-variables-route: forwards figmaUrl and returns meta payload', async () => {
  let capturedArgs: { figmaUrl?: string } | null = null;
  const app = createTestApp({
    fetchFigmaMcpVariablesFn: async (args) => {
      capturedArgs = args;
      return {
        meta: {
          variableCollections: { 'Collection:1': { id: 'Collection:1', name: 'Primitives' } },
          variables: { 'VariableID:1': { id: 'VariableID:1', name: 'color/primary' } },
        },
      };
    },
  });

  const response = await app.request('/api/figma-mcp-variables', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ figmaUrl: 'https://www.figma.com/design/abc/Test' }),
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.meta?.variables?.['VariableID:1']?.name, 'color/primary');
  assert.deepEqual(capturedArgs, {
    figmaUrl: 'https://www.figma.com/design/abc/Test',
  });
});

test('figma-mcp-variables-route: allows trusted internal token from non-loopback client', async () => {
  let fetchCalled = false;
  const app = createTestApp({
    getConnInfoFn: () => ({ remote: { address: '10.20.30.40' } }),
    internalToken: 'internal-secret',
    fetchFigmaMcpVariablesFn: async () => {
      fetchCalled = true;
      return { meta: { variables: {}, variableCollections: {} } };
    },
  });

  const response = await app.request('/api/figma-mcp-variables', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-ds-dashboard-internal-token': 'internal-secret',
    },
    body: JSON.stringify({}),
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(fetchCalled, true);
});

test('figma-mcp-variables-route: allows trusted internal token when remote address is missing', async () => {
  let fetchCalled = false;
  const app = createTestApp({
    getConnInfoFn: () => ({ remote: { address: '' } }),
    internalToken: 'internal-secret',
    fetchFigmaMcpVariablesFn: async () => {
      fetchCalled = true;
      return { meta: { variables: {}, variableCollections: {} } };
    },
  });

  const response = await app.request('/api/figma-mcp-variables', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-ds-dashboard-internal-token': 'internal-secret',
    },
    body: JSON.stringify({}),
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(fetchCalled, true);
});

test('figma-mcp-variables-route: maps fetch errors to fetch_failed payload', async () => {
  const app = createTestApp({
    fetchFigmaMcpVariablesFn: async () => {
      throw new Error('synthetic variables failure');
    },
  });

  const response = await app.request('/api/figma-mcp-variables', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.code, 'mcp_variables.fetch_failed');
  assert.match(String(payload.message || ''), /synthetic variables failure/i);
});
