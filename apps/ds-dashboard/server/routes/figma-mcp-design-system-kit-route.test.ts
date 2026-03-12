/**
 * Tests for Figma MCP Design System Kit Route
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { Hono } from 'hono';

import { registerFigmaMcpDesignSystemKitRoute, type FigmaMcpDesignSystemKitRouteDeps } from './figma-mcp-design-system-kit-route.ts';
import type { DesignSystemKitResult } from '../../../../tooling/src/services/figma-mcp-variables.js';
import { getPluginConnectionManager, resetPluginConnectionManager, type PluginWebSocket } from '../services/plugin-connection-manager.ts';

function createTestApp(overrides: Partial<FigmaMcpDesignSystemKitRouteDeps> = {}): Hono {
  const app = new Hono();
  registerFigmaMcpDesignSystemKitRoute(app, {
    getConnInfoFn: () => ({ remote: { address: '127.0.0.1' } }),
    internalToken: 'test-token',
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

test('design-system-kit-route: direct mode returns kit data from plugin ws', async () => {
  const prevMode = process.env.MCP_TRANSPORT;
  process.env.MCP_TRANSPORT = 'direct';
  resetPluginConnectionManager();

  try {
    const manager = getPluginConnectionManager();
    let socketId = '';
    const socket = createMockSocket((data) => {
      const request = JSON.parse(data) as { id: string; method: string };
      if (request.method === 'GET_VARIABLES_DATA') {
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
        return;
      }
      manager.handleMessage(
        socketId,
        JSON.stringify({
          id: request.id,
          result: {
            success: true,
            timestamp: Date.now(),
            fileKey: 'abc',
            styles: [{ id: 's1', name: 'Heading', styleType: 'TEXT', description: '' }],
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
      fetchDesignSystemKitFn: async () => ({ ok: false, code: 'legacy.unused', message: 'unused' }),
    });

    const response = await app.request('/api/figma-mcp/design-system-kit?fileUrl=https://www.figma.com/design/abc/Test', {
      method: 'GET',
      headers: { 'x-ds-dashboard-internal-token': 'test-token' },
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.styles[0].name, 'Heading');
  } finally {
    resetPluginConnectionManager();
    if (prevMode === undefined) delete process.env.MCP_TRANSPORT;
    else process.env.MCP_TRANSPORT = prevMode;
  }
});

test('design-system-kit-route: shadow mode returns direct result and runs legacy in background', async () => {
  const prevMode = process.env.MCP_TRANSPORT;
  process.env.MCP_TRANSPORT = 'shadow';
  resetPluginConnectionManager();

  try {
    const manager = getPluginConnectionManager();
    let socketId = '';
    const socket = createMockSocket((data) => {
      const request = JSON.parse(data) as { id: string; method: string };
      if (request.method === 'GET_VARIABLES_DATA') {
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
      } else {
        manager.handleMessage(
          socketId,
          JSON.stringify({
            id: request.id,
            result: {
              success: true,
              timestamp: Date.now(),
              fileKey: 'abc',
              styles: [],
            },
          })
        );
      }
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
      fetchDesignSystemKitFn: async () => {
        legacyCalls += 1;
        return { ok: true, tokens: { variables: {}, variableCollections: {} }, styles: [], elapsedMs: 1 };
      },
    });

    const response = await app.request('/api/figma-mcp/design-system-kit?fileUrl=https://www.figma.com/design/abc/Test', {
      method: 'GET',
      headers: { 'x-ds-dashboard-internal-token': 'test-token' },
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
