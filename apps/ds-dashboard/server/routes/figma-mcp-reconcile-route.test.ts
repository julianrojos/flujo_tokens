/**
 * Tests for Figma MCP Reconcile Route
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { Hono } from 'hono';

import {
  registerFigmaMcpReconcileRoute,
  type FigmaMcpReconcileRouteDeps,
} from './figma-mcp-reconcile-route.ts';

function createTestApp(
  overrides: Partial<FigmaMcpReconcileRouteDeps> = {},
): { app: Hono; calls: { dispose: number; warmup: number; ping: number } } {
  const app = new Hono();
  const calls = { dispose: 0, warmup: 0, ping: 0 };

  const deps: FigmaMcpReconcileRouteDeps = {
    getConnInfoFn: () => ({ remote: { address: '127.0.0.1' } }),
    internalToken: 'test-token',
    pingFigmaMcpServiceFn: async () => {
      calls.ping += 1;
      return {
        ok: false,
        connected: false,
        code: 'mcp.not_connected',
        message: 'Not connected.',
        everConnected: false,
      };
    },
    disposeFigmaMcpPingServiceFn: () => {
      calls.dispose += 1;
    },
    warmupFigmaMcpPingServiceFn: () => {
      calls.warmup += 1;
    },
    sleepMs: 0,
  };

  if (overrides.getConnInfoFn) deps.getConnInfoFn = overrides.getConnInfoFn;
  if (overrides.internalToken) deps.internalToken = overrides.internalToken;
  if (overrides.pingFigmaMcpServiceFn) deps.pingFigmaMcpServiceFn = overrides.pingFigmaMcpServiceFn;
  if (overrides.disposeFigmaMcpPingServiceFn) {
    deps.disposeFigmaMcpPingServiceFn = overrides.disposeFigmaMcpPingServiceFn;
  }
  if (overrides.warmupFigmaMcpPingServiceFn) {
    deps.warmupFigmaMcpPingServiceFn = overrides.warmupFigmaMcpPingServiceFn;
  }
  if (typeof overrides.sleepMs === 'number') deps.sleepMs = overrides.sleepMs;

  registerFigmaMcpReconcileRoute(app, deps);
  return { app, calls };
}

function reconcileRequestBody(extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    confirmReconcile: true,
    ...extra,
  });
}

test('figma-mcp-reconcile-route: blocks unauthenticated remote clients', async () => {
  const { app } = createTestApp({
    getConnInfoFn: () => ({ remote: { address: '10.20.30.40' } }),
  });

  const response = await app.request('/api/figma-mcp/reconcile', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-ds-mcp-reconcile-confirm': 'true',
    },
    body: reconcileRequestBody(),
  });

  assert.equal(response.status, 403);
  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.code, 'mcp_reconcile.forbidden_remote');
});

test('figma-mcp-reconcile-route: requires explicit confirmation', async () => {
  const { app } = createTestApp();

  const response = await app.request('/api/figma-mcp/reconcile', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });

  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.code, 'mcp_reconcile.confirmation_required');
});

test('figma-mcp-reconcile-route: returns immediately when already connected', async () => {
  let pingCount = 0;
  const { app, calls } = createTestApp({
    pingFigmaMcpServiceFn: async () => {
      pingCount += 1;
      return {
        ok: true,
        connected: true,
        code: 'mcp.connected',
        message: 'Healthy',
        everConnected: true,
      };
    },
  });

  const response = await app.request('/api/figma-mcp/reconcile', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-ds-mcp-reconcile-confirm': 'true',
    },
    body: reconcileRequestBody(),
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.connected, true);
  assert.equal(payload.phase, 'already_connected');
  assert.equal(payload.attemptedReset, false);
  assert.equal(pingCount, 1);
  assert.equal(calls.dispose, 0);
  assert.equal(calls.warmup, 0);
});

test('figma-mcp-reconcile-route: resets and retries when disconnected', async () => {
  let pingCount = 0;
  const { app, calls } = createTestApp({
    pingFigmaMcpServiceFn: async () => {
      pingCount += 1;
      if (pingCount === 1) {
        return {
          ok: false,
          connected: false,
          code: 'mcp.instance_mismatch',
          message: 'Mismatch',
          everConnected: true,
        };
      }
      return {
        ok: true,
        connected: true,
        code: 'mcp.connected',
        message: 'Healthy',
        everConnected: true,
      };
    },
  });

  const response = await app.request('/api/figma-mcp/reconcile', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-ds-mcp-reconcile-confirm': 'true',
    },
    body: reconcileRequestBody(),
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.connected, true);
  assert.equal(payload.phase, 'connected_after_reset');
  assert.equal(payload.attemptedReset, true);
  assert.equal(pingCount, 2);
  assert.equal(calls.dispose, 1);
  assert.equal(calls.warmup, 1);
});

test('figma-mcp-reconcile-route: accepts legacy reset confirmation fields', async () => {
  const { app } = createTestApp();

  const response = await app.request('/api/figma-mcp/reconcile', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-ds-mcp-reset-confirm': 'true',
    },
    body: JSON.stringify({ confirmGlobalReset: true }),
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.attemptedReset, true);
});
