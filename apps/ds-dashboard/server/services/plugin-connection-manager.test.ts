import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PluginConnectionManager,
  type PluginWebSocket,
  resetPluginConnectionManager,
  getPluginConnectionManager,
} from './plugin-connection-manager.ts';

function createMockSocket(
  onSend: (data: string) => void,
  options: { readyState?: number } = {}
): PluginWebSocket {
  const readyState = options.readyState ?? 1;
  return {
    readyState,
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

test('plugin-connection-manager: correlates request/response by id', async () => {
  const manager = new PluginConnectionManager();
  let socketId = '';

  const socket = createMockSocket((data) => {
    const request = JSON.parse(data) as { id: string; method: string };
    manager.handleMessage(socketId, JSON.stringify({ id: request.id, result: { ok: true, method: request.method } }));
  });

  socketId = manager.register(socket, {
    fileKey: 'FILE_1',
    docName: 'Doc',
    pluginVersion: '1.0.0',
    pluginBuild: 'test',
    timestamp: Date.now(),
  });

  const result = await manager.request<{ ok: boolean; method: string }>(socketId, 'GET_VARIABLES_DATA');
  assert.deepEqual(result, { ok: true, method: 'GET_VARIABLES_DATA' });
});

test('plugin-connection-manager: rejects with timeout when plugin does not respond', async () => {
  const manager = new PluginConnectionManager({ defaultTimeoutMs: 5 });
  const socket = createMockSocket(() => {
    // no-op
  });

  const socketId = manager.register(socket, {
    fileKey: 'FILE_1',
    docName: 'Doc',
    pluginVersion: '1.0.0',
    pluginBuild: 'test',
    timestamp: Date.now(),
  });

  await assert.rejects(
    () => manager.request(socketId, 'GET_VARIABLES_DATA'),
    /ws\.request\.timeout:GET_VARIABLES_DATA/
  );
});

test('plugin-connection-manager: unregister only rejects pending requests for the closed socket', async () => {
  const manager = new PluginConnectionManager({ defaultTimeoutMs: 1_000 });

  let socketAId = '';
  const socketA = createMockSocket(() => {
    // no-op
  });
  socketAId = manager.register(socketA, {
    fileKey: 'FILE_A',
    docName: 'A',
    pluginVersion: '1.0.0',
    pluginBuild: 'test',
    timestamp: Date.now(),
  });

  let socketBId = '';
  const socketB = createMockSocket((data) => {
    const request = JSON.parse(data) as { id: string };
    manager.handleMessage(socketBId, JSON.stringify({ id: request.id, result: { ok: true } }));
  });
  socketBId = manager.register(socketB, {
    fileKey: 'FILE_B',
    docName: 'B',
    pluginVersion: '1.0.0',
    pluginBuild: 'test',
    timestamp: Date.now(),
  });

  const pendingA = manager.request(socketAId, 'GET_VARIABLES_DATA');
  const pendingB = manager.request<{ ok: boolean }>(socketBId, 'GET_VARIABLES_DATA');

  manager.unregister(socketAId, 'test-close');

  await assert.rejects(() => pendingA, /ws\.connection\.closed:GET_VARIABLES_DATA/);
  const resultB = await pendingB;
  assert.deepEqual(resultB, { ok: true });
});

test('plugin-connection-manager: singleton can be reset for tests', () => {
  const first = getPluginConnectionManager();
  resetPluginConnectionManager();
  const second = getPluginConnectionManager();
  assert.notEqual(first, second);
});

test('plugin-connection-manager: requestForFileKey prefers open socket when newer socket is closed', async () => {
  const manager = new PluginConnectionManager();

  let openSocketId = '';
  const openSocket = createMockSocket((data) => {
    const request = JSON.parse(data) as { id: string };
    manager.handleMessage(openSocketId, JSON.stringify({ id: request.id, result: { ok: true } }));
  });
  openSocketId = manager.register(openSocket, {
    fileKey: 'FILE_SHARED',
    docName: 'open',
    pluginVersion: '1.0.0',
    pluginBuild: 'test',
    timestamp: Date.now(),
  });

  const closedSocket = createMockSocket(
    () => {
      throw new Error('closed socket should never be selected');
    },
    { readyState: 3 }
  );
  manager.register(closedSocket, {
    fileKey: 'FILE_SHARED',
    docName: 'closed',
    pluginVersion: '1.0.0',
    pluginBuild: 'test',
    timestamp: Date.now(),
  });

  const result = await manager.requestForFileKey<{ ok: boolean }>('FILE_SHARED', 'GET_VARIABLES_DATA');
  assert.deepEqual(result, { ok: true });
});
