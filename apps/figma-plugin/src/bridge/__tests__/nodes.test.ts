/**
 * Node and screenshot handlers tests
 */

import { afterEach, describe, expect, it } from 'vitest';
import {
  handleCaptureScreenshot,
  handleCloneNode,
  handleCreateChildNode,
  handleDeleteNode,
  handleMoveNode,
  handleRenameNode,
  handleResizeNode,
  handleSetNodeCornerRadius,
  handleSetNodeFills,
  handleSetNodeOpacity,
  handleSetNodeStrokes,
  handleSetTextContent,
  handleGetChildren,
  handleSearchNodes,
  handleGetNodesById,
} from '../handlers/nodes';

function setMockFigma(figma: unknown): void {
  (globalThis as unknown as { figma?: unknown }).figma = figma;
}

function clearMockFigma(): void {
  delete (globalThis as unknown as { figma?: unknown }).figma;
}

afterEach(() => {
  clearMockFigma();
});

describe('nodes handlers', () => {
  it('handleResizeNode resizes a node', async () => {
    const node = {
      id: 'n1',
      name: 'Rect',
      type: 'RECTANGLE',
      width: 10,
      height: 20,
      resize(width: number, height: number) {
        this.width = width;
        this.height = height;
      },
      resizeWithoutConstraints(width: number, height: number) {
        this.width = width;
        this.height = height;
      },
    };

    setMockFigma({ getNodeByIdAsync: async () => node });

    const result = await handleResizeNode({ nodeId: 'n1', width: 100, height: 50 });
    expect(result).toMatchObject({ success: true, node: { width: 100, height: 50 } });
  });

  it('handleMoveNode moves a node', async () => {
    const node = { id: 'n1', name: 'Rect', type: 'RECTANGLE', x: 0, y: 0 };
    setMockFigma({ getNodeByIdAsync: async () => node });

    const result = await handleMoveNode({ nodeId: 'n1', x: 45, y: 90 });
    expect(result).toMatchObject({ success: true, node: { x: 45, y: 90 } });
  });

  it('handleSetNodeFills converts hex fills', async () => {
    const node = { id: 'n1', name: 'Rect', type: 'RECTANGLE', fills: [] as unknown[] };
    setMockFigma({ getNodeByIdAsync: async () => node });

    const result = await handleSetNodeFills({
      nodeId: 'n1',
      fills: [{ type: 'SOLID', color: '#FF0000' }],
    });

    expect(result).toMatchObject({ success: true });
    expect(node.fills).toHaveLength(1);
  });

  it('handleSetNodeStrokes sets strokes and weight', async () => {
    const node = {
      id: 'n1',
      name: 'Rect',
      type: 'RECTANGLE',
      strokes: [] as unknown[],
      strokeWeight: 1,
    };
    setMockFigma({ getNodeByIdAsync: async () => node });

    const result = await handleSetNodeStrokes({
      nodeId: 'n1',
      strokes: [{ type: 'SOLID', color: '#00FF00' }],
      strokeWeight: 3,
    });

    expect(result).toMatchObject({ success: true });
    expect(node.strokeWeight).toBe(3);
  });

  it('handleSetNodeOpacity clamps opacity', async () => {
    const node = { id: 'n1', name: 'Rect', type: 'RECTANGLE', opacity: 1 };
    setMockFigma({ getNodeByIdAsync: async () => node });

    const result = await handleSetNodeOpacity({ nodeId: 'n1', opacity: 2 });
    expect(result).toMatchObject({ success: true, node: { opacity: 1 } });
  });

  it('handleSetNodeCornerRadius sets corner radius', async () => {
    const node = { id: 'n1', name: 'Rect', type: 'RECTANGLE', cornerRadius: 0 };
    setMockFigma({ getNodeByIdAsync: async () => node });

    const result = await handleSetNodeCornerRadius({ nodeId: 'n1', radius: 8 });
    expect(result).toMatchObject({ success: true, node: { cornerRadius: 8 } });
  });

  it('handleCloneNode clones node', async () => {
    const cloned = { id: 'n2', name: 'Clone', type: 'RECTANGLE', x: 10, y: 20 };
    const node = {
      id: 'n1',
      name: 'Rect',
      type: 'RECTANGLE',
      clone: () => cloned,
    };
    setMockFigma({ getNodeByIdAsync: async () => node });

    const result = await handleCloneNode({ nodeId: 'n1' });
    expect(result).toMatchObject({ success: true, node: { id: 'n2', name: 'Clone' } });
  });

  it('handleDeleteNode removes node', async () => {
    let removed = false;
    const node = {
      id: 'n1',
      name: 'Rect',
      type: 'RECTANGLE',
      remove: () => {
        removed = true;
      },
    };
    setMockFigma({ getNodeByIdAsync: async () => node });

    const result = await handleDeleteNode({ nodeId: 'n1' });
    expect(result).toMatchObject({ success: true, deleted: { id: 'n1' } });
    expect(removed).toBe(true);
  });

  it('handleRenameNode renames node', async () => {
    const node = { id: 'n1', name: 'Old', type: 'RECTANGLE' };
    setMockFigma({ getNodeByIdAsync: async () => node });

    const result = await handleRenameNode({ nodeId: 'n1', newName: 'New' });
    expect(result).toMatchObject({ success: true, node: { oldName: 'Old', name: 'New' } });
  });

  it('handleSetTextContent sets text content', async () => {
    const node = {
      id: 't1',
      name: 'Text',
      type: 'TEXT',
      fontName: { family: 'Inter', style: 'Regular' },
      characters: '',
      fontSize: 12,
    };

    setMockFigma({
      mixed: Symbol('mixed'),
      getNodeByIdAsync: async () => node,
      loadFontAsync: async () => undefined,
    });

    const result = await handleSetTextContent({ nodeId: 't1', text: 'Hello', fontSize: 16 });
    expect(result).toMatchObject({ success: true, node: { characters: 'Hello' } });
    expect(node.fontSize).toBe(16);
  });

  it('handleCreateChildNode creates a child node', async () => {
    const appended: Array<{ id: string }> = [];
    const parent = {
      id: 'p1',
      name: 'Frame',
      type: 'FRAME',
      appendChild: (child: { id: string }) => appended.push(child),
    };

    const createdRect = {
      id: 'r1',
      name: 'Rect',
      type: 'RECTANGLE',
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      resize(width: number, height: number) {
        this.width = width;
        this.height = height;
      },
      fills: [] as unknown[],
    };

    setMockFigma({
      getNodeByIdAsync: async () => parent,
      createRectangle: () => createdRect,
    });

    const result = await handleCreateChildNode({
      parentId: 'p1',
      nodeType: 'RECTANGLE',
      properties: { name: 'Card', width: 120, height: 60, x: 12, y: 24 },
    });

    expect(result).toMatchObject({ success: true, node: { id: 'r1', name: 'Card' } });
    expect(appended).toHaveLength(1);
  });

  it('handleCaptureScreenshot exports node bytes to base64', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const node = {
      id: 'n1',
      name: 'Rect',
      type: 'RECTANGLE',
      exportAsync: async () => bytes,
      absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 80 },
    };

    setMockFigma({
      getNodeByIdAsync: async () => node,
      currentPage: node,
      base64Encode: (input: Uint8Array) => Buffer.from(input).toString('base64'),
    });

    const result = await handleCaptureScreenshot({ nodeId: 'n1', format: 'PNG', scale: 2 });
    expect(result).toMatchObject({
      success: true,
      image: {
        format: 'PNG',
        scale: 2,
        byteLength: 4,
        node: { id: 'n1' },
      },
    });
  });

  it('handleGetChildren returns empty array for node without children', async () => {
    const node = {
      id: 'parent-1',
      name: 'Frame',
      type: 'FRAME',
    };
    setMockFigma({ getNodeByIdAsync: async () => node });

    const result = await handleGetChildren({ parentId: 'parent-1' });
    expect(result).toMatchObject({ success: true, parentId: 'parent-1', children: [] });
  });

  it('handleGetChildren returns children summaries', async () => {
    const child1 = { id: 'child-1', name: 'Rect1', type: 'RECTANGLE' };
    const child2 = { id: 'child-2', name: 'Text1', type: 'TEXT' };
    const parent = {
      id: 'parent-1',
      name: 'Frame',
      type: 'FRAME',
      children: [child1, child2],
    };
    setMockFigma({ getNodeByIdAsync: async () => parent });

    const result = await handleGetChildren({ parentId: 'parent-1' });
    const typed = result as { success: boolean; children: Array<{ id: string; name: string }> };

    expect(typed.success).toBe(true);
    expect(typed.children).toHaveLength(2);
    expect(typed.children[0].id).toBe('child-1');
    expect(typed.children[1].id).toBe('child-2');
  });

  it('handleGetChildren respects compact:false with visual fields', async () => {
    const child1 = {
      id: 'child-1',
      name: 'Rect1',
      type: 'RECTANGLE',
      x: 10,
      y: 20,
      width: 100,
      height: 50,
      fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 } }],
      strokes: [],
      opacity: 0.5,
    };
    const parent = {
      id: 'parent-1',
      name: 'Frame',
      type: 'FRAME',
      children: [child1],
    };
    setMockFigma({ getNodeByIdAsync: async () => parent });

    const result = await handleGetChildren({ parentId: 'parent-1', compact: false });
    const typed = result as { success: boolean; children: Array<{ x?: number; fills?: unknown[] }> };

    expect(typed.success).toBe(true);
    expect(typed.children).toHaveLength(1);
    expect(typed.children[0].x).toBe(10);
    expect(typed.children[0].width).toBe(100);
    expect(typed.children[0].fills).toEqual([{ type: 'SOLID', color: { r: 1, g: 0, b: 0 } }]);
  });

  it('handleSearchNodes with maxDepth limits traversal', async () => {
    const grandchild = { id: 'gc-1', name: 'GrandChild', type: 'RECTANGLE', parent: null as unknown };
    const child = {
      id: 'child-1',
      name: 'Child',
      type: 'FRAME',
      children: [grandchild],
      parent: null as unknown,
    };
    const root = {
      id: 'root-1',
      name: 'Root',
      type: 'PAGE',
      children: [child],
    };
    grandchild.parent = child;
    child.parent = root;

    setMockFigma({ getNodeByIdAsync: async (id: string) => (id === 'root-1' ? root : child) });

    const result = await handleSearchNodes({ parentId: 'root-1', maxDepth: 1 });
    const typed = result as { success: boolean; nodes: Array<{ name: string }>; count: number };

    expect(typed.success).toBe(true);
    // Should only find child, not grandchild (depth 1)
    expect(typed.nodes.every((n) => n.name !== 'GrandChild')).toBe(true);
  });

  it('handleSearchNodes with nameContains is diacritic-insensitive', async () => {
    const child1 = {
      id: 'child-1',
      name: 'Botón',
      type: 'FRAME',
      parent: null as unknown,
    };
    const child2 = {
      id: 'child-2',
      name: 'Boton',
      type: 'FRAME',
      parent: null as unknown,
    };
    const child3 = {
      id: 'child-3',
      name: 'Niño',
      type: 'RECTANGLE',
      parent: null as unknown,
    };
    const root = {
      id: 'root-1',
      name: 'Root',
      type: 'PAGE',
      children: [child1, child2, child3],
    };
    child1.parent = root;
    child2.parent = root;
    child3.parent = root;

    setMockFigma({ getNodeByIdAsync: async (id: string) => (id === 'root-1' ? root : null) });

    // ASCII query should match both accented and non-accented
    const asciiResult = await handleSearchNodes({ parentId: 'root-1', nameContains: 'boton' });
    const asciiTyped = asciiResult as { success: boolean; nodes: Array<{ name: string }>; count: number };
    expect(asciiTyped.success).toBe(true);
    expect(asciiTyped.count).toBe(2);
    expect(asciiTyped.nodes.map((n) => n.name)).toEqual(['Botón', 'Boton']);

    // Accented query should also match both
    const accentResult = await handleSearchNodes({ parentId: 'root-1', nameContains: 'botón' });
    const accentTyped = accentResult as { success: boolean; nodes: Array<{ name: string }>; count: number };
    expect(accentTyped.success).toBe(true);
    expect(accentTyped.count).toBe(2);
    expect(accentTyped.nodes.map((n) => n.name)).toEqual(['Botón', 'Boton']);

    // Test with ñ
    const ninoResult = await handleSearchNodes({ parentId: 'root-1', nameContains: 'nino' });
    const ninoTyped = ninoResult as { success: boolean; nodes: Array<{ name: string }>; count: number };
    expect(ninoTyped.success).toBe(true);
    expect(ninoTyped.count).toBe(1);
    expect(ninoTyped.nodes[0]?.name).toBe('Niño');
  });

  it('handleGetNodesById returns null for non-existent IDs', async () => {
    const existingNode = {
      id: 'exists-1',
      name: 'Existing',
      type: 'RECTANGLE',
      parent: null,
      fills: [],
      strokes: [],
      opacity: 1,
      cornerRadius: 0,
      visible: true,
      locked: false,
      effects: [],
      styles: {},
    };

    setMockFigma({
      getNodeByIdAsync: async (id: string) => (id === 'exists-1' ? existingNode : null),
    });

    const result = await handleGetNodesById({ nodeIds: ['exists-1', 'missing-1'] });
    const typed = result as { success: boolean; nodes: Record<string, unknown>; requestedIds: readonly string[] };

    expect(typed.success).toBe(true);
    expect(typed.nodes['exists-1']).toBeTruthy();
    expect(typed.nodes['missing-1']).toBe(null);
    // requestedIds preserves the original order for stable client iteration
    expect(typed.requestedIds).toEqual(['exists-1', 'missing-1']);
  });

  it('handleGetNodesById throws error for > 50 nodeIds', async () => {
    const tooManyIds = Array.from({ length: 51 }, (_, i) => `node-${i}`);

    setMockFigma({ getNodeByIdAsync: async () => null });

    await expect(handleGetNodesById({ nodeIds: tooManyIds })).rejects.toMatchObject({
      code: 'INVALID_PARAMETER',
    });
  });

  it('handleGetNodesById with empty array returns empty result', async () => {
    setMockFigma({ getNodeByIdAsync: async () => null });

    const result = await handleGetNodesById({ nodeIds: [] });
    const typed = result as { success: boolean; nodes: Record<string, unknown>; requestedIds: readonly string[] };

    expect(typed.success).toBe(true);
    expect(Object.keys(typed.nodes)).toHaveLength(0);
    expect(typed.requestedIds).toEqual([]);
  });

  it('handleGetChildren respects limit and offset for pagination', async () => {
    // Create parent with 100 children
    const children = Array.from({ length: 100 }, (_, i) => ({
      id: `child-${i}`,
      name: `Child ${i}`,
      type: 'RECTANGLE',
    }));
    const parent = {
      id: 'parent-1',
      name: 'Frame',
      type: 'FRAME',
      children,
    };
    setMockFigma({ getNodeByIdAsync: async () => parent });

    // Test default limit (500) - should return all 100
    const result1 = await handleGetChildren({ parentId: 'parent-1' });
    const typed1 = result1 as { success: boolean; children: Array<{ id: string }>; total: number; limit: number };
    expect(typed1.children).toHaveLength(100);
    expect(typed1.total).toBe(100);
    expect(typed1.limit).toBe(500);

    // Test custom limit
    const result2 = await handleGetChildren({ parentId: 'parent-1', limit: 20 });
    const typed2 = result2 as { children: Array<{ id: string }>; limit: number; hasMore: boolean };
    expect(typed2.children).toHaveLength(20);
    expect(typed2.limit).toBe(20);
    expect(typed2.hasMore).toBe(true);

    // Test offset
    const result3 = await handleGetChildren({ parentId: 'parent-1', limit: 20, offset: 50 });
    const typed3 = result3 as { children: Array<{ id: string }>; offset: number };
    expect(typed3.children).toHaveLength(20);
    expect(typed3.children[0].id).toBe('child-50');
    expect(typed3.offset).toBe(50);
  });

  it('handleGetChildren enforces max limit of 2000', async () => {
    const children = Array.from({ length: 3000 }, (_, i) => ({
      id: `child-${i}`,
      name: `Child ${i}`,
      type: 'RECTANGLE',
    }));
    const parent = {
      id: 'parent-1',
      name: 'Frame',
      type: 'FRAME',
      children,
    };
    setMockFigma({ getNodeByIdAsync: async () => parent });

    // Request 3000, should cap at 2000
    const result = await handleGetChildren({ parentId: 'parent-1', limit: 3000 });
    const typed = result as { children: Array<{ id: string }>; limit: number; hasMore: boolean };
    expect(typed.children).toHaveLength(2000);
    expect(typed.limit).toBe(2000);
    expect(typed.hasMore).toBe(true);
  });

  it('handleGetChildren with limit=-1 returns all children (no limit)', async () => {
    const children = Array.from({ length: 100 }, (_, i) => ({
      id: `child-${i}`,
      name: `Child ${i}`,
      type: 'RECTANGLE',
    }));
    const parent = {
      id: 'parent-1',
      name: 'Frame',
      type: 'FRAME',
      children,
    };
    setMockFigma({ getNodeByIdAsync: async () => parent });

    const result = await handleGetChildren({ parentId: 'parent-1', limit: -1 });
    const typed = result as { children: Array<{ id: string }>; limit: number };
    expect(typed.children).toHaveLength(100);
    expect(typed.limit).toBe(100); // -1 means no limit, returns all
  });

  it('handleGetChildren clamps negative offset to 0', async () => {
    const children = Array.from({ length: 100 }, (_, i) => ({
      id: `child-${i}`,
      name: `Child ${i}`,
      type: 'RECTANGLE',
    }));
    const parent = {
      id: 'parent-1',
      name: 'Frame',
      type: 'FRAME',
      children,
    };
    setMockFigma({ getNodeByIdAsync: async () => parent });

    // Negative offset should be clamped to 0
    const result = await handleGetChildren({ parentId: 'parent-1', limit: 20, offset: -10 });
    const typed = result as { children: Array<{ id: string }>; offset: number };
    expect(typed.children).toHaveLength(20);
    expect(typed.children[0].id).toBe('child-0'); // Should start from beginning, not from end
    expect(typed.offset).toBe(0); // Clamped to 0
  });
});
