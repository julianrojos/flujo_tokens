/**
 * Tests for Figma MCP Capabilities Route
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { Hono } from 'hono';

import {
  registerFigmaMcpCapabilitiesRoute,
  type FigmaMcpCapabilitiesRouteDeps,
} from './figma-mcp-capabilities-route.ts';

function createTestApp(overrides?: Partial<FigmaMcpCapabilitiesRouteDeps>): Hono {
  const app = new Hono();
  const deps: FigmaMcpCapabilitiesRouteDeps = {
    getConnInfoFn: () => ({ remote: { address: '127.0.0.1' } }),
    internalToken: 'test-token',
    pingFigmaMcpServiceFn: async () => ({
      connected: false,
      currentPort: 9223,
      message: 'MCP not connected (mock).',
    }),
    listMcpToolsServiceFn: async () => ({
      ok: false,
      code: 'mcp.not_connected',
      message: 'MCP not connected.',
    }),
  };
  if (overrides?.getConnInfoFn) deps.getConnInfoFn = overrides.getConnInfoFn;
  if (overrides?.internalToken) deps.internalToken = overrides.internalToken;
  if (overrides?.pingFigmaMcpServiceFn) deps.pingFigmaMcpServiceFn = overrides.pingFigmaMcpServiceFn;
  if (overrides?.listMcpToolsServiceFn) deps.listMcpToolsServiceFn = overrides.listMcpToolsServiceFn;
  registerFigmaMcpCapabilitiesRoute(app, deps);
  return app;
}

test('figma-mcp-capabilities-route: GET blocks unauthenticated request', async () => {
  const app = createTestApp({
    getConnInfoFn: () => ({ remote: { address: '10.20.30.40' } }),
  });

  const response = await app.request('/api/figma-mcp/capabilities', {
    method: 'GET',
  });

  assert.equal(response.status, 403);
  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.code, 'capabilities.forbidden_remote');
});

test('figma-mcp-capabilities-route: GET allows with valid token and returns capabilities', async () => {
  const app = createTestApp({
    getConnInfoFn: () => ({ remote: { address: '10.20.30.40' } }),
    pingFigmaMcpServiceFn: async () => ({
      connected: true,
      currentPort: 9223,
      message: 'MCP connected.',
    }),
    listMcpToolsServiceFn: async () => ({
      ok: true,
      tools: [{ name: 'figma_get_variables' }],
      elapsedMs: 50,
    }),
  });

  const response = await app.request('/api/figma-mcp/capabilities', {
    method: 'GET',
    headers: { 'x-ds-dashboard-internal-token': 'test-token' },
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.ok(Array.isArray(payload.tools));
  assert.equal(payload.tools.length, 1);
  assert.equal(payload.mcp.connected, true);
});

test('figma-mcp-capabilities-route: GET returns not_connected when MCP down', async () => {
  const app = createTestApp();

  const response = await app.request('/api/figma-mcp/capabilities', {
    method: 'GET',
    headers: { 'x-ds-dashboard-internal-token': 'test-token' },
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.code, 'mcp.not_connected');
});

test('figma-mcp-capabilities-route: GET preserves ping error code when MCP down', async () => {
  const app = createTestApp({
    pingFigmaMcpServiceFn: async () => ({
      connected: false,
      currentPort: 9227,
      code: 'mcp.instance_mismatch',
      message: 'Bridge connected to another MCP instance.',
    }),
  });

  const response = await app.request('/api/figma-mcp/capabilities', {
    method: 'GET',
    headers: { 'x-ds-dashboard-internal-token': 'test-token' },
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.code, 'mcp.instance_mismatch');
});

test('figma-mcp-capabilities-route: GET blocks empty remoteAddress without token (fail-closed)', async () => {
  const app = createTestApp({
    getConnInfoFn: () => ({ remote: { address: '' } }),
  });

  const response = await app.request('/api/figma-mcp/capabilities', {
    method: 'GET',
  });

  assert.equal(response.status, 403);
  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.code, 'capabilities.forbidden_remote');
});

test('figma-mcp-capabilities-route: GET allows loopback without token', async () => {
  const app = createTestApp({
    getConnInfoFn: () => ({ remote: { address: '127.0.0.1' } }),
  });

  const response = await app.request('/api/figma-mcp/capabilities', {
    method: 'GET',
  });

  // Will return mcp.not_connected (mock), but should pass auth
  assert.notEqual(response.status, 403);
  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.code, 'mcp.not_connected');
});

test('figma-mcp-capabilities-route: GET returns method_not_found when tools/list unavailable', async () => {
  const app = createTestApp({
    pingFigmaMcpServiceFn: async () => ({
      connected: true,
      currentPort: 9223,
      message: 'MCP connected.',
    }),
    listMcpToolsServiceFn: async () => ({
      ok: false,
      code: 'mcp.method_not_found',
      message: 'MCP tools/list method not available.',
      retryable: false,
    }),
  });

  const response = await app.request('/api/figma-mcp/capabilities', {
    method: 'GET',
    headers: { 'x-ds-dashboard-internal-token': 'test-token' },
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.code, 'mcp.method_not_found');
});

test('figma-mcp-capabilities-route: GET returns timeout when tools/list times out', async () => {
  const app = createTestApp({
    pingFigmaMcpServiceFn: async () => ({
      connected: true,
      currentPort: 9223,
      message: 'MCP connected.',
    }),
    listMcpToolsServiceFn: async () => ({
      ok: false,
      code: 'mcp.timeout',
      message: 'MCP list tools timed out.',
      retryable: true,
    }),
  });

  const response = await app.request('/api/figma-mcp/capabilities', {
    method: 'GET',
    headers: { 'x-ds-dashboard-internal-token': 'test-token' },
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.code, 'mcp.timeout');
});

test('figma-mcp-capabilities-route: GET returns capabilities when tools/list succeeds', async () => {
  const app = createTestApp({
    pingFigmaMcpServiceFn: async () => ({
      connected: true,
      currentPort: 9223,
      message: 'MCP connected.',
    }),
    listMcpToolsServiceFn: async () => ({
      ok: true,
      tools: [
        { name: 'figma_get_variables', description: 'Get Figma variables' },
        { name: 'figma_search_nodes', description: 'Search nodes' },
      ],
      elapsedMs: 50,
    }),
  });

  const response = await app.request('/api/figma-mcp/capabilities', {
    method: 'GET',
    headers: { 'x-ds-dashboard-internal-token': 'test-token' },
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.ok(Array.isArray(payload.tools));
  assert.equal(payload.tools.length, 2);
  assert.equal(payload.supports.searchNodes, true);
  assert.equal(payload.supports.searchVariables, true);
  assert.equal(payload.mcp.connected, true);
  // currentPort may be undefined if detectPort is not enabled
  assert.ok(payload.mcp.currentPort === 9223 || payload.mcp.currentPort === undefined);
});
