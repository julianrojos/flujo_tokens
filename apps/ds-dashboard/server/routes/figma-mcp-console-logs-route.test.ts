import assert from 'node:assert/strict';
import test from 'node:test';
import { handleGetFigmaMcpConsoleLogs } from './figma-mcp-console-logs-route.ts';
import { getPluginConnectionManager, resetPluginConnectionManager } from '../services/plugin-connection-manager.ts';

function createMockContext(options: { fileKey?: string | null; clear?: boolean; scope?: string | null } = {}) {
  return {
    req: {
      query: (key?: string) => {
        if (key === 'fileKey') return options.fileKey ?? null;
        if (key === 'clear') return options.clear ? 'true' : null;
        if (key === 'scope') return options.scope ?? null;
        return null;
      },
      header: (name?: string) => {
        if (name === 'x-ds-dashboard-internal-token') return undefined;
        return undefined;
      },
      json: async () => ({}),
    },
    json: (data: unknown, status?: number) => ({ data, status }),
  } as unknown as { req: { query: (key?: string) => string | null; header: (name?: string) => string | undefined; json: () => Promise<Record<string, unknown>> }; json: (data: unknown, status?: number) => { data: unknown; status?: number } };
}

test('figma-mcp-console-logs-route: returns empty array when no logs', async () => {
  resetPluginConnectionManager();

  const mockC = createMockContext();
  // Pass deps with getConnInfoFn that returns loopback address
  const response = await handleGetFigmaMcpConsoleLogs(mockC, {
    getConnInfoFn: () => ({ remote: { address: '127.0.0.1' } }),
  });

  assert.equal(response.status, 200);
  const data = response.data as { ok: boolean; data: unknown[]; fileKey: string | null; count: number };
  assert.equal(data.ok, true);
  assert.deepEqual(data.data, []);
  assert.equal(data.fileKey, null);
  assert.equal(data.count, 0);
});

test('figma-mcp-console-logs-route: returns logs from buffer', async () => {
  resetPluginConnectionManager();

  // Add a log to the buffer
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
    fileKey: 'FILE_TEST',
    docName: 'Test',
    pluginVersion: '1.0.0',
    pluginBuild: 'test',
    timestamp: Date.now(),
  });

  // Simulate CONSOLE_CAPTURE
  manager.handleMessage(socketId, JSON.stringify({
    type: 'CONSOLE_CAPTURE',
    level: 'log',
    message: 'Test log message',
    args: ['arg1', 'arg2'],
    timestamp: Date.now(),
  }));

  const mockC = createMockContext({ fileKey: 'FILE_TEST' });
  const response = await handleGetFigmaMcpConsoleLogs(mockC, {
    getConnInfoFn: () => ({ remote: { address: '127.0.0.1' } }),
  });

  assert.equal(response.status, 200);
  const data = response.data as { ok: boolean; data: unknown[]; fileKey: string | null; count: number };
  assert.equal(data.ok, true);
  assert.equal(data.data.length, 1);
  assert.equal(data.count, 1);
  assert.equal((data.data[0] as { message: string }).message, 'Test log message');
});

test('figma-mcp-console-logs-route: falls back to activeFileKey when no fileKey param', async () => {
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
    fileKey: 'FILE_FALLBACK',
    docName: 'Test',
    pluginVersion: '1.0.0',
    pluginBuild: 'test',
    timestamp: Date.now(),
  });

  // Make FILE_FALLBACK active via SELECTION_CHANGE
  manager.handleMessage(socketId, JSON.stringify({
    type: 'SELECTION_CHANGE',
    nodes: [],
    count: 0,
    page: 'Page 1',
    timestamp: Date.now(),
  }));

  manager.handleMessage(socketId, JSON.stringify({
    type: 'CONSOLE_CAPTURE',
    level: 'log',
    message: 'Active file log',
    args: [],
    timestamp: Date.now(),
  }));

  // Call without fileKey — should use active file key as fallback
  const mockC = createMockContext(); // no fileKey
  const response = await handleGetFigmaMcpConsoleLogs(mockC, {
    getConnInfoFn: () => ({ remote: { address: '127.0.0.1' } }),
  });

  assert.equal(response.status, 200);
  const data = response.data as { ok: boolean; data: unknown[]; fileKey: string | null; count: number };
  assert.equal(data.ok, true);
  assert.equal(data.fileKey, 'FILE_FALLBACK');
  assert.equal(data.data.length, 1); // but resolves data from active file
  assert.equal((data.data[0] as { message: string }).message, 'Active file log');
});

test('figma-mcp-console-logs-route: scope=all returns entries with fileKey metadata', async () => {
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
    type: 'CONSOLE_CAPTURE',
    data: {
      level: 'log',
      message: 'A log',
      args: [],
      timestamp: Date.now(),
    },
  }));
  manager.handleMessage(socketB, JSON.stringify({
    type: 'CONSOLE_CAPTURE',
    data: {
      level: 'log',
      message: 'B log',
      args: [],
      timestamp: Date.now(),
    },
  }));

  const response = await handleGetFigmaMcpConsoleLogs(createMockContext({ scope: 'all' }), {
    getConnInfoFn: () => ({ remote: { address: '127.0.0.1' } }),
  });

  assert.equal(response.status, 200);
  const data = response.data as {
    ok: boolean;
    data: Array<{ fileKey: string; message: string }>;
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

test('figma-mcp-console-logs-route: clear=true clears logs after reading', async () => {
  resetPluginConnectionManager();

  // Add logs to the buffer
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
    fileKey: 'FILE_CLEAR',
    docName: 'Test',
    pluginVersion: '1.0.0',
    pluginBuild: 'test',
    timestamp: Date.now(),
  });

  manager.handleMessage(socketId, JSON.stringify({
    type: 'CONSOLE_CAPTURE',
    level: 'log',
    message: 'Log to clear',
    args: [],
    timestamp: Date.now(),
  }));

  // First read with clear=true
  const mockC = createMockContext({ fileKey: 'FILE_CLEAR', clear: true });
  const response1 = await handleGetFigmaMcpConsoleLogs(mockC, {
    getConnInfoFn: () => ({ remote: { address: '127.0.0.1' } }),
  });

  const data1 = response1.data as { ok: boolean; data: unknown[]; count: number };
  assert.equal(data1.data.length, 1);

  // Second read should return empty array
  const mockC2 = createMockContext({ fileKey: 'FILE_CLEAR' });
  const response2 = await handleGetFigmaMcpConsoleLogs(mockC2, {
    getConnInfoFn: () => ({ remote: { address: '127.0.0.1' } }),
  });

  const data2 = response2.data as { ok: boolean; data: unknown[]; count: number };
  assert.equal(data2.data.length, 0);
  assert.equal(data2.count, 0);
});
