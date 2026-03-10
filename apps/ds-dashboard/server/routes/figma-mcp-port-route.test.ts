/**
 * Tests for Figma MCP Port Route
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { Hono } from 'hono';

import {
  registerFigmaMcpPortRoute,
  type FigmaMcpPortRouteDeps,
} from './figma-mcp-port-route.ts';
import {
  getFigmaMcpRuntimeState,
  resetFigmaMcpRuntimeState,
  isPortAllowed,
} from '../services/figma-mcp-runtime-state.ts';

function createTestApp(overrides: Partial<FigmaMcpPortRouteDeps> = {}): Hono {
  const app = new Hono();
  registerFigmaMcpPortRoute(app, {
    getConnInfoFn: () => ({ remote: { address: '127.0.0.1' } }),
    internalToken: 'test-token',
    disposeFigmaMcpPingServiceFn: () => { /* mock */ },
    verifyMcpPortFn: async () => true, // Mock successful verification
    ...overrides,
  });
  return app;
}

test.beforeEach(() => {
  resetFigmaMcpRuntimeState();
  process.env.FIGMA_WS_PORT = '9223';
});

// Mock the warmup/dispose functions to avoid spawning real MCP processes
const originalEnv = process.env.FIGMA_WS_PORT;
test.before(() => {
  process.env.FIGMA_WS_PORT = '9223';
});

test.after(() => {
  process.env.FIGMA_WS_PORT = originalEnv;
  resetFigmaMcpRuntimeState();
});

test('figma-mcp-port-route: GET returns current state', async () => {
  const app = createTestApp();

  const response = await app.request('/api/figma-mcp/port', {
    method: 'GET',
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(typeof payload.activePort, 'number');
  assert.ok(payload.allowedRange);
  assert.equal(typeof payload.lastChangeAt, 'number');
  assert.equal(payload.isSwitching, false);
});

test('figma-mcp-port-route: GET blocks non-loopback without token', async () => {
  const app = createTestApp({
    getConnInfoFn: () => ({ remote: { address: '10.20.30.40' } }),
  });

  const response = await app.request('/api/figma-mcp/port', {
    method: 'GET',
  });

  assert.equal(response.status, 403);
  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.code, 'port.forbidden_remote');
});

test('figma-mcp-port-route: GET allows non-loopback with valid token', async () => {
  const app = createTestApp({
    getConnInfoFn: () => ({ remote: { address: '10.20.30.40' } }),
  });

  const response = await app.request('/api/figma-mcp/port', {
    method: 'GET',
    headers: { 'x-ds-dashboard-internal-token': 'test-token' },
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
});

test('figma-mcp-port-route: POST switches port successfully', async () => {
  const app = createTestApp();

  const response = await app.request('/api/figma-mcp/port', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ port: 9224 }),
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.activePort, 9224);
  assert.equal(payload.previousPort, 9223);

  // Verify state was updated
  const state = getFigmaMcpRuntimeState();
  assert.equal(state.activePort, 9224);
  assert.equal(state.isSwitching, false);
});

test('figma-mcp-port-route: POST rejects port out of range', async () => {
  const app = createTestApp();

  const response = await app.request('/api/figma-mcp/port', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ port: 9999 }),
  });

  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.code, 'port.out_of_range');
});

test('figma-mcp-port-route: POST rejects non-integer port', async () => {
  const app = createTestApp();

  const response = await app.request('/api/figma-mcp/port', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ port: 'not-a-number' }),
  });

  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.code, 'port.invalid_type');
});

test('figma-mcp-port-route: POST rejects same port', async () => {
  const app = createTestApp();

  const response = await app.request('/api/figma-mcp/port', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ port: 9223 }),
  });

  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.code, 'port.same_as_active');
});

test('figma-mcp-port-route: POST allows sequential switches (200, 200)', async () => {
  const app = createTestApp({
    internalToken: 'test-token',
  });

  // First switch
  const response1 = await app.request('/api/figma-mcp/port', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ port: 9224 }),
  });

  assert.equal(response1.status, 200);

  // Second switch after first completed (should succeed)
  const response2 = await app.request('/api/figma-mcp/port', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ port: 9225 }),
  });

  assert.equal(response2.status, 200);
});

test('figma-mcp-port-route: POST blocks non-loopback without token', async () => {
  const app = createTestApp({
    getConnInfoFn: () => ({ remote: { address: '10.20.30.40' } }),
  });

  const response = await app.request('/api/figma-mcp/port', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ port: 9224 }),
  });

  assert.equal(response.status, 403);
  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.code, 'port.forbidden_remote');
});

test('figma-mcp-port-route: POST allows non-loopback with valid token', async () => {
  const app = createTestApp({
    getConnInfoFn: () => ({ remote: { address: '10.20.30.40' } }),
  });

  const response = await app.request('/api/figma-mcp/port', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-ds-dashboard-internal-token': 'test-token',
    },
    body: JSON.stringify({ port: 9224 }),
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
});

test('figma-mcp-port-route: POST blocks empty remoteAddress without token (fail-closed)', async () => {
  const app = createTestApp({
    getConnInfoFn: () => ({ remote: { address: '' } }),
  });

  const response = await app.request('/api/figma-mcp/port', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ port: 9224 }),
  });

  assert.equal(response.status, 403);
  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.code, 'port.forbidden_remote');
});

test('figma-mcp-port-route: isPortAllowed validates range correctly', () => {
  const range = { start: 9223, end: 9227 };
  
  assert.equal(isPortAllowed(9223, range), true);
  assert.equal(isPortAllowed(9225, range), true);
  assert.equal(isPortAllowed(9227, range), true);
  assert.equal(isPortAllowed(9222, range), false);
  assert.equal(isPortAllowed(9228, range), false);
  assert.equal(isPortAllowed(9999, range), false);
  assert.equal(isPortAllowed(NaN, range), false);
  assert.equal(isPortAllowed(9223.5, range), false);
});

test('figma-mcp-port-route: concurrent POST requests result in one 409', async () => {
  let verifyBlocker: (() => void) | null = null;
  const verifyPromise = new Promise<void>((resolve) => {
    verifyBlocker = resolve;
  });

  const app = createTestApp({
    verifyMcpPortFn: async () => {
      await verifyPromise;
      return true;
    },
  });

  // Launch first request and keep it in-flight during verify.
  const response1Promise = app.request('/api/figma-mcp/port', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ port: 9224 }),
  });

  // Allow request 1 to acquire the switch lock before request 2 starts.
  await new Promise((resolve) => setTimeout(resolve, 0));

  const response2 = await app.request('/api/figma-mcp/port', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ port: 9225 }),
  });

  // Release request 1 and collect response.
  verifyBlocker!();
  const response1 = await response1Promise;

  // One should succeed (200), one should be blocked (409)
  const statuses = [response1.status, response2.status].sort();
  assert.deepEqual(statuses, [200, 409]);

  // Verify the 409 has correct code
  const blockedResponse = response1.status === 409 ? response1 : response2;
  const payload = await blockedResponse.json();
  assert.equal(payload.code, 'port.switch_in_progress');
});

test('figma-mcp-port-route: rollback on verify failure', async () => {
  const app = createTestApp({
    verifyMcpPortFn: async () => false, // Always fail verification
  });

  const response = await app.request('/api/figma-mcp/port', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ port: 9224 }),
  });

  assert.equal(response.status, 500);
  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.code, 'port.switch_failed');
  assert.match(payload.message, /Rolled back to 9223/);

  // Verify state was rolled back
  const state = getFigmaMcpRuntimeState();
  assert.equal(state.activePort, 9223);
  assert.equal(state.isSwitching, false);
});
