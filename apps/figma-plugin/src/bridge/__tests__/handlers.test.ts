/**
 * Handler Tests
 *
 * Tests for bridge method handlers.
 * Note: These tests mock the Figma API.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { handleGetFileInfo } from '../handlers/get-file-info';
import { handleClearConsole } from '../handlers/control';
import { handleGetVariablesData, handleSearchVariables } from '../handlers/variables';

function setMockFigma(figma: unknown): void {
  (globalThis as unknown as { figma?: unknown }).figma = figma;
}

function clearMockFigma(): void {
  delete (globalThis as unknown as { figma?: unknown }).figma;
}

// Mock Figma API
const mockFigma = {
  root: { name: 'Test Design System' },
  fileKey: 'test-file-key-123',
  currentPage: {
    name: 'Page 1',
    id: 'page-1-id',
    selection: [],
  },
  variables: {
    getLocalVariablesAsync: async () => [],
    getLocalVariableCollectionsAsync: async () => [],
  },
};

describe('Handlers', () => {
  describe('handleGetFileInfo', () => {
    beforeEach(() => {
      setMockFigma(mockFigma);
    });

    afterEach(() => {
      clearMockFigma();
    });

    it('should return file info', async () => {
      const result = await handleGetFileInfo({});

      expect(result.fileName).toBe('Test Design System');
      expect(result.fileKey).toBe('test-file-key-123');
      expect(result.currentPage).toBe('Page 1');
      expect(result.currentPageId).toBe('page-1-id');
      expect(result.selectionCount).toBe(0);
    });

    it('should handle null fileKey', async () => {
      setMockFigma({ ...mockFigma, fileKey: null });

      const result = await handleGetFileInfo({});

      expect(result.fileKey).toBe(null);
    });
  });

  describe('handleClearConsole', () => {
    it('should return cleared: true', async () => {
      const result = await handleClearConsole({});
      expect(result.cleared).toBe(true);
    });
  });

  describe('handleGetVariablesData', () => {
    beforeEach(() => {
      setMockFigma(mockFigma);
    });

    afterEach(() => {
      clearMockFigma();
    });

    it('should return empty variables when none exist', async () => {
      const result = await handleGetVariablesData({});

      expect(result.success).toBe(true);
      expect(result.fileKey).toBe('test-file-key-123');
      expect(result.variables).toEqual([]);
      expect(result.variableCollections).toEqual([]);
    });
  });

  describe('handleSearchVariables', () => {
    beforeEach(() => {
      setMockFigma({
        ...mockFigma,
        variables: {
          getLocalVariablesAsync: async () => [
            {
              id: 'var-1',
              name: 'blue/100',
              key: 'key-1',
              resolvedType: 'COLOR',
              valuesByMode: { 'mode-1': { r: 0.1, g: 0.2, b: 1, a: 1 } },
              variableCollectionId: 'col-1',
              scopes: ['ALL_SCOPES'],
              description: 'Blue 100',
              hiddenFromPublishing: false,
            },
            {
              id: 'var-2',
              name: 'blue/200',
              key: 'key-2',
              resolvedType: 'COLOR',
              valuesByMode: { 'mode-1': { r: 0.2, g: 0.3, b: 1, a: 1 } },
              variableCollectionId: 'col-1',
              scopes: ['ALL_SCOPES'],
              description: 'Blue 200',
              hiddenFromPublishing: false,
            },
            {
              id: 'var-3',
              name: 'red/100',
              key: 'key-3',
              resolvedType: 'COLOR',
              valuesByMode: { 'mode-1': { r: 1, g: 0.2, b: 0.2, a: 1 } },
              variableCollectionId: 'col-2',
              scopes: ['ALL_SCOPES'],
              description: 'Red 100',
              hiddenFromPublishing: false,
            },
          ],
        },
      });
    });

    afterEach(() => {
      clearMockFigma();
    });

    it('should filter by namePattern regex', async () => {
      const result = await handleSearchVariables({ namePattern: 'blue' });
      const typed = result as { success: boolean; variables: unknown[]; count: number };

      expect(typed.success).toBe(true);
      expect(typed.count).toBe(2);
      expect(typed.variables.every((v) => (v as { name: string }).name.toLowerCase().includes('blue'))).toBe(true);
    });

    it('should filter by resolvedType', async () => {
      const result = await handleSearchVariables({ resolvedType: 'COLOR' });
      const typed = result as { success: boolean; variables: unknown[]; count: number };

      expect(typed.success).toBe(true);
      expect(typed.count).toBe(3);
    });

    it('should apply limit', async () => {
      const result = await handleSearchVariables({ limit: 1 });
      const typed = result as { success: boolean; variables: unknown[]; count: number };

      expect(typed.success).toBe(true);
      expect(typed.count).toBe(1);
    });

    it('should return compact format', async () => {
      const result = await handleSearchVariables({ compact: true });
      const typed = result as { success: boolean; variables: unknown[]; count: number };

      expect(typed.success).toBe(true);
      expect(typed.variables[0]).toHaveProperty('id');
      expect(typed.variables[0]).toHaveProperty('name');
      expect(typed.variables[0]).toHaveProperty('resolvedType');
      expect(typed.variables[0]).not.toHaveProperty('valuesByMode');
    });
  });
});
