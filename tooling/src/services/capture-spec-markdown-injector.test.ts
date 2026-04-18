/**
 * Capture Spec Markdown Injector Tests
 *
 * Tests for injectSpecZones function.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { injectSpecZones } from './capture-spec-markdown-injector.js';

describe('capture-spec-markdown-injector', () => {
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
        anatomy: [{ id: '1', index: 1, name: 'Container', type: 'FRAME' }],
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
      assert.ok(
        result.includes('Source: <active-system-docs>/docs/_spec/components/alert.yml'),
        'Must include source doc slug',
      );
    });

    it('preserves rich anatomy metadata when rendering injected anatomy zone', () => {
      const spec = {
        anatomy: [
          {
            id: 'node-1',
            index: 1,
            name: 'Container',
            type: 'FRAME',
            width: 320,
            height: 48,
            fill: 'Semantic.Color.Primary',
            stroke: 'Semantic.Color.Border.Default',
            effects: ['Shadow 1'],
            description: 'Main wrapper',
          },
        ],
        properties: [],
        variants: [],
        layout: [],
      };

      const result = injectSpecZones(baseMarkdown, spec, 'alert');

      assert.ok(result.includes('Width 320'), 'Must include anatomy width metadata');
      assert.ok(result.includes('Height 48'), 'Must include anatomy height metadata');
      assert.ok(result.includes('Fill `Semantic.Color.Primary`'), 'Must include anatomy fill metadata');
      assert.ok(result.includes('Stroke `Semantic.Color.Border.Default`'), 'Must include anatomy stroke metadata');
      assert.ok(result.includes('Description Main wrapper'), 'Must include anatomy description metadata');
    });

    it('preserves property notes in narrative notes column', () => {
      const spec = {
        anatomy: [],
        properties: [
          {
            name: 'label',
            type: 'text',
            default: 'Primary',
            required: true,
            description: 'Text label',
            notes: 'Comes from spec notes',
          },
        ],
        variants: [],
        layout: [],
      };

      const result = injectSpecZones(baseMarkdown, spec, 'button');

      assert.ok(result.includes('Comes from spec notes'), 'Must map spec notes into narrative notes column');
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

    it('does not render Unknown row when variant shape is invalid', () => {
      const spec = {
        anatomy: [],
        properties: [],
        variants: [{}],
        layout: [],
      };

      const result = injectSpecZones(baseMarkdown, spec, 'test_component');

      assert.ok(
        !result.includes('Unknown'),
        'Must not emit Unknown placeholder rows for invalid variants',
      );
    });

    it('keeps partially enriched variants in enriched path', () => {
      const spec = {
        anatomy: [],
        properties: [],
        variants: [
          {
            name: 'Default',
            properties: { State: 'Default' },
          },
        ],
        layout: [],
      };

      const result = injectSpecZones(baseMarkdown, spec, 'test_component');

      assert.ok(
        result.includes('#### State=Default'),
        'Must preserve enriched properties as-is for partially enriched variants',
      );
      assert.ok(
        !result.includes('#### Variant=Default'),
        'Must not coerce partially enriched variants into manual format',
      );
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
