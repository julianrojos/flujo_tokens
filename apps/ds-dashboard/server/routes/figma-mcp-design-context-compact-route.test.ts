import assert from 'node:assert/strict';
import test from 'node:test';

import { Hono } from 'hono';

import {
  registerFigmaMcpDesignContextCompactRoute,
  type FigmaMcpDesignContextCompactRouteDeps,
} from './figma-mcp-design-context-compact-route.ts';

function createTestApp(
  overrides: Partial<FigmaMcpDesignContextCompactRouteDeps> = {},
): Hono {
  const app = new Hono();
  registerFigmaMcpDesignContextCompactRoute(app, {
    getConnInfoFn: () => ({ remote: { address: '127.0.0.1' } }),
    internalToken: 'test-token',
    resolveFileKeyFromManagerFn: () => ({ fileKey: 'FILE_1' }),
    fetchVariablesDirectFn: async () => ({
      meta: {
        variables: {},
        variableCollections: {},
      },
    }),
    getNodesByIdDirectFn: async () => ({
      success: true,
      nodes: {},
      requestedIds: [],
    }),
    getComponentSpecDirectFn: async () => ({
      success: true,
      nodeId: '1:1',
      name: 'Button',
      type: 'COMPONENT_SET',
      description: null,
      anatomy: { id: '1:1', name: 'Button', type: 'COMPONENT_SET' },
      variants: [],
      variantAxes: [],
      props: [],
      states: [],
      tokenBindings: [],
    }),
    getSelectionFn: () => null,
    ...overrides,
  });
  return app;
}

test('design-context-compact-route: blocks unauthenticated non-loopback request', async () => {
  const app = createTestApp({
    getConnInfoFn: () => ({ remote: { address: '10.20.30.40' } }),
  });

  const response = await app.request('/api/figma-mcp/design-context-compact', {
    method: 'GET',
  });

  assert.equal(response.status, 403);
  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.code, 'context_compact.forbidden_remote');
});

test('design-context-compact-route: allows non-loopback request with trimmed internal token', async () => {
  const app = createTestApp({
    getConnInfoFn: () => ({ remote: { address: '10.20.30.40' } }),
    internalToken: '  test-token  ',
  });

  const response = await app.request('/api/figma-mcp/design-context-compact', {
    method: 'GET',
    headers: {
      'x-ds-dashboard-internal-token': 'test-token',
    },
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
});

test('design-context-compact-route: returns compact context with token mode fallback', async () => {
  const app = createTestApp({
    fetchVariablesDirectFn: async () => ({
      meta: {
        variables: {
          var_1: {
            id: 'var_1',
            name: 'color/brand/primary',
            variableCollectionId: 'col_1',
            resolvedType: 'COLOR',
            valuesByMode: {
              dark: { r: 1, g: 1, b: 1, a: 1 },
              light: { r: 0, g: 0, b: 0, a: 1 },
            },
          },
          var_2: {
            id: 'var_2',
            name: 'space/md',
            variableCollectionId: 'col_1',
            resolvedType: 'FLOAT',
            valuesByMode: {
              light: 16,
            },
          },
        },
        variableCollections: {
          col_1: {
            id: 'col_1',
            name: 'Primitives',
            modes: [
              { modeId: 'light', name: 'Light' },
              { modeId: 'dark', name: 'Dark' },
            ],
          },
        },
      },
    }),
    getNodesByIdDirectFn: async () => ({
      success: true,
      nodes: {
        '10:1': {
          id: '10:1',
          name: 'Button',
          type: 'COMPONENT_SET',
          parentId: '0:1',
          childCount: 4,
          x: 10,
          y: 20,
          width: 120,
          height: 40,
        },
      },
      requestedIds: ['10:1'],
    }),
    getComponentSpecDirectFn: async () => ({
      success: true,
      nodeId: '10:1',
      name: 'Button',
      type: 'COMPONENT_SET',
      description: 'Button component set',
      anatomy: { id: '10:1', name: 'Button', type: 'COMPONENT_SET' },
      variants: [
        {
          key: 'v1',
          nodeId: '10:2',
          name: 'Default',
          variantProperties: { State: 'Default' },
          layerTokens: [{ nodeId: '10:3', nodeName: 'Background', field: 'fills', variableId: 'var_1' }],
        },
      ],
      variantAxes: [{ name: 'State', values: ['Default', 'Hover'] }],
      props: [{ name: 'label', type: 'TEXT', defaultValue: 'Button' }],
      states: ['Default', 'Hover'],
      tokenBindings: [
        { nodeId: '10:3', nodeName: 'Background', field: 'fills', variableId: 'var_1' },
        { nodeId: '10:4', nodeName: 'Container', field: 'padding', variableId: 'var_2' },
      ],
    }),
  });

  const response = await app.request(
    '/api/figma-mcp/design-context-compact?nodeId=10:1&modeId=dark',
    { method: 'GET' },
  );
  assert.equal(response.status, 200);

  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.targetNodeId, '10:1');
  assert.equal(payload.component.name, 'Button');
  assert.equal(payload.component.tokenBindingCount, 2);
  assert.equal(payload.tokens.count, 2);
  assert.equal(payload.tokens.missingCount, 0);
  assert.equal(payload.tokens.modeFallbackCount, 1);
});

test('design-context-compact-route: falls back to current selection when nodeId is omitted', async () => {
  let capturedNodeIds: string[] = [];

  const app = createTestApp({
    getSelectionFn: () => ({
      nodes: [{ id: '22:9', name: 'Card', type: 'FRAME', width: 320, height: 180 }],
      count: 1,
      page: 'Page 1',
      timestamp: Date.now(),
    }),
    getNodesByIdDirectFn: async (_fileKey, params) => {
      capturedNodeIds = [...params.nodeIds];
      return {
        success: true,
        nodes: {
          '22:9': {
            id: '22:9',
            name: 'Card',
            type: 'FRAME',
            parentId: '0:1',
            childCount: 3,
            x: 0,
            y: 0,
            width: 320,
            height: 180,
          },
        },
        requestedIds: params.nodeIds,
      };
    },
    getComponentSpecDirectFn: async () => {
      throw new Error('ws.response.error:INVALID_PARAMETER:Node must be COMPONENT or COMPONENT_SET. Got: FRAME');
    },
  });

  const response = await app.request('/api/figma-mcp/design-context-compact', {
    method: 'GET',
  });
  assert.equal(response.status, 200);

  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.deepEqual(capturedNodeIds, ['22:9']);
  assert.equal(payload.targetNodeId, '22:9');
  assert.equal(payload.component, null);
  assert.equal(Array.isArray(payload.warnings), true);
});

test('design-context-compact-route: returns empty node context when nothing is selected', async () => {
  let getNodesCalls = 0;

  const app = createTestApp({
    getNodesByIdDirectFn: async () => {
      getNodesCalls += 1;
      return {
        success: true,
        nodes: {},
        requestedIds: [],
      };
    },
  });

  const response = await app.request('/api/figma-mcp/design-context-compact', {
    method: 'GET',
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.targetNodeId, null);
  assert.equal(payload.tokens.count, 0);
  assert.equal(getNodesCalls, 0);
});

test('design-context-compact-route: passes through file-key ambiguity errors', async () => {
  const app = createTestApp({
    resolveFileKeyFromManagerFn: () => ({
      ok: false,
      code: 'context_compact.ambiguous_file_key',
      message: 'Provide fileUrl.',
    }),
  });

  const response = await app.request('/api/figma-mcp/design-context-compact', {
    method: 'GET',
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.code, 'context_compact.ambiguous_file_key');
});
