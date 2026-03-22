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
import { resetFigmaMcpRuntimeState, isPortAllowed } from '../services/figma-mcp-runtime-state.ts';

function createTestApp(overrides: Partial<FigmaMcpPortRouteDeps> = {}): Hono {
  const app = new Hono();
  registerFigmaMcpPortRoute(app, {
    getConnInfoFn: () => ({ remote: { address: '127.0.0.1' } }),
    internalToken: 'test-token',
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

test('figma-mcp-port-route: GET blocks empty remote address without token', async () => {
  const previousToken = process.env.DS_DASHBOARD_INTERNAL_TOKEN;
  delete process.env.DS_DASHBOARD_INTERNAL_TOKEN;

  try {
    const app = createTestApp({
      getConnInfoFn: () => ({ remote: { address: '' } }),
      internalToken: '',
    });

    const response = await app.request('/api/figma-mcp/port', {
      method: 'GET',
    });

    assert.equal(response.status, 403);
    const payload = await response.json();
    assert.equal(payload.ok, false);
    assert.equal(payload.code, 'port.forbidden_remote');
  } finally {
    if (previousToken == null) {
      delete process.env.DS_DASHBOARD_INTERNAL_TOKEN;
    } else {
      process.env.DS_DASHBOARD_INTERNAL_TOKEN = previousToken;
    }
  }
});

test('figma-mcp-port-route: GET returns 500 when runtime state retrieval fails', async () => {
  const app = createTestApp({
    getRuntimeStateFn: () => {
      throw new Error('state unavailable');
    },
  });
  const originalConsoleError = console.error;
  const consoleCalls: unknown[][] = [];
  console.error = (...args: unknown[]) => {
    consoleCalls.push(args);
  };

  try {
    const response = await app.request('/api/figma-mcp/port', {
      method: 'GET',
    });

    assert.equal(response.status, 500);
    const payload = await response.json();
    assert.equal(payload.ok, false);
    assert.equal(payload.code, 'port.runtime_state_unavailable');
    assert.equal(typeof payload.errorId, 'string');
    assert.equal(payload.errorId.length > 0, true);
    assert.equal(typeof payload.timestamp, 'string');
    assert.equal(consoleCalls.length, 1);
    assert.equal(
      String(consoleCalls[0]?.[0] ?? '').includes(`[figma-mcp-port-route][${payload.errorId}]`),
      true
    );
  } finally {
    console.error = originalConsoleError;
  }
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
