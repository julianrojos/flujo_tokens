/**
 * Tests for Figma MCP Variables Route
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import type { Context } from 'hono';
import { Hono } from 'hono';

import { registerFigmaMcpVariablesRoute, type FigmaMcpVariablesRouteDeps } from './figma-mcp-variables-route.ts';
import { getPluginConnectionManager, resetPluginConnectionManager, type PluginWebSocket } from '../services/plugin-connection-manager.ts';

const ORIGINAL_MCP_TRANSPORT = process.env.MCP_TRANSPORT;
test.beforeEach(() => {
  process.env.MCP_TRANSPORT = 'legacy';
});
test.after(() => {
  if (ORIGINAL_MCP_TRANSPORT === undefined) delete process.env.MCP_TRANSPORT;
  else process.env.MCP_TRANSPORT = ORIGINAL_MCP_TRANSPORT;
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

function createMockSocket(onSend: (data: string) => void): PluginWebSocket {
  return {
    readyState: 1,
    protocol: '',
    send(data: string) {
      onSend(data);
    },
    close() {},
    onopen: null,
    onclose: null,
    onerror: null,
    onmessage: null,
  };
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

test('figma-mcp-variables-route: retries once on recoverable disconnect without restarting shared MCP client', async () => {
  let attempts = 0;
  let disposeCalls = 0;
  const app = createTestApp({
    fetchFigmaMcpVariablesFn: async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error('MCP server is running, but it is not connected to Figma Desktop.');
      }
      return {
        meta: {
          variableCollections: { 'Collection:1': { id: 'Collection:1', name: 'Primitives' } },
          variables: { 'VariableID:1': { id: 'VariableID:1', name: 'color/primary' } },
        },
      };
    },
    disposeFigmaMcpPingServiceFn: () => {
      disposeCalls += 1;
    },
    getFigmaMcpHeartbeatStatusFn: () => ({ alive: true }),
  });

  const response = await app.request('/api/figma-mcp-variables', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(attempts, 2);
  assert.equal(disposeCalls, 0);
});

test('figma-mcp-variables-route: retries once on broken MCP stdio stream error', async () => {
  let attempts = 0;
  let disposeCalls = 0;
  const app = createTestApp({
    fetchFigmaMcpVariablesFn: async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error('MCP stdin stream is closed (tools/call).');
      }
      return {
        meta: {
          variableCollections: { 'Collection:1': { id: 'Collection:1', name: 'Primitives' } },
          variables: { 'VariableID:1': { id: 'VariableID:1', name: 'color/primary' } },
        },
      };
    },
    disposeFigmaMcpPingServiceFn: () => {
      disposeCalls += 1;
    },
    getFigmaMcpHeartbeatStatusFn: () => ({ alive: true }),
  });

  const response = await app.request('/api/figma-mcp-variables', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(attempts, 2);
  assert.equal(disposeCalls, 1);
});

test('figma-mcp-variables-route: retries recoverable legacy disconnect even when heartbeat is false', async () => {
  let attempts = 0;
  let disposeCalls = 0;
  const app = createTestApp({
    fetchFigmaMcpVariablesFn: async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error('MCP server is running, but it is not connected to Figma Desktop.');
      }
      return {
        meta: {
          variableCollections: { 'Collection:1': { id: 'Collection:1', name: 'Primitives' } },
          variables: { 'VariableID:1': { id: 'VariableID:1', name: 'color/primary' } },
        },
      };
    },
    disposeFigmaMcpPingServiceFn: () => {
      disposeCalls += 1;
    },
    getFigmaMcpHeartbeatStatusFn: () => ({ alive: false }),
  });

  const response = await app.request('/api/figma-mcp-variables', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(attempts, 2);
  assert.equal(disposeCalls, 0);
});

test('figma-mcp-variables-route: direct mode returns variables from plugin ws', async () => {
  const prevMode = process.env.MCP_TRANSPORT;
  process.env.MCP_TRANSPORT = 'direct';
  resetPluginConnectionManager();

  try {
    const manager = getPluginConnectionManager();
    let socketId = '';
    const socket = createMockSocket((data) => {
      const request = JSON.parse(data) as { id: string; method: string };
      manager.handleMessage(
        socketId,
        JSON.stringify({
          id: request.id,
          result: {
            success: true,
            timestamp: Date.now(),
            fileKey: 'abc',
            variables: [
              {
                id: 'v1',
                name: 'color/primary',
                key: 'k1',
                resolvedType: 'COLOR',
                valuesByMode: {},
                variableCollectionId: 'c1',
                scopes: [],
                description: '',
                hiddenFromPublishing: false,
              },
            ],
            variableCollections: [
              { id: 'c1', name: 'Primitives', key: 'pc1', modes: [], defaultModeId: '', variableIds: [] },
            ],
          },
        })
      );
    });

    socketId = manager.register(socket, {
      fileKey: 'abc',
      docName: 'Doc',
      pluginVersion: '1.0.0',
      pluginBuild: 'test',
      timestamp: Date.now(),
    });

    const app = createTestApp({
      fetchFigmaMcpVariablesFn: async () => {
        throw new Error('legacy should not run');
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
    assert.equal(payload.meta.variables.v1.name, 'color/primary');
  } finally {
    resetPluginConnectionManager();
    if (prevMode === undefined) delete process.env.MCP_TRANSPORT;
    else process.env.MCP_TRANSPORT = prevMode;
  }
});

test('figma-mcp-variables-route: direct mode falls back to legacy when no socket exists for file', async () => {
  const prevMode = process.env.MCP_TRANSPORT;
  process.env.MCP_TRANSPORT = 'direct';
  resetPluginConnectionManager();

  let legacyCalls = 0;
  const app = createTestApp({
    fetchFigmaMcpVariablesFn: async () => {
      legacyCalls += 1;
      return {
        meta: {
          variableCollections: { c1: { id: 'c1', name: 'Primitives' } },
          variables: { v1: { id: 'v1', name: 'color/primary' } },
        },
      };
    },
  });

  try {
    const response = await app.request('/api/figma-mcp-variables', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ figmaUrl: 'https://www.figma.com/design/abc/Test' }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.meta.variables.v1.name, 'color/primary');
    assert.equal(legacyCalls, 1);
  } finally {
    if (prevMode === undefined) delete process.env.MCP_TRANSPORT;
    else process.env.MCP_TRANSPORT = prevMode;
    resetPluginConnectionManager();
  }
});

test('figma-mcp-variables-route: shadow mode returns direct result and runs legacy in background', async () => {
  const prevMode = process.env.MCP_TRANSPORT;
  process.env.MCP_TRANSPORT = 'shadow';
  resetPluginConnectionManager();

  try {
    const manager = getPluginConnectionManager();
    let socketId = '';
    const socket = createMockSocket((data) => {
      const request = JSON.parse(data) as { id: string };
      manager.handleMessage(
        socketId,
        JSON.stringify({
          id: request.id,
          result: {
            success: true,
            timestamp: Date.now(),
            fileKey: 'abc',
            variables: [],
            variableCollections: [],
          },
        })
      );
    });

    socketId = manager.register(socket, {
      fileKey: 'abc',
      docName: 'Doc',
      pluginVersion: '1.0.0',
      pluginBuild: 'test',
      timestamp: Date.now(),
    });

    let legacyCalls = 0;
    const app = createTestApp({
      fetchFigmaMcpVariablesFn: async () => {
        legacyCalls += 1;
        return { meta: { variables: {}, variableCollections: {} } };
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

    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.ok(legacyCalls >= 1);
  } finally {
    resetPluginConnectionManager();
    if (prevMode === undefined) delete process.env.MCP_TRANSPORT;
    else process.env.MCP_TRANSPORT = prevMode;
  }
});
