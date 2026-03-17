/**
 * Tests for Figma MCP Design System Kit Route (Direct-Only Mode)
 *
 * Note: Tests for successful plugin communication require complex async mocking.
 * Those scenarios are covered by E2E tests with real plugin.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { Hono } from 'hono';

import { registerFigmaMcpDesignSystemKitRoute, type FigmaMcpDesignSystemKitRouteDeps } from './figma-mcp-design-system-kit-route.ts';
import type { VariableData as MockVariable } from '../services/figma-direct-bridge-service.ts';

function createTestApp(overrides: Partial<FigmaMcpDesignSystemKitRouteDeps> = {}): Hono {
  const app = new Hono();
  registerFigmaMcpDesignSystemKitRoute(app, {
    getConnInfoFn: () => ({ remote: { address: '127.0.0.1' } }),
    internalToken: 'test-token',
    ...overrides,
  });
  return app;
}

test('design-system-kit-route (direct-only): GET returns 403 for non-loopback without token', async () => {
  const app = createTestApp({
    getConnInfoFn: () => ({ remote: { address: '10.20.30.40' } }),
  });

  const response = await app.request('/api/figma-mcp/design-system-kit', { method: 'GET' });

  assert.equal(response.status, 403);
  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.code, 'kit.forbidden_remote');
});

test('design-system-kit-route (direct-only): GET allows loopback without token', async () => {
  const app = createTestApp();

  const response = await app.request('/api/figma-mcp/design-system-kit', {
    method: 'GET',
  });

  // Should not be 403 - will be 200 with either success or no_socket error
  assert.notEqual(response.status, 403);
});

test('design-system-kit-route: format=compact removes valuesByMode', async () => {
  const mockVariables = {
    var1: {
      id: 'var1',
      name: 'Variable 1',
      key: 'var1',
      resolvedType: 'COLOR',
      valuesByMode: {
        mode1: { r: 0.1, g: 0.2, b: 0.3, a: 1 },
        mode2: { r: 0.4, g: 0.5, b: 0.6, a: 1 },
      },
      variableCollectionId: 'col1',
      scopes: [],
      description: 'Test variable 1',
      hiddenFromPublishing: false,
    },
  };

  const mockCollections = {
    col1: {
      id: 'col1',
      name: 'Collection 1',
      key: 'col1',
      modes: [{ modeId: 'mode1', name: 'Mode 1' }],
      defaultModeId: 'mode1',
      variableIds: ['var1'],
    },
  };

  const app = createTestApp({
    fetchDesignSystemKitDirectFn: async (_fileKey?: string | null, _opts?: { format?: string; include?: string[] }) => ({ ok: true, tokens: { variables: mockVariables, variableCollections: mockCollections }, styles: [], elapsedMs: 10 }),
  });

  const response = await app.request('/api/figma-mcp/design-system-kit?format=compact&fileUrl=https://www.figma.com/design/abc/Test', {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.ok(payload.ok);
  // Validate compact: valuesByMode should not exist (compact only has id, name, resolvedType)
  assert.strictEqual(payload.tokens.variables.var1.valuesByMode, undefined);
  // Validate responseMeta
  assert.equal(payload.responseMeta.appliedFormat, 'compact');
  assert.ok(typeof payload.responseMeta.estimatedBytes === 'number');
});

test('design-system-kit-route: format=dtcg returns dtcg key (not tokens)', async () => {
  const mockVariables = {
    var1: {
      id: 'var1',
      name: 'colors/primary',
      key: 'var1',
      resolvedType: 'COLOR',
      valuesByMode: {
        mode1: { r: 1, g: 0, b: 0, a: 1 },
      },
      variableCollectionId: 'col1',
      scopes: [],
      description: 'Test variable 1',
      hiddenFromPublishing: false,
    },
  };

  const mockCollections = {
    col1: {
      id: 'col1',
      name: 'Collection 1',
      key: 'col1',
      modes: [{ modeId: 'mode1', name: 'Mode 1' }],
      defaultModeId: 'mode1',
      variableIds: ['var1'],
    },
  };

  const app = createTestApp({
    fetchDesignSystemKitDirectFn: async (_fileKey?: string | null, _opts?: { format?: string; include?: string[] }) => ({ ok: true, tokens: { variables: mockVariables, variableCollections: mockCollections }, styles: [], elapsedMs: 10 }),
  });

  const response = await app.request('/api/figma-mcp/design-system-kit?format=dtcg&fileUrl=https://www.figma.com/design/abc/Test', {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.ok(payload.ok);
  // Validate DTCG format: has dtcg key, no tokens key
  assert.ok('dtcg' in payload);
  assert.ok(!('tokens' in payload));
  // Validate DTCG structure
  assert.ok(payload.dtcg.colors);
  assert.ok(payload.dtcg.colors.primary);
  assert.equal(payload.dtcg.colors.primary.$type, 'color');
  assert.equal(payload.dtcg.colors.primary.$value.toUpperCase(), '#FF0000');
  // Validate responseMeta
  assert.equal(payload.responseMeta.appliedFormat, 'dtcg');
});

test('design-system-kit-route: format=dtcg with undefined tokens returns empty dtcg', async () => {
  const app = createTestApp({
    fetchDesignSystemKitDirectFn: async (_fileKey?: string | null, _opts?: { format?: string; include?: string[] }) => ({ ok: true, elapsedMs: 10 }),
  });

  const response = await app.request('/api/figma-mcp/design-system-kit?format=dtcg&fileUrl=https://www.figma.com/design/abc/Test', {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.ok(payload.ok);
  assert.deepStrictEqual(payload.dtcg, {});
  assert.equal(payload.responseMeta.appliedFormat, 'dtcg');
});

test('design-system-kit-route: format=summary keeps single mode value', async () => {
  const mockVariables = {
    var1: {
      id: 'var1',
      name: 'Variable 1',
      key: 'var1',
      resolvedType: 'COLOR',
      valuesByMode: {
        mode1: { r: 0.1, g: 0.2, b: 0.3, a: 1 },
        mode2: { r: 0.4, g: 0.5, b: 0.6, a: 1 },
      },
      variableCollectionId: 'col1',
      scopes: [],
      description: 'Test variable 1',
      hiddenFromPublishing: false,
    },
  };

  const mockCollections = {
    col1: {
      id: 'col1',
      name: 'Collection 1',
      key: 'col1',
      modes: [{ modeId: 'mode1', name: 'Mode 1' }, { modeId: 'mode2', name: 'Mode 2' }],
      defaultModeId: 'mode1',
      variableIds: ['var1'],
    },
  };

  const app = createTestApp({
    fetchDesignSystemKitDirectFn: async (_fileKey?: string | null, _opts?: { format?: string; include?: string[] }) => ({ ok: true, tokens: { variables: mockVariables, variableCollections: mockCollections }, styles: [], elapsedMs: 10 }),
  });

  const response = await app.request('/api/figma-mcp/design-system-kit?format=summary&fileUrl=https://www.figma.com/design/abc/Test', {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.ok(payload.ok);
  // Validate summary: only default mode value
  assert.deepStrictEqual(payload.tokens.variables.var1.valuesByMode, {
    mode1: { r: 0.1, g: 0.2, b: 0.3, a: 1 },
  });
  assert.equal(payload.responseMeta.appliedFormat, 'summary');
});

test('design-system-kit-route: format=full returns all data unchanged', async () => {
  const mockVariables = {
    var1: {
      id: 'var1',
      name: 'Variable 1',
      key: 'var1',
      resolvedType: 'COLOR',
      valuesByMode: {
        mode1: { r: 0.1, g: 0.2, b: 0.3, a: 1 },
        mode2: { r: 0.4, g: 0.5, b: 0.6, a: 1 },
      },
      variableCollectionId: 'col1',
      scopes: [],
      description: 'Test variable 1',
      hiddenFromPublishing: false,
    },
  };

  const mockCollections = {
    col1: {
      id: 'col1',
      name: 'Collection 1',
      key: 'col1',
      modes: [{ modeId: 'mode1', name: 'Mode 1' }],
      defaultModeId: 'mode1',
      variableIds: ['var1'],
    },
  };

  const app = createTestApp({
    fetchDesignSystemKitDirectFn: async (_fileKey?: string | null, _opts?: { format?: string; include?: string[] }) => ({ ok: true, tokens: { variables: mockVariables, variableCollections: mockCollections }, styles: [], elapsedMs: 10 }),
  });

  const response = await app.request('/api/figma-mcp/design-system-kit?format=full&fileUrl=https://www.figma.com/design/abc/Test', {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.ok(payload.ok);
  // Validate full: all mode values preserved
  assert.deepStrictEqual(payload.tokens.variables.var1.valuesByMode, {
    mode1: { r: 0.1, g: 0.2, b: 0.3, a: 1 },
    mode2: { r: 0.4, g: 0.5, b: 0.6, a: 1 },
  });
  assert.equal(payload.responseMeta.appliedFormat, 'full');
});

test('design-system-kit-route: double threshold verification (auto-degrade to compact)', async () => {
  const largeMockVariables: Record<string, MockVariable> = {};
  // Create 3000 variables with values to exceed 1MB threshold
  for (let i = 0; i < 3000; i++) {
    largeMockVariables[`var${i}`] = {
      id: `var${i}`,
      name: `Variable ${i}`,
      key: `var${i}`,
      resolvedType: 'COLOR',
      valuesByMode: {
        mode1: { r: 0.1, g: 0.2, b: 0.3, a: 1 },
        mode2: { r: 0.4, g: 0.5, b: 0.6, a: 1 },
      },
      variableCollectionId: 'col1',
      scopes: [],
      description: `Test variable ${i} with a long description to increase size`,
      hiddenFromPublishing: false,
    };
  }

  const mockCollections = {
    col1: {
      id: 'col1',
      name: 'Collection 1',
      key: 'col1',
      modes: [{ modeId: 'mode1', name: 'Mode 1' }],
      defaultModeId: 'mode1',
      variableIds: Object.keys(largeMockVariables),
    },
  };

  const app = createTestApp({
    fetchDesignSystemKitDirectFn: async () => ({ ok: true, tokens: { variables: largeMockVariables, variableCollections: mockCollections }, styles: [], elapsedMs: 10 }),
  });

  const response = await app.request('/api/figma-mcp/design-system-kit?format=auto&fileUrl=https://www.figma.com/design/abc/Test', {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  // Should auto-degrade to compact due to size
  assert.equal(payload.responseMeta.appliedFormat, 'compact');
  assert.ok(typeof payload.responseMeta.estimatedBytes === 'number');
});

test('design-system-kit-route: GET without format param includes responseMeta (regression)', async () => {
  const mockVariables = {
    var1: {
      id: 'var1',
      name: 'Variable 1',
      key: 'var1',
      resolvedType: 'COLOR',
      valuesByMode: { mode1: { r: 0.1, g: 0.2, b: 0.3, a: 1 } },
      variableCollectionId: 'col1',
      scopes: [],
      description: 'Test',
      hiddenFromPublishing: false,
    },
  };

  const mockCollections = {
    col1: {
      id: 'col1',
      name: 'Collection 1',
      key: 'col1',
      modes: [{ modeId: 'mode1', name: 'Mode 1' }],
      defaultModeId: 'mode1',
      variableIds: ['var1'],
    },
  };

  const app = createTestApp({
    fetchDesignSystemKitDirectFn: async (_fileKey?: string | null, _opts?: { format?: string; include?: string[] }) => ({ ok: true, tokens: { variables: mockVariables, variableCollections: mockCollections }, styles: [], elapsedMs: 10 }),
  });

  const response = await app.request('/api/figma-mcp/design-system-kit?fileUrl=https://www.figma.com/design/abc/Test', {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.ok(payload.ok);
  // Regression: responseMeta should always be present (additive, non-breaking)
  assert.ok(payload.responseMeta);
  assert.ok(payload.responseMeta.appliedFormat);
  assert.ok(typeof payload.responseMeta.estimatedBytes === 'number');
});
