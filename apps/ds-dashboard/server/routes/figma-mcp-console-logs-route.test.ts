import assert from 'node:assert/strict';
import test from 'node:test';
import { Hono } from 'hono';
import { registerFigmaMcpConsoleLogsRoute } from './figma-mcp-console-logs-route.ts';
import { getPluginConnectionManager, resetPluginConnectionManager } from '../services/plugin-connection-manager.ts';
import { createMockConnInfo, createMockPluginSocket, readJson } from './figma-mcp-test-helpers.ts';

interface ConsoleLogEntry {
  fileKey: string;
  message: string;
}

interface ConsoleLogsResponse {
  ok: boolean;
  data: ConsoleLogEntry[];
  fileKey: string | null;
  count: number;
}

function createTestApp(): Hono {
  const app = new Hono();
  registerFigmaMcpConsoleLogsRoute(app, {
    getConnInfoFn: createMockConnInfo,
    internalToken: 'test-token',
  });
  return app;
}

function buildConsoleLogsPath(options: { fileKey?: string; clear?: boolean; scope?: 'all' } = {}): string {
  const params = new URLSearchParams();
  if (options.fileKey) params.set('fileKey', options.fileKey);
  if (options.clear) params.set('clear', 'true');
  if (options.scope) params.set('scope', options.scope);
  const query = params.toString();
  return query ? `/api/figma-mcp/console-logs?${query}` : '/api/figma-mcp/console-logs';
}

test('figma-mcp-console-logs-route: returns empty array when no logs', async () => {
  resetPluginConnectionManager();
  const app = createTestApp();

  const response = await app.request(buildConsoleLogsPath(), { method: 'GET' });

  assert.equal(response.status, 200);
  const data = await readJson<ConsoleLogsResponse>(response);
  assert.equal(data.ok, true);
  assert.deepEqual(data.data, []);
  assert.equal(data.fileKey, null);
  assert.equal(data.count, 0);
});

test('figma-mcp-console-logs-route: returns logs from buffer', async () => {
  resetPluginConnectionManager();
  const app = createTestApp();

  // Add a log to the buffer
  const manager = getPluginConnectionManager();
  const mockSocket = createMockPluginSocket();

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

  const response = await app.request(buildConsoleLogsPath({ fileKey: 'FILE_TEST' }), { method: 'GET' });

  assert.equal(response.status, 200);
  const data = await readJson<ConsoleLogsResponse>(response);
  assert.equal(data.ok, true);
  assert.equal(data.data.length, 1);
  assert.equal(data.count, 1);
  assert.equal(data.data[0].message, 'Test log message');
});

test('figma-mcp-console-logs-route: falls back to activeFileKey when no fileKey param', async () => {
  resetPluginConnectionManager();
  const app = createTestApp();

  const manager = getPluginConnectionManager();
  const mockSocket = createMockPluginSocket();

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
  const response = await app.request(buildConsoleLogsPath(), { method: 'GET' });

  assert.equal(response.status, 200);
  const data = await readJson<ConsoleLogsResponse>(response);
  assert.equal(data.ok, true);
  assert.equal(data.fileKey, 'FILE_FALLBACK');
  assert.equal(data.data.length, 1); // but resolves data from active file
  assert.equal(data.data[0].message, 'Active file log');
});

test('figma-mcp-console-logs-route: scope=all returns entries with fileKey metadata', async () => {
  resetPluginConnectionManager();
  const app = createTestApp();

  const manager = getPluginConnectionManager();
  const mockSocket = createMockPluginSocket();

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

  const response = await app.request(buildConsoleLogsPath({ scope: 'all' }), { method: 'GET' });

  assert.equal(response.status, 200);
  const data = await readJson<ConsoleLogsResponse>(response);
  assert.equal(data.ok, true);
  assert.equal(data.fileKey, null);
  assert.equal(data.count, 2);
  assert.equal(data.data.length, 2);
  const keys = new Set(data.data.map((entry: { fileKey: string }) => entry.fileKey));
  assert.deepEqual(keys, new Set(['FILE_A', 'FILE_B']));
});

test('figma-mcp-console-logs-route: clear=true clears logs after reading', async () => {
  resetPluginConnectionManager();
  const app = createTestApp();

  // Add logs to the buffer
  const manager = getPluginConnectionManager();
  const mockSocket = createMockPluginSocket();

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
  const response1 = await app.request(buildConsoleLogsPath({ fileKey: 'FILE_CLEAR', clear: true }), {
    method: 'GET',
  });

  const data1 = await readJson<ConsoleLogsResponse>(response1);
  assert.equal(data1.data.length, 1);

  // Second read should return empty array
  const response2 = await app.request(buildConsoleLogsPath({ fileKey: 'FILE_CLEAR' }), { method: 'GET' });

  const data2 = await readJson<ConsoleLogsResponse>(response2);
  assert.equal(data2.data.length, 0);
  assert.equal(data2.count, 0);
});
