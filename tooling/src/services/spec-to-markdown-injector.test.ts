/**
 * Spec to Markdown Injector Tests
 *
 * Tests for injectSpecZones and variant adaptation.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { injectSpecZones } from './spec-to-markdown-injector.js';

describe('spec-to-markdown-injector', () => {
  describe('injectSpecZones()', () => {
    const baseMarkdown = `<!-- AUTO-GENERATED-ANATOMY:START -->
<!-- AUTO-GENERATED-ANATOMY:END -->

<!-- AUTO-GENERATED-PROPERTIES:START -->
<!-- AUTO-GENERATED-PROPERTIES:END -->

<!-- AUTO-GENERATED-VISUALS:START -->
<!-- AUTO-GENERATED-VISUALS:END -->

<!-- AUTO-GENERATED-VARIANTS:START -->
<!-- AUTO-GENERATED-VARIANTS:END -->
`;

    it('should preserve manual variant data (token, fallback, notes) in rendered output', () => {
      const spec = {
        name: 'Test Component',
        anatomy: [],
        properties: [],
        variants: [
          {
            name: 'Default',
            value: 'default',
            token: 'Semantic.Color.Primary',
            fallback: '#007AFF',
            notes: 'Primary action color',
          },
        ],
        layout: [],
      };

      const result = injectSpecZones(baseMarkdown, spec, 'test_component');

      // Verify manual data is preserved (not TBD)
      assert.ok(
        result.includes('Semantic.Color.Primary'),
        'Should include manual token value'
      );
      assert.ok(
        result.includes('#007AFF'),
        'Should include manual fallback value'
      );
      assert.ok(
        result.includes('Primary action color'),
        'Should include manual notes'
      );
      // Verify TBD is NOT present for manual variants
      assert.ok(
        !result.includes('| `Default` | `TBD` | `TBD`'),
        'Should NOT have TBD for manual variants with data'
      );
    });

    it('should use TBD for variants without manual data', () => {
      const spec = {
        name: 'Test Component',
        anatomy: [],
        properties: [],
        variants: [
          {
            name: 'Empty',
            // No token, fallback, or notes
          },
        ],
        layout: [],
      };

      const result = injectSpecZones(baseMarkdown, spec, 'test_component');

      // Empty variants should have TBD
      assert.ok(
        result.includes('`TBD`'),
        'Should include TBD for variants without manual data'
      );
    });
  });
});