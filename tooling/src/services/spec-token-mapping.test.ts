/**
 * Spec Token Mapping Tests
 *
 * Tests for token mapping functions.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

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

      const lines = buildTokenMenuLines(registryEntries, 'Alert');
      assert.deepEqual(lines, ['components/alert/icon/color (color: #FF0000)']);
    });
  });

  describe('pickBestTokenPath()', () => {
    it('requires strong or unique match', () => {
      const candidates = [
        { path: 'components.alert.background.default', slashPath: 'components/alert/background/default' },
        { path: 'components.alert.border.default', slashPath: 'components/alert/border/default' },
      ];

      assert.equal(
        pickBestTokenPath(candidates, 'token_mapping.background', 'default'),
        'components/alert/background/default',
      );
      assert.equal(
        pickBestTokenPath(candidates, 'token_mapping.unknown', 'default'),
        '',
      );
    });
  });

  describe('prefillTokenMapping()', () => {
    it('fills TBD values recursively', () => {
      const mapping = {
        color_default: 'TBD',
        nested: {
          icon_path: 'TBD',
        },
      };
      const candidates = [
        { path: 'components.alert.color.default', slashPath: 'components/alert/color/default' },
        { path: 'components.alert.icon.path', slashPath: 'components/alert/icon/path' },
      ];

      const filled = prefillTokenMapping(mapping, candidates, 'token_mapping');
      assert.equal(filled, 2);
      assert.equal(mapping.color_default, 'components/alert/color/default');
      assert.equal(mapping.nested.icon_path, 'components/alert/icon/path');
    });
  });
});
