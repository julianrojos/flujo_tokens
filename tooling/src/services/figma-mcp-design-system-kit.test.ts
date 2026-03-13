/**
 * Tests for Figma MCP Design System Kit fetching
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  fetchDesignSystemKitFromSharedMcpClient,
  setSharedMcpClientFactoryForTesting,
} from './figma-mcp-variables.js';

type MockToolResult = {
  isError?: boolean;
  connected?: boolean;
  transport?: unknown;
  structuredContent?: unknown;
  data?: unknown;
  content?: unknown;
};

type MockClient = {
  callTool: (
    name: string,
    params: Record<string, unknown>,
    timeoutMs?: number,
  ) => Promise<MockToolResult>;
};

function setMockClient(client: MockClient): void {
  setSharedMcpClientFactoryForTesting(async () => client as unknown as never);
}

test.beforeEach(() => {
  setSharedMcpClientFactoryForTesting(null);
});

test.after(() => {
  setSharedMcpClientFactoryForTesting(null);
});

test('fetchDesignSystemKitFromSharedMcpClient: parses structuredContent payload', async () => {
  setMockClient({
    callTool: async (name) => {
      if (name === 'figma_get_status') {
        return { connected: true };
      }
      if (name === 'figma_get_design_system_kit') {
        return {
          isError: false,
          structuredContent: {
            tokens: {
              variables: [
                {
                  id: 'VariableID:1',
                  name: 'color/primary',
                  variableCollectionId: 'VariableCollectionId:1',
                  resolvedType: 'COLOR',
                  valuesByMode: { '1:0': '#FF0000' },
                },
              ],
              variableCollections: [
                {
                  id: 'VariableCollectionId:1',
                  name: 'Primitives',
                  modes: [{ modeId: '1:0', name: 'Base' }],
                },
              ],
            },
            styles: [{ id: 'Style:1', name: 'Color/Primary', styleType: 'FILL' }],
          },
        };
      }
      return {};
    },
  });

  const result = await fetchDesignSystemKitFromSharedMcpClient({
    format: 'summary',
    include: ['tokens', 'styles'],
    timeoutMs: 1_000,
    connectWaitMs: 0,
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(Object.keys(result.tokens?.variables ?? {}).length, 1);
    assert.equal(Object.keys(result.tokens?.variableCollections ?? {}).length, 1);
    assert.equal(result.styles?.length, 1);
    assert.equal(result.styles?.[0]?.name, 'Color/Primary');
  }
});

test('fetchDesignSystemKitFromSharedMcpClient: parses data payload', async () => {
  setMockClient({
    callTool: async (name) => {
      if (name === 'figma_get_status') {
        return { connected: true };
      }
      if (name === 'figma_get_design_system_kit') {
        return {
          isError: false,
          data: {
            tokens: {
              variables: [],
              variableCollections: [],
            },
            styles: [{ id: 'Style:2', name: 'Text/Body', styleType: 'TEXT' }],
          },
        };
      }
      return {};
    },
  });

  const result = await fetchDesignSystemKitFromSharedMcpClient({
    include: ['styles', 'components'],
    timeoutMs: 1_000,
    connectWaitMs: 0,
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.styles?.length, 1);
    assert.equal(result.styles?.[0]?.styleType, 'TEXT');
  }
});

test('fetchDesignSystemKitFromSharedMcpClient: returns method_not_found when tool is unavailable', async () => {
  setMockClient({
    callTool: async (name) => {
      if (name === 'figma_get_status') return { connected: true };
      if (name === 'figma_get_design_system_kit') {
        throw new Error('Method not found: figma_get_design_system_kit');
      }
      return {};
    },
  });

  const result = await fetchDesignSystemKitFromSharedMcpClient({
    include: ['tokens', 'styles'],
    timeoutMs: 1_000,
    connectWaitMs: 0,
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, 'kit.method_not_found');
  }
});

test('fetchDesignSystemKitFromSharedMcpClient: returns tool_error when MCP reports isError=true', async () => {
  setMockClient({
    callTool: async (name) => {
      if (name === 'figma_get_status') return { connected: true };
      if (name === 'figma_get_design_system_kit') return { isError: true };
      return {};
    },
  });

  const result = await fetchDesignSystemKitFromSharedMcpClient({
    include: ['tokens', 'styles'],
    timeoutMs: 1_000,
    connectWaitMs: 0,
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, 'kit.tool_error');
  }
});

test('fetchDesignSystemKitFromSharedMcpClient: classifies timeout errors', async () => {
  setMockClient({
    callTool: async (name) => {
      if (name === 'figma_get_status') return { connected: true };
      if (name === 'figma_get_design_system_kit') {
        throw new Error('Request timed out while calling MCP.');
      }
      return {};
    },
  });

  const result = await fetchDesignSystemKitFromSharedMcpClient({
    include: ['tokens'],
    timeoutMs: 50,
    connectWaitMs: 0,
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, 'kit.timeout');
    assert.equal(result.retryable, true);
  }
});
