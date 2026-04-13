import assert from 'node:assert/strict';
import test from 'node:test';

import { Hono } from 'hono';

import { registerFigmaMcpComponentsRoutes } from './figma-mcp-components-route.ts';
import {
  getPluginConnectionManager,
  resetPluginConnectionManager,
  type PluginWebSocket,
} from '../services/plugin-connection-manager.ts';

function makeSocket(onSend: (data: string) => void): PluginWebSocket {
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

function createTestApp() {
  const app = new Hono();
  registerFigmaMcpComponentsRoutes(app, {
    internalToken: 'test-token',
  });
  return app;
}

test.beforeEach(() => {
  resetPluginConnectionManager();
});

test.afterEach(() => {
  resetPluginConnectionManager();
});

test('figma-mcp-components-route: returns no_socket when no plugin is connected', async () => {
  const app = createTestApp();

  const response = await app.request('/api/figma-mcp/search-components', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-ds-dashboard-internal-token': 'test-token',
    },
    body: JSON.stringify({ figmaUrl: 'https://www.figma.com/design/FILE_X/Test' }),
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.code, 'mcp_components.no_socket');
});

test('figma-mcp-components-route: forwards offset for paginated search and returns paging metadata', async () => {
  const manager = getPluginConnectionManager();
  let socketId = '';
  let capturedRequest:
    | { method?: string; params?: Record<string, unknown> }
    | null = null;

  const socket = makeSocket((data) => {
    const request = JSON.parse(data) as {
      id: string;
      method: string;
      params?: Record<string, unknown>;
    };
    capturedRequest = { method: request.method, params: request.params };

    manager.handleMessage(
      socketId,
      JSON.stringify({
        id: request.id,
        result: {
          success: true,
          components: [
            {
              key: 'k1',
              nodeId: '10:1',
              name: 'Button',
              type: 'COMPONENT_SET',
              pageName: 'Main',
            },
          ],
          count: 1,
          total: 10,
          hasMore: true,
          nextOffset: 6,
          truncated: false,
          totalIsEstimated: false,
          limit: 5,
        },
      }),
    );
  });

  socketId = manager.register(socket, {
    fileKey: 'FILE123',
    docName: 'Doc',
    pluginVersion: '1.0.0',
    pluginBuild: 'test',
    timestamp: Date.now(),
  });

  const app = createTestApp();
  const response = await app.request('/api/figma-mcp/search-components', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-ds-dashboard-internal-token': 'test-token',
    },
    body: JSON.stringify({
      figmaUrl: 'https://www.figma.com/design/FILE123/Test',
      limit: 5,
      offset: 5,
      compact: true,
    }),
  });

  assert.equal(response.status, 200);
  assert.equal(capturedRequest?.method, 'SEARCH_COMPONENTS');
  assert.equal(capturedRequest?.params?.offset, 5);
  assert.equal(capturedRequest?.params?.limit, 5);

  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.hasMore, true);
  assert.equal(payload.nextOffset, 6);
  assert.equal(payload.limit, 5);
  assert.equal(payload.total, 10);
});
