/**
 * Token Usage Index Tests
 *
 * Tests for token usage index generation and figma alias injection.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  generateUsageIndex,
  injectFigmaAliases,
  generateUsageIndexFromFile,
} from './token-usage-index.js';
import type { TokenCatalog, TokenUsageEntryNew } from './token-types.js';

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

  describe('injectFigmaAliases()', () => {
    let tempDir: string;
    let figmaAliasGraphPath: string;

    beforeEach(() => {
      tempDir = fs.mkdtempSync('figma-alias-test-');
      figmaAliasGraphPath = path.join(tempDir, 'figma-alias-graph.json');
    });

    afterEach(() => {
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('injectFigmaAliases adds entries with kind: "figma-alias" given valid fixture', () => {
      // Create mock usageMap
      const usageMap = new Map<string, TokenUsageEntryNew>();
      usageMap.set('color.primary', {
        path: 'color.primary',
        slashPath: 'color/primary',
        cssVar: '--color-primary',
        type: 'color',
        collection: 'colors',
        usageCount: 0,
        usageByKind: {},
        usedIn: [],
      });

      // Create figma-alias-graph.json fixture
      const figmaAliasGraph = {
        version: 1,
        generatedAt: '2024-01-01T00:00:00Z',
        aliases: [
          {
            fromPath: 'color.brand',
            toPath: 'color.primary',
            modes: ['light', 'dark'],
          },
        ],
      };
      fs.writeFileSync(figmaAliasGraphPath, JSON.stringify(figmaAliasGraph, null, 2));

      const warnings: Array<{ message: string; tokenPath?: string }> = [];
      injectFigmaAliases(usageMap, figmaAliasGraphPath, warnings);

      const entry = usageMap.get('color.primary');
      assert.ok(entry);
      assert.strictEqual(entry.usageCount, 1);
      assert.strictEqual(entry.usageByKind['figma-alias'], 1);
      assert.strictEqual(entry.usedIn.length, 1);
      assert.strictEqual(entry.usedIn[0].kind, 'figma-alias');
      assert.strictEqual(entry.usedIn[0].source, 'figma-variables');
      assert.strictEqual(entry.usedIn[0].owner, 'color.brand');
      assert.strictEqual(entry.usedIn[0].detail, 'light, dark');
      // Warnings array should be empty on success
      assert.strictEqual(warnings.length, 0);
    });

    it('injectFigmaAliases does not throw when figmaAliasGraphPath does not exist', () => {
      const usageMap = new Map<string, TokenUsageEntryNew>();
      usageMap.set('color.primary', {
        path: 'color.primary',
        slashPath: 'color/primary',
        cssVar: '--color-primary',
        type: 'color',
        collection: 'colors',
        usageCount: 0,
        usageByKind: {},
        usedIn: [],
      });

      const warnings: Array<{ message: string; tokenPath?: string }> = [];

      // Should not throw even if file doesn't exist
      assert.doesNotThrow(() => {
        injectFigmaAliases(usageMap, '/nonexistent/path.json', warnings);
      });

      // Usage map should remain unchanged
      const entry = usageMap.get('color.primary');
      assert.ok(entry);
      assert.strictEqual(entry.usageCount, 0);
      assert.strictEqual(entry.usedIn.length, 0);
      // Warnings array should be empty
      assert.strictEqual(warnings.length, 0);
    });

    it('injectFigmaAliases gracefully handles malformed JSON', () => {
      const usageMap = new Map<string, TokenUsageEntryNew>();
      usageMap.set('color.primary', {
        path: 'color.primary',
        slashPath: 'color/primary',
        cssVar: '--color-primary',
        type: 'color',
        collection: 'colors',
        usageCount: 0,
        usageByKind: {},
        usedIn: [],
      });

      // Write malformed JSON
      fs.writeFileSync(figmaAliasGraphPath, '{ invalid json }');

      const warnings: Array<{ message: string; tokenPath?: string }> = [];

      // Should not throw
      assert.doesNotThrow(() => {
        injectFigmaAliases(usageMap, figmaAliasGraphPath, warnings);
      });

      // Usage map should remain unchanged
      const entry = usageMap.get('color.primary');
      assert.ok(entry);
      assert.strictEqual(entry.usageCount, 0);
    });

    it('injectFigmaAliases skips entries for non-existent target tokens', () => {
      const usageMap = new Map<string, TokenUsageEntryNew>();
      // Note: color.secondary is NOT in the usageMap
      usageMap.set('color.primary', {
        path: 'color.primary',
        slashPath: 'color/primary',
        cssVar: '--color-primary',
        type: 'color',
        collection: 'colors',
        usageCount: 0,
        usageByKind: {},
        usedIn: [],
      });

      const figmaAliasGraph = {
        version: 1,
        generatedAt: '2024-01-01T00:00:00Z',
        aliases: [
          {
            fromPath: 'color.brand',
            toPath: 'color.secondary', // This token doesn't exist in usageMap
            modes: ['light'],
          },
        ],
      };
      fs.writeFileSync(figmaAliasGraphPath, JSON.stringify(figmaAliasGraph, null, 2));

      const warnings: Array<{ message: string; tokenPath?: string }> = [];
      injectFigmaAliases(usageMap, figmaAliasGraphPath, warnings);

      // color.primary should remain unchanged
      const primaryEntry = usageMap.get('color.primary');
      assert.ok(primaryEntry);
      assert.strictEqual(primaryEntry.usageCount, 0);
      assert.strictEqual(primaryEntry.usedIn.length, 0);
      // Warnings array should be empty (skipping non-existent tokens is not an error)
      assert.strictEqual(warnings.length, 0);
    });

    it('injectFigmaAliases adds warning to array on malformed JSON', () => {
      const usageMap = new Map<string, TokenUsageEntryNew>();
      usageMap.set('color.primary', {
        path: 'color.primary',
        slashPath: 'color/primary',
        cssVar: '--color-primary',
        type: 'color',
        collection: 'colors',
        usageCount: 0,
        usageByKind: {},
        usedIn: [],
      });

      // Write malformed JSON
      fs.writeFileSync(figmaAliasGraphPath, '{ invalid json }');

      const warnings: Array<{ message: string; tokenPath?: string }> = [];

      // Should not throw
      assert.doesNotThrow(() => {
        injectFigmaAliases(usageMap, figmaAliasGraphPath, warnings);
      });

      // Warning should be added to array, not just console
      assert.strictEqual(warnings.length, 1);
      assert.ok(warnings[0].message.includes('Failed to process figma-alias-graph.json'));
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

    it('accepts optional figmaAliasGraphPath parameter', () => {
      const figmaAliasGraphPath = path.join(tempDir, 'figma-alias-graph.json');

      // Create figma alias graph
      const figmaAliasGraph = {
        version: 1,
        generatedAt: '2024-01-01T00:00:00Z',
        aliases: [
          {
            fromPath: 'color.brand',
            toPath: 'color.primary',
            modes: ['light'],
          },
        ],
      };
      fs.writeFileSync(figmaAliasGraphPath, JSON.stringify(figmaAliasGraph, null, 2));

      const result = generateUsageIndexFromFile(registryPath, cssFiles, figmaAliasGraphPath);

      const entry = result.byPath['color.primary'];
      assert.ok(entry);
      assert.strictEqual(entry.usageByKind['figma-alias'], 1);
    });
  });
});
