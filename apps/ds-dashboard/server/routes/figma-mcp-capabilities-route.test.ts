/**
 * Tests for Figma MCP Capabilities Route
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { Hono } from 'hono';

import {
  registerFigmaMcpCapabilitiesRoute,
  type FigmaMcpCapabilitiesRouteDeps,
} from './figma-mcp-capabilities-route.ts';

function createTestApp(overrides?: Partial<FigmaMcpCapabilitiesRouteDeps>): Hono {
  const app = new Hono();
  const deps: FigmaMcpCapabilitiesRouteDeps = {
    getConnInfoFn: () => ({ remote: { address: '127.0.0.1' } }),
    internalToken: 'test-token',
    pingFigmaMcpServiceFn: async () => ({
      connected: false,
      currentPort: 9223,
      message: 'MCP not connected (mock).',
    }),
    listMcpToolsServiceFn: async () => ({
      ok: false,
      code: 'mcp.not_connected',
      message: 'MCP not connected.',
    }),
  };
  if (overrides?.getConnInfoFn) deps.getConnInfoFn = overrides.getConnInfoFn;
  if (overrides?.internalToken) deps.internalToken = overrides.internalToken;
  if (overrides?.pingFigmaMcpServiceFn) deps.pingFigmaMcpServiceFn = overrides.pingFigmaMcpServiceFn;
  if (overrides?.listMcpToolsServiceFn) deps.listMcpToolsServiceFn = overrides.listMcpToolsServiceFn;
  if (overrides?.disposeFigmaMcpPingServiceFn) {
    deps.disposeFigmaMcpPingServiceFn = overrides.disposeFigmaMcpPingServiceFn;
  }
  if (overrides?.getFigmaMcpHeartbeatStatusFn) {
    deps.getFigmaMcpHeartbeatStatusFn = overrides.getFigmaMcpHeartbeatStatusFn;
  }
  if (overrides?.terminateCompetingFigmaMcpProcessesFn) {
    deps.terminateCompetingFigmaMcpProcessesFn = overrides.terminateCompetingFigmaMcpProcessesFn;
  }
  registerFigmaMcpCapabilitiesRoute(app, deps);
  return app;
}

test('figma-mcp-capabilities-route: GET blocks unauthenticated request', async () => {
  const app = createTestApp({
    getConnInfoFn: () => ({ remote: { address: '10.20.30.40' } }),
  });

  const response = await app.request('/api/figma-mcp/capabilities', {
    method: 'GET',
  });

  assert.equal(response.status, 403);
  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.code, 'capabilities.forbidden_remote');
});

test('figma-mcp-capabilities-route: GET allows with valid token and returns capabilities', async () => {
  const app = createTestApp({
    getConnInfoFn: () => ({ remote: { address: '10.20.30.40' } }),
    pingFigmaMcpServiceFn: async () => ({
      connected: true,
      currentPort: 9223,
      message: 'MCP connected.',
    }),
    listMcpToolsServiceFn: async () => ({
      ok: true,
      tools: [{ name: 'figma_get_variables' }],
      elapsedMs: 50,
    }),
  });

  const response = await app.request('/api/figma-mcp/capabilities', {
    method: 'GET',
    headers: { 'x-ds-dashboard-internal-token': 'test-token' },
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.ok(Array.isArray(payload.tools));
  assert.equal(payload.tools.length, 1);
  assert.equal(payload.mcp.connected, true);
});

test('figma-mcp-capabilities-route: GET returns not_connected when MCP down', async () => {
  const app = createTestApp();

  const response = await app.request('/api/figma-mcp/capabilities', {
    method: 'GET',
    headers: { 'x-ds-dashboard-internal-token': 'test-token' },
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.code, 'mcp.not_connected');
});

test('figma-mcp-capabilities-route: GET preserves ping error code when MCP down', async () => {
  const app = createTestApp({
    pingFigmaMcpServiceFn: async () => ({
      connected: false,
      currentPort: 9227,
      code: 'mcp.instance_mismatch',
      message: 'Bridge connected to another MCP instance.',
    }),
  });

  const response = await app.request('/api/figma-mcp/capabilities', {
    method: 'GET',
    headers: { 'x-ds-dashboard-internal-token': 'test-token' },
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.code, 'mcp.instance_mismatch');
});

test('figma-mcp-capabilities-route: GET blocks empty remoteAddress without token (fail-closed)', async () => {
  const app = createTestApp({
    getConnInfoFn: () => ({ remote: { address: '' } }),
  });

  const response = await app.request('/api/figma-mcp/capabilities', {
    method: 'GET',
  });

  assert.equal(response.status, 403);
  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.code, 'capabilities.forbidden_remote');
});

test('figma-mcp-capabilities-route: GET allows loopback without token', async () => {
  const app = createTestApp({
    getConnInfoFn: () => ({ remote: { address: '127.0.0.1' } }),
  });

  const response = await app.request('/api/figma-mcp/capabilities', {
    method: 'GET',
  });

  // Will return mcp.not_connected (mock), but should pass auth
  assert.notEqual(response.status, 403);
  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.code, 'mcp.not_connected');
});

test('figma-mcp-capabilities-route: GET returns method_not_found when tools/list unavailable', async () => {
  const app = createTestApp({
    pingFigmaMcpServiceFn: async () => ({
      connected: true,
      currentPort: 9223,
      message: 'MCP connected.',
    }),
    listMcpToolsServiceFn: async () => ({
      ok: false,
      code: 'mcp.method_not_found',
      message: 'MCP tools/list method not available.',
      retryable: false,
    }),
  });

  const response = await app.request('/api/figma-mcp/capabilities', {
    method: 'GET',
    headers: { 'x-ds-dashboard-internal-token': 'test-token' },
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.ok(Array.isArray(payload.tools));
  assert.equal(payload.tools.length, 0);
  assert.match(String(payload.toolsDiscoveryError || ''), /method not available/i);
});

test('figma-mcp-capabilities-route: GET returns timeout when tools/list times out', async () => {
  const app = createTestApp({
    pingFigmaMcpServiceFn: async () => ({
      connected: true,
      currentPort: 9223,
      message: 'MCP connected.',
    }),
    listMcpToolsServiceFn: async () => ({
      ok: false,
      code: 'mcp.timeout',
      message: 'MCP list tools timed out.',
      retryable: true,
    }),
  });

  const response = await app.request('/api/figma-mcp/capabilities', {
    method: 'GET',
    headers: { 'x-ds-dashboard-internal-token': 'test-token' },
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.ok(Array.isArray(payload.tools));
  assert.equal(payload.tools.length, 0);
  assert.match(String(payload.toolsDiscoveryError || ''), /timed out/i);
});

test('figma-mcp-capabilities-route: GET returns capabilities when tools/list succeeds', async () => {
  const app = createTestApp({
    pingFigmaMcpServiceFn: async () => ({
      connected: true,
      currentPort: 9223,
      message: 'MCP connected.',
    }),
    listMcpToolsServiceFn: async () => ({
      ok: true,
      tools: [
        { name: 'figma_get_variables', description: 'Get Figma variables' },
        { name: 'figma_search_nodes', description: 'Search nodes' },
      ],
      elapsedMs: 50,
    }),
  });

  const response = await app.request('/api/figma-mcp/capabilities', {
    method: 'GET',
    headers: { 'x-ds-dashboard-internal-token': 'test-token' },
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.ok(Array.isArray(payload.tools));
  assert.equal(payload.tools.length, 2);
  assert.equal(payload.supports.searchNodes, true);
  assert.equal(payload.supports.searchVariables, true);
  assert.equal(payload.mcp.connected, true);
  // currentPort may be undefined if detectPort is not enabled
  assert.ok(payload.mcp.currentPort === 9223 || payload.mcp.currentPort === undefined);
});

test('figma-mcp-capabilities-route: GET retries once after resetting shared MCP client when heartbeat is alive', async () => {
  let pingCalls = 0;
  let disposeCalls = 0;

  const app = createTestApp({
    pingFigmaMcpServiceFn: async () => {
      pingCalls += 1;
      if (pingCalls === 1) {
        return {
          connected: false,
          currentPort: 9223,
          code: 'mcp.not_connected',
          message: 'MCP server is running, but it is not connected.',
        };
      }
      return {
        connected: true,
        currentPort: 9223,
        code: 'mcp.connected',
        message: 'MCP connected.',
      };
    },
    disposeFigmaMcpPingServiceFn: () => {
      disposeCalls += 1;
    },
    getFigmaMcpHeartbeatStatusFn: () => ({ alive: true }),
    listMcpToolsServiceFn: async () => ({
      ok: true,
      tools: [{ name: 'figma_get_variables' }],
      elapsedMs: 20,
    }),
  });

  const response = await app.request('/api/figma-mcp/capabilities', {
    method: 'GET',
    headers: { 'x-ds-dashboard-internal-token': 'test-token' },
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(pingCalls, 2);
  assert.equal(disposeCalls, 0);
});

test('figma-mcp-capabilities-route: GET retries once on broken MCP stdio even when ping code is mcp.error', async () => {
  let pingCalls = 0;
  let disposeCalls = 0;
  const app = createTestApp({
    pingFigmaMcpServiceFn: async () => {
      pingCalls += 1;
      if (pingCalls === 1) {
        return {
          connected: false,
          code: 'mcp.error',
          message: 'MCP stdin stream is closed (tools/call).',
        };
      }
      return {
        connected: true,
        currentPort: 9223,
        code: 'mcp.connected',
        message: 'MCP connected.',
      };
    },
    disposeFigmaMcpPingServiceFn: () => {
      disposeCalls += 1;
    },
    getFigmaMcpHeartbeatStatusFn: () => ({ alive: false }),
    listMcpToolsServiceFn: async () => ({
      ok: true,
      tools: [{ name: 'figma_get_variables' }],
      elapsedMs: 20,
    }),
  });

  const response = await app.request('/api/figma-mcp/capabilities', {
    method: 'GET',
    headers: { 'x-ds-dashboard-internal-token': 'test-token' },
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(pingCalls, 2);
  assert.equal(disposeCalls, 1);
});

test('figma-mcp-capabilities-route: GET does not retry mcp.not_connected when heartbeat is not alive', async () => {
  let pingCalls = 0;
  let disposeCalls = 0;
  const app = createTestApp({
    pingFigmaMcpServiceFn: async () => {
      pingCalls += 1;
      return {
        connected: false,
        currentPort: 9223,
        code: 'mcp.not_connected',
        message: 'MCP server is running, but it is not connected.',
      };
    },
    disposeFigmaMcpPingServiceFn: () => {
      disposeCalls += 1;
    },
    getFigmaMcpHeartbeatStatusFn: () => ({ alive: false }),
  });

  const response = await app.request('/api/figma-mcp/capabilities', {
    method: 'GET',
    headers: { 'x-ds-dashboard-internal-token': 'test-token' },
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.code, 'mcp.not_connected');
  assert.equal(pingCalls, 1);
  assert.equal(disposeCalls, 0);
});

test('figma-mcp-capabilities-route: GET retries after instance_mismatch even when heartbeat is not alive', async () => {
  let pingCalls = 0;
  let disposeCalls = 0;

  const app = createTestApp({
    pingFigmaMcpServiceFn: async () => {
      pingCalls += 1;
      if (pingCalls === 1) {
        return {
          connected: false,
          currentPort: 9227,
          code: 'mcp.instance_mismatch',
          message: 'Bridge connected to another MCP instance.',
        };
      }
      return {
        connected: true,
        currentPort: 9223,
        code: 'mcp.connected',
        message: 'MCP connected.',
      };
    },
    disposeFigmaMcpPingServiceFn: () => {
      disposeCalls += 1;
    },
    // Heartbeat not alive, but instance_mismatch should still trigger retry
    // (because instance_mismatch is treated as a special case that always retries)
    getFigmaMcpHeartbeatStatusFn: () => ({ alive: false }),
    listMcpToolsServiceFn: async () => ({
      ok: true,
      tools: [{ name: 'figma_get_variables' }],
      elapsedMs: 20,
    }),
  });

  const response = await app.request('/api/figma-mcp/capabilities', {
    method: 'GET',
    headers: { 'x-ds-dashboard-internal-token': 'test-token' },
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.mcp.connected, true);
  // Should retry after instance_mismatch (even without heartbeat)
  assert.equal(pingCalls, 2);
  // Should NOT dispose for instance_mismatch (only terminates competitors, which is not mocked here)
  // Note: dispose is only called for process errors (stdin closed, EPIPE, etc.)
  assert.equal(disposeCalls, 0);
});

test('figma-mcp-capabilities-route: GET retries after instance_mismatch and calls terminateCompeting (not dispose)', async () => {
  let pingCalls = 0;
  let disposeCalls = 0;
  let terminateCalls = 0;

  const app = createTestApp({
    pingFigmaMcpServiceFn: async () => {
      pingCalls += 1;
      if (pingCalls === 1) {
        return {
          connected: false,
          currentPort: 9227,
          code: 'mcp.instance_mismatch',
          message: 'Bridge connected to another MCP instance.',
        };
      }
      return {
        connected: true,
        currentPort: 9223,
        code: 'mcp.connected',
        message: 'MCP connected.',
      };
    },
    disposeFigmaMcpPingServiceFn: () => {
      disposeCalls += 1;
    },
    terminateCompetingFigmaMcpProcessesFn: async () => {
      terminateCalls += 1;
    },
    getFigmaMcpHeartbeatStatusFn: () => ({ alive: false }),
    listMcpToolsServiceFn: async () => ({
      ok: true,
      tools: [{ name: 'figma_get_variables' }],
      elapsedMs: 20,
    }),
  });

  const response = await app.request('/api/figma-mcp/capabilities', {
    method: 'GET',
    headers: { 'x-ds-dashboard-internal-token': 'test-token' },
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.mcp.connected, true);
  // Should retry after instance_mismatch
  assert.equal(pingCalls, 2);
  // terminateCompetings should be called exactly once for instance_mismatch
  assert.equal(terminateCalls, 1);
  // dispose should NOT be called for instance_mismatch (only for process errors)
  assert.equal(disposeCalls, 0);
});

test('figma-mcp-capabilities-route: GET continues after terminateCompeting fails (best-effort cleanup)', async () => {
  let pingCalls = 0;
  let terminateCalls = 0;

  const app = createTestApp({
    pingFigmaMcpServiceFn: async () => {
      pingCalls += 1;
      if (pingCalls === 1) {
        return {
          connected: false,
          currentPort: 9227,
          code: 'mcp.instance_mismatch',
          message: 'Bridge connected to another MCP instance.',
        };
      }
      return {
        connected: true,
        currentPort: 9223,
        code: 'mcp.connected',
        message: 'MCP connected.',
      };
    },
    disposeFigmaMcpPingServiceFn: () => {
      // Should not be called
    },
    terminateCompetingFigmaMcpProcessesFn: async () => {
      terminateCalls += 1;
      // Simulate failure (permissions issue, process already dead, etc.)
      throw new Error('Failed to terminate process: permission denied');
    },
    getFigmaMcpHeartbeatStatusFn: () => ({ alive: false }),
    listMcpToolsServiceFn: async () => ({
      ok: true,
      tools: [{ name: 'figma_get_variables' }],
      elapsedMs: 20,
    }),
  });

  const response = await app.request('/api/figma-mcp/capabilities', {
    method: 'GET',
    headers: { 'x-ds-dashboard-internal-token': 'test-token' },
  });

  // Should still succeed despite terminate failure (best-effort)
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.mcp.connected, true);
  // Should have attempted terminate
  assert.equal(terminateCalls, 1);
  // Should have retried ping despite the terminate failure
  assert.equal(pingCalls, 2);
});
