import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import WebSocket from 'ws';

import { createFigmaPluginWsServer, clearPrewarmInFlight } from './figma-plugin-ws-server.ts';
import { getPluginConnectionManager, resetPluginConnectionManager } from './plugin-connection-manager.ts';
import {
  clearPrewarmComponentSnapshotCache,
  getCachedPrewarmComponentSnapshot,
  setCachedPrewarmComponentSnapshot,
} from './figma-prewarm-snapshot-cache.ts';

test.afterEach(() => {
  resetPluginConnectionManager();
  clearPrewarmInFlight();
  clearPrewarmComponentSnapshotCache();
});

async function listenOrSkip(
  t: { skip: (message?: string) => void },
  server: http.Server
): Promise<boolean> {
  const listenResult = await new Promise<'ok' | 'eperm' | 'error'>((resolve) => {
    const onError = (error: NodeJS.ErrnoException) => {
      server.off('listening', onListening);
      if (error.code === 'EPERM') {
        resolve('eperm');
        return;
      }
      resolve('error');
    };
    const onListening = () => {
      server.off('error', onError);
      resolve('ok');
    };

    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(0, '127.0.0.1');
  });

  if (listenResult === 'eperm') {
    t.skip('Loopback listen not permitted in this environment (EPERM)');
    return false;
  }
  if (listenResult === 'error') {
    throw new Error('Failed to start test server');
  }
  return true;
}

