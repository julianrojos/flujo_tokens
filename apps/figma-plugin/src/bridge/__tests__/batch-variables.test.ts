/**
 * Batch Variables Handler Tests
 *
 * Tests for handleBatchCreateVariables and handleBatchUpdateVariables
 * with partial-success semantics.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { handleBatchCreateVariables, handleBatchUpdateVariables } from '../handlers/batch-variables';

function setMockFigma(figma: unknown): void {
  (globalThis as unknown as { figma?: unknown }).figma = figma;
}

function clearMockFigma(): void {
  delete (globalThis as unknown as { figma?: unknown }).figma;
}

describe('handleBatchCreateVariables', () => {
  afterEach(() => {
    clearMockFigma();
  });

  it('should create multiple variables with partial success', async () => {
    const mockCollections = new Map([
      ['col-1', {
        id: 'col-1',
        name: 'Test',
        key: 'col-1',
        modes: [{ modeId: 'mode-1', name: 'Default' }],
        defaultModeId: 'mode-1',
        variableIds: [],
      }],
    ]);

    setMockFigma({
      variables: {
        getVariableCollectionByIdAsync: async (id: string) => mockCollections.get(id) || null,
        createVariable: (name: string, collectionId: string, resolvedType: string) => {
          // Simulate failure for nonexistent collection
          if (collectionId === 'nonexistent') {
            throw new Error('Collection not found');
          }
          return {
            id: `var-${Date.now()}-${name}`,
            name,
            key: `key-${Date.now()}`,
            resolvedType,
            valuesByMode: {},
            variableCollectionId: collectionId,
            scopes: [],
            description: '',
            hiddenFromPublishing: false,
            remote: false,
          };
        },
      },
    });

    const result = await handleBatchCreateVariables({
      items: [
        { name: 'Color/Primary', collectionId: 'col-1', resolvedType: 'COLOR' },
        { name: 'Color/Secondary', collectionId: 'nonexistent', resolvedType: 'COLOR' },
        { name: 'Spacing/Small', collectionId: 'col-1', resolvedType: 'FLOAT' },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.created.length).toBe(2);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0].index).toBe(1);
    expect(result.errors[0].name).toContain('Color/Secondary');
  });

  it('should return all-fail when all items fail', async () => {
    setMockFigma({
      variables: {
        getVariableCollectionByIdAsync: async () => null,
      },
    });

    const result = await handleBatchCreateVariables({
      items: [
        { name: 'Var1', collectionId: 'nonexistent', resolvedType: 'COLOR' },
        { name: 'Var2', collectionId: 'nonexistent', resolvedType: 'FLOAT' },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.created.length).toBe(0);
    expect(result.errors.length).toBe(2);
  });

  it('should return empty created array for empty items', async () => {
    setMockFigma({
      variables: {
        getLocalVariableCollectionsAsync: async () => [],
      },
    });

    const result = await handleBatchCreateVariables({ items: [] });

    expect(result.success).toBe(true);
    expect(result.created.length).toBe(0);
    expect(result.errors.length).toBe(0);
  });
});

describe('handleBatchUpdateVariables', () => {
  afterEach(() => {
    clearMockFigma();
  });

  it('should update multiple variables with partial success', async () => {
    const mockVars = new Map([
      [
        'var-1',
        {
          id: 'var-1',
          name: 'Color/Primary',
          key: 'key-1',
          resolvedType: 'COLOR',
          valuesByMode: { 'mode-1': { r: 1, g: 0, b: 0, a: 1 } },
          variableCollectionId: 'col-1',
          scopes: [],
          description: '',
          hiddenFromPublishing: false,
          remote: false,
          setValueForMode: function(modeId: string, value: any) {
            this.valuesByMode[modeId] = value;
            return this;
          },
        },
      ],
      [
        'var-2',
        {
          id: 'var-2',
          name: 'Color/Secondary',
          key: 'key-2',
          resolvedType: 'COLOR',
          valuesByMode: { 'mode-1': { r: 0, g: 0, b: 1, a: 1 } },
          variableCollectionId: 'col-1',
          scopes: [],
          description: '',
          hiddenFromPublishing: false,
          remote: false,
          setValueForMode: function(modeId: string, value: any) {
            this.valuesByMode[modeId] = value;
            return this;
          },
        },
      ],
    ]);

    setMockFigma({
      variables: {
        getLocalVariablesAsync: async () => Array.from(mockVars.values()),
        getVariableByIdAsync: async (id: string) => {
          const variable = mockVars.get(id);
          return variable ? { ...variable } : null;
        },
        getLocalVariableCollectionsAsync: async () => [
          {
            id: 'col-1',
            name: 'Test',
            key: 'col-1',
            modes: [{ modeId: 'mode-1', name: 'Default' }],
            defaultModeId: 'mode-1',
            variableIds: ['var-1', 'var-2'],
          },
        ],
      },
    });

    const result = await handleBatchUpdateVariables({
      items: [
        { variableId: 'var-1', modeId: 'mode-1', value: { r: 0, g: 1, b: 0, a: 1 } },
        { variableId: 'nonexistent', modeId: 'mode-1', value: { r: 1, g: 1, b: 0, a: 1 } },
        { variableId: 'var-2', modeId: 'mode-1', value: { r: 1, g: 1, b: 0, a: 1 } },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.updated.length).toBe(2);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0].index).toBe(1);
    expect(result.errors[0].variableId).toBe('nonexistent');
  });

  it('should return empty updated array for empty items', async () => {
    setMockFigma({
      variables: {
        getLocalVariablesAsync: async () => [],
        getLocalVariableCollectionsAsync: async () => [],
      },
    });

    const result = await handleBatchUpdateVariables({ items: [] });

    expect(result.success).toBe(true);
    expect(result.updated.length).toBe(0);
    expect(result.errors.length).toBe(0);
  });
});
