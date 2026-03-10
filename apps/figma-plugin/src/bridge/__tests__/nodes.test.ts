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
});
