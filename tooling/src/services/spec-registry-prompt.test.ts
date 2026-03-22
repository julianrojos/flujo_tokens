/**
 * Spec Registry Prompt Tests
 *
 * Tests for spec registry prompt utilities.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildSpecPromptWithRegistry } from './spec-registry-prompt.js';

describe('spec-registry-prompt', () => {
  describe('buildSpecPromptWithRegistry()', () => {
    it('includes deterministic source context', () => {
      const prompt = buildSpecPromptWithRegistry({
        figmaUrl: 'https://www.figma.com/design/FILE123/Components?node-id=123-456',
        nodeId: '123:456',
        componentName: 'Alert',
        componentSlug: 'alert',
        outputPath: '/tmp/alert.yml',
        templatePath: '/tmp/_template.yml',
        registryPath: '/tmp/registry.json',
        fileKeyFromUrl: 'FILE123',
        registryIndex: {
          token_a: {
            path: 'components.alert.icon.color',
            slashPath: 'components/alert/icon/color',
            collection: 'components',
            type: 'color',
            resolvedValue: '#FF0000',
          },
        },
      });

      assert.match(prompt, /Context/);
      assert.match(prompt, /FILE123/);
      assert.match(prompt, /components\/alert\/icon\/color/);
    });
  });
});
