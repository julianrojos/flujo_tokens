/**
 * Tests for Figma MCP Capabilities Route (Direct-Only Mode)
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
    getFigmaMcpHeartbeatStatusFn: () => ({ alive: false }),
  };
  if (overrides?.getConnInfoFn) deps.getConnInfoFn = overrides.getConnInfoFn;
  if (overrides?.internalToken) deps.internalToken = overrides.internalToken;
  if (overrides?.getFigmaMcpHeartbeatStatusFn) {
    deps.getFigmaMcpHeartbeatStatusFn = overrides.getFigmaMcpHeartbeatStatusFn;
  }
  registerFigmaMcpCapabilitiesRoute(app, deps);
  return app;
}

test('figma-mcp-capabilities-route (direct-only): GET blocks unauthenticated request', async () => {
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

test('figma-mcp-capabilities-route (direct-only): GET allows loopback without token', async () => {
  const app = createTestApp();

  const response = await app.request('/api/figma-mcp/capabilities', {
    method: 'GET',
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.transport.mode, 'direct');
});

test('figma-mcp-capabilities-route (direct-only): GET allows with valid internal token', async () => {
  const app = createTestApp({
    getConnInfoFn: () => ({ remote: { address: '10.20.30.40' } }),
  });

  const response = await app.request('/api/figma-mcp/capabilities', {
    method: 'GET',
    headers: {
      'x-forwarded-for': '10.20.30.40',
      'x-ds-dashboard-internal-token': 'test-token',
    },
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
});

test('figma-mcp-capabilities-route (direct-only): GET returns no_socket when no plugin connected', async () => {
  const app = createTestApp();

  const response = await app.request('/api/figma-mcp/capabilities', {
    method: 'GET',
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.transport.wsAlive, false);
  assert.equal(payload.mcp.connected, false);
  assert.ok(payload.toolsDiscoveryError?.includes('No plugin connection'));
});

test('figma-mcp-capabilities-route (direct-only): GET returns supportsV2 with semantic flags', async () => {
  const app = createTestApp();

  const response = await app.request('/api/figma-mcp/capabilities', {
    method: 'GET',
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  
  // Verify supportsV2 exists with semantic flags
  assert.ok(payload.supportsV2);
  assert.equal(typeof payload.supportsV2.hasFileInfo, 'boolean');
  assert.equal(typeof payload.supportsV2.hasComponent, 'boolean');
  assert.equal(typeof payload.supportsV2.hasLocalStyles, 'boolean');
  assert.equal(typeof payload.supportsV2.hasVariablesData, 'boolean');
  assert.equal(typeof payload.supportsV2.hasPortSwitch, 'boolean');
  
  // Verify legacy supports still exists for compatibility
  assert.ok(payload.supports);
  assert.equal(typeof payload.supports.searchNodes, 'boolean');
  assert.equal(typeof payload.supports.getChildren, 'boolean');
  assert.equal(typeof payload.supports.searchStyles, 'boolean');
  assert.equal(typeof payload.supports.searchVariables, 'boolean');
  assert.equal(typeof payload.supports.portSwitch, 'boolean');
});

test('figma-mcp-capabilities-route (direct-only): supportsV2 flags default to false when no connection', async () => {
  const app = createTestApp();

  const response = await app.request('/api/figma-mcp/capabilities', {
    method: 'GET',
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  
  // All capability flags should be false when no plugin connected
  assert.equal(payload.supportsV2.hasFileInfo, false);
  assert.equal(payload.supportsV2.hasComponent, false);
  assert.equal(payload.supportsV2.hasLocalStyles, false);
  assert.equal(payload.supportsV2.hasVariablesData, false);
  assert.equal(payload.supportsV2.hasPortSwitch, false);
  
  // Legacy flags also false
  assert.equal(payload.supports.searchNodes, false);
  assert.equal(payload.supports.getChildren, false);
  assert.equal(payload.supports.searchStyles, false);
  assert.equal(payload.supports.searchVariables, false);
  assert.equal(payload.supports.portSwitch, false);
});