test('figma-plugin-ws-server: accepts ws connection and forwards manager requests', async (t) => {
  resetPluginConnectionManager();

  const server = http.createServer((_req, res) => {
    res.statusCode = 200;
    res.end('ok');
  });
  const wss = createFigmaPluginWsServer(server);

  if (!(await listenOrSkip(t, server))) {
    wss.close();
    server.close();
    resetPluginConnectionManager();
    return;
  }

  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const port = address.port;

  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/figma-plugin`);
  const manager = getPluginConnectionManager();

  const openPromise = new Promise<void>((resolve, reject) => {
    ws.on('open', () => resolve());
    ws.on('error', (error) => reject(error));
  });
  await openPromise;

  ws.on('message', (raw) => {
    const msg = JSON.parse(String(raw)) as Record<string, unknown>;
    if (typeof msg.id !== 'string' || typeof msg.method !== 'string') {
      return;
    }

    ws.send(
      JSON.stringify({
        id: msg.id,
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

  ws.send(
    JSON.stringify({
      type: 'SESSION_INFO',
      sessionInfo: {
        fileKey: 'abc',
        docName: 'Doc',
        pluginVersion: '1.0.0',
        pluginBuild: 'test',
        timestamp: Date.now(),
      },
    })
  );

  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(manager.getConnectionCount(), 1);

  const result = await manager.requestForFileKey<{ success: boolean }>('abc', 'GET_VARIABLES_DATA');
  assert.equal(result.success, true);

  ws.close();
  await new Promise((resolve) => setTimeout(resolve, 20));

  wss.close();
  server.close();
  resetPluginConnectionManager();
});

test('figma-plugin-ws-server: prewarms component snapshot once session info resolves fileKey', async (t) => {
  resetPluginConnectionManager();

  const server = http.createServer((_req, res) => {
    res.statusCode = 200;
    res.end('ok');
  });
  const wss = createFigmaPluginWsServer(server, {
    prewarmOnSessionInfo: true,
  });

  if (!(await listenOrSkip(t, server))) {
    wss.close();
    server.close();
    resetPluginConnectionManager();
    return;
  }

  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const port = address.port;

  const seenMethods = new Set<string>();
  let cachedSnapshot: readonly unknown[] | null = null;

  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/figma-plugin`);
  ws.on('message', (raw) => {
    const msg = JSON.parse(String(raw)) as { id?: string; method?: string };
    if (!msg.id || !msg.method) return;
    seenMethods.add(msg.method);

    if (msg.method === 'SEARCH_COMPONENTS') {
      ws.send(JSON.stringify({
        id: msg.id,
        result: {
          success: true,
          components: [
            {
              key: 'k-1',
              nodeId: '1:1',
              name: 'Button',
              type: 'COMPONENT',
              pageName: 'Page 1',
              variantCount: 0,
            },
          ],
          count: 1,
          truncated: false,
          total: 1,
          totalIsEstimated: false,
          limit: 1000,
          hasMore: false,
          nextOffset: null,
        },
      }));
    }
  });

  const openPromise = new Promise<void>((resolve, reject) => {
    ws.on('open', () => resolve());
    ws.on('error', (error) => reject(error));
  });
  await openPromise;

  ws.send(JSON.stringify({
    type: 'SESSION_INFO',
    sessionInfo: {
      fileKey: 'abc',
      docName: 'Doc',
      pluginVersion: '1.0.0',
      pluginBuild: 'test',
      timestamp: Date.now(),
    },
  }));

  for (let attempts = 0; attempts < 50; attempts += 1) {
    cachedSnapshot = getCachedPrewarmComponentSnapshot({
      fileKey: 'abc',
    });
    if (cachedSnapshot) {
      assert.equal(cachedSnapshot.length, 1);
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  try {
    assert.ok(cachedSnapshot);
    assert.equal(seenMethods.has('SEARCH_COMPONENTS'), true);
  } finally {
    ws.close();
    await new Promise((resolve) => setTimeout(resolve, 20));
    wss.close();
    server.close();
    resetPluginConnectionManager();
  }
});

test('figma-plugin-ws-server: skips snapshot prewarm when prewarm cache already has the fileKey snapshot', async (t) => {
  resetPluginConnectionManager();
  clearPrewarmComponentSnapshotCache();
  const cachedSnapshot = [
    {
      node_id: '1:1',
      name: 'Button',
      type: 'COMPONENT',
      page_name: 'Page 1',
    variant_count: 0,
    },
  ];
  setCachedPrewarmComponentSnapshot({
    fileKey: 'abc',
    components: cachedSnapshot,
  });

  const server = http.createServer((_req, res) => {
    res.statusCode = 200;
    res.end('ok');
  });
  const wss = createFigmaPluginWsServer(server, {
    prewarmOnSessionInfo: true,
  });

  if (!(await listenOrSkip(t, server))) {
    wss.close();
    server.close();
    resetPluginConnectionManager();
    return;
  }

  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const port = address.port;

  let sawComponents = false;

  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/figma-plugin`);
  ws.on('message', (raw) => {
    const msg = JSON.parse(String(raw)) as { id?: string; method?: string };
    if (!msg.id || !msg.method) return;

    if (msg.method === 'SEARCH_COMPONENTS') {
      sawComponents = true;
      ws.send(JSON.stringify({
        id: msg.id,
        result: {
          success: true,
          components: [],
          count: 0,
          truncated: false,
          total: 0,
          totalIsEstimated: false,
          limit: 1000,
          hasMore: false,
          nextOffset: null,
        },
      }));
    }
  });

  const openPromise = new Promise<void>((resolve, reject) => {
    ws.on('open', () => resolve());
    ws.on('error', (error) => reject(error));
  });
  await openPromise;

  ws.send(JSON.stringify({
    type: 'SESSION_INFO',
    sessionInfo: {
      fileKey: 'abc',
      docName: 'Doc',
      pluginVersion: '1.0.0',
      pluginBuild: 'test',
      timestamp: Date.now(),
    },
  }));

  await new Promise((resolve) => setTimeout(resolve, 100));

  try {
    assert.equal(sawComponents, false);
  } finally {
    ws.close();
    await new Promise((resolve) => setTimeout(resolve, 20));
    wss.close();
    server.close();
    resetPluginConnectionManager();
  }
});

test('figma-plugin-ws-server: dedupes concurrent prewarm requests for the same fileKey', async (t) => {
  resetPluginConnectionManager();
  clearPrewarmComponentSnapshotCache();

  const server = http.createServer((_req, res) => {
    res.statusCode = 200;
    res.end('ok');
  });
  const wss = createFigmaPluginWsServer(server, {
    prewarmOnSessionInfo: true,
  });

  if (!(await listenOrSkip(t, server))) {
    wss.close();
    server.close();
    resetPluginConnectionManager();
    return;
  }

  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const port = address.port;

  let searchRequestCount = 0;

  const sockets = [
    new WebSocket(`ws://127.0.0.1:${port}/ws/figma-plugin`),
    new WebSocket(`ws://127.0.0.1:${port}/ws/figma-plugin`),
  ];

  for (const ws of sockets) {
    ws.on('message', (raw) => {
      const msg = JSON.parse(String(raw)) as { id?: string; method?: string };
      if (!msg.id || !msg.method) return;

      if (msg.method === 'SEARCH_COMPONENTS') {
        searchRequestCount += 1;
        setTimeout(() => {
          ws.send(JSON.stringify({
            id: msg.id,
            result: {
              success: true,
              components: [
                {
                  key: 'k-1',
                  nodeId: '1:1',
                  name: 'Button',
                  type: 'COMPONENT',
                  pageName: 'Page 1',
                  variantCount: 0,
                },
              ],
              count: 1,
              truncated: false,
              total: 1,
              totalIsEstimated: false,
              limit: 1000,
              hasMore: false,
              nextOffset: null,
            },
          }));
        }, 80);
      }
    });
  }

  await Promise.all(
    sockets.map(
      (ws) =>
        new Promise<void>((resolve, reject) => {
          ws.on('open', () => resolve());
          ws.on('error', (error) => reject(error));
        }),
    ),
  );

  for (const ws of sockets) {
    ws.send(JSON.stringify({
      type: 'SESSION_INFO',
      sessionInfo: {
        fileKey: 'abc',
        docName: 'Doc',
        pluginVersion: '1.0.0',
        pluginBuild: 'test',
        timestamp: Date.now(),
      },
    }));
  }

  await new Promise((resolve) => setTimeout(resolve, 250));

  try {
    assert.equal(searchRequestCount, 1);
  } finally {
    for (const ws of sockets) {
      ws.close();
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
    wss.close();
    server.close();
    resetPluginConnectionManager();
  }
});

test('figma-plugin-ws-server: rejects non-matching websocket paths', async (t) => {
  resetPluginConnectionManager();

  const server = http.createServer((_req, res) => {
    res.statusCode = 200;
    res.end('ok');
  });
  const wss = createFigmaPluginWsServer(server);

  if (!(await listenOrSkip(t, server))) {
    wss.close();
    server.close();
    resetPluginConnectionManager();
    return;
  }

  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const port = address.port;

  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/figma-plugin-x`);
  const outcome = await new Promise<'error' | 'open'>((resolve) => {
    ws.on('error', () => resolve('error'));
    ws.on('open', () => resolve('open'));
  });

  assert.equal(outcome, 'error');
  assert.equal(getPluginConnectionManager().getConnectionCount(), 0);

  ws.close();
  wss.close();
  server.close();
  resetPluginConnectionManager();
});

test('figma-plugin-ws-server: rejects websocket upgrades from disallowed origin', async (t) => {
  resetPluginConnectionManager();

  const server = http.createServer((_req, res) => {
    res.statusCode = 200;
    res.end('ok');
  });
  const wss = createFigmaPluginWsServer(server);

  if (!(await listenOrSkip(t, server))) {
    wss.close();
    server.close();
    resetPluginConnectionManager();
    return;
  }

  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const port = address.port;

  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/figma-plugin`, {
    origin: 'https://evil.example',
  });

  const outcome = await new Promise<'error' | 'open'>((resolve) => {
    ws.on('error', () => resolve('error'));
    ws.on('open', () => resolve('open'));
  });

  assert.equal(outcome, 'error');
  assert.equal(getPluginConnectionManager().getConnectionCount(), 0);

  ws.close();
  wss.close();
  server.close();
  resetPluginConnectionManager();
});

