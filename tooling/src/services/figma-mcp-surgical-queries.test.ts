/**
 * Tests for Figma MCP Surgical Queries Service
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import type { FigmaVariablesResponse } from '../utils/figma.js';
import {
  getChildrenViaMcp,
  searchStylesViaMcp,
  searchVariablesViaMcp,
  setSurgicalMcpModuleForTesting,
} from './figma-mcp-surgical-queries.js';

type SurgicalMcpModule = Exclude<
  Parameters<typeof setSurgicalMcpModuleForTesting>[0],
  null
>;

type MockToolResult = {
  isError?: boolean;
  structuredContent?: unknown;
  data?: unknown;
  content?: unknown;
};

type MockCallTool = (
  name: string,
  params: Record<string, unknown>,
  timeoutMs?: number,
) => Promise<MockToolResult>;

const EMPTY_VARIABLES_RESPONSE: FigmaVariablesResponse = {
  meta: {
    variableCollections: {},
    variables: {},
  },
};

function buildMockModule(args?: {
  callTool?: MockCallTool;
  variablesResponse?: FigmaVariablesResponse;
  fetchVariablesError?: Error;
}): SurgicalMcpModule {
  const callTool: MockCallTool =
    args?.callTool ??
    (async () => ({
      isError: false,
      structuredContent: {
        nodes: [],
      },
    }));

  return {
    getOrCreateSharedMcpClient: async () => ({ callTool }),
    fetchFigmaLocalVariablesViaMcp: async () => {
      if (args?.fetchVariablesError) {
        throw args.fetchVariablesError;
      }
      return args?.variablesResponse ?? EMPTY_VARIABLES_RESPONSE;
    },
  };
}

test.beforeEach(() => {
  setSurgicalMcpModuleForTesting(null);
});

test.after(() => {
  setSurgicalMcpModuleForTesting(null);
});

test('getChildrenViaMcp: rejects missing parentId', async () => {
  const result = await getChildrenViaMcp({ parentId: '' });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, 'get_children.parent_missing');
  }
});

test('getChildrenViaMcp: parses children from structuredContent', async () => {
  setSurgicalMcpModuleForTesting(
    buildMockModule({
      callTool: async (name) => {
        assert.equal(name, 'figma_list_nodes');
        return {
          isError: false,
          structuredContent: {
            nodes: [
              { id: '1:1', name: 'Frame A', type: 'FRAME' },
              { id: '1:2', name: 'Frame B', type: 'FRAME' },
            ],
          },
        };
      },
    }),
  );

  const result = await getChildrenViaMcp({ parentId: '0:1', limit: 10 });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.items.length, 2);
    assert.equal(result.items[0]?.name, 'Frame A');
    assert.equal(result.source, 'mcp_tool');
  }
});

test('getChildrenViaMcp: classifies timeout error', async () => {
  setSurgicalMcpModuleForTesting(
    buildMockModule({
      callTool: async () => {
        throw new Error('Request timed out while calling figma_list_nodes.');
      },
    }),
  );

  const result = await getChildrenViaMcp({ parentId: '0:1', timeoutMs: 1234 });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, 'get_children.timeout');
    assert.equal(result.retryable, true);
  }
});

test('searchStylesViaMcp: rejects short nameContains', async () => {
  const result = await searchStylesViaMcp({ nameContains: 'a' });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, 'search_styles.name_too_short');
  }
});

test('searchStylesViaMcp: filters styles by name and type', async () => {
  setSurgicalMcpModuleForTesting(
    buildMockModule({
      callTool: async (name) => {
        assert.equal(name, 'figma_get_styles');
        return {
          isError: false,
          structuredContent: {
            styles: [
              { id: 's:1', name: 'Color/Primary', styleType: 'FILL' },
              { id: 's:2', name: 'Typography/Body', styleType: 'TEXT' },
            ],
          },
        };
      },
    }),
  );

  const result = await searchStylesViaMcp({
    nameContains: 'color',
    styleType: 'FILL',
    limit: 5,
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0]?.id, 's:1');
  }
});

test('searchStylesViaMcp: classifies not_connected error', async () => {
  setSurgicalMcpModuleForTesting(
    buildMockModule({
      callTool: async () => {
        throw new Error('MCP client is not connected to Figma Desktop.');
      },
    }),
  );

  const result = await searchStylesViaMcp({ nameContains: 'color' });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, 'search_styles.not_connected');
    assert.equal(result.retryable, true);
  }
});

test('searchVariablesViaMcp: rejects short nameContains', async () => {
  const result = await searchVariablesViaMcp({ nameContains: 'x' });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, 'search_variables.name_too_short');
  }
});

test('searchVariablesViaMcp: filters variables by name and collection', async () => {
  const response: FigmaVariablesResponse = {
    meta: {
      variableCollections: {
        'vc:1': {
          id: 'vc:1',
          name: 'Primitives',
          modes: [{ modeId: '1:0', name: 'Base' }],
        },
      },
      variables: {
        'v:1': {
          id: 'v:1',
          name: 'color/primary',
          variableCollectionId: 'vc:1',
          resolvedType: 'COLOR',
          valuesByMode: { '1:0': '#000000' },
        },
        'v:2': {
          id: 'v:2',
          name: 'spacing/md',
          variableCollectionId: 'vc:1',
          resolvedType: 'FLOAT',
          valuesByMode: { '1:0': 16 },
        },
      },
    },
  };

  setSurgicalMcpModuleForTesting(buildMockModule({ variablesResponse: response }));

  const result = await searchVariablesViaMcp({
    nameContains: 'color',
    collection: 'vc:1',
    limit: 10,
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0]?.name, 'color/primary');
    assert.equal(result.source, 'fallback');
  }
});

test('searchVariablesViaMcp: classifies timeout error', async () => {
  setSurgicalMcpModuleForTesting(
    buildMockModule({
      fetchVariablesError: new Error('Timed out while fetching variables.'),
    }),
  );

  const result = await searchVariablesViaMcp({ nameContains: 'color', timeoutMs: 250 });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, 'search_variables.timeout');
    assert.equal(result.retryable, true);
  }
});
