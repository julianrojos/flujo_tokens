import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Hono } from 'hono';

import {
  registerFigmaMcpReconnectRoute,
  type FigmaMcpReconnectRouteDeps,
} from './figma-mcp-reconnect-route.ts';

interface ReconnectPayload {
  ok: boolean;
  reconnected?: boolean;
  closedConnections?: number;
  siblingCleanup?: string;
  message?: string;
  code?: string;
}

function createTestApp(overrides: Partial<FigmaMcpReconnectRouteDeps> = {}): Hono {
  const app = new Hono();
  registerFigmaMcpReconnectRoute(app, {
    internalToken: 'test-token',
    getConnInfoFn: () => ({
      remote: { address: '127.0.0.1' },
    }),
    getPluginConnectionManagerFn: () => ({
      forceReconnectAll: () => 2,
    }),
    resetHeartbeatFn: () => {},
    terminateCompetingFn: async () => {},
    ...overrides,
  });
  return app;
}

test('figma-mcp-reconnect-route: loopback requests reconnect active sessions', async () => {
  let reasonArg: string | undefined;
  let resetCalled = 0;
  let terminateCalled = 0;
  const app = createTestApp({
    getPluginConnectionManagerFn: () => ({
      forceReconnectAll: (reason?: string) => {
        reasonArg = reason;
        return 3;
      },
    }),
    resetHeartbeatFn: () => {
      resetCalled += 1;
    },
    terminateCompetingFn: async () => {
      terminateCalled += 1;
    },
  });

  const response = await app.request('/api/figma-mcp/reconnect', {
    method: 'POST',
  });

  assert.equal(response.status, 200);
  const payload = (await response.json()) as ReconnectPayload;
  assert.equal(payload.ok, true);
  assert.equal(payload.reconnected, true);
  assert.equal(payload.closedConnections, 3);
  assert.equal(payload.siblingCleanup, 'ok');
  assert.match(String(payload.message), /3 active plugin session/);
  assert.equal(reasonArg, 'api.reconnect');
  assert.equal(resetCalled, 1);
  assert.equal(terminateCalled, 1);
});

test('figma-mcp-reconnect-route: blocks non-loopback requests without internal token', async () => {
  let managerCalled = 0;
  const app = createTestApp({
    getConnInfoFn: () => ({
      remote: { address: '198.51.100.77' },
    }),
    getPluginConnectionManagerFn: () => ({
      forceReconnectAll: () => {
        managerCalled += 1;
        return 0;
      },
    }),
  });

  const response = await app.request('/api/figma-mcp/reconnect', {
    method: 'POST',
  });

  assert.equal(response.status, 403);
  const payload = (await response.json()) as ReconnectPayload;
  assert.equal(payload.ok, false);
  assert.equal(payload.code, 'reconnect.forbidden_remote');
  assert.equal(managerCalled, 0);
});

test('figma-mcp-reconnect-route: allows non-loopback requests with valid internal token', async () => {
  const app = createTestApp({
    getConnInfoFn: () => ({
      remote: { address: '203.0.113.12' },
    }),
    getPluginConnectionManagerFn: () => ({
      forceReconnectAll: () => 1,
    }),
  });

  const response = await app.request('/api/figma-mcp/reconnect', {
    method: 'POST',
    headers: {
      'x-ds-dashboard-internal-token': 'test-token',
    },
  });

  assert.equal(response.status, 200);
  const payload = (await response.json()) as ReconnectPayload;
  assert.equal(payload.ok, true);
  assert.equal(payload.closedConnections, 1);
});

test('figma-mcp-reconnect-route: reports sibling cleanup errors without failing request', async () => {
  const app = createTestApp({
    getPluginConnectionManagerFn: () => ({
      forceReconnectAll: () => 0,
    }),
    terminateCompetingFn: async () => {
      throw new Error('terminate failed');
    },
  });

  const response = await app.request('/api/figma-mcp/reconnect', {
    method: 'POST',
  });

  assert.equal(response.status, 200);
  const payload = (await response.json()) as ReconnectPayload;
  assert.equal(payload.ok, true);
  assert.equal(payload.closedConnections, 0);
  assert.equal(payload.siblingCleanup, 'terminate failed');
  assert.match(String(payload.message), /No active plugin sessions found/);
});
