/**
 * Dispatcher Tests
 *
 * Tests for bridge request dispatcher.
 */

import { describe, it, expect } from 'vitest';
import { dispatchRequest, getSupportedMethods } from '../dispatcher';
import { ERROR_CODES, BRIDGE_METHODS } from '../protocol';

function setMockFigma(figma: unknown): void {
  (globalThis as unknown as { figma?: unknown }).figma = figma;
}

function clearMockFigma(): void {
  delete (globalThis as unknown as { figma?: unknown }).figma;
}

describe('Dispatcher', () => {
  describe('dispatchRequest', () => {
    it('should return UNKNOWN_METHOD for unsupported methods', async () => {
      const response = await dispatchRequest({
        id: 'test_123',
        method: 'UNKNOWN_METHOD' as unknown as import('../protocol').BridgeMethod,
        params: {},
      });

      expect('error' in response).toBe(true);
      if ('error' in response) {
        expect(response.error.code).toBe(ERROR_CODES.UNKNOWN_METHOD);
        expect(response.error.message).toContain('Unknown method: UNKNOWN_METHOD');
      }
    });

    it('should handle GET_FILE_INFO method', async () => {
      setMockFigma({
        root: { name: 'Test File' },
        fileKey: 'test-key',
        currentPage: {
          name: 'Page 1',
          id: 'page-1',
          selection: [],
        },
      });

      const response = await dispatchRequest({
        id: 'test_123',
        method: BRIDGE_METHODS.GET_FILE_INFO,
        params: {},
      });

      expect('result' in response).toBe(true);
      if ('result' in response) {
        expect(response.result).toEqual({
          fileName: 'Test File',
          fileKey: 'test-key',
          currentPage: 'Page 1',
          currentPageId: 'page-1',
          selectionCount: 0,
        });
      }

      clearMockFigma();
    });

    it('should route GET_LOCAL_COMPONENTS to component handlers', async () => {
      const page = { id: '1:1', type: 'PAGE', name: 'Page 1', children: [] };

      setMockFigma({
        root: { name: 'Test File', children: [page] },
        fileKey: 'test-key',
        loadAllPagesAsync: async () => undefined,
      });

      const response = await dispatchRequest({
        id: 'test_components_1',
        method: BRIDGE_METHODS.GET_LOCAL_COMPONENTS,
        params: {},
      });

      expect('result' in response).toBe(true);
      if ('result' in response) {
        const result = response.result as {
          success: boolean;
          data: { totalComponents: number; totalComponentSets: number };
        };
        expect(result.success).toBe(true);
        expect(result.data.totalComponents).toBe(0);
        expect(result.data.totalComponentSets).toBe(0);
      }

      clearMockFigma();
    });

    it('should route SET_INSTANCE_PROPERTIES and return typed handler errors', async () => {
      setMockFigma({
        getNodeByIdAsync: async () => ({ id: 'node-1', type: 'FRAME' }),
      });

      const response = await dispatchRequest({
        id: 'test_components_2',
        method: BRIDGE_METHODS.SET_INSTANCE_PROPERTIES,
        params: {
          nodeId: 'node-1',
          properties: {},
        },
      });

      expect('error' in response).toBe(true);
      if ('error' in response) {
        expect(response.error.code).toBe(ERROR_CODES.FIGMA_API_ERROR);
      }

      clearMockFigma();
    });

    it('should only report methods that are dispatchable (no UNKNOWN_METHOD)', async () => {
      clearMockFigma();
      const supportedMethods = getSupportedMethods();

      expect(supportedMethods.length).toBeGreaterThan(0);
      expect(supportedMethods).toContain(BRIDGE_METHODS.GET_BRIDGE_CAPABILITIES);

      for (const method of supportedMethods) {
        const response = await dispatchRequest({
          id: `dispatchable_${method}`,
          method,
          params: {},
        });

        if ('error' in response) {
          expect(response.error.code).not.toBe(ERROR_CODES.UNKNOWN_METHOD);
        }
      }
    });
  });
});
