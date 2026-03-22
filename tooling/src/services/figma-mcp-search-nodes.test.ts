/**
 * Tests for Figma MCP Search Nodes Service
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeSearchQuery,
  normalizeSearchLimit,
  normalizeNodeTypes,
  searchFigmaNodesViaMcp,
  setSearchMcpModuleForTesting,
} from './figma-mcp-search-nodes.js';

type MockToolResult = {
  isError?: boolean;
  structuredContent?: unknown;
  content?: unknown;
  data?: unknown;
};

type MockClient = {
  callTool: (
    name: string,
    params: Record<string, unknown>,
    timeoutMs?: number,
  ) => Promise<MockToolResult>;
};

function setMockModule(client: MockClient): void {
  setSearchMcpModuleForTesting({
    getOrCreateSharedMcpClient: async () => client,
  } as never);
}

test.beforeEach(() => {
  setSearchMcpModuleForTesting(null);
});

test.after(() => {
  setSearchMcpModuleForTesting(null);
});

test('normalizeSearchQuery: rejects empty string', () => {
  const result = normalizeSearchQuery('');
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, 'search.name_too_short');
  }
});

test('normalizeSearchQuery: rejects single character', () => {
  const result = normalizeSearchQuery('a');
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, 'search.name_too_short');
  }
});

test('normalizeSearchQuery: accepts two characters', () => {
  const result = normalizeSearchQuery('ab');
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.normalized, 'ab');
  }
});

test('normalizeSearchQuery: trims whitespace', () => {
  const result = normalizeSearchQuery('  color  ');
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.normalized, 'color');
  }
});

test('normalizeSearchLimit: uses default when undefined', () => {
  const result = normalizeSearchLimit(undefined);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.limit, 20);
  }
});

test('normalizeSearchLimit: accepts valid limit', () => {
  const result = normalizeSearchLimit(10);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.limit, 10);
  }
});

test('normalizeSearchLimit: rejects zero', () => {
  const result = normalizeSearchLimit(0);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, 'search.invalid_limit');
  }
});

test('normalizeSearchLimit: rejects over max', () => {
  const result = normalizeSearchLimit(100);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, 'search.invalid_limit');
  }
});

test('normalizeSearchLimit: accepts max limit (50)', () => {
  const result = normalizeSearchLimit(50);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.limit, 50);
  }
});

test('normalizeNodeTypes: accepts valid types', () => {
  const result = normalizeNodeTypes(['FRAME', 'COMPONENT']);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.types, ['FRAME', 'COMPONENT']);
  }
});

test('normalizeNodeTypes: filters invalid types', () => {
  const result = normalizeNodeTypes(['FRAME', 'INVALID_TYPE', 'TEXT']);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.types, ['FRAME', 'TEXT']);
  }
});

test('normalizeNodeTypes: returns empty array for undefined', () => {
  const result = normalizeNodeTypes(undefined);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.types, []);
  }
});

test('normalizeNodeTypes: case-insensitive matching', () => {
  const result = normalizeNodeTypes(['frame', 'component']);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.types, ['FRAME', 'COMPONENT']);
  }
});

test('searchFigmaNodesViaMcp: prioritizes structuredContent over content text JSON', async () => {
  setMockModule({
    callTool: async () => ({
      isError: false,
      structuredContent: {
        nodes: [{ id: 'node-structured', name: 'Primary Button', type: 'FRAME' }],
      },
      content: [
        {
          type: 'text',
          text: '{"nodes":[{"id":"node-text","name":"Wrong Node","type":"TEXT"}]}',
        },
      ],
    }),
  });

  const result = await searchFigmaNodesViaMcp({ nameContains: 'button' });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.source, 'search_tool');
    assert.equal(result.count, 1);
    assert.equal(result.nodes[0]?.id, 'node-structured');
  }
});

test('searchFigmaNodesViaMcp: falls back to figma_list_nodes when search tool fails', async () => {
  const calledTools: string[] = [];
  setMockModule({
    callTool: async (name) => {
      calledTools.push(name);
      if (name === 'figma_search_nodes') {
        return {
          isError: true,
          content: [{ type: 'text', text: 'Method not found: figma_search_nodes' }],
        };
      }
      if (name === 'figma_list_nodes') {
        return {
          isError: false,
          structuredContent: {
            nodes: [
              { id: 'n1', name: 'Primary Button', type: 'FRAME', parentId: '0:1' },
              { id: 'n2', name: 'Input Field', type: 'FRAME', parentId: '0:1' },
            ],
          },
        };
      }
      return { isError: true };
    },
  });

  const result = await searchFigmaNodesViaMcp({
    nameContains: 'button',
    limit: 10,
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.source, 'fallback_list');
    assert.equal(result.count, 1);
    assert.equal(result.nodes[0]?.id, 'n1');
  }
  assert.deepEqual(calledTools.slice(0, 2), ['figma_search_nodes', 'figma_list_nodes']);
});

test('searchFigmaNodesViaMcp: does not fallback for timeout error from search tool', async () => {
  const calledTools: string[] = [];
  setMockModule({
    callTool: async (name) => {
      calledTools.push(name);
      if (name === 'figma_search_nodes') {
        throw new Error('MCP request timed out (tools/call).');
      }
      return {
        isError: false,
        structuredContent: {
          nodes: [{ id: 'unexpected', name: 'Should not run fallback', type: 'FRAME' }],
        },
      };
    },
  });

  const result = await searchFigmaNodesViaMcp({ nameContains: 'button', timeoutMs: 15 });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, 'search.timeout');
  }
  assert.deepEqual(calledTools, ['figma_search_nodes']);
});

test('searchFigmaNodesViaMcp: returns error when fallback figma_list_nodes fails', async () => {
  setMockModule({
    callTool: async (name) => {
      if (name === 'figma_search_nodes') {
        return {
          isError: true,
          content: [{ type: 'text', text: 'Unknown tool: figma_search_nodes' }],
        };
      }
      return {
        isError: true,
        content: [{ type: 'text', text: 'MCP server is not connected to Figma Desktop' }],
      };
    },
  });

  const result = await searchFigmaNodesViaMcp({ nameContains: 'button' });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, 'search.not_connected');
  }
});

test('searchFigmaNodesViaMcp: parses content.text JSON payload', async () => {
  setMockModule({
    callTool: async () => ({
      isError: false,
      content: [
        {
          type: 'text',
          text: '{"nodes":[{"id":"json-node","name":"Color Primary","type":"FRAME"}]}',
        },
      ],
    }),
  });

  const result = await searchFigmaNodesViaMcp({ nameContains: 'color' });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.count, 1);
    assert.equal(result.nodes[0]?.id, 'json-node');
  }
});

test('searchFigmaNodesViaMcp: marks truncated=false when result count equals requested limit', async () => {
  setMockModule({
    callTool: async () => ({
      isError: false,
      structuredContent: {
        nodes: [
          { id: 'n1', name: 'Button Primary', type: 'FRAME' },
          { id: 'n2', name: 'Button Secondary', type: 'FRAME' },
        ],
      },
    }),
  });

  const result = await searchFigmaNodesViaMcp({ nameContains: 'button', limit: 2 });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.count, 2);
    assert.equal(result.truncated, false);
  }
});

test('searchFigmaNodesViaMcp: marks truncated=true when result count exceeds requested limit', async () => {
  setMockModule({
    callTool: async () => ({
      isError: false,
      structuredContent: {
        nodes: [
          { id: 'n1', name: 'Button Primary', type: 'FRAME' },
          { id: 'n2', name: 'Button Secondary', type: 'FRAME' },
          { id: 'n3', name: 'Button Tertiary', type: 'FRAME' },
        ],
      },
    }),
  });

  const result = await searchFigmaNodesViaMcp({ nameContains: 'button', limit: 2 });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.count, 2);
    assert.equal(result.nodes.length, 2);
    assert.equal(result.truncated, true);
  }
});

test('searchFigmaNodesViaMcp: handles malformed tool payload without throwing', async () => {
  setMockModule({
    callTool: async () => ({
      isError: false,
      content: [
        {
          type: 'text',
          text: '{not-valid-json',
        },
      ],
    }),
  });

  const result = await searchFigmaNodesViaMcp({ nameContains: 'color' });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.source, 'search_tool');
    assert.equal(result.count, 0);
    assert.deepEqual(result.nodes, []);
  }
});

test('searchFigmaNodesViaMcp: classifies timeout errors', async () => {
  setSearchMcpModuleForTesting({
    getOrCreateSharedMcpClient: async () => {
      throw new Error('MCP request timed out (tools/call).');
    },
  } as never);

  const result = await searchFigmaNodesViaMcp({ nameContains: 'color', timeoutMs: 10 });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, 'search.timeout');
  }
});

test('searchFigmaNodesViaMcp: classifies not_connected errors', async () => {
  setSearchMcpModuleForTesting({
    getOrCreateSharedMcpClient: async () => {
      throw new Error('MCP server is running, but it is not connected to Figma Desktop');
    },
  } as never);

  const result = await searchFigmaNodesViaMcp({ nameContains: 'color' });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, 'search.not_connected');
  }
});
