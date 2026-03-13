/**
 * Tests for Figma MCP Variables Route (Direct-Only Mode)
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import type { Context } from 'hono';
import { Hono } from 'hono';

import { registerFigmaMcpVariablesRoute, type FigmaMcpVariablesRouteDeps } from './figma-mcp-variables-route.ts';
import { getPluginConnectionManager, resetPluginConnectionManager } from '../services/plugin-connection-manager.ts';

// Mock data for testing - uses Record<string, ...> to match FigmaVariablesResponse contract
const mockVariablesData = {
  meta: {
    variables: {
      'var1': { id: 'var1', name: 'Color/Primary', key: 'key1', resolvedType: 'COLOR', valuesByMode: {}, variableCollectionId: 'col1', scopes: [], description: '', hiddenFromPublishing: false, remote: false },
      'var2': { id: 'var2', name: 'Spacing/Small', key: 'key2', resolvedType: 'FLOAT', valuesByMode: {}, variableCollectionId: 'col2', scopes: [], description: '', hiddenFromPublishing: false, remote: false },
      'var3': { id: 'var3', name: 'Color/Secondary', key: 'key3', resolvedType: 'COLOR', valuesByMode: {}, variableCollectionId: 'col1', scopes: [], description: '', hiddenFromPublishing: false, remote: false },
    },
    variableCollections: {
      'col1': { id: 'col1', name: 'Global', key: 'global-key', modes: [{ modeId: 'mode1', name: 'Default' }], defaultModeId: 'mode1', remote: false },
      'col2': { id: 'col2', name: 'Spacing', key: 'spacing-key', modes: [{ modeId: 'mode1', name: 'Default' }], defaultModeId: 'mode1', remote: false },
    },
  },
};

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

// Test S-02: returnAsLinks=true from query string returns resource links
test('figma-mcp-variables-route: ?returnAsLinks=true returns items as resource_links', async () => {
  // Mock the fetchVariablesDirect function
  const fetchVariablesDirectStub = async () => mockVariablesData;

  // Create test app with mocked dependency
  const app = createTestApp({
    fetchVariablesDirect: fetchVariablesDirectStub,
  });

  // Make request with returnAsLinks=true in query
  const response = await app.request('/api/figma-mcp-variables?returnAsLinks=true', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ figmaUrl: 'https://www.figma.com/design/abc/Test' }),
  });

  // Verify response
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.ok(Array.isArray(payload.items));
  assert.equal(payload.items[0].type, 'resource_link');
  assert.ok(payload.pagination);
  assert.ok(payload.serverMeta);
  assert.equal(payload.serverMeta.schemaVersion, '1.0.0');
});

// Test S-02b: returnAsLinks=false from query string works
test('figma-mcp-variables-route: ?returnAsLinks=false uses standard mode', async () => {
  // Mock the fetchVariablesDirect function
  const fetchVariablesDirectStub = async () => mockVariablesData;

  // Create test app with mocked dependency
  const app = createTestApp({
    fetchVariablesDirect: fetchVariablesDirectStub,
  });

  // Make request with returnAsLinks=false in query
  const response = await app.request('/api/figma-mcp-variables?returnAsLinks=false', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ figmaUrl: 'https://www.figma.com/design/abc/Test' }),
  });

  // Verify response
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.ok(payload.meta.variables);
  assert.ok(payload.meta.variableCollections);
  // R-002: Verify variableCollections is Record (not array) - legacy contract
  assert.equal(typeof payload.meta.variableCollections, 'object');
  assert.ok(!Array.isArray(payload.meta.variableCollections));
  assert.ok(payload.meta.variableCollections.col1);
  assert.ok(payload.meta.variableCollections.col2);
  assert.ok(payload.pagination);
  assert.ok(payload.serverMeta);
  assert.equal(payload.serverMeta.schemaVersion, '1.0.0');
  assert.ok(!('items' in payload));
});

// Test S-03: returnAsLinks=1 from query string
test('figma-mcp-variables-route: ?returnAsLinks=1 returns resource_links (numeric)', async () => {
  // Mock the fetchVariablesDirect function
  const fetchVariablesDirectStub = async () => mockVariablesData;

  // Create test app with mocked dependency
  const app = createTestApp({
    fetchVariablesDirect: fetchVariablesDirectStub,
  });

  // Make request with returnAsLinks=1 in query
  const response = await app.request('/api/figma-mcp-variables?returnAsLinks=1', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ figmaUrl: 'https://www.figma.com/design/abc/Test' }),
  });

  // Verify response
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.ok(Array.isArray(payload.items));
  assert.equal(payload.items[0].type, 'resource_link');
  assert.ok(payload.pagination);
  assert.ok(payload.serverMeta);
});

// Test S-03b: returnAsLinks=0 from query string
test('figma-mcp-variables-route: ?returnAsLinks=0 uses standard mode (numeric)', async () => {
  // Mock the fetchVariablesDirect function
  const fetchVariablesDirectStub = async () => mockVariablesData;

  // Create test app with mocked dependency
  const app = createTestApp({
    fetchVariablesDirect: fetchVariablesDirectStub,
  });

  // Make request with returnAsLinks=0 in query
  const response = await app.request('/api/figma-mcp-variables?returnAsLinks=0', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ figmaUrl: 'https://www.figma.com/design/abc/Test' }),
  });

  // Verify response
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.ok(payload.meta.variables);
  assert.ok(payload.pagination);
  assert.ok(payload.serverMeta);
  assert.ok(!('items' in payload));
});

// Test S-04: body overrides query - body=false, query=true
test('figma-mcp-variables-route: body.returnAsLinks=false overrides query=true', async () => {
  // Mock the fetchVariablesDirect function
  const fetchVariablesDirectStub = async () => mockVariablesData;

  // Create test app with mocked dependency
  const app = createTestApp({
    fetchVariablesDirect: fetchVariablesDirectStub,
  });

  // Make request with returnAsLinks=true in query and false in body
  const response = await app.request('/api/figma-mcp-variables?returnAsLinks=true', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ figmaUrl: 'https://www.figma.com/design/abc/Test', returnAsLinks: false }),
  });

  // Verify response - should use standard mode (meta.variables)
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.ok(payload.meta.variables);
  assert.ok(payload.pagination);
  assert.ok(payload.serverMeta);
  assert.ok(!('items' in payload));
});

// Test S-04b: body overrides query - body=true, query=false
test('figma-mcp-variables-route: body.returnAsLinks=true overrides query=false', async () => {
  // Mock the fetchVariablesDirect function
  const fetchVariablesDirectStub = async () => mockVariablesData;

  // Create test app with mocked dependency
  const app = createTestApp({
    fetchVariablesDirect: fetchVariablesDirectStub,
  });

  // Make request with returnAsLinks=false in query and true in body
  const response = await app.request('/api/figma-mcp-variables?returnAsLinks=false', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ figmaUrl: 'https://www.figma.com/design/abc/Test', returnAsLinks: true }),
  });

  // Verify response - should use links mode (items)
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.ok(Array.isArray(payload.items));
  assert.equal(payload.items[0].type, 'resource_link');
  assert.ok(payload.pagination);
  assert.ok(payload.serverMeta);
});

// Test S-01: GET alias returns same shape as POST
test('figma-mcp-variables-route GET alias: /api/figma-mcp/variables returns success with mock', async () => {
  const fetchVariablesDirectStub = async () => mockVariablesData;

  const app = createTestApp({
    fetchVariablesDirect: fetchVariablesDirectStub,
  });

  // GET request to alias path
  const response = await app.request('/api/figma-mcp/variables?figmaUrl=https://www.figma.com/design/abc/Test', {
    method: 'GET',
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.ok(payload.meta);
  assert.ok(payload.serverMeta);
});

// Test S-01b: GET alias with returnAsLinks query param
test('figma-mcp-variables-route GET alias: ?returnAsLinks=true works via query', async () => {
  const fetchVariablesDirectStub = async () => mockVariablesData;

  const app = createTestApp({
    fetchVariablesDirect: fetchVariablesDirectStub,
  });

  // GET request with returnAsLinks in query
  const response = await app.request('/api/figma-mcp/variables?figmaUrl=https://www.figma.com/design/abc/Test&returnAsLinks=true', {
    method: 'GET',
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.ok(Array.isArray(payload.items));
  assert.equal(payload.items[0].type, 'resource_link');
});

// Test R-001: POST with invalid JSON returns explicit 400 error
test('figma-mcp-variables-route: POST with invalid JSON returns 400', async () => {
  const app = createTestApp({
    readJsonBody: async () => {
      throw new Error('Unexpected token X in JSON at position 0');
    },
  });

  // Register a mock socket to avoid no_socket error
  const manager = getPluginConnectionManager();
  const mockSocket = {
    readyState: 1,
    protocol: '',
    send: () => {},
    close: () => {},
    onopen: null,
    onclose: null,
    onerror: null,
    onmessage: null,
  };
  manager.register(mockSocket, {
    fileKey: 'FILE_TEST',
    docName: 'Test',
    pluginVersion: '1.0.0',
    pluginBuild: 'test',
    timestamp: Date.now(),
  });

  // POST request with body that will fail JSON parsing
  const response = await app.request('/api/figma-mcp-variables', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: 'invalid-json-{{{',
  });

  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.code, 'mcp_variables.invalid_body');
  assert.ok(payload.message.includes('Invalid JSON'));
});
