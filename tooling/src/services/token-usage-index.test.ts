/**
 * Token Usage Index Tests
 *
 * Tests for token usage index generation.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  generateUsageIndex,
  generateUsageIndexFromFile,
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
  });

  describe('generateUsageIndexFromFile()', () => {
    let tempDir: string;
    let registryPath: string;
    let specRoot: string;
    let cssFiles: string[];

    beforeEach(() => {
      tempDir = fs.mkdtempSync('usage-index-test-');
      registryPath = path.join(tempDir, 'registry.json');
      specRoot = path.join(tempDir, 'specs');
      cssFiles = [path.join(tempDir, 'test.css')];

      // Create mock registry
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
      fs.writeFileSync(registryPath, JSON.stringify(mockRegistry, null, 2));

      // Create specs directory
      fs.mkdirSync(specRoot, { recursive: true });

      // Create CSS file
      fs.writeFileSync(cssFiles[0], ':root { --color-primary: #ff0000; }');
    });

    afterEach(() => {
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('loads files and generates usage index with new shape', () => {
      const result = generateUsageIndexFromFile(registryPath, cssFiles);

      assert.ok(result.byPath);
      assert.ok(result.bySlashPath);
      assert.ok(result.byCssVar);
      assert.ok(result.entries);
      assert.ok(result.summary.usage_links_total !== undefined);
    });

  });
});