test('figma-plugin-ws-server: accepts websocket upgrades from figma origin', async (t) => {
  resetPluginConnectionManager();

  const server = http.createServer((_req, res) => {
    res.statusCode = 200;
    res.end('ok');
  });
  const wss = createFigmaPluginWsServer(server);

  if (!(await listenOrSkip(t, server))) {
    wss.close();
    server.close();
    resetPluginConnectionManager();
    return;
  }

  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const port = address.port;

  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/figma-plugin`, {
    origin: 'https://www.figma.com',
  });

  const outcome = await new Promise<'error' | 'open'>((resolve) => {
    ws.on('error', () => resolve('error'));
    ws.on('open', () => resolve('open'));
  });

  assert.equal(outcome, 'open');
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(getPluginConnectionManager().getConnectionCount(), 1);

  ws.close();
  await new Promise((resolve) => setTimeout(resolve, 20));
  wss.close();
  server.close();
  resetPluginConnectionManager();
});

test('figma-plugin-ws-server: accepts websocket upgrades from null origin', async (t) => {
  resetPluginConnectionManager();

  const server = http.createServer((_req, res) => {
    res.statusCode = 200;
    res.end('ok');
  });
  const wss = createFigmaPluginWsServer(server);

  if (!(await listenOrSkip(t, server))) {
    wss.close();
    server.close();
    resetPluginConnectionManager();
    return;
  }

  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const port = address.port;

  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/figma-plugin`, {
    origin: 'null',
  });

  const outcome = await new Promise<'error' | 'open'>((resolve) => {
    ws.on('error', () => resolve('error'));
    ws.on('open', () => resolve('open'));
  });

  assert.equal(outcome, 'open');
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(getPluginConnectionManager().getConnectionCount(), 1);

  ws.close();
  await new Promise((resolve) => setTimeout(resolve, 20));
  wss.close();
  server.close();
  resetPluginConnectionManager();
});

