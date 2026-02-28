/**
 * Spec to Markdown Injector Tests
 *
 * Tests for injectSpecZones function.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

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

    it('happy path with full boundaries', () => {
      const markdown = `
# Alert Component

Introductory prose.

## Anatomy
<!-- AUTO-GENERATED-ANATOMY:START -->
Old anatomy here.
<!-- AUTO-GENERATED-ANATOMY:END -->

## Properties
<!-- AUTO-GENERATED-PROPERTIES:START -->
Old props.
<!-- AUTO-GENERATED-PROPERTIES:END -->

## Visuals
<!-- AUTO-GENERATED-VISUALS:START -->
Old visuals.
<!-- AUTO-GENERATED-VISUALS:END -->

## Variants
<!-- AUTO-GENERATED-VARIANTS:START -->
Old variants.
<!-- AUTO-GENERATED-VARIANTS:END -->

Trailing prose.
`;

      const spec = {
        anatomy: [{ index: 1, name: 'Container', type: 'FRAME' }],
        properties: [{ name: 'state', type: 'variant', default: 'info', required: true }],
        variants: [],
        layout: [{ node: 'Container', direction: 'Horizontal', hSizing: 'Fill', vSizing: 'Hug', alignment: 'Top left', itemSpacing: 8 }],
      };

      const result = injectSpecZones(markdown, spec, 'alert');

      assert.ok(result.includes('Introductory prose.'), 'Must preserve leading prose');
      assert.ok(result.includes('Trailing prose.'), 'Must preserve trailing prose');
      assert.ok(!result.includes('Old anatomy here.'), 'Must overwrite old anatomy');
      assert.ok(!result.includes('Old props.'), 'Must overwrite old properties');

      assert.ok(result.includes('1. **Container**'), 'Must inject new anatomy');
      assert.ok(result.includes('⚠️ AUTO-GENERATED: DO NOT EDIT'), 'Must include generation header');
      assert.ok(result.includes('Source: docs/_spec/components/alert.yml'), 'Must include source doc slug');
    });

    it('preserves manual variant data in rendered output', () => {
      const spec = {
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

      assert.ok(result.includes('Semantic.Color.Primary'), 'Must preserve manual token value');
      assert.ok(result.includes('#007AFF'), 'Must preserve manual fallback value');
      assert.ok(result.includes('Primary action color'), 'Must preserve manual notes');
      assert.ok(
        !result.includes('| `Default` | `TBD` | `TBD`'),
        'Must not downgrade manual variant data to TBD placeholders',
      );
    });

    it('uses TBD for variants without manual data', () => {
      const spec = {
        anatomy: [],
        properties: [],
        variants: [{ name: 'Empty' }],
        layout: [],
      };

      const result = injectSpecZones(baseMarkdown, spec, 'test_component');

      assert.ok(result.includes('`TBD`'), 'Must render TBD when a manual variant lacks data');
    });

    it('appends new zones if tags are completely missing', () => {
      const markdown = `# Simple Component\n\nNo tags here.`;
      const spec = { anatomy: [], properties: [], variants: [], layout: [] };

      const result = injectSpecZones(markdown, spec, 'simple');

      assert.ok(result.includes('No tags here.'), 'Must preserve prose');
      assert.ok(result.includes('<!-- AUTO-GENERATED-ANATOMY:START -->'), 'Must append missing start tag');
      assert.ok(result.includes('<!-- AUTO-GENERATED-ANATOMY:END -->'), 'Must append missing end tag');
    });

    it('throws on corrupted boundaries', () => {
      const markdown = `
# Alert Component
<!-- AUTO-GENERATED-ANATOMY:START -->
Missing the end tag...
`;
      const spec = { anatomy: [], properties: [], variants: [], layout: [] };

      assert.throws(
        () => injectSpecZones(markdown, spec, 'alert'),
        /Corrupted boundaries for ANATOMY: Missing END tag/,
      );
    });

    it('throws on multiple identical tags', () => {
      const markdown = `
# Alert Component
<!-- AUTO-GENERATED-ANATOMY:START -->
<!-- AUTO-GENERATED-ANATOMY:START -->
<!-- AUTO-GENERATED-ANATOMY:END -->
`;
      const spec = { anatomy: [], properties: [], variants: [], layout: [] };

      assert.throws(
        () => injectSpecZones(markdown, spec, 'alert'),
        /Ambiguity for ANATOMY: Multiple identical tags found/,
      );
    });

    it('throws on invalid input', () => {
      // @ts-expect-error - testing invalid input
      assert.throws(() => injectSpecZones(null, {}, 'alert'), /Markdown content must be a string/);
      // @ts-expect-error - testing invalid input
      assert.throws(() => injectSpecZones('', null, 'alert'), /YAML spec must be a valid object/);
    });
  });
});
