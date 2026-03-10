/**
 * Handler Tests
 *
 * Tests for bridge method handlers.
 * Note: These tests mock the Figma API.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { handleGetFileInfo } from '../handlers/get-file-info';
import { handleClearConsole } from '../handlers/control';
import { handleGetVariablesData } from '../handlers/variables';

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
});
