import assert from 'node:assert/strict';
import test from 'node:test';
import { handleGetFigmaMcpDesignChanges } from './figma-mcp-design-changes-route.ts';
import { getPluginConnectionManager, resetPluginConnectionManager } from '../services/plugin-connection-manager.ts';

function createMockContext(options: { fileKey?: string | null; scope?: string | null } = {}) {
  return {
    req: {
      query: (key?: string) => {
        if (key === 'fileKey') return options.fileKey ?? null;
        if (key === 'scope') return options.scope ?? null;
        return null;
      },
      header: (_name?: string) => undefined,
      json: async () => ({}),
    },
    json: (data: unknown, status?: number) => ({ data, status }),
  } as unknown as {
    req: {
      query: (key?: string) => string | null;
      header: (name?: string) => string | undefined;
      json: () => Promise<Record<string, unknown>>;
    };
    json: (data: unknown, status?: number) => { data: unknown; status?: number };
  };
}

test('figma-mcp-design-changes-route: returns empty array when no changes', async () => {
  resetPluginConnectionManager();

  const response = await handleGetFigmaMcpDesignChanges(createMockContext(), {
    getConnInfoFn: () => ({ remote: { address: '127.0.0.1' } }),
  });

  assert.equal(response.status, 200);
  const data = response.data as { ok: boolean; data: unknown[]; fileKey: string | null; count: number };
  assert.equal(data.ok, true);
  assert.deepEqual(data.data, []);
  assert.equal(data.fileKey, null);
  assert.equal(data.count, 0);
});

test('figma-mcp-design-changes-route: falls back to activeFileKey when no fileKey param', async () => {
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
  const mockC = createMockContext(); // no fileKey
  const response = await handleGetFigmaMcpDesignChanges(mockC, {
    getConnInfoFn: () => ({ remote: { address: '127.0.0.1' } }),
  });

  assert.equal(response.status, 200);
  const data = response.data as { ok: boolean; data: Array<{ changeCount: number }>; fileKey: string | null; count: number };
  assert.equal(data.ok, true);
  assert.equal(data.fileKey, 'FILE_FALLBACK_CHANGES');
  assert.equal(data.data.length, 1); // but resolves data from active file
  assert.equal(data.data[0].changeCount, 1);
});

test('figma-mcp-design-changes-route: scope=all returns entries with fileKey metadata', async () => {
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

  const response = await handleGetFigmaMcpDesignChanges(createMockContext({ scope: 'all' }), {
    getConnInfoFn: () => ({ remote: { address: '127.0.0.1' } }),
  });

  assert.equal(response.status, 200);
  const data = response.data as {
    ok: boolean;
    data: Array<{ fileKey: string; changeCount: number }>;
    fileKey: string | null;
    count: number;
  };
  assert.equal(data.ok, true);
  assert.equal(data.fileKey, null);
  assert.equal(data.count, 2);
  assert.equal(data.data.length, 2);
  const keys = new Set(data.data.map((entry) => entry.fileKey));
  assert.deepEqual(keys, new Set(['FILE_A', 'FILE_B']));
});

test('figma-mcp-design-changes-route: returns buffered document changes for fileKey', async () => {
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

  const response = await handleGetFigmaMcpDesignChanges(createMockContext({ fileKey: 'FILE_CHANGES' }), {
    getConnInfoFn: () => ({ remote: { address: '127.0.0.1' } }),
  });

  assert.equal(response.status, 200);
  const data = response.data as { ok: boolean; data: Array<{ changeCount: number }>; fileKey: string | null; count: number };
  assert.equal(data.ok, true);
  assert.equal(data.fileKey, 'FILE_CHANGES');
  assert.equal(data.count, 1);
  assert.equal(data.data.length, 1);
  assert.equal(data.data[0].changeCount, 1);
});
