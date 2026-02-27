/**
 * Spec Token Mapping Tests
 *
 * Tests for token mapping utilities.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTokenMenuLines,
  extractUniqueRegistryEntries,
  pickBestTokenPath,
  pickComponentTokenCandidates,
  prefillTokenMapping,
} from './spec-token-mapping.js';

describe('spec-token-mapping', () => {
  describe('extractUniqueRegistryEntries()', () => {
    it('deduplicates by stable marker', () => {
      const entries = {
        a: { path: 'components.alert.icon.color', slashPath: 'components/alert/icon/color', collection: 'components' },
        b: { path: 'components.alert.icon.color', slashPath: 'components/alert/icon/color', collection: 'components' },
        c: { path: 'semantic.surface.default', slashPath: 'semantic/surface/default', collection: 'semantic' },
      };

      const unique = extractUniqueRegistryEntries(entries);
      assert.equal(unique.length, 2);
    });
  });

  describe('pickComponentTokenCandidates()', () => {
    it('filters components collection by normalized component name', () => {
      const registryEntries = [
        { path: 'components.alert.icon.color', slashPath: 'components/alert/icon/color', collection: 'components' },
        { path: 'components.button.icon.color', slashPath: 'components/button/icon/color', collection: 'components' },
        { path: 'semantic.surface.default', slashPath: 'semantic/surface/default', collection: 'semantic' },
      ];

      const matches = pickComponentTokenCandidates(registryEntries, 'Alert');
      assert.equal(matches.length, 1);
      assert.equal(matches[0].path, 'components.alert.icon.color');
    });
  });

  describe('buildTokenMenuLines()', () => {
    it('prefers component candidates and formats resolved values', () => {
      const registryEntries = [
        {
          path: 'components.alert.icon.color',
          slashPath: 'components/alert/icon/color',
          collection: 'components',
          type: 'color',
          resolvedValue: '#FF0000',
        },
        {
          path: 'semantic.surface.default',
          slashPath: 'semantic/surface/default',
          collection: 'semantic',
          type: 'color',
          resolvedValue: '#FFFFFF',
        },
      ];

      const lines = buildTokenMenuLines(registryEntries, 'alert', 10);
      // Should have 1 line (the component candidate, not semantic fallback)
      assert.equal(lines.length, 1);
      assert.ok(lines[0].includes('components/alert/icon/color'));
      assert.ok(lines[0].includes('#FF0000'));
    });
  });

  describe('prefillTokenMapping()', () => {
    it('fills TBD values with suggestions from registry', () => {
      const registryEntries = [
        { path: 'components.alert.icon.color', slashPath: 'components/alert/icon/color', collection: 'components', type: 'color' },
        { path: 'semantic.surface.default', slashPath: 'semantic/surface/default', collection: 'semantic', type: 'color' },
      ];

      const node = {
        icon: {
          color: 'TBD',
        },
      };

      const filledCount = prefillTokenMapping(node, registryEntries, 'icon');
      assert.ok(filledCount > 0);
      assert.ok(node.icon.color.includes('components/alert/icon/color'));
    });
  });
});
