/**
 * Tests for Figma MCP Ping Route
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import type { Context } from 'hono';
import { Hono } from 'hono';

import { registerFigmaMcpPingRoute, type FigmaMcpPingRouteDeps } from './figma-mcp-ping-route.ts';

function createFailJson() {
  return (c: Context, statusCode: number, args: { code: string; userMessage: string }) =>
    c.json(
      {
        ok: false,
        code: args.code,
        message: args.userMessage,
      },
      statusCode,
    );
}

function createTestApp(overrides: Partial<FigmaMcpPingRouteDeps> = {}): Hono {
  const app = new Hono();
  registerFigmaMcpPingRoute(app, {
    failJson: createFailJson(),
    readJsonBody: async (c: Context) => await c.req.json(),
    ...overrides,
  });
  return app;
}

test('figma-mcp-ping-route: rejects non-figma hosts', async () => {
  const app = createTestApp();

  const response = await app.request('/api/figma-mcp-ping', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      figmaUrl: 'https://example.com/design/abc123/Test',
    }),
  });

  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.equal(payload.code, 'mcp_ping.invalid_host');
});

test('figma-mcp-ping-route: returns payload from shared MCP ping service', async () => {
  const app = createTestApp({
    pingFigmaMcpFn: async () => ({
      ok: true,
      connected: true,
      message: 'MCP connection is healthy.',
      collectionsDetected: 4,
      variablesDetected: 72,
    }),
  });

  const response = await app.request('/api/figma-mcp-ping', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.connected, true);
  assert.equal(payload.collectionsDetected, 4);
  assert.equal(payload.variablesDetected, 72);
});

test('figma-mcp-ping-route: maps thrown ping errors to command_failed payload', async () => {
  const app = createTestApp({
    pingFigmaMcpFn: async () => {
      throw new Error('synthetic ping failure');
    },
  });

  const response = await app.request('/api/figma-mcp-ping', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.connected, false);
  assert.equal(payload.code, 'mcp_ping.command_failed');
  assert.match(String(payload.message || ''), /synthetic ping failure/i);
});

test('figma-mcp-ping-route: forwards figmaToken and figmaUrl to ping service', async () => {
  let capturedArgs: { figmaUrl?: string; figmaToken?: string } | null = null;
  const app = createTestApp({
    pingFigmaMcpFn: async (args) => {
      capturedArgs = args;
      return {
        ok: true,
        connected: true,
        message: 'ok',
      };
    },
  });

  const response = await app.request('/api/figma-mcp-ping', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      figmaUrl: 'https://www.figma.com/design/rYOptx0KbO77Z6EJYadlvN/Caca',
      figmaToken: 'figd_test_token',
    }),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(capturedArgs, {
    figmaUrl: 'https://www.figma.com/design/rYOptx0KbO77Z6EJYadlvN/Caca',
    figmaToken: 'figd_test_token',
  });
});

test('figma-mcp-ping-route: rejects unresolved figmaToken env refs', async () => {
  const app = createTestApp({
    pingFigmaMcpFn: async () => ({
      ok: true,
      connected: true,
      message: 'ok',
    }),
  });

  const response = await app.request('/api/figma-mcp-ping', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      figmaToken: '${FIGMA_TOKEN_NOT_SET_FOR_TEST}',
    }),
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.connected, false);
  assert.equal(payload.code, 'mcp_ping.env_var_not_set');
});
