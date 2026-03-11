import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';
import {
  registerFigmaMcpHeartbeatRoute,
  type FigmaMcpHeartbeatRouteDeps,
} from './figma-mcp-heartbeat-route.ts';
import { resetFigmaMcpHeartbeatState } from '../services/figma-mcp-heartbeat-state.ts';

function createTestApp(overrides: Partial<FigmaMcpHeartbeatRouteDeps> = {}): Hono {
  const app = new Hono();
  registerFigmaMcpHeartbeatRoute(app, {
    internalToken: 'test-token',
    getConnInfoFn: () => ({
      remote: { address: '127.0.0.1', port: 9999, transport: 'tcp' },
    }),
    nowMsFn: () => 1_000_000,
    ...overrides,
  });
  return app;
}

beforeEach(() => {
  resetFigmaMcpHeartbeatState();
});

test('figma-mcp-heartbeat-route: POST records heartbeat and GET returns alive status', async () => {
  const app = createTestApp();

  const postResponse = await app.request('/api/figma-mcp/heartbeat', {
    method: 'POST',
    body: JSON.stringify({
      timestamp: 999_500,
      fileKey: 'abc123',
      docName: 'Test File',
    }),
    headers: { 'content-type': 'application/json' },
  });
  assert.equal(postResponse.status, 200);
  const postPayload = await postResponse.json() as {
    ok: boolean;
    alive: boolean;
    sourceFileKey: string | null;
  };
  assert.equal(postPayload.ok, true);
  assert.equal(postPayload.alive, true);
  assert.equal(postPayload.sourceFileKey, 'abc123');

  const getResponse = await app.request('/api/figma-mcp/heartbeat', { method: 'GET' });
  assert.equal(getResponse.status, 200);
  const getPayload = await getResponse.json() as {
    ok: boolean;
    alive: boolean;
    ageMs: number | null;
  };
  assert.equal(getPayload.ok, true);
  assert.equal(getPayload.alive, true);
  assert.equal(getPayload.ageMs, 500);
});

test('figma-mcp-heartbeat-route: blocks non-loopback without token', async () => {
  const app = createTestApp({
    getConnInfoFn: () => ({ remote: { address: '198.51.100.77', port: 4000, transport: 'tcp' } }),
  });

  const response = await app.request('/api/figma-mcp/heartbeat', {
    method: 'GET',
  });
  assert.equal(response.status, 403);
});

