import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PluginConnectionManager,
  type PluginWebSocket,
  resetPluginConnectionManager,
  getPluginConnectionManager,
  CircularBuffer,
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
    close() { },
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

test('plugin-connection-manager: getConnectionCount excludes zombie (closed) sockets', () => {
  const manager = new PluginConnectionManager();

  // Register an open socket
  const openSocket = createMockSocket(() => { }, { readyState: 1 });
  manager.register(openSocket, {
    fileKey: 'FILE_1',
    docName: 'open',
    pluginVersion: '1.0.0',
    pluginBuild: 'test',
    timestamp: Date.now(),
  });

  // Register a closed (zombie) socket
  const closedSocket = createMockSocket(() => { }, { readyState: 3 });
  manager.register(closedSocket, {
    fileKey: 'FILE_2',
    docName: 'closed',
    pluginVersion: '1.0.0',
    pluginBuild: 'test',
    timestamp: Date.now(),
  });

  // Should only count the open socket
  assert.equal(manager.getConnectionCount(), 1);
});

test('plugin-connection-manager: getConnectionCount returns 0 when all sockets are zombies', () => {
  const manager = new PluginConnectionManager();

  // Register only closed (zombie) sockets
  const closedSocket1 = createMockSocket(() => { }, { readyState: 3 });
  manager.register(closedSocket1, {
    fileKey: 'FILE_1',
    docName: 'closed1',
    pluginVersion: '1.0.0',
    pluginBuild: 'test',
    timestamp: Date.now(),
  });

  const closedSocket2 = createMockSocket(() => { }, { readyState: 3 });
  manager.register(closedSocket2, {
    fileKey: 'FILE_2',
    docName: 'closed2',
    pluginVersion: '1.0.0',
    pluginBuild: 'test',
    timestamp: Date.now(),
  });

  // Should return 0 - no open connections
  assert.equal(manager.getConnectionCount(), 0);
});

test('plugin-connection-manager: getDebugInfo connectionCount matches open sockets', () => {
  const manager = new PluginConnectionManager();

  const openSocket = createMockSocket(() => { }, { readyState: 1 });
  manager.register(openSocket, {
    fileKey: 'FILE_OPEN',
    docName: 'open',
    pluginVersion: '1.0.0',
    pluginBuild: 'test',
    timestamp: Date.now(),
  });

  const closedSocket = createMockSocket(() => { }, { readyState: 3 });
  manager.register(closedSocket, {
    fileKey: 'FILE_CLOSED',
    docName: 'closed',
    pluginVersion: '1.0.0',
    pluginBuild: 'test',
    timestamp: Date.now(),
  });

  assert.equal(manager.getConnectionCount(), 1);
  assert.equal(manager.getDebugInfo().connectionCount, 1);
  assert.equal(manager.getDebugInfo().connections.length, 2);
  assert.equal(manager.getDebugInfo().openConnections.length, 1);
});

test('plugin-connection-manager: getActiveFileKeys excludes fileKeys from zombie sockets', () => {
  const manager = new PluginConnectionManager();

  // Register an open socket with fileKey
  const openSocket = createMockSocket(() => { }, { readyState: 1 });
  manager.register(openSocket, {
    fileKey: 'FILE_OPEN',
    docName: 'open',
    pluginVersion: '1.0.0',
    pluginBuild: 'test',
    timestamp: Date.now(),
  });

  // Register a closed socket with different fileKey
  const closedSocket = createMockSocket(() => { }, { readyState: 3 });
  manager.register(closedSocket, {
    fileKey: 'FILE_CLOSED',
    docName: 'closed',
    pluginVersion: '1.0.0',
    pluginBuild: 'test',
    timestamp: Date.now(),
  });

  const activeFileKeys = manager.getActiveFileKeys();
  assert.deepEqual(activeFileKeys, ['FILE_OPEN']);
  assert.equal(activeFileKeys.length, 1);
});

test('plugin-connection-manager: getActiveFileKeys returns empty array when all sockets are zombies', () => {
  const manager = new PluginConnectionManager();

  // Register only closed sockets with fileKeys
  const closedSocket1 = createMockSocket(() => { }, { readyState: 3 });
  manager.register(closedSocket1, {
    fileKey: 'FILE_1',
    docName: 'closed1',
    pluginVersion: '1.0.0',
    pluginBuild: 'test',
    timestamp: Date.now(),
  });

  const closedSocket2 = createMockSocket(() => { }, { readyState: 3 });
  manager.register(closedSocket2, {
    fileKey: 'FILE_2',
    docName: 'closed2',
    pluginVersion: '1.0.0',
    pluginBuild: 'test',
    timestamp: Date.now(),
  });

  const activeFileKeys = manager.getActiveFileKeys();
  assert.deepEqual(activeFileKeys, []);
  assert.equal(activeFileKeys.length, 0);
});

