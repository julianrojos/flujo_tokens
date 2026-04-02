/**
 * Tests for merge-spec-structured-data utility
 * 
 * Validates DB-first precedence for structured Figma data
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ComponentRegistryItem } from '@/types/component-registry';
import type { PartialComponentSpec } from 'ds-types';
import { mergeSpecWithStructuredData } from '../merge-spec-structured-data';

function createMockRegistryItem(overrides?: Partial<ComponentRegistryItem>): ComponentRegistryItem {
  return {
    slug: 'button',
    display_name: 'Button',
    paths: { spec: 'specs/button.yml', doc: 'docs/button.md', visual_proof: null },
    spec: { exists: true, status: 'draft' },
    doc: { exists: false, status: 'draft' },
    figma: {
      file_url: 'https://figma.com/file/123',
      component_set_node_id: '1:1',
      ...overrides?.figma,
    },
    visual_proof: { exists: false, screenshot_url: null },
    pipeline_stage: 'spec',
    ready_for_publish: false,
    fingerprint_sha256: 'abc123',
    ...overrides,
  };
}

function createMockSpec(overrides?: Partial<PartialComponentSpec>): PartialComponentSpec {
  return {
    summary: {
      purpose: 'YAML summary',
      when_to_use: 'YAML when to use',
      when_not_to_use: 'YAML when not to use',
    },
    best_practices: { do: ['YAML best practice'], dont: [] },
    ...overrides,
  } as PartialComponentSpec;
}

describe('mergeSpecWithStructuredData', () => {
  it('returns base spec when no registry item', () => {
    const yamlSpec = createMockSpec({
      summary: {
        purpose: 'YAML only',
        when_to_use: 'Use',
        when_not_to_use: 'Avoid',
      },
    });
    const result = mergeSpecWithStructuredData(yamlSpec, null);

    assert.equal(result.summary?.purpose, 'YAML only');
    assert.equal(result.layout, undefined);
    assert.equal(result.figma_metadata, undefined);
  });

  it('returns empty spec when both inputs are null', () => {
    const result = mergeSpecWithStructuredData(null, null);
    assert.deepEqual(result, {});
  });

  it('DB layout overrides YAML layout (DB-first)', () => {
    const yamlSpec = createMockSpec({
      layout: [
        {
          node: 'Container',
          direction: 'Vertical',
          hSizing: 'Fill',
          vSizing: 'Hug',
          alignment: 'Center',
          itemSpacing: 4,
        },
      ],
    });
    const registryItem = createMockRegistryItem({
      figma: {
        file_url: 'https://figma.com/file/123',
        component_set_node_id: '1:1',
        layout: [
          {
            node_name: 'Container',
            direction: 'horizontal',
            h_sizing: 'fill',
            v_sizing: 'hug',
            alignment_h: 'center',
            alignment_v: 'center',
            item_spacing: 8,
            padding: { top: 4, right: 8, bottom: 4, left: 8 },
          },
        ],
      },
    });

    const result = mergeSpecWithStructuredData(yamlSpec, registryItem);

    assert.equal(result.layout?.[0]?.direction, 'Horizontal'); // DB wins
    assert.equal(result.layout?.[0]?.itemSpacing, 8); // DB wins
    assert.equal(result.layout?.[0]?.alignment, 'center / center');
  });

  it('DB variants override YAML variants (DB-first)', () => {
    const yamlSpec = createMockSpec({
      variant_visuals: [{ name: 'YAML variant', properties: { state: 'yaml' } }],
    });
    const registryItem = createMockRegistryItem({
      figma: {
        file_url: 'https://figma.com/file/123',
        component_set_node_id: '1:1',
        variants: [{ name: 'DB variant', properties: { state: 'db' }, node_id: '2:2' }],
      },
    });

    const result = mergeSpecWithStructuredData(yamlSpec, registryItem);

    assert.equal(result.variant_visuals?.[0]?.name, 'DB variant'); // DB wins
    assert.deepEqual(result.variant_visuals?.[0]?.properties, { state: 'db' }); // DB wins
  });

  it('always uses DB for figma_metadata', () => {
    const yamlSpec = createMockSpec();
    const registryItem = createMockRegistryItem({
      figma: {
        file_url: 'https://figma.com/file/456',
        component_set_node_id: '2:2',
        page_name: 'Components',
      },
    });

    const result = mergeSpecWithStructuredData(yamlSpec, registryItem);

    assert.equal(result.figma_metadata?.page_name, 'Components');
    assert.equal(result.figma_metadata?.component_set_node_id, '2:2');
    assert.equal(result.figma_metadata?.file_url, 'https://figma.com/file/456');
  });

  it('preserves YAML editorial fields', () => {
    const yamlSpec = createMockSpec({
      summary: {
        purpose: 'Editorial summary',
        when_to_use: 'Use editorially',
        when_not_to_use: 'Avoid editorially',
      },
      best_practices: { do: ['YAML practice 1', 'YAML practice 2'], dont: [] },
    });
    const registryItem = createMockRegistryItem({
      figma: {
        file_url: 'https://figma.com/file/123',
        component_set_node_id: '1:1',
        layout: [{ node_name: 'Container', direction: 'horizontal' }],
      },
    });

    const result = mergeSpecWithStructuredData(yamlSpec, registryItem);

    assert.equal(result.summary?.purpose, 'Editorial summary'); // YAML preserved
    assert.deepEqual(result.best_practices?.do, ['YAML practice 1', 'YAML practice 2']); // YAML preserved
    assert.equal(result.layout?.[0]?.direction, 'Horizontal'); // DB added
  });

  it('includes token_bindings when available', () => {
    const yamlSpec = createMockSpec();
    const registryItem = createMockRegistryItem({
      figma: {
        file_url: 'https://figma.com/file/123',
        component_set_node_id: '1:1',
        token_bindings: [
          {
            node_id: '10:2',
            node_name: 'Button',
            field: 'fills',
            variable_id: 'var-123',
            token_path: 'color.blue.500',
            mode: 'Default',
          },
        ],
      },
    });

    const result = mergeSpecWithStructuredData(yamlSpec, registryItem);

    assert.ok(result.figma_token_bindings);
    assert.deepEqual(result.figma_token_bindings?.[0], {
      node_id: '10:2',
      node_name: 'Button',
      field: 'fills',
      variable_id: 'var-123',
      token_path: 'color.blue.500',
      mode: 'Default',
    });
  });

  it('handles missing structured data gracefully', () => {
    const yamlSpec = createMockSpec({
      summary: {
        purpose: 'Only YAML',
        when_to_use: 'Use YAML',
        when_not_to_use: 'Avoid YAML',
      },
    });
    const registryItem = createMockRegistryItem({
      figma: {
        file_url: 'https://figma.com/file/123',
        component_set_node_id: '1:1',
        // No layout, variants, or token_bindings
      },
    });

    const result = mergeSpecWithStructuredData(yamlSpec, registryItem);

    assert.equal(result.summary?.purpose, 'Only YAML');
    assert.equal(result.layout, undefined);
    assert.equal(result.variant_visuals, undefined);
    assert.ok(result.figma_metadata); // Always present from DB
    assert.equal(result.figma_metadata?.file_url, 'https://figma.com/file/123');
  });

  it('DB empty arrays clear YAML structured fields', () => {
    const yamlSpec = createMockSpec({
      layout: [
        {
          node: 'Legacy',
          direction: 'Horizontal',
          hSizing: 'Fill',
          vSizing: 'Hug',
          alignment: 'Center',
          itemSpacing: 8,
        },
      ],
      variant_visuals: [{ name: 'Legacy', properties: { state: 'legacy' } }],
    });
    const registryItem = createMockRegistryItem({
      figma: {
        file_url: 'https://figma.com/file/123',
        component_set_node_id: '1:1',
        layout: [],
        variants: [],
        token_bindings: [],
      },
    });

    const result = mergeSpecWithStructuredData(yamlSpec, registryItem);

    assert.deepEqual(result.layout, []);
    assert.deepEqual(result.variant_visuals, []);
    assert.deepEqual(result.figma_token_bindings, []);
  });
});
