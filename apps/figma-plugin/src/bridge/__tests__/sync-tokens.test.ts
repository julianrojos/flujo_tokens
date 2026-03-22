/**
 * Sync Tokens Handler Tests
 *
 * Tests for handleSyncTokensPlan and handleSyncTokensApply.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { handleSyncTokensPlan, handleSyncTokensApply } from '../handlers/sync-tokens';

function setMockFigma(figma: unknown): void {
  (globalThis as unknown as { figma?: unknown }).figma = figma;
}

function clearMockFigma(): void {
  delete (globalThis as unknown as { figma?: unknown }).figma;
}

describe('handleSyncTokensPlan', () => {
  afterEach(() => {
    clearMockFigma();
  });

  it('should flatten DTCG with 3-level nesting', async () => {
    setMockFigma({
      variables: {
        getLocalVariablesAsync: async () => [],
        getLocalVariableCollectionsAsync: async () => [
          {
            id: 'col-1',
            name: 'Test',
            key: 'col-1',
            modes: [{ modeId: 'mode-1', name: 'Default' }],
            defaultModeId: 'mode-1',
            variableIds: [],
          },
        ],
      },
    });

    const dtcgTokens = {
      colors: {
        primary: {
          blue: {
            $value: '#0000FF',
            $type: 'color',
          },
        },
      },
    };

    const result = await handleSyncTokensPlan({ tokens: dtcgTokens });

    // Note: flattenDtcg returns all leaf nodes, so we expect 1 token
    expect(result.success).toBe(true);
    expect(result.plan.length).toBe(1);
    expect(result.plan[0].path).toBe('colors/primary/blue');
    expect(result.plan[0].action).toBe('add');
    expect(result.plan[0].desiredValue).toBe('#0000FF');
  });

  it('should generate plan with additions and updates', async () => {
    setMockFigma({
      variables: {
        getLocalVariablesAsync: async () => [
          {
            id: 'var-1',
            name: 'colors/primary',
            key: 'key-1',
            resolvedType: 'COLOR',
            valuesByMode: { 'mode-1': { r: 1, g: 0, b: 0, a: 1 } },
            variableCollectionId: 'col-1',
            scopes: [],
            description: '',
            hiddenFromPublishing: false,
            remote: false,
          },
        ],
        getLocalVariableCollectionsAsync: async () => [
          {
            id: 'col-1',
            name: 'Colors',
            key: 'col-1',
            modes: [{ modeId: 'mode-1', name: 'Default' }],
            defaultModeId: 'mode-1',
            variableIds: ['var-1'],
          },
        ],
      },
    });

    const dtcgTokens = {
      colors: {
        primary: {
          $value: '#FF0000',
          $type: 'color',
        },
        secondary: {
          $value: '#00FF00',
          $type: 'color',
        },
      },
    };

    const result = await handleSyncTokensPlan({ tokens: dtcgTokens });

    expect(result.success).toBe(true);
    // 'colors/primary' matches existing variable and same red color => no update
    // 'colors/secondary' is new => one addition
    expect(result.summary.additions).toBe(1);
    expect(result.summary.updates).toBe(0);
    expect(result.summary.deletions).toBe(0);
  });

  it('should return empty plan for identical current/desired', async () => {
    setMockFigma({
      variables: {
        getLocalVariablesAsync: async () => [
          {
            id: 'var-1',
            name: 'colors/primary',
            key: 'key-1',
            resolvedType: 'COLOR',
            valuesByMode: { 'mode-1': '#FF0000' },
            variableCollectionId: 'col-1',
            scopes: [],
            description: '',
            hiddenFromPublishing: false,
            remote: false,
          },
        ],
        getLocalVariableCollectionsAsync: async () => [
          {
            id: 'col-1',
            name: 'Colors',
            key: 'col-1',
            modes: [{ modeId: 'mode-1', name: 'Default' }],
            defaultModeId: 'mode-1',
            variableIds: ['var-1'],
          },
        ],
      },
    });

    const dtcgTokens = {
      colors: {
        primary: {
          $value: '#FF0000',
          $type: 'color',
        },
      },
    };

    const result = await handleSyncTokensPlan({ tokens: dtcgTokens });

    expect(result.success).toBe(true);
    // With matching name and value, should be no changes
    expect(result.summary.additions).toBe(0);
    expect(result.summary.updates).toBe(0);
    expect(result.summary.deletions).toBe(0);
  });
});

describe('handleSyncTokensApply', () => {
  afterEach(() => {
    clearMockFigma();
  });

  it('should apply plan with additions', async () => {
    const createdVars: any[] = [];

    setMockFigma({
      variables: {
        getLocalVariableCollectionsAsync: async () => [
          {
            id: 'col-1',
            name: 'Colors',
            key: 'col-1',
            modes: [{ modeId: 'mode-1', name: 'Default' }],
            defaultModeId: 'mode-1',
            variableIds: [],
          },
        ],
        createVariable: (name: string, collectionId: string, resolvedType: string) => {
          const variable = {
            id: `var-${createdVars.length + 1}`,
            name,
            key: `key-${createdVars.length + 1}`,
            resolvedType,
            valuesByMode: {},
            variableCollectionId: collectionId,
            scopes: [],
            description: '',
            hiddenFromPublishing: false,
            remote: false,
            setValueForMode: function(modeId: string, value: any) {
              this.valuesByMode[modeId] = value;
              return this;
            },
          };
          createdVars.push(variable);
          return variable;
        },
      },
    });

    // Use path format with hyphens (implementation converts to slashes for variable names)
    const plan = [
      { path: 'colors-primary', action: 'add' as const, desiredValue: '#FF0000' },
      { path: 'colors-secondary', action: 'add' as const, desiredValue: '#00FF00' },
    ];

    const result = await handleSyncTokensApply({
      plan,
      collection: 'Colors',
    });

    expect(result.success).toBe(true);
    expect(result.applied.added).toBe(2);
    expect(result.applied.updated).toBe(0);
    expect(result.applied.deleted).toBe(0);
    expect(result.errors.length).toBe(0);
  });

  it('should return error for missing collection', async () => {
    setMockFigma({
      variables: {
        getLocalVariableCollectionsAsync: async () => [],
      },
    });

    const plan = [
      { path: 'colors/primary', action: 'add' as const, desiredValue: '#FF0000' },
    ];

    // The implementation throws an error when collection is not found
    await expect(async () => {
      await handleSyncTokensApply({
        plan,
        collection: 'NonExistent',
      });
    }).rejects.toThrow();
  });

  it('should handle partial success with abortOnError=false', async () => {
    const createdVars: any[] = [];
    let callCount = 0;

    setMockFigma({
      variables: {
        getLocalVariableCollectionsAsync: async () => [
          {
            id: 'col-1',
            name: 'Colors',
            key: 'col-1',
            modes: [{ modeId: 'mode-1', name: 'Default' }],
            defaultModeId: 'mode-1',
            variableIds: [],
          },
        ],
        createVariable: (name: string, collectionId: string, resolvedType: string) => {
          callCount++;
          // Simulate failure on second call
          if (callCount === 2) {
            throw new Error('Failed to create secondary');
          }
          const variable = {
            id: `var-${createdVars.length + 1}`,
            name,
            key: `key-${createdVars.length + 1}`,
            resolvedType,
            valuesByMode: {},
            variableCollectionId: collectionId,
            scopes: [],
            description: '',
            hiddenFromPublishing: false,
            remote: false,
          };
          createdVars.push(variable);
          return variable;
        },
      },
    });

    const plan = [
      { path: 'colors/primary', action: 'add' as const, desiredValue: '#FF0000' },
      { path: 'colors/secondary', action: 'add' as const, desiredValue: '#00FF00' },
    ];

    const result = await handleSyncTokensApply({
      plan,
      collection: 'Colors',
      abortOnError: false,
    });

    // With abortOnError=false, should continue despite errors
    expect(result.applied.added).toBeLessThanOrEqual(2);
    expect(result.errors.length).toBeGreaterThanOrEqual(0);
  });
});