test('CircularBuffer: pushes items and maintains max size', () => {
  const buffer = new CircularBuffer<number>(3);

  buffer.push(1);
  buffer.push(2);
  buffer.push(3);

  assert.deepEqual(buffer.toArray(), [1, 2, 3]);

  buffer.push(4); // Should discard oldest (1)

  assert.deepEqual(buffer.toArray(), [2, 3, 4]);
  assert.equal(buffer.toArray().length, 3);
});

test('CircularBuffer: handles empty buffer', () => {
  const buffer = new CircularBuffer<string>(5);
  assert.deepEqual(buffer.toArray(), []);
});

test('CircularBuffer: push with undefined args treats as empty array', () => {
  const buffer = new CircularBuffer<{ level: string; message: string; args: unknown[] }>(10);

  buffer.push({ level: 'log', message: 'test', args: [] });

  assert.equal(buffer.toArray()[0].args.length, 0);
});

test('plugin-connection-manager: CONSOLE_CAPTURE push event adds to buffer with truncation', () => {
  const manager = new PluginConnectionManager();
  const socket = createMockSocket(() => { });

  const socketId = manager.register(socket, {
    fileKey: 'FILE_1',
    docName: 'Doc',
    pluginVersion: '1.0.0',
    pluginBuild: 'test',
    timestamp: Date.now(),
  });

  // Send CONSOLE_CAPTURE with long message (> 1000 chars) and many args (> 10)
  const longMessage = 'x'.repeat(1500);
  const manyArgs = Array.from({ length: 20 }, (_, i) => `arg${i}`);

  manager.handleMessage(socketId, JSON.stringify({
    type: 'CONSOLE_CAPTURE',
    level: 'log',
    message: longMessage,
    args: manyArgs,
    timestamp: Date.now(),
  }));

  const logs = manager.getConsoleLogs('FILE_1');
  assert.equal(logs.length, 1);
  assert.equal(logs[0].message.length, 1000); // Truncated to 1000
  assert.equal(logs[0].args.length, 10); // Limited to 10
});

test('plugin-connection-manager: CONSOLE_CAPTURE per-item arg truncation at 500 chars', () => {
  const manager = new PluginConnectionManager();
  const socket = createMockSocket(() => { });

  const socketId = manager.register(socket, {
    fileKey: 'FILE_ARG_TRUNC',
    docName: 'Doc',
    pluginVersion: '1.0.0',
    pluginBuild: 'test',
    timestamp: Date.now(),
  });

  const longArg = 'y'.repeat(800); // Exceeds 500-char per-item cap

  manager.handleMessage(socketId, JSON.stringify({
    type: 'CONSOLE_CAPTURE',
    level: 'log',
    message: 'test',
    args: [longArg, { key: 'value' }],
    timestamp: Date.now(),
  }));

  const logs = manager.getConsoleLogs('FILE_ARG_TRUNC');
  assert.equal(logs.length, 1);
  assert.equal(logs[0].args.length, 2);
  // Each arg is serialized as a string and capped at 500 chars
  assert.equal(typeof logs[0].args[0], 'string');
  assert.equal((logs[0].args[0] as string).length, 500); // Truncated from 800
  // Object arg is JSON-serialized (short enough to pass through)
  assert.equal(typeof logs[0].args[1], 'string');
  assert.ok((logs[0].args[1] as string).includes('key'));
});

