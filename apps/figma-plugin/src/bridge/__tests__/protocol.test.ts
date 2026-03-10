/**
 * Protocol Tests
 *
 * Tests for WebSocket bridge protocol types, guards, and utilities.
 */

import { describe, it, expect } from 'vitest';
import {
  createBridgeError,
  ERROR_CODES,
  isWSRequest,
  isWSResponseSuccess,
  isWSResponseError,
  isBridgeMethod,
  BRIDGE_METHODS,
  type WSRequest,
  type WSResponseSuccess,
  type WSResponseError,
} from '../protocol';

describe('Protocol', () => {
  describe('createBridgeError', () => {
    it('should create a BridgeError with code and message', () => {
      const error = createBridgeError(ERROR_CODES.TIMEOUT, 'Request timed out');
      expect(error.code).toBe(ERROR_CODES.TIMEOUT);
      expect(error.message).toBe('Request timed out');
    });

    it('should work with any error code', () => {
      const error = createBridgeError(
        ERROR_CODES.FIGMA_API_ERROR,
        'Figma API failed'
      );
      expect(error.code).toBe(ERROR_CODES.FIGMA_API_ERROR);
      expect(error.message).toBe('Figma API failed');
    });
  });

  describe('isWSRequest', () => {
    it('should return true for valid WSRequest', () => {
      const request: WSRequest = {
        id: 'test_123',
        method: BRIDGE_METHODS.GET_FILE_INFO,
        params: {},
      };
      expect(isWSRequest(request)).toBe(true);
    });

    it('should return false for non-object', () => {
      expect(isWSRequest(null)).toBe(false);
      expect(isWSRequest('string')).toBe(false);
      expect(isWSRequest(123)).toBe(false);
    });

    it('should return false if missing required fields', () => {
      expect(isWSRequest({ id: 'test' })).toBe(false);
      expect(isWSRequest({ method: 'GET_FILE_INFO' })).toBe(false);
      expect(isWSRequest({ params: {} })).toBe(false);
    });

    it('should return false for unsupported method', () => {
      const request = {
        id: 'test_123',
        method: 'UNSUPPORTED_METHOD',
        params: {},
      };
      expect(isWSRequest(request)).toBe(false);
    });
  });

  describe('isWSResponseSuccess', () => {
    it('should return true for success response', () => {
      const response: WSResponseSuccess = {
        id: 'test_123',
        result: { success: true },
      };
      expect(isWSResponseSuccess(response)).toBe(true);
    });

    it('should return false if has error field', () => {
      const response = {
        id: 'test_123',
        result: { success: true },
        error: { code: 'ERROR', message: 'Failed' },
      };
      expect(isWSResponseSuccess(response)).toBe(false);
    });

    it('should return false for non-object', () => {
      expect(isWSResponseSuccess(null)).toBe(false);
      expect(isWSResponseSuccess('string')).toBe(false);
    });
  });

  describe('isWSResponseError', () => {
    it('should return true for error response', () => {
      const response: WSResponseError = {
        id: 'test_123',
        error: { code: ERROR_CODES.TIMEOUT, message: 'Timed out' },
      };
      expect(isWSResponseError(response)).toBe(true);
    });

    it('should return false if error is not a BridgeError', () => {
      const response = {
        id: 'test_123',
        error: 'Just a string',
      };
      expect(isWSResponseError(response)).toBe(false);
    });

    it('should return false for non-object', () => {
      expect(isWSResponseError(null)).toBe(false);
      expect(isWSResponseError('string')).toBe(false);
    });
  });

  describe('isBridgeMethod', () => {
    it('should return true for valid bridge methods', () => {
      expect(isBridgeMethod(BRIDGE_METHODS.GET_FILE_INFO)).toBe(true);
      expect(isBridgeMethod(BRIDGE_METHODS.EXECUTE_CODE)).toBe(true);
      expect(isBridgeMethod(BRIDGE_METHODS.GET_VARIABLES_DATA)).toBe(true);
      expect(isBridgeMethod(BRIDGE_METHODS.CREATE_VARIABLE)).toBe(true);
      expect(isBridgeMethod(BRIDGE_METHODS.DELETE_VARIABLE)).toBe(true);
      expect(isBridgeMethod(BRIDGE_METHODS.RELOAD_UI)).toBe(true);
      expect(isBridgeMethod(BRIDGE_METHODS.CLEAR_CONSOLE)).toBe(true);
      expect(isBridgeMethod(BRIDGE_METHODS.RESIZE_NODE)).toBe(true);
      expect(isBridgeMethod(BRIDGE_METHODS.MOVE_NODE)).toBe(true);
      expect(isBridgeMethod(BRIDGE_METHODS.SET_NODE_FILLS)).toBe(true);
      expect(isBridgeMethod(BRIDGE_METHODS.CAPTURE_SCREENSHOT)).toBe(true);
    });

    it('should return false for invalid methods', () => {
      expect(isBridgeMethod('INVALID_METHOD')).toBe(false);
      expect(isBridgeMethod('')).toBe(false);
      expect(isBridgeMethod(123 as unknown as string)).toBe(false);
    });
  });
});
