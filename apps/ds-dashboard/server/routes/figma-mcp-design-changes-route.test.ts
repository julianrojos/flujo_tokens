import assert from 'node:assert/strict';
import test from 'node:test';
import { Hono } from 'hono';
import { registerFigmaMcpDesignChangesRoute } from './figma-mcp-design-changes-route.ts';
import { getPluginConnectionManager, resetPluginConnectionManager } from '../services/plugin-connection-manager.ts';

function createTestApp(): Hono {
  const app = new Hono();
  registerFigmaMcpDesignChangesRoute(app, {
    getConnInfoFn: () => ({
      remote: {
        address: '127.0.0.1',
        port: 3000,
        addressType: 'IPv4',
      },
    }),
    internalToken: 'test-token',
  });
  return app;
}

function buildDesignChangesPath(options: { fileKey?: string; scope?: 'all' } = {}): string {
  const params = new URLSearchParams();
  if (options.fileKey) params.set('fileKey', options.fileKey);
  if (options.scope) params.set('scope', options.scope);
  const query = params.toString();
  return query ? `/api/figma-mcp/design-changes?${query}` : '/api/figma-mcp/design-changes';
}

test('figma-mcp-design-changes-route: returns empty array when no changes', async () => {
  resetPluginConnectionManager();
  const app = createTestApp();

  const response = await app.request(buildDesignChangesPath(), { method: 'GET' });

  assert.equal(response.status, 200);
  const responseData = await response.json();
  assert.equal(responseData.ok, true);
  assert.deepEqual(responseData.data, []);
  assert.equal(responseData.fileKey, null);
  assert.equal(responseData.count, 0);
});

test('figma-mcp-design-changes-route: falls back to activeFileKey when no fileKey param', async () => {
  resetPluginConnectionManager();
  const app = createTestApp();

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

  const socketId = manager.register(mockSocket, {
    fileKey: 'FILE_FALLBACK_CHANGES',
    docName: 'Doc',
    pluginVersion: '1.0.0',
    pluginBuild: 'test',
    timestamp: Date.now(),
  });

  // Make FILE_FALLBACK_CHANGES active via SELECTION_CHANGE
  manager.handleMessage(socketId, JSON.stringify({
    type: 'SELECTION_CHANGE',
    nodes: [],
    count: 0,
    page: 'Page 1',
    timestamp: Date.now(),
  }));

  manager.handleMessage(socketId, JSON.stringify({
    type: 'DOCUMENT_CHANGE',
    hasStyleChanges: false,
    hasNodeChanges: true,
    changedNodeIds: ['2:3'],
    changeCount: 1,
    timestamp: Date.now(),
  }));

  // Call without fileKey — should use active file key as fallback
  const response = await app.request(buildDesignChangesPath(), { method: 'GET' });

  assert.equal(response.status, 200);
  const data: {
    ok: boolean;
    data: Array<{ fileKey: string; changeCount: number }>;
    fileKey: string | null;
    count: number;
  } = await response.json();
  assert.equal(data.ok, true);
  assert.equal(data.fileKey, 'FILE_FALLBACK_CHANGES');
  assert.equal(data.data.length, 1); // but resolves data from active file
  assert.equal(data.data[0].changeCount, 1);
});

test('figma-mcp-design-changes-route: scope=all returns entries with fileKey metadata', async () => {
  resetPluginConnectionManager();
  const app = createTestApp();

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

  const socketA = manager.register(mockSocket, {
    fileKey: 'FILE_A',
    docName: 'A',
    pluginVersion: '1.0.0',
    pluginBuild: 'test',
    timestamp: Date.now(),
  });
  const socketB = manager.register(mockSocket, {
    fileKey: 'FILE_B',
    docName: 'B',
    pluginVersion: '1.0.0',
    pluginBuild: 'test',
    timestamp: Date.now(),
  });

  manager.handleMessage(socketA, JSON.stringify({
    type: 'DOCUMENT_CHANGE',
    data: {
      hasStyleChanges: false,
      hasNodeChanges: true,
      changedNodeIds: ['1:2'],
      changeCount: 1,
      timestamp: Date.now(),
    },
  }));
  manager.handleMessage(socketB, JSON.stringify({
    type: 'DOCUMENT_CHANGE',
    data: {
      hasStyleChanges: true,
      hasNodeChanges: false,
      changedNodeIds: ['2:3'],
      changeCount: 1,
      timestamp: Date.now(),
    },
  }));

  const response = await app.request(buildDesignChangesPath({ scope: 'all' }), { method: 'GET' });

  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.ok, true);
  assert.equal(data.fileKey, null);
  assert.equal(data.count, 2);
  assert.equal(data.data.length, 2);
  const keys = new Set(data.data.map((entry: { fileKey: string }) => entry.fileKey));
  assert.deepEqual(keys, new Set(['FILE_A', 'FILE_B']));
});

test('figma-mcp-design-changes-route: returns buffered document changes for fileKey', async () => {
  resetPluginConnectionManager();
  const app = createTestApp();

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

  const socketId = manager.register(mockSocket, {
    fileKey: 'FILE_CHANGES',
    docName: 'Doc',
    pluginVersion: '1.0.0',
    pluginBuild: 'test',
    timestamp: Date.now(),
  });

  manager.handleMessage(socketId, JSON.stringify({
    type: 'DOCUMENT_CHANGE',
    hasStyleChanges: true,
    hasNodeChanges: true,
    changedNodeIds: ['1:2'],
    changeCount: 1,
    timestamp: Date.now(),
  }));

  const response = await app.request(buildDesignChangesPath({ fileKey: 'FILE_CHANGES' }), { method: 'GET' });

  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.ok, true);
  assert.equal(data.fileKey, 'FILE_CHANGES');
  assert.equal(data.count, 1);
  assert.equal(data.data.length, 1);
  assert.equal(data.data[0].changeCount, 1);
});