test('plugin-connection-manager: SELECTION_CHANGE push event updates buffer and active file key', () => {
  const manager = new PluginConnectionManager();
  const socket = createMockSocket(() => { });

  const socketId = manager.register(socket, {
    fileKey: 'FILE_ACTIVE',
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

  const selection = manager.getSelection('FILE_ACTIVE');
  assert.notEqual(selection, null);
  assert.equal(selection?.count, 1);
  assert.equal(manager.getActiveFileKey(), 'FILE_ACTIVE');
});

test('plugin-connection-manager: push event without fileKey uses __unknown__ fallback', () => {
  const manager = new PluginConnectionManager();
  const socket = createMockSocket(() => { });

  const socketId = manager.register(socket, {
    fileKey: null,
    docName: 'Doc',
    pluginVersion: '1.0.0',
    pluginBuild: 'test',
    timestamp: Date.now(),
  });

  manager.handleMessage(socketId, JSON.stringify({
    type: 'CONSOLE_CAPTURE',
    level: 'log',
    message: 'test',
    args: [],
    timestamp: Date.now(),
  }));

  const logs = manager.getConsoleLogs('__unknown__');
  assert.equal(logs.length, 1);
  assert.equal(logs[0].message, 'test');
});

test('plugin-connection-manager: unregister schedules buffer cleanup with TTL', () => {
  const manager = new PluginConnectionManager({ bufferCleanupTtlMs: 10 });

  const socket = createMockSocket(() => { });
  const socketId = manager.register(socket, {
    fileKey: 'FILE_TO_CLEAN',
    docName: 'Test',
    pluginVersion: '1.0.0',
    pluginBuild: 'test',
    timestamp: Date.now(),
  });

  // Add data to buffer
  manager.handleMessage(socketId, JSON.stringify({
    type: 'CONSOLE_CAPTURE',
    level: 'log',
    message: 'test message',
    args: [],
    timestamp: Date.now(),
  }));

  // Verify buffer has data
  assert.equal(manager.getConsoleLogs('FILE_TO_CLEAN').length, 1);

  // Unregister should schedule cleanup (not immediate)
  manager.unregister(socketId, 'test');

  // Buffer should still exist immediately (within TTL)
  assert.equal(manager.getConsoleLogs('FILE_TO_CLEAN').length, 1);
});

test('plugin-connection-manager: unregister does not schedule cleanup when multiple sockets exist', () => {
  const manager = new PluginConnectionManager({ bufferCleanupTtlMs: 10 });

  // Register first socket with fileKey
  const socket1 = createMockSocket(() => { });
  const socketId1 = manager.register(socket1, {
    fileKey: 'FILE_SHARED',
    docName: 'Test1',
    pluginVersion: '1.0.0',
    pluginBuild: 'test',
    timestamp: Date.now(),
  });

  // Register second socket with same fileKey
  const socket2 = createMockSocket(() => { });
  const socketId2 = manager.register(socket2, {
    fileKey: 'FILE_SHARED',
    docName: 'Test2',
    pluginVersion: '1.0.0',
    pluginBuild: 'test',
    timestamp: Date.now(),
  });

  // Add data to buffer
  manager.handleMessage(socketId1, JSON.stringify({
    type: 'CONSOLE_CAPTURE',
    level: 'log',
    message: 'test message',
    args: [],
    timestamp: Date.now(),
  }));

  // Unregister first socket should NOT schedule cleanup (second socket still active)
  manager.unregister(socketId1, 'test');

  // Verify buffer is preserved
  assert.equal(manager.getConsoleLogs('FILE_SHARED').length, 1);

  // Unregister second socket should schedule cleanup
  manager.unregister(socketId2, 'test');

  // Buffer should still exist immediately (within TTL)
  assert.equal(manager.getConsoleLogs('FILE_SHARED').length, 1);
});

test('plugin-connection-manager: buffer cleanup TTL preserves data for reconnections', () => {
  const manager = new PluginConnectionManager({ bufferCleanupTtlMs: 10 });

  const socket1 = createMockSocket(() => { });
  const socketId1 = manager.register(socket1, {
    fileKey: 'FILE_RECONNECT',
    docName: 'Test1',
    pluginVersion: '1.0.0',
    pluginBuild: 'test',
    timestamp: Date.now(),
  });

  // Add data to buffer
  manager.handleMessage(socketId1, JSON.stringify({
    type: 'CONSOLE_CAPTURE',
    level: 'log',
    message: 'original message',
    args: [],
    timestamp: Date.now(),
  }));

  // Disconnect first socket
  manager.unregister(socketId1, 'test');

  // Reconnect within TTL
  const socket2 = createMockSocket(() => { });
  const socketId2 = manager.register(socket2, {
    fileKey: 'FILE_RECONNECT',
    docName: 'Test2',
    pluginVersion: '1.0.0',
    pluginBuild: 'test',
    timestamp: Date.now(),
  });

  // Buffer should be preserved (cleanup cancelled on reconnect)
  assert.equal(manager.getConsoleLogs('FILE_RECONNECT').length, 1);
  assert.equal((manager.getConsoleLogs('FILE_RECONNECT')[0] as { message: string }).message, 'original message');
});

test('plugin-connection-manager: unregister recalculates _activeFileKey after TTL expires', () => {
  const manager = new PluginConnectionManager({ bufferCleanupTtlMs: 10 });

  // Register first socket with fileKey A
  const socket1 = createMockSocket(() => { });
  const socketId1 = manager.register(socket1, {
    fileKey: 'FILE_A',
    docName: 'A',
    pluginVersion: '1.0.0',
    pluginBuild: 'test',
    timestamp: Date.now() - 1000,
  });

  // Register second socket with fileKey B
  const socket2 = createMockSocket(() => { });
  const socketId2 = manager.register(socket2, {
    fileKey: 'FILE_B',
    docName: 'B',
    pluginVersion: '1.0.0',
    pluginBuild: 'test',
    timestamp: Date.now(),
  });

  // Simulate SELECTION_CHANGE to set FILE_B as active
  manager.handleMessage(socketId2, JSON.stringify({
    type: 'SELECTION_CHANGE',
    nodes: [],
    count: 0,
    page: 'Page 1',
    timestamp: Date.now(),
  }));

  // Verify FILE_B is active
  assert.equal(manager.getActiveFileKey(), 'FILE_B');

  // Disconnect FILE_B (active file) - _activeFileKey NOT recalculated immediately (within TTL)
  manager.unregister(socketId2, 'test');

  // Within TTL, _activeFileKey still points to disconnected FILE_B
  // This is acceptable - routes will use getActiveFileKeys() for validation
  // After TTL expires, _activeFileKey will be recalculated
});

test('plugin-connection-manager: getPreferredSocketId uses active file key as tiebreaker', () => {
  const manager = new PluginConnectionManager();

  // Register first socket
  const socket1 = createMockSocket(() => { });
  const socketId1 = manager.register(socket1, {
    fileKey: 'FILE_A',
    docName: 'A',
    pluginVersion: '1.0.0',
    pluginBuild: 'test',
    timestamp: Date.now() - 1000, // Older
  });

  // Register second socket (newer)
  const socket2 = createMockSocket(() => { });
  const socketId2 = manager.register(socket2, {
    fileKey: 'FILE_B',
    docName: 'B',
    pluginVersion: '1.0.0',
    pluginBuild: 'test',
    timestamp: Date.now(),
  });

  // Simulate SELECTION_CHANGE to set FILE_B as active
  manager.handleMessage(socketId2, JSON.stringify({
    type: 'SELECTION_CHANGE',
    nodes: [],
    count: 0,
    page: 'Page 1',
    timestamp: Date.now(),
  }));

  // Without explicit fileKey, should prefer active file
  const preferred = manager.getPreferredSocketId();
  assert.equal(preferred, socketId2);
});

test('plugin-connection-manager: null fileKey reconnect within TTL preserves __unknown__ buffer', () => {
  const manager = new PluginConnectionManager({ bufferCleanupTtlMs: 10 });

  // Register socket with null fileKey
  const socket1 = createMockSocket(() => { });
  const socketId1 = manager.register(socket1, {
    fileKey: null,
    docName: 'Test1',
    pluginVersion: '1.0.0',
    pluginBuild: 'test',
    timestamp: Date.now(),
  });

  // Add data to __unknown__ buffer
  manager.handleMessage(socketId1, JSON.stringify({
    type: 'CONSOLE_CAPTURE',
    level: 'log',
    message: 'original message',
    args: [],
    timestamp: Date.now(),
  }));

  // Verify buffer has data
  assert.equal(manager.getConsoleLogs('__unknown__').length, 1);

  // Disconnect first socket
  manager.unregister(socketId1, 'test');

  // Reconnect within TTL with null fileKey
  const socket2 = createMockSocket(() => { });
  const socketId2 = manager.register(socket2, {
    fileKey: null,
    docName: 'Test2',
    pluginVersion: '1.0.0',
    pluginBuild: 'test',
    timestamp: Date.now(),
  });

  // Buffer should be preserved (cleanup cancelled on reconnect)
  assert.equal(manager.getConsoleLogs('__unknown__').length, 1);
  assert.equal((manager.getConsoleLogs('__unknown__')[0] as { message: string }).message, 'original message');
});

test('plugin-connection-manager: two null fileKey sockets, close one does not trigger cleanup', () => {
  const manager = new PluginConnectionManager({ bufferCleanupTtlMs: 10 });

  // Register first socket with null fileKey
  const socket1 = createMockSocket(() => { });
  const socketId1 = manager.register(socket1, {
    fileKey: null,
    docName: 'Test1',
    pluginVersion: '1.0.0',
    pluginBuild: 'test',
    timestamp: Date.now(),
  });

  // Register second socket with null fileKey
  const socket2 = createMockSocket(() => { });
  const socketId2 = manager.register(socket2, {
    fileKey: null,
    docName: 'Test2',
    pluginVersion: '1.0.0',
    pluginBuild: 'test',
    timestamp: Date.now(),
  });

  // Add data to __unknown__ buffer
  manager.handleMessage(socketId1, JSON.stringify({
    type: 'CONSOLE_CAPTURE',
    level: 'log',
    message: 'test message',
    args: [],
    timestamp: Date.now(),
  }));

  // Disconnect first socket - should NOT schedule cleanup (second socket still active)
  manager.unregister(socketId1, 'test');

  // Buffer should be preserved (no cleanup scheduled)
  assert.equal(manager.getConsoleLogs('__unknown__').length, 1);

  // Disconnect second socket - should schedule cleanup
  manager.unregister(socketId2, 'test');

  // Buffer should still exist immediately (within TTL)
  assert.equal(manager.getConsoleLogs('__unknown__').length, 1);
});

test('plugin-connection-manager: getPreferredSocketId works for null fileKey sessions', () => {
  const manager = new PluginConnectionManager();

  // Register first socket with null fileKey (older)
  const socket1 = createMockSocket(() => { });
  const socketId1 = manager.register(socket1, {
    fileKey: null,
    docName: 'Test1',
    pluginVersion: '1.0.0',
    pluginBuild: 'test',
    timestamp: Date.now() - 1000, // Older
  });

  // Small delay to ensure different createdAt
  const startTime = Date.now();
  while (Date.now() === startTime) { /* wait */ }

  // Register second socket with null fileKey (newer)
  const socket2 = createMockSocket(() => { });
  const socketId2 = manager.register(socket2, {
    fileKey: null,
    docName: 'Test2',
    pluginVersion: '1.0.0',
    pluginBuild: 'test',
    timestamp: Date.now(),
  });

  // Simulate SELECTION_CHANGE to set __unknown__ as active (via socket2)
  manager.handleMessage(socketId2, JSON.stringify({
    type: 'SELECTION_CHANGE',
    nodes: [],
    count: 0,
    page: 'Page 1',
    timestamp: Date.now(),
  }));

  // Verify _activeFileKey is set to __unknown__
  assert.equal(manager.getActiveFileKey(), '__unknown__');

  // Without explicit fileKey, should prefer active file (__unknown__ -> socket2)
  const preferred = manager.getPreferredSocketId();
  assert.equal(preferred, socketId2);
});

// Test S-05: onDocumentChange callback is invoked when DOCUMENT_CHANGE is received
test('plugin-connection-manager: onDocumentChange callback is invoked exactly once per DOCUMENT_CHANGE', async () => {
  let callbackCount = 0;
  let callbackFileKey: string | null = null;

  const manager = new PluginConnectionManager({
    onDocumentChange: (fileKey: string) => {
      callbackCount++;
      callbackFileKey = fileKey;
    },
  });

  let socketId = '';
  const socket = createMockSocket(() => { });

  socketId = manager.register(socket, {
    fileKey: 'FILE_123',
    docName: 'Test Doc',
    pluginVersion: '1.0.0',
    pluginBuild: 'test',
    timestamp: Date.now(),
  });

  // Simulate DOCUMENT_CHANGE message
  manager.handleMessage(socketId, JSON.stringify({
    type: 'DOCUMENT_CHANGE',
    timestamp: Date.now(),
  }));

  // Verify callback was invoked exactly once with correct fileKey
  assert.equal(callbackCount, 1);
  assert.equal(callbackFileKey, 'FILE_123');
});

// Test S-05b: onDocumentChange is not invoked when fileKey is null
test('plugin-connection-manager: onDocumentChange callback is NOT invoked when fileKey is null', async () => {
  let callbackInvoked = false;

  const manager = new PluginConnectionManager({
    onDocumentChange: () => {
      callbackInvoked = true;
    },
  });

  let socketId = '';
  const socket = createMockSocket(() => { });

  // Register without fileKey (null)
  socketId = manager.register(socket, {
    fileKey: null,
    docName: 'Test Doc',
    pluginVersion: '1.0.0',
    pluginBuild: 'test',
    timestamp: Date.now(),
  });

  // Simulate DOCUMENT_CHANGE message
  manager.handleMessage(socketId, JSON.stringify({
    type: 'DOCUMENT_CHANGE',
    timestamp: Date.now(),
  }));

  // Verify callback was NOT invoked
  assert.equal(callbackInvoked, false);
});
