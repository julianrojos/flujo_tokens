/**
 * Token Usage Handler Tests
 *
 * Tests for handleGetTokenUsage with BFS traversal, limits, and partial-results semantics.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { handleGetTokenUsage } from '../handlers/token-usage';
import { ERROR_CODES } from '../protocol';

function setMockFigma(figma: unknown): void {
  (globalThis as unknown as { figma?: unknown }).figma = figma;
}

function clearMockFigma(): void {
  delete (globalThis as unknown as { figma?: unknown }).figma;
}

function makeNode(
  id: string,
  boundVariableIds: string[] = [],
  children: Array<{ id: string; boundVariableIds?: string[]; children?: unknown[] }> = []
): SceneNode {
  const boundVariables: Record<string, { id: string } | Array<{ id: string }>> = {};

  if (boundVariableIds.length > 0) {
    // Use fills as the binding property
    boundVariables.fills = boundVariableIds.map((vid) => ({ id: vid }));
  }

  return {
    id,
    type: 'FRAME',
    boundVariables: boundVariableIds.length ? boundVariables : {},
    children: children.map((child) => makeNode(child.id, child.boundVariableIds || [], child.children || [])),
  } as unknown as SceneNode;
}

function makeVariable(id: string, name: string) {
  return {
    id,
    name,
    key: `key-${id}`,
    resolvedType: 'COLOR' as const,
    valuesByMode: {},
    variableCollectionId: 'col-1',
    scopes: [],
    description: '',
    hiddenFromPublishing: false,
    remote: false,
  };
}

describe('handleGetTokenUsage', () => {
  afterEach(() => {
    clearMockFigma();
    vi.restoreAllMocks();
  });

  it('should return empty usage for empty page', async () => {
    const mockVariables: Array<{ id: string; name: string }> = [
      makeVariable('var-1', 'Primary/Color'),
      makeVariable('var-2', 'Secondary/Color'),
    ];

    setMockFigma({
      currentPage: {
        id: 'page-1',
        children: [],
      },
      getNodeByIdAsync: async () => null,
      variables: {
        getLocalVariablesAsync: async () => mockVariables,
      },
    });

    const result = await handleGetTokenUsage({});

    expect(result.success).toBe(true);
    expect(result.usage).toEqual([]);
    expect(result.unusedVariableIds).toEqual(['var-1', 'var-2']);
    expect(result.scannedNodeCount).toBe(1);
    expect(result.truncated).toBe(false);
  });

  it('should track usage for single node with binding', async () => {
    const mockVariables = [makeVariable('var-1', 'Primary/Color')];
    const mockNode = makeNode('node-1', ['var-1']);

    setMockFigma({
      currentPage: {
        id: 'page-1',
        children: [mockNode],
      },
      getNodeByIdAsync: async () => null,
      variables: {
        getLocalVariablesAsync: async () => mockVariables,
      },
    });

    const result = await handleGetTokenUsage({});

    expect(result.success).toBe(true);
    expect(result.usage.length).toBe(1);
    expect(result.usage[0].variableId).toBe('var-1');
    expect(result.usage[0].variableName).toBe('Primary/Color');
    expect(result.usage[0].nodeCount).toBe(1);
    expect(result.usage[0].nodeIds).toEqual(['node-1']);
    expect(result.unusedVariableIds).toEqual([]);
    expect(result.scannedNodeCount).toBe(2); // root + 1 child
  });

  it('should stop traversal at maxNodes without truncated flag', async () => {
    // Note: truncated is ONLY set to true when time budget exceeds (line 65 in token-usage.ts).
    // When maxNodes limit is reached, traversal stops gracefully without setting truncated=true.
    // This is intentional - maxNodes is a "soft limit" while time budget is a "hard limit".
    const mockVariables = [makeVariable('var-1', 'Primary/Color')];
    const maxNodes = 5;
    // Create maxNodes + 1 nodes
    const children = Array.from({ length: maxNodes + 1 }, (_, i) =>
      makeNode(`node-${i}`, i === 0 ? ['var-1'] : [])
    );

    setMockFigma({
      currentPage: {
        id: 'page-1',
        children,
      },
      getNodeByIdAsync: async () => null,
      variables: {
        getLocalVariablesAsync: async () => mockVariables,
      },
    });

    const result = await handleGetTokenUsage({ maxNodes });

    expect(result.success).toBe(true);
    // maxNodes stops traversal without setting truncated=true.
    expect(result.truncated).toBe(false);
    expect(result.scannedNodeCount).toBe(maxNodes);
    expect(result.usage[0].nodeCount).toBe(1); // Only first node has binding
  });

  it('should scan from specific pageId when provided', async () => {
    const mockVariables = [makeVariable('var-1', 'Primary/Color')];
    const targetNode = makeNode('target-node', ['var-1']);

    setMockFigma({
      currentPage: {
        id: 'page-1',
        children: [],
      },
      getNodeByIdAsync: async (id: string) => {
        if (id === 'page-123') {
          return { id: 'page-123', children: [targetNode] } as unknown as PageNode;
        }
        return null;
      },
      variables: {
        getLocalVariablesAsync: async () => mockVariables,
      },
    });

    const result = await handleGetTokenUsage({ pageId: 'page-123' });

    expect(result.success).toBe(true);
    expect(result.usage.length).toBe(1);
    expect(result.usage[0].variableId).toBe('var-1');
    expect(result.usage[0].nodeIds).toContain('target-node');
  });

  it('should throw NODE_NOT_FOUND for invalid pageId', async () => {
    setMockFigma({
      currentPage: {
        id: 'page-1',
        children: [],
      },
      getNodeByIdAsync: async () => null,
      variables: {
        getLocalVariablesAsync: async () => [],
      },
    });

    await expect(handleGetTokenUsage({ pageId: 'nonexistent' })).rejects.toMatchObject({
      code: ERROR_CODES.NODE_NOT_FOUND,
    });
  });

  it('should set truncated=true when time budget is exceeded', async () => {
    const mockVariables = [makeVariable('var-1', 'Primary/Color')];
    const children = Array.from({ length: 200 }, (_, i) => makeNode(`node-${i}`, []));
    setMockFigma({
      currentPage: { id: 'page-1', children },
      getNodeByIdAsync: async () => null,
      variables: { getLocalVariablesAsync: async () => mockVariables },
    });

    const nowSpy = vi.spyOn(Date, 'now');
    let now = 0;
    nowSpy.mockImplementation(() => {
      const current = now;
      now += 6000;
      return current;
    });

    let result;
    try {
      result = await handleGetTokenUsage({});
    } finally {
      nowSpy.mockRestore();
    }

    expect(result.success).toBe(true);
    expect(result.truncated).toBe(true);
    expect(result.scannedNodeCount).toBeLessThan(201);
  });

  it('should respect maxNodes limit and stop at exact limit', async () => {
    // Validates truncation CONTRACT: when traversal stops early, scannedNodeCount equals limit.
    // This shares the same logic pattern as time budget truncation (early exit with count).
    const mockVariables = [makeVariable('var-1', 'Primary/Color')];
    const children = Array.from({ length: 200 }, (_, i) => makeNode(`node-${i}`, []));
    setMockFigma({
      currentPage: { id: 'page-1', children },
      getNodeByIdAsync: async () => null,
      variables: { getLocalVariablesAsync: async () => mockVariables },
    });

    const result = await handleGetTokenUsage({ maxNodes: 50 });
    expect(result.success).toBe(true);
    expect(result.scannedNodeCount).toBe(50);
  });

  it('should cap nodeIds to 50 per entry', async () => {
    const mockVariables = [makeVariable('var-1', 'Primary/Color')];
    // Create 60 nodes all using the same variable
    const children = Array.from({ length: 60 }, (_, i) =>
      makeNode(`node-${i}`, ['var-1'])
    );

    setMockFigma({
      currentPage: {
        id: 'page-1',
        children,
      },
      getNodeByIdAsync: async () => null,
      variables: {
        getLocalVariablesAsync: async () => mockVariables,
      },
    });

    const result = await handleGetTokenUsage({});

    expect(result.success).toBe(true);
    expect(result.usage.length).toBe(1);
    expect(result.usage[0].variableId).toBe('var-1');
    expect(result.usage[0].nodeCount).toBe(60);
    expect(result.usage[0].nodeIds.length).toBe(50); // Capped at 50
    expect(result.usage[0].nodeIds[0]).toBe('node-0');
    expect(result.usage[0].nodeIds[49]).toBe('node-49');
  });

  it('should handle alias binding (object with id property)', async () => {
    const mockVariables = [makeVariable('var-1', 'Primary/Color')];

    // Create a node with alias-style binding
    const mockNode = {
      id: 'node-1',
      type: 'FRAME',
      boundVariables: {
        fills: [{ id: 'var-1' }], // Alias binding
      },
      children: [],
    } as unknown as SceneNode;

    setMockFigma({
      currentPage: {
        id: 'page-1',
        children: [mockNode],
      },
      getNodeByIdAsync: async () => null,
      variables: {
        getLocalVariablesAsync: async () => mockVariables,
      },
    });

    const result = await handleGetTokenUsage({});

    expect(result.success).toBe(true);
    expect(result.usage.length).toBe(1);
    expect(result.usage[0].variableId).toBe('var-1');
    expect(result.usage[0].nodeIds).toEqual(['node-1']);
  });

  it('should correctly track used vs unused variables', async () => {
    const mockVariables = [
      makeVariable('var-used', 'Used/Color'),
      makeVariable('var-unused', 'Unused/Color'),
    ];
    const mockNode = makeNode('node-1', ['var-used']);

    setMockFigma({
      currentPage: {
        id: 'page-1',
        children: [mockNode],
      },
      getNodeByIdAsync: async () => null,
      variables: {
        getLocalVariablesAsync: async () => mockVariables,
      },
    });

    const result = await handleGetTokenUsage({});

    expect(result.success).toBe(true);
    expect(result.usage.length).toBe(1);
    expect(result.usage[0].variableId).toBe('var-used');
    expect(result.unusedVariableIds).toContain('var-unused');
    expect(result.unusedVariableIds).not.toContain('var-used');
  });

  it('should traverse nested children (BFS)', async () => {
    const mockVariables = [makeVariable('var-1', 'Primary/Color')];
    // Create nested structure: currentPage -> child1 -> grandchild (with binding)
    const grandchild = makeNode('grandchild', ['var-1']);
    const child1 = {
      id: 'child1',
      type: 'FRAME',
      boundVariables: {},
      children: [grandchild],
    } as unknown as SceneNode;

    setMockFigma({
      currentPage: {
        id: 'page-1',
        children: [child1],
      },
      getNodeByIdAsync: async () => null,
      variables: {
        getLocalVariablesAsync: async () => mockVariables,
      },
    });

    const result = await handleGetTokenUsage({});

    expect(result.success).toBe(true);
    expect(result.usage.length).toBe(1);
    expect(result.usage[0].variableId).toBe('var-1');
    expect(result.usage[0].nodeIds).toContain('grandchild');
  });

  it('should handle node with empty boundVariables', async () => {
    const mockVariables = [makeVariable('var-1', 'Primary/Color')];
    const mockNode = {
      id: 'node-1',
      type: 'FRAME',
      boundVariables: {}, // Empty object
      children: [],
    } as unknown as SceneNode;

    setMockFigma({
      currentPage: {
        id: 'page-1',
        children: [mockNode],
      },
      getNodeByIdAsync: async () => null,
      variables: {
        getLocalVariablesAsync: async () => mockVariables,
      },
    });

    const result = await handleGetTokenUsage({});

    expect(result.success).toBe(true);
    expect(result.usage).toEqual([]);
    expect(result.unusedVariableIds).toEqual(['var-1']);
  });

  it('should handle binding array vs single object', async () => {
    const mockVariables = [
      makeVariable('var-1', 'Primary/Color'),
      makeVariable('var-2', 'Secondary/Color'),
    ];

    // Create node with multiple bindings (array style)
    const mockNode = {
      id: 'node-1',
      type: 'FRAME',
      boundVariables: {
        fills: [
          { id: 'var-1' },
          { id: 'var-2' },
        ],
      },
      children: [],
    } as unknown as SceneNode;

    setMockFigma({
      currentPage: {
        id: 'page-1',
        children: [mockNode],
      },
      getNodeByIdAsync: async () => null,
      variables: {
        getLocalVariablesAsync: async () => mockVariables,
      },
    });

    const result = await handleGetTokenUsage({});

    expect(result.success).toBe(true);
    expect(result.usage.length).toBe(2);
    expect(result.usage.map((u) => u.variableId)).toEqual(['var-1', 'var-2']);
  });

  it('should sort usage by nodeCount descending', async () => {
    const mockVariables = [
      makeVariable('var-1', 'Most/Used'),
      makeVariable('var-2', 'Least/Used'),
      makeVariable('var-3', 'Medium/Used'),
    ];

    // Create nodes: var-1 used 3 times, var-3 used 2 times, var-2 used 1 time
    const children = [
      makeNode('node-1', ['var-1', 'var-2', 'var-3']),
      makeNode('node-2', ['var-1', 'var-3']),
      makeNode('node-3', ['var-1']),
    ];

    setMockFigma({
      currentPage: {
        id: 'page-1',
        children,
      },
      getNodeByIdAsync: async () => null,
      variables: {
        getLocalVariablesAsync: async () => mockVariables,
      },
    });

    const result = await handleGetTokenUsage({});

    expect(result.success).toBe(true);
    expect(result.usage.length).toBe(3);
    expect(result.usage[0].variableId).toBe('var-1'); // 3 uses
    expect(result.usage[1].variableId).toBe('var-3'); // 2 uses
    expect(result.usage[2].variableId).toBe('var-2'); // 1 use
  });
});
