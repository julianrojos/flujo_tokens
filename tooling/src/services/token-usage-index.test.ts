/**
 * Token Usage Index Tests
 *
 * Tests for token usage index generation.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildAliasChainsFromSources,
  extractCssReferencesFromSources,
  generateUsageIndex,
} from './token-usage-index.js';
import type { TokenCatalog } from './token-types.js';

describe('token-usage-index', () => {
  describe('generateUsageIndex()', () => {
    it('returns new shape with byPath, bySlashPath, byCssVar, entries, summary.usage_links_total', () => {
      const mockRegistry: TokenCatalog = {
        entries: [
          {
            id: '1',
            path: 'color.primary',
            $value: '#ff0000',
            type: 'color',
            collection: 'colors',
            cssVar: '--color-primary',
          },
        ],
        meta: {
          generatedAt: '2024-01-01T00:00:00Z',
          version: '1.0.0',
        },
      };

      const result = generateUsageIndex(mockRegistry, [], new Map());

      assert.ok(result.byPath);
      assert.ok(result.bySlashPath);
      assert.ok(result.byCssVar);
      assert.ok(result.entries);
      assert.ok(result.summary.usage_links_total !== undefined);
      assert.strictEqual(result.summary.totalTokens, 1);
      assert.strictEqual(result.summary.tokensWithUsage, 0);
      assert.strictEqual(result.summary.usage_links_total, 0);
    });

    it('populates css-alias usage correctly', () => {
      const mockRegistry: TokenCatalog = {
        entries: [
          {
            id: '1',
            path: 'color.primary',
            $value: '#ff0000',
            type: 'color',
            collection: 'colors',
            cssVar: '--color-primary',
          },
        ],
        meta: {
          generatedAt: '2024-01-01T00:00:00Z',
          version: '1.0.0',
        },
      };

      const cssRefs = [
        { varName: '--color-primary', file: 'test.css', value: 'var(--color-primary)' },
      ];

      const result = generateUsageIndex(mockRegistry, cssRefs, new Map());

      const entry = result.byPath['color.primary'];
      assert.ok(entry);
      assert.strictEqual(entry.usageByKind['css-alias'], 1);
      assert.strictEqual(entry.usageCount, 1);
    });

    it('extracts references and alias chains from in-memory css sources', () => {
      const mockRegistry: TokenCatalog = {
        entries: [
          {
            id: '1',
            path: 'color.primary',
            $value: '#ff0000',
            type: 'color',
            collection: 'colors',
            cssVar: '--color-primary',
          },
          {
            id: '2',
            path: 'color.secondary',
            $value: '#00ff00',
            type: 'color',
            collection: 'colors',
            cssVar: '--color-secondary',
          },
        ],
        meta: {
          generatedAt: '2024-01-01T00:00:00Z',
          version: '1.0.0',
        },
      };

      const cssSources = [
        {
          file: 'primitives.css',
          content: ':root { --color-primary: var(--color-secondary); }',
        },
        {
          file: 'tokens.css',
          content: '.btn { color: var(--color-primary); }',
        },
      ];

      const refs = extractCssReferencesFromSources(cssSources, mockRegistry);
      const chains = buildAliasChainsFromSources(cssSources);

      assert.strictEqual(refs.length, 2);
      assert.strictEqual(refs[0]?.file, 'primitives.css');
      assert.strictEqual(refs[1]?.file, 'tokens.css');
      assert.deepEqual(chains.get('--color-primary'), ['--color-secondary']);
    });
  });

});