test('figma-plugin-ws-server: accepts websocket upgrades from figma.com (no www)', async (t) => {
  resetPluginConnectionManager();

  const server = http.createServer((_req, res) => {
    res.statusCode = 200;
    res.end('ok');
  });
  const wss = createFigmaPluginWsServer(server);

  if (!(await listenOrSkip(t, server))) {
    wss.close();
    server.close();
    resetPluginConnectionManager();
    return;
  }

  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const port = address.port;

  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/figma-plugin`, {
    origin: 'https://figma.com',
  });

  const outcome = await new Promise<'error' | 'open'>((resolve) => {
    ws.on('error', () => resolve('error'));
    ws.on('open', () => resolve('open'));
  });

  assert.equal(outcome, 'open');
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(getPluginConnectionManager().getConnectionCount(), 1);

  ws.close();
  await new Promise((resolve) => setTimeout(resolve, 20));
  wss.close();
  server.close();
  resetPluginConnectionManager();
});

test('figma-plugin-ws-server: accepts websocket upgrades from localhost with port', async (t) => {
  resetPluginConnectionManager();

  const server = http.createServer((_req, res) => {
    res.statusCode = 200;
    res.end('ok');
  });
  const wss = createFigmaPluginWsServer(server);

  if (!(await listenOrSkip(t, server))) {
    wss.close();
    server.close();
    resetPluginConnectionManager();
    return;
  }

  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const port = address.port;

  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/figma-plugin`, {
    origin: 'http://localhost:8787',
  });

  const outcome = await new Promise<'error' | 'open'>((resolve) => {
    ws.on('error', () => resolve('error'));
    ws.on('open', () => resolve('open'));
  });

  assert.equal(outcome, 'open');
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(getPluginConnectionManager().getConnectionCount(), 1);

  ws.close();
  await new Promise((resolve) => setTimeout(resolve, 20));
  wss.close();
  server.close();
  resetPluginConnectionManager();
});

test('figma-plugin-ws-server: accepts websocket upgrades from enterprise figma tenant', async (t) => {
  resetPluginConnectionManager();

  const server = http.createServer((_req, res) => {
    res.statusCode = 200;
    res.end('ok');
  });
  const wss = createFigmaPluginWsServer(server);

  if (!(await listenOrSkip(t, server))) {
    wss.close();
    server.close();
    resetPluginConnectionManager();
    return;
  }

  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const port = address.port;

  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/figma-plugin`, {
    origin: 'https://company.figma.com',
  });

  const outcome = await new Promise<'error' | 'open'>((resolve) => {
    ws.on('error', () => resolve('error'));
    ws.on('open', () => resolve('open'));
  });

  assert.equal(outcome, 'open');
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(getPluginConnectionManager().getConnectionCount(), 1);

  ws.close();
  await new Promise((resolve) => setTimeout(resolve, 20));
  wss.close();
  server.close();
  resetPluginConnectionManager();
});

test('figma-plugin-ws-server: accepts websocket upgrades from IPv6 loopback origin', async (t) => {
  resetPluginConnectionManager();

  const server = http.createServer((_req, res) => {
    res.statusCode = 200;
    res.end('ok');
  });
  const wss = createFigmaPluginWsServer(server);

  if (!(await listenOrSkip(t, server))) {
    wss.close();
    server.close();
    resetPluginConnectionManager();
    return;
  }

  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const port = address.port;

  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/figma-plugin`, {
    origin: 'http://[::1]:8787',
  });

  const outcome = await new Promise<'error' | 'open'>((resolve) => {
    ws.on('error', () => resolve('error'));
    ws.on('open', () => resolve('open'));
  });

  assert.equal(outcome, 'open');
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(getPluginConnectionManager().getConnectionCount(), 1);

  ws.close();
  await new Promise((resolve) => setTimeout(resolve, 20));
  wss.close();
  server.close();
  resetPluginConnectionManager();
});

test('figma-plugin-ws-server: accepts configured custom origin via DS_WS_ALLOWED_ORIGINS', async (t) => {
  resetPluginConnectionManager();
  const previous = process.env.DS_WS_ALLOWED_ORIGINS;
  process.env.DS_WS_ALLOWED_ORIGINS = 'https://custom.example';

  const server = http.createServer((_req, res) => {
    res.statusCode = 200;
    res.end('ok');
  });
  const wss = createFigmaPluginWsServer(server);

  try {
    if (!(await listenOrSkip(t, server))) {
      wss.close();
      server.close();
      resetPluginConnectionManager();
      return;
    }

    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const port = address.port;

    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/figma-plugin`, {
      origin: 'https://custom.example',
    });

    const outcome = await new Promise<'error' | 'open'>((resolve) => {
      ws.on('error', () => resolve('error'));
      ws.on('open', () => resolve('open'));
    });

    assert.equal(outcome, 'open');
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(getPluginConnectionManager().getConnectionCount(), 1);

    ws.close();
    await new Promise((resolve) => setTimeout(resolve, 20));
    wss.close();
    server.close();
    resetPluginConnectionManager();
  } finally {
    if (previous === undefined) {
      delete process.env.DS_WS_ALLOWED_ORIGINS;
    } else {
      process.env.DS_WS_ALLOWED_ORIGINS = previous;
    }
  }
});
