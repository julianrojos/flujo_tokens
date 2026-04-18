/**
 * Token Health Service Tests
 *
 * Tests for token health checks including broken refs and WCAG pairs.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  findBrokenRefs,
  findBrokenAliases,
  checkWcagPairs,
  findHighUsageTokens,
  findHighIndegreeTokens,
  generateHealthReport,
} from './token-health.js';
import { generateUsageIndex } from './token-usage-index.js';
import type { TokenCatalog, WcagPair } from './token-types.js';

describe('token-health', () => {
  describe('findBrokenRefs()', () => {
    it('detects broken CSS variable references in pure var() values', () => {
      const registry: TokenCatalog = {
        entries: [
          {
            id: '1',
            path: 'color.primary',
            $value: 'var(--nonexistent)',
            type: 'color',
            collection: 'colors',
          },
        ],
        meta: {
          generatedAt: '2024-01-01T00:00:00Z',
          version: '1.0.0',
        },
      };

      const cssVarIndex = new Map<string, string>();
      // --color-primary exists, but --nonexistent does not

      const issues = findBrokenRefs(registry, cssVarIndex);

      assert.strictEqual(issues.length, 1);
      assert.strictEqual(issues[0].code, 'BROKEN_REF');
      assert.strictEqual(issues[0].message, 'References non-existent CSS variable: --nonexistent');
    });

    it('detects broken CSS variable references in compound values', () => {
      const registry: TokenCatalog = {
        entries: [
          {
            id: '1',
            path: 'shadow.lg',
            $value: 'var(--nonexistent) 0 0 4px rgba(0,0,0,0.1)',
            type: 'shadow',
            collection: 'shadows',
          },
        ],
        meta: {
          generatedAt: '2024-01-01T00:00:00Z',
          version: '1.0.0',
        },
      };

      const cssVarIndex = new Map<string, string>();

      const issues = findBrokenRefs(registry, cssVarIndex);

      assert.strictEqual(issues.length, 1);
      assert.strictEqual(issues[0].message, 'References non-existent CSS variable: --nonexistent');
    });

    it('detects multiple broken references in a single value', () => {
      const registry: TokenCatalog = {
        entries: [
          {
            id: '1',
            path: 'gradient.primary',
            $value: 'linear-gradient(var(--color-a), var(--color-b))',
            type: 'gradient',
            collection: 'gradients',
          },
        ],
        meta: {
          generatedAt: '2024-01-01T00:00:00Z',
          version: '1.0.0',
        },
      };

      const cssVarIndex = new Map<string, string>();

      const issues = findBrokenRefs(registry, cssVarIndex);

      assert.strictEqual(issues.length, 2);
      assert.ok(issues.some(i => i.message.includes('--color-a')));
      assert.ok(issues.some(i => i.message.includes('--color-b')));
    });

    it('does not report valid CSS variable references', () => {
      const registry: TokenCatalog = {
        entries: [
          {
            id: '1',
            path: 'color.primary',
            $value: 'var(--color-primary)',
            type: 'color',
            collection: 'colors',
          },
        ],
        meta: {
          generatedAt: '2024-01-01T00:00:00Z',
          version: '1.0.0',
        },
      };

      const cssVarIndex = new Map<string, string>();
      cssVarIndex.set('--color-primary', '1');

      const issues = findBrokenRefs(registry, cssVarIndex);

      assert.strictEqual(issues.length, 0);
    });

    it('handles var() with fallback values', () => {
      const registry: TokenCatalog = {
        entries: [
          {
            id: '1',
            path: 'color.primary',
            $value: 'var(--nonexistent, #ff0000)',
            type: 'color',
            collection: 'colors',
          },
        ],
        meta: {
          generatedAt: '2024-01-01T00:00:00Z',
          version: '1.0.0',
        },
      };

      const cssVarIndex = new Map<string, string>();

      const issues = findBrokenRefs(registry, cssVarIndex);

      assert.strictEqual(issues.length, 1);
      assert.strictEqual(issues[0].message, 'References non-existent CSS variable: --nonexistent');
    });

    it('handles compound values with mixed valid and invalid refs', () => {
      const registry: TokenCatalog = {
        entries: [
          {
            id: '1',
            path: 'shadow.mixed',
            $value: 'var(--valid-shadow) 0 0 var(--invalid-size) rgba(0,0,0,0.1)',
            type: 'shadow',
            collection: 'shadows',
          },
        ],
        meta: {
          generatedAt: '2024-01-01T00:00:00Z',
          version: '1.0.0',
        },
      };

      const cssVarIndex = new Map<string, string>();
      cssVarIndex.set('--valid-shadow', '2');
      // --invalid-size is NOT in the index

      const issues = findBrokenRefs(registry, cssVarIndex);

      assert.strictEqual(issues.length, 1);
      assert.strictEqual(issues[0].message, 'References non-existent CSS variable: --invalid-size');
    });
  });

  describe('checkWcagPairs()', () => {
    it('returns empty array when WCAG check is not implemented', () => {
      const registry: TokenCatalog = {
        entries: [],
        meta: {
          generatedAt: '2024-01-01T00:00:00Z',
          version: '1.0.0',
        },
      };

      const wcagPairs: WcagPair[] = [
        {
          fg: 'color.text',
          bg: 'color.background',
          level: 'AA',
          context: 'Button text',
        },
      ];

      const failures = checkWcagPairs(registry, wcagPairs);

      assert.strictEqual(failures.length, 0);
    });

    it('returns empty array for missing tokens (graceful skip)', () => {
      const registry: TokenCatalog = {
        entries: [],
        meta: {
          generatedAt: '2024-01-01T00:00:00Z',
          version: '1.0.0',
        },
      };

      const wcagPairs: WcagPair[] = [
        {
          fg: 'nonexistent.fg',
          bg: 'nonexistent.bg',
          level: 'AAA',
          context: 'Test',
        },
      ];

      const failures = checkWcagPairs(registry, wcagPairs);

      assert.strictEqual(failures.length, 0);
    });
  });

  describe('findBrokenAliases()', () => {
    it('detects aliases pointing to non-existent tokens', () => {
      const registry: TokenCatalog = {
        entries: [
          {
            id: '1',
            path: 'color.brand',
            $value: '#ff0000',
            type: 'color',
            collection: 'colors',
            aliases: ['nonexistent-id'],
          },
        ],
        meta: {
          generatedAt: '2024-01-01T00:00:00Z',
          version: '1.0.0',
        },
      };

      const issues = findBrokenAliases(registry);

      assert.strictEqual(issues.length, 1);
      assert.strictEqual(issues[0].code, 'BROKEN_ALIAS');
      assert.strictEqual(issues[0].message, 'References non-existent alias: nonexistent-id');
    });

    it('does not report valid aliases', () => {
      const registry: TokenCatalog = {
        entries: [
          {
            id: '1',
            path: 'color.brand',
            $value: '#ff0000',
            type: 'color',
            collection: 'colors',
            aliases: ['2'],
          },
          {
            id: '2',
            path: 'color.primary',
            $value: '#00ff00',
            type: 'color',
            collection: 'colors',
          },
        ],
        meta: {
          generatedAt: '2024-01-01T00:00:00Z',
          version: '1.0.0',
        },
      };

      const issues = findBrokenAliases(registry);

      assert.strictEqual(issues.length, 0);
    });
  });

  describe('findHighUsageTokens()', () => {
    it('finds high usage tokens from new format (entries)', () => {
      const usageIndex = {
        entries: [
          { path: 'color.primary', usageCount: 50 },
          { path: 'color.secondary', usageCount: 5 },
          { path: 'color.tertiary', usageCount: 100 },
        ],
      };

      const highUsage = findHighUsageTokens(usageIndex, 10);

      assert.strictEqual(highUsage.length, 2);
      assert.strictEqual(highUsage[0].tokenPath, 'color.tertiary');
      assert.strictEqual(highUsage[0].usageCount, 100);
      assert.strictEqual(highUsage[1].tokenPath, 'color.primary');
      assert.strictEqual(highUsage[1].usageCount, 50);
    });

    it('returns empty array for null usageIndex', () => {
      const highUsage = findHighUsageTokens(null as any, 10);
      assert.strictEqual(highUsage.length, 0);
    });

    it('returns empty array for empty usageIndex', () => {
      const highUsage = findHighUsageTokens({}, 10);
      assert.strictEqual(highUsage.length, 0);
    });

    it('returns empty array for invalid entries type', () => {
      const highUsage = findHighUsageTokens({ entries: 'bad' } as any, 10);
      assert.strictEqual(highUsage.length, 0);
    });

    it('returns empty array for invalid usage type', () => {
      const highUsage = findHighUsageTokens({ usage: 'bad' } as any, 10);
      assert.strictEqual(highUsage.length, 0);
    });

    it('returns empty array for entries with non-array value', () => {
      const highUsage = findHighUsageTokens({ entries: { path: 'test' } } as any, 10);
      assert.strictEqual(highUsage.length, 0);
    });

    it('producer-consumer contract: generateUsageIndex → findHighUsageTokens', () => {
      // Minimal registry fixture
      const registry: TokenCatalog = {
        entries: [
          { id: '1', path: 'color.primary', $value: '#ff0000', type: 'color', collection: 'colors', cssVar: '--color-primary' },
          { id: '2', path: 'color.secondary', $value: '#00ff00', type: 'color', collection: 'colors', cssVar: '--color-secondary' },
          { id: '3', path: 'color.tertiary', $value: '#0000ff', type: 'color', collection: 'colors', cssVar: '--color-tertiary' },
        ],
        meta: { generatedAt: '2024-01-01T00:00:00Z', version: '1.0.0' },
      };

      // Minimal CSS refs
      const cssRefs = [
        { varName: '--color-primary', file: 'tokens.css', value: 'var(--color-primary)' },
        { varName: '--color-primary', file: 'tokens.css', value: 'var(--color-primary)' },
        { varName: '--color-secondary', file: 'tokens.css', value: 'var(--color-secondary)' },
      ];

      // Generate usage index using producer function
      const usageIndex = generateUsageIndex(registry, cssRefs as any, new Map());

      // Consume with findHighUsageTokens
      const highUsage = findHighUsageTokens(usageIndex, 1);

      // Contract validation: each result must have tokenPath from entry.path and usageCount from entry.usageCount
      for (const item of highUsage) {
        // tokenPath must be derived from entry.path
        assert.ok(item.tokenPath.includes('.'), 'tokenPath should be a dotted path like entry.path');
        // usageCount must be a positive number
        assert.ok(typeof item.usageCount === 'number' && item.usageCount > 0, 'usageCount must be positive number');
      }

      // Specific contract assertions
      const primaryEntry = highUsage.find(u => u.tokenPath === 'color.primary');
      assert.ok(primaryEntry, 'color.primary should be in high usage');
      assert.strictEqual(primaryEntry.usageCount, 2, 'color.primary should have 2 CSS usages');

      const secondaryEntry = highUsage.find(u => u.tokenPath === 'color.secondary');
      assert.ok(secondaryEntry, 'color.secondary should be in high usage');
      assert.strictEqual(secondaryEntry.usageCount, 1, 'color.secondary has 1 usage');

      // Verify ordering: highest usageCount first
      assert.ok(highUsage[0].usageCount >= highUsage[1].usageCount, 'Should be sorted by usageCount descending');
    });
  });

  describe('findHighIndegreeTokens()', () => {
    it('finds high indegree tokens from graph', () => {
      const graph = {
        nodes: [
          { id: '1', path: 'color.primary', inDegree: 50 },
          { id: '2', path: 'color.secondary', inDegree: 5 },
          { id: '3', path: 'color.tertiary', inDegree: 100 },
        ],
      };

      const highIndegree = findHighIndegreeTokens(graph, 10);

      assert.strictEqual(highIndegree.length, 2);
      assert.strictEqual(highIndegree[0].tokenPath, 'color.tertiary');
      assert.strictEqual(highIndegree[0].inDegree, 100);
    });

    it('returns empty array for null graph', () => {
      const highIndegree = findHighIndegreeTokens(null as any, 10);
      assert.strictEqual(highIndegree.length, 0);
    });
  });

  describe('generateHealthReport()', () => {
    it('generates report with broken aliases and refs', () => {
      const registry: TokenCatalog = {
        entries: [
          {
            id: '1',
            path: 'color.broken',
            $value: 'var(--nonexistent)',
            type: 'color',
            collection: 'colors',
            aliases: ['nonexistent-alias'],
          },
        ],
        meta: {
          generatedAt: '2024-01-01T00:00:00Z',
          version: '1.0.0',
        },
      };

      const report = generateHealthReport(
        registry,
        {},
        {},
        [],
        {
          maxItems: 100,
          highUsageThreshold: 10,
          highIndegreeThreshold: 10,
        },
      );

      assert.strictEqual(report.status, 'error');
      // Note: brokenAliases and brokenRefs both count the same token, so errorTokens is 1
      assert.strictEqual(report.summary.brokenAliases, 1);
      assert.strictEqual(report.summary.brokenRefs, 1);
      // Total issues should be 2 (1 broken alias + 1 broken ref)
      assert.strictEqual(report.issues.length, 2);
      assert.ok(report.issues.some(i => i.code === 'BROKEN_ALIAS'));
      assert.ok(report.issues.some(i => i.code === 'BROKEN_REF'));
    });

    it('generates healthy report when no issues', () => {
      const registry: TokenCatalog = {
        entries: [
          {
            id: '1',
            path: 'color.primary',
            $value: '#ff0000',
            type: 'color',
            collection: 'colors',
          },
        ],
        meta: {
          generatedAt: '2024-01-01T00:00:00Z',
          version: '1.0.0',
        },
      };

      const report = generateHealthReport(
        registry,
        {},
        {},
        [],
        {
          maxItems: 100,
          highUsageThreshold: 10,
          highIndegreeThreshold: 10,
        },
      );

      assert.strictEqual(report.status, 'healthy');
      assert.strictEqual(report.summary.errorTokens, 0);
      assert.strictEqual(report.issues.length, 0);
    });
  });
});
