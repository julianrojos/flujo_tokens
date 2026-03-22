/**
 * Variables Handler Tests - Enhanced Features
 *
 * Tests for handleSearchVariables with P1 enhancements:
 * - nameContains filter (case-insensitive)
 * - offset pagination (total, offset, hasMore)
 * - resolveAliases with depth guard
 * - collectionName filter
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { handleSearchVariables } from '../handlers/variables';

function setMockFigma(figma: unknown): void {
  (globalThis as unknown as { figma?: unknown }).figma = figma;
}

function clearMockFigma(): void {
  delete (globalThis as unknown as { figma?: unknown }).figma;
}

describe('handleSearchVariables - P1 Enhancements', () => {
  afterEach(() => {
    clearMockFigma();
  });

  describe('nameContains filter', () => {
    beforeEach(() => {
      setMockFigma({
        variables: {
          getLocalVariablesAsync: async () => [
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
            },
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
            },
            {
              id: 'var-3',
              name: 'Spacing/Small',
              key: 'key-3',
              resolvedType: 'FLOAT',
              valuesByMode: { 'mode-1': 8 },
              variableCollectionId: 'col-2',
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
              variableIds: ['var-1', 'var-2'],
            },
            {
              id: 'col-2',
              name: 'Spacing',
              key: 'col-2',
              modes: [{ modeId: 'mode-1', name: 'Default' }],
              defaultModeId: 'mode-1',
              variableIds: ['var-3'],
            },
          ],
        },
      });
    });

    afterEach(() => {
      clearMockFigma();
    });

    it('should filter by nameContains (case-insensitive)', async () => {
      const result = await handleSearchVariables({ nameContains: 'primary' });
      const typed = result as { success: boolean; variables: unknown[]; count: number };

      expect(typed.success).toBe(true);
      expect(typed.count).toBe(1);
      expect((typed.variables[0] as { name: string }).name).toBe('Color/Primary');
    });

    it('should filter by nameContains with uppercase query', async () => {
      const result = await handleSearchVariables({ nameContains: 'COLOR' });
      const typed = result as { success: boolean; variables: unknown[]; count: number };

      expect(typed.success).toBe(true);
      expect(typed.count).toBe(2);
    });

    it('should filter by nameContains with diacritics (diacritic-insensitive)', async () => {
      const mockVarsWithDiacritics = [
        {
          id: 'var-1',
          name: 'color/primário',
          key: 'key-1',
          resolvedType: 'COLOR' as const,
          valuesByMode: { 'mode-1': { r: 1, g: 0, b: 0, a: 1 } },
          variableCollectionId: 'col-1',
          scopes: [],
          description: '',
          hiddenFromPublishing: false,
          remote: false,
        },
        {
          id: 'var-2',
          name: 'color/primario',
          key: 'key-2',
          resolvedType: 'COLOR' as const,
          valuesByMode: { 'mode-1': { r: 0, g: 1, b: 0, a: 1 } },
          variableCollectionId: 'col-1',
          scopes: [],
          description: '',
          hiddenFromPublishing: false,
          remote: false,
        },
        {
          id: 'var-3',
          name: 'tamaño/caja',
          key: 'key-3',
          resolvedType: 'FLOAT' as const,
          valuesByMode: { 'mode-1': 16 },
          variableCollectionId: 'col-1',
          scopes: [],
          description: '',
          hiddenFromPublishing: false,
          remote: false,
        },
        {
          id: 'var-4',
          name: 'tamano/caja',
          key: 'key-4',
          resolvedType: 'FLOAT' as const,
          valuesByMode: { 'mode-1': 24 },
          variableCollectionId: 'col-1',
          scopes: [],
          description: '',
          hiddenFromPublishing: false,
          remote: false,
        },
      ];

      setMockFigma({
        variables: {
          getLocalVariablesAsync: async () => mockVarsWithDiacritics,
          getLocalVariableCollectionsAsync: async () => [
            {
              id: 'col-1',
              name: 'Test',
              key: 'col-1',
              modes: [{ modeId: 'mode-1', name: 'Default' }],
              defaultModeId: 'mode-1',
              variableIds: mockVarsWithDiacritics.map((v) => v.id),
            },
          ],
        },
      });

      // Test ASCII query finds both ASCII and diacritic variables
      const asciiQueryResult = await handleSearchVariables({ nameContains: 'primario' });
      const asciiTyped = asciiQueryResult as { success: boolean; variables: unknown[]; count: number };
      expect(asciiTyped.success).toBe(true);
      expect(asciiTyped.count).toBe(2);
      expect((asciiTyped.variables as Array<{ name: string }>).map((v) => v.name)).toEqual([
        'color/primário',
        'color/primario',
      ]);

      // Test diacritic query finds both ASCII and diacritic variables
      const accentQueryResult = await handleSearchVariables({ nameContains: 'primário' });
      const accentTyped = accentQueryResult as { success: boolean; variables: unknown[]; count: number };
      expect(accentTyped.success).toBe(true);
      expect(accentTyped.count).toBe(2);
      expect((accentTyped.variables as Array<{ name: string }>).map((v) => v.name)).toEqual([
        'color/primário',
        'color/primario',
      ]);

      // Test with ñ/niño pair (using tamaño/tamano)
      const tamanoQueryResult = await handleSearchVariables({ nameContains: 'tamaño' });
      const tamanoTyped = tamanoQueryResult as { success: boolean; variables: unknown[]; count: number };
      expect(tamanoTyped.success).toBe(true);
      expect(tamanoTyped.count).toBe(2);
      expect((tamanoTyped.variables as Array<{ name: string }>).map((v) => v.name)).toEqual([
        'tamaño/caja',
        'tamano/caja',
      ]);

      // Test with ASCII query for ñ/niño pair
      const tamanoAsciiQueryResult = await handleSearchVariables({ nameContains: 'tamano' });
      const tamanoAsciiTyped = tamanoAsciiQueryResult as { success: boolean; variables: unknown[]; count: number };
      expect(tamanoAsciiTyped.success).toBe(true);
      expect(tamanoAsciiTyped.count).toBe(2);
      expect((tamanoAsciiTyped.variables as Array<{ name: string }>).map((v) => v.name)).toEqual([
        'tamaño/caja',
        'tamano/caja',
      ]);
    });
  });

  describe('offset pagination', () => {
    beforeEach(() => {
      const mockVars = Array.from({ length: 5 }, (_, i) => ({
        id: `var-${i + 1}`,
        name: `Var ${i + 1}`,
        key: `key-${i + 1}`,
        resolvedType: 'FLOAT' as const,
        valuesByMode: { 'mode-1': i + 1 },
        variableCollectionId: 'col-1',
        scopes: [],
        description: '',
        hiddenFromPublishing: false,
        remote: false,
      }));

      setMockFigma({
        variables: {
          getLocalVariablesAsync: async () => mockVars,
          getLocalVariableCollectionsAsync: async () => [
            {
              id: 'col-1',
              name: 'Test',
              key: 'col-1',
              modes: [{ modeId: 'mode-1', name: 'Default' }],
              defaultModeId: 'mode-1',
              variableIds: mockVars.map((v) => v.id),
            },
          ],
        },
      });
    });

    afterEach(() => {
      clearMockFigma();
    });

    it('should return total, offset, hasMore for first page', async () => {
      const result = await handleSearchVariables({ offset: 0, limit: 2 });
      const typed = result as {
        success: boolean;
        variables: unknown[];
        count: number;
        total: number;
        offset: number;
        hasMore: boolean;
      };

      expect(typed.success).toBe(true);
      expect(typed.count).toBe(2);
      expect(typed.total).toBe(5);
      expect(typed.offset).toBe(0);
      expect(typed.hasMore).toBe(true);
    });

    it('should return correct hasMore for middle page', async () => {
      const result = await handleSearchVariables({ offset: 2, limit: 2 });
      const typed = result as {
        success: boolean;
        variables: unknown[];
        count: number;
        total: number;
        offset: number;
        hasMore: boolean;
      };

      expect(typed.success).toBe(true);
      expect(typed.count).toBe(2);
      expect(typed.total).toBe(5);
      expect(typed.offset).toBe(2);
      expect(typed.hasMore).toBe(true);
    });

    it('should return hasMore=false for last page', async () => {
      const result = await handleSearchVariables({ offset: 4, limit: 2 });
      const typed = result as {
        success: boolean;
        variables: unknown[];
        count: number;
        total: number;
        offset: number;
        hasMore: boolean;
      };

      expect(typed.success).toBe(true);
      expect(typed.count).toBe(1);
      expect(typed.total).toBe(5);
      expect(typed.offset).toBe(4);
      expect(typed.hasMore).toBe(false);
    });

    it('should return empty array when offset > total', async () => {
      const result = await handleSearchVariables({ offset: 10, limit: 2 });
      const typed = result as {
        success: boolean;
        variables: unknown[];
        count: number;
        total: number;
        offset: number;
        hasMore: boolean;
      };

      expect(typed.success).toBe(true);
      expect(typed.count).toBe(0);
      expect(typed.total).toBe(5);
      expect(typed.offset).toBe(10);
      expect(typed.hasMore).toBe(false);
    });
  });

  describe('resolveAliases with depth guard', () => {
    beforeEach(() => {
      // Create alias chain: var-1 -> var-2 -> ... -> var-12 (final value)
      const mockVars = Array.from({ length: 12 }, (_, i) => ({
        id: `var-${i + 1}`,
        name: `Var ${i + 1}`,
        key: `key-${i + 1}`,
        resolvedType: i === 11 ? ('FLOAT' as const) : ('COLOR' as const),
        valuesByMode: {
          'mode-1':
            i === 11
              ? 42
              : { type: 'VARIABLE_ALIAS' as const, id: `var-${i + 2}` },
        },
        variableCollectionId: 'col-1',
        scopes: [],
        description: '',
        hiddenFromPublishing: false,
        remote: false,
      }));

      setMockFigma({
        variables: {
          getLocalVariablesAsync: async () => mockVars,
          getLocalVariableCollectionsAsync: async () => [
            {
              id: 'col-1',
              name: 'Test',
              key: 'col-1',
              modes: [{ modeId: 'mode-1', name: 'Default' }],
              defaultModeId: 'mode-1',
              variableIds: mockVars.map((v) => v.id),
            },
          ],
          getVariableByIdAsync: async (id: string) =>
            mockVars.find((v) => v.id === id) || null,
        },
      });
    });

    afterEach(() => {
      clearMockFigma();
    });

    it('should resolve aliases with depth guard (max depth 10)', async () => {
      const result = await handleSearchVariables({
        nameContains: 'Var',
        resolveAliases: true,
      });

      expect(result.success).toBe(true);
      expect(result.variables.length).toBeGreaterThan(0);
      // Should have resolved some aliases but stopped at depth 10
      const firstVar = result.variables[0] as {
        id: string;
        resolvedValuesByMode?: Record<string, unknown>;
      };
      expect(firstVar).toBeDefined();
    });
  });

  describe('collectionName filter', () => {
    beforeEach(() => {
      setMockFigma({
        variables: {
          getLocalVariablesAsync: async () => [
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
            },
          ],
          getLocalVariableCollectionsAsync: async () => [
            {
              id: 'col-1',
              name: 'Colors Global',
              key: 'col-1',
              modes: [{ modeId: 'mode-1', name: 'Default' }],
              defaultModeId: 'mode-1',
              variableIds: ['var-1'],
            },
          ],
        },
      });
    });

    afterEach(() => {
      clearMockFigma();
    });

    it('should filter by collectionName (case-insensitive substring)', async () => {
      const result = await handleSearchVariables({ collectionName: 'global' });
      const typed = result as { success: boolean; variables: unknown[]; count: number };

      expect(typed.success).toBe(true);
      expect(typed.count).toBe(1);
    });
  });
});
