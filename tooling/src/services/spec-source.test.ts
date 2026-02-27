/**
 * Spec Source Tests
 *
 * Tests for resolveFigmaSource and parseFigmaUrl.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveFigmaSource, parseFigmaUrl } from './spec-source.js';

describe('spec-source', () => {
  describe('parseFigmaUrl()', () => {
    it('should extract node-id from URL parameter', () => {
      const result = parseFigmaUrl('https://www.figma.com/file/abc123/Test?node-id=123:456');
      
      assert.equal(result.fileKey, 'abc123');
      assert.equal(result.nodeId, '123:456');
    });

    it('should return empty nodeId when URL has no node-id parameter', () => {
      const result = parseFigmaUrl('https://www.figma.com/file/abc123/Test');
      
      assert.equal(result.fileKey, 'abc123');
      assert.equal(result.nodeId, '');
    });

    it('should handle node_id (underscore) variant', () => {
      const result = parseFigmaUrl('https://www.figma.com/file/abc123/Test?node_id=789:012');
      
      assert.equal(result.fileKey, 'abc123');
      assert.equal(result.nodeId, '789:012');
    });

    it('should handle nodeId (camelCase) variant', () => {
      const result = parseFigmaUrl('https://www.figma.com/file/abc123/Test?nodeId=345:678');
      
      assert.equal(result.fileKey, 'abc123');
      assert.equal(result.nodeId, '345:678');
    });
  });

  describe('resolveFigmaSource()', () => {
    it('should return explicit nodeId without validation', () => {
      const result = resolveFigmaSource({
        nodeId: '123:456',
        figmaUrl: undefined,
        rawComponentName: undefined,
      });
      
      assert.equal(result.nodeId, '123:456');
      assert.equal(result.fileKeyFromUrl, '');
    });

    it('should extract nodeId from URL', () => {
      const result = resolveFigmaSource({
        figmaUrl: 'https://www.figma.com/file/abc123/Test?node-id=123:456',
        nodeId: undefined,
        rawComponentName: undefined,
      });
      
      assert.equal(result.nodeId, '123:456');
      assert.equal(result.fileKeyFromUrl, 'abc123');
    });

    it('should throw error when URL has no node-id and no explicit nodeId', () => {
      assert.throws(
        () => resolveFigmaSource({
          figmaUrl: 'https://www.figma.com/file/abc123/Test',
          nodeId: undefined,
          rawComponentName: undefined,
        }),
        {
          message: /No node-id found in Figma URL/,
        },
        'Should throw error when nodeId is missing from URL'
      );
    });

    it('should throw error when no source is provided', () => {
      assert.throws(
        () => resolveFigmaSource({
          figmaUrl: undefined,
          nodeId: undefined,
          rawComponentName: undefined,
        }),
        {
          message: /Missing Figma source/,
        },
        'Should throw error when no source is provided'
      );
    });

    it('should throw error when only figmaUrl without nodeId or rawComponentName', () => {
      assert.throws(
        () => resolveFigmaSource({
          figmaUrl: 'https://www.figma.com/file/abc123/Test',
          nodeId: undefined,
          rawComponentName: undefined,
        }),
        {
          message: /No node-id found in Figma URL/,
        },
        'Should throw error when URL has no nodeId and no componentName'
      );
    });

    it('should accept rawComponentName as fallback', () => {
      const result = resolveFigmaSource({
        figmaUrl: undefined,
        nodeId: undefined,
        rawComponentName: 'Test Component',
      });
      
      // Should not throw, but nodeId will be empty (to be resolved by name later)
      assert.equal(result.nodeId, '');
      assert.equal(result.fileKeyFromUrl, '');
    });

    it('should accept rawComponentName with figmaUrl (nodeId will be resolved later)', () => {
      const result = resolveFigmaSource({
        figmaUrl: 'https://www.figma.com/file/abc123/Test',
        nodeId: undefined,
        rawComponentName: 'Test Component',
      });
      
      // Should not throw - componentName is valid source even with URL
      assert.equal(result.nodeId, '');
      assert.equal(result.fileKeyFromUrl, 'abc123');
    });

    it('should preserve nodeId from URL when rawComponentName is also provided', () => {
      const result = resolveFigmaSource({
        figmaUrl: 'https://www.figma.com/file/abc123/Test?node-id=123:456',
        nodeId: undefined,
        rawComponentName: 'Test Component',
      });
      
      // Should use nodeId from URL when available
      assert.equal(result.nodeId, '123:456');
      assert.equal(result.fileKeyFromUrl, 'abc123');
    });
  });
});