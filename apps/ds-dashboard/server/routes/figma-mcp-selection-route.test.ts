import assert from 'node:assert/strict';
import test from 'node:test';
import { handleGetFigmaMcpSelection } from './figma-mcp-selection-route.ts';
import { getPluginConnectionManager, resetPluginConnectionManager } from '../services/plugin-connection-manager.ts';

function createMockContext(options: { fileKey?: string | null } = {}) {
  return {
    req: {
      query: (key?: string) => {
        if (key === 'fileKey') return options.fileKey ?? null;
        return null;
      },
      header: (_name?: string) => undefined,
      json: async () => ({}),
    },
    json: (data: unknown, status?: number) =>
      new Response(JSON.stringify(data), {
        status: status ?? 200,
        headers: { 'content-type': 'application/json' },
      }),
  } as any;
}

test('figma-mcp-selection-route: returns null when no selection is buffered', async () => {
  resetPluginConnectionManager();

  const response = await handleGetFigmaMcpSelection(createMockContext(), {
    getConnInfoFn: () => ({ remote: { address: '127.0.0.1' } }),
  });

  assert.equal(response.status, 200);
  const data = (await response.json()) as { ok: boolean; data: unknown | null; fileKey: string | null };
  assert.equal(data.ok, true);
  assert.equal(data.fileKey, null);
  assert.equal(data.data, null);
});

test('figma-mcp-selection-route: returns latest selection for provided fileKey', async () => {
  resetPluginConnectionManager();

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
    fileKey: 'FILE_SELECTION',
    docName: 'Doc',
    pluginVersion: '1.0.0',
    pluginBuild: 'test',
    timestamp: Date.now(),
  });

  manager.handleMessage(socketId, JSON.stringify({
    type: 'SELECTION_CHANGE',
    nodes: [{ id: '1:2', name: 'Frame', type: 'FRAME' }],
    count: 1,
    page: 'Page 1',
    timestamp: Date.now(),
  }));

  const response = await handleGetFigmaMcpSelection(createMockContext({ fileKey: 'FILE_SELECTION' }), {
    getConnInfoFn: () => ({ remote: { address: '127.0.0.1' } }),
  });

  assert.equal(response.status, 200);
  const data = (await response.json()) as {
    ok: boolean;
    data: { count: number; nodes: Array<{ id: string }> } | null;
    fileKey: string | null;
  };
  assert.equal(data.ok, true);
  assert.equal(data.fileKey, 'FILE_SELECTION');
  assert.notEqual(data.data, null);
  assert.equal(data.data?.count, 1);
  assert.equal(data.data?.nodes[0]?.id, '1:2');
});

test('figma-mcp-selection-route: falls back to activeFileKey when no fileKey param', async () => {
  resetPluginConnectionManager();

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
    fileKey: 'FILE_ACTIVE_SELECTION',
    docName: 'Doc',
    pluginVersion: '1.0.0',
    pluginBuild: 'test',
    timestamp: Date.now(),
  });

  manager.handleMessage(socketId, JSON.stringify({
    type: 'SELECTION_CHANGE',
    data: {
      nodes: [{ id: '3:4', name: 'Card', type: 'FRAME' }],
      count: 1,
      page: 'Page 2',
      timestamp: Date.now(),
    },
  }));

  const response = await handleGetFigmaMcpSelection(createMockContext(), {
    getConnInfoFn: () => ({ remote: { address: '127.0.0.1' } }),
  });

  assert.equal(response.status, 200);
  const data = (await response.json()) as {
    ok: boolean;
    data: { count: number; nodes: Array<{ id: string }> } | null;
    fileKey: string | null;
  };
  assert.equal(data.ok, true);
  assert.equal(data.fileKey, 'FILE_ACTIVE_SELECTION');
  assert.notEqual(data.data, null);
  assert.equal(data.data?.nodes[0]?.id, '3:4');
});
