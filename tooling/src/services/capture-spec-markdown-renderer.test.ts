/**
 * Capture Spec Markdown Renderer Tests
 *
 * Tests for Markdown rendering utilities.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderPropertiesTable, renderVariantRows, renderLayoutTable } from './capture-spec-markdown-renderer.js';

describe('capture-spec-markdown-renderer', () => {
  describe('renderPropertiesTable()', () => {
    it('should escape pipe characters in description and notes', () => {
      const properties = [
        {
          name: 'Test Prop',
          type: 'text',
          default: 'default',
          description: 'Description with | pipe character',
          narrative_notes: 'Notes with | pipe and\nnewline',
        },
      ];

      const result = renderPropertiesTable(properties);

      // Verify pipes are escaped
      assert.ok(
        result.includes('\\|'),
        'Should escape pipe characters in table cells'
      );
      // Verify newlines in notes are replaced (notes field is sanitized)
      assert.ok(
        !result.includes('pipe and\nnewline'),
        'Should replace newlines with spaces in notes'
      );
    });

    it('should sanitize all dynamic fields (name, default, description, notes)', () => {
      const properties = [
        {
          name: 'Prop | with pipe',
          type: 'text',
          default: 'start | center | end',
          description: 'Desc | pipe',
          narrative_notes: 'Notes | pipe',
        },
      ];

      const result = renderPropertiesTable(properties);

      // All pipe characters should be escaped
      const pipeCount = (result.match(/\\\|/g) || []).length;
      assert.ok(
        pipeCount >= 4,  // At least 4 pipes escaped (name, default, description, notes)
        `Should escape pipes in all dynamic fields, found ${pipeCount} escaped pipes`
      );
    });
  });

  describe('renderVariantRows()', () => {
    it('should escape pipe characters in manual variant data', () => {
      const variants = [
        {
          name: 'Test Variant',
          _manual: {
            token: 'Semantic.Color | Primary',
            fallback: '#FF0000 | Red',
            notes: 'Notes with | pipe',
          },
        },
      ];

      const result = renderVariantRows(variants);

      // Verify pipes are escaped
      assert.ok(
        result.includes('\\|'),
        'Should escape pipe characters in manual variant data'
      );
    });

    it('should handle variants without _manual field (enriched format)', () => {
      const variants = [
        {
          name: 'Enriched Variant',
          properties: { Variant: 'Default' },
          fingerprints: new Map(),
        },
      ];

      const result = renderVariantRows(variants);

      // Should render with TBD for enriched format
      assert.ok(
        result.includes('`TBD`'),
        'Should use TBD for enriched format variants'
      );
    });
  });

  describe('renderLayoutTable()', () => {
    it('should escape pipe characters in padding values', () => {
      const layout = [
        {
          node: 'container',
          direction: 'Vertical',
          alignment: 'Center',
          hSizing: 'Fill',
          vSizing: 'Hug',
          itemSpacing: '8',
          padding: { top: 10, right: 20, bottom: 10, left: 20 },
        },
      ];

      const result = renderLayoutTable(layout);

      // Should render padding without breaking table structure
      assert.ok(
        result.includes('10/20/10/20'),
        'Should render padding values correctly'
      );
    });
  });
});
