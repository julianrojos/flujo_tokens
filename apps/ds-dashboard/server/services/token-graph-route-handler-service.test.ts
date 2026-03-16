/**
 * Token Graph Route Handler Service Tests
 *
 * Tests for token usage index normalization shim.
 * Migrated from apps/ds-dashboard/server/services/token-graph-route-handler-service.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    normalizeLegacyUsageIndex,
} from './token-graph-route-handler-service.ts';

describe('token-graph-route-handler-service', () => {
    describe('normalizeLegacyUsageIndex()', () => {
        it('converts legacy shape to new shape', () => {
            const legacy = {
                timestamp: '2024-01-01T00:00:00Z',
                totalTokens: 10,
                usage: [
                    {
                        tokenPath: 'color.primary',
                        usageCount: 2,
                        usedIn: [
                            { file: 'test.css', context: 'css', property: 'color' },
                            { file: 'component.yml', context: 'spec', property: 'background' },
                        ],
                    },
                ],
                unresolved: [{ ref: '--nonexistent', file: 'test.css', context: 'css' }],
            };

            const normalized = normalizeLegacyUsageIndex(legacy);

            // Check new shape structure
            assert.ok(normalized.byPath);
            assert.ok(normalized.bySlashPath);
            assert.ok(normalized.byCssVar);
            assert.ok(normalized.entries);
            assert.ok(normalized.summary.usage_links_total !== undefined);

            // Check specific transformations
            assert.strictEqual(normalized.ok, true);
            assert.strictEqual(normalized.summary.generatedAt, '2024-01-01T00:00:00Z');
            assert.strictEqual(normalized.summary.tokens_total, 10);
            assert.strictEqual(normalized.summary.tokens_with_usage, 1);
            assert.strictEqual(normalized.summary.tokens_without_usage, 9);
            assert.strictEqual(normalized.summary.usage_links_total, 2);
            assert.deepStrictEqual(normalized.summary.usage_links_by_kind, {
                css: 1,
                spec: 1,
            });
            assert.strictEqual(normalized.summary.unresolved_total, 1);

            // Check entry transformation
            const entry = normalized.byPath['color.primary'];
            assert.ok(entry);
            assert.strictEqual(entry.path, 'color.primary');
            assert.strictEqual(entry.slashPath, 'color/primary');
            assert.strictEqual(entry.cssVar, '--color-primary');
            assert.strictEqual(entry.usageCount, 2);
            assert.strictEqual(entry.usedIn.length, 2);

            // Check usedIn transformation
            const cssUsage = entry.usedIn.find((u) => u.kind === 'css');
            const specUsage = entry.usedIn.find((u) => u.kind === 'spec');
            assert.ok(cssUsage);
            assert.ok(specUsage);
            assert.strictEqual(cssUsage.source, 'css-alias');
            assert.strictEqual(cssUsage.owner, 'test.css');
            assert.strictEqual(cssUsage.detail, 'color');
            assert.strictEqual(specUsage.source, 'component-spec');
            assert.strictEqual(specUsage.owner, 'component.yml');
            assert.strictEqual(specUsage.detail, 'background');

            // Check unresolved transformation
            assert.strictEqual(normalized.unresolved.length, 1);
            const unresolved = normalized.unresolved[0];
            assert.strictEqual(unresolved.kind, 'css');
            assert.strictEqual(unresolved.source, 'css-alias');
            assert.strictEqual(unresolved.owner, 'test.css');
            assert.strictEqual(unresolved.keyPath, '--nonexistent');
            assert.strictEqual(unresolved.tokenPath, '--nonexistent');
            assert.strictEqual(unresolved.reason, 'unresolved');
            assert.strictEqual(unresolved.suggested, null);
        });

        it('normalizes byPath payload with snake_case summary fields', () => {
            const newShape = {
                ok: true,
                byPath: { 'color.primary': { path: 'color.primary', slashPath: '', cssVar: '', type: '', collection: '', usageCount: 0, usageByKind: {}, usedIn: [] } },
                bySlashPath: { 'color/primary': { path: 'color.primary', slashPath: '', cssVar: '', type: '', collection: '', usageCount: 0, usageByKind: {}, usedIn: [] } },
                byCssVar: { '--color-primary': { path: 'color.primary', slashPath: '', cssVar: '', type: '', collection: '', usageCount: 0, usageByKind: {}, usedIn: [] } },
                entries: [{ path: 'color.primary', slashPath: '', cssVar: '', type: '', collection: '', usageCount: 0, usageByKind: {}, usedIn: [] }],
                summary: {
                    generatedAt: '',
                    tokens_total: 12,
                    tokens_with_usage: 5,
                    tokens_without_usage: 7,
                    usage_links_total: 9,
                    usage_links_by_kind: { 'component-spec': 5, 'css-alias': 4 },
                    unresolved_total: 2,
                },
                warnings: [],
                unresolved: [],
            };

            const result = normalizeLegacyUsageIndex(newShape);

            assert.strictEqual(result.summary.tokens_total, 12);
            assert.strictEqual(result.summary.tokens_with_usage, 5);
            assert.strictEqual(result.summary.tokens_without_usage, 7);
            assert.strictEqual(result.summary.usage_links_total, 9);
            assert.deepStrictEqual(result.summary.usage_links_by_kind, { 'component-spec': 5, 'css-alias': 4 });
            assert.strictEqual(result.summary.unresolved_total, 2);
        });

        it('normalizes byPath payload with camelCase summary fields', () => {
            const newShape = {
                ok: true,
                byPath: { 'color.primary': { path: 'color.primary', slashPath: '', cssVar: '', type: '', collection: '', usageCount: 0, usageByKind: {}, usedIn: [] } },
                bySlashPath: { 'color/primary': { path: 'color.primary', slashPath: '', cssVar: '', type: '', collection: '', usageCount: 0, usageByKind: {}, usedIn: [] } },
                byCssVar: { '--color-primary': { path: 'color.primary', slashPath: '', cssVar: '', type: '', collection: '', usageCount: 0, usageByKind: {}, usedIn: [] } },
                entries: [{ path: 'color.primary', slashPath: '', cssVar: '', type: '', collection: '', usageCount: 0, usageByKind: {}, usedIn: [] }],
                summary: {
                    generatedAt: '2024-01-01T00:00:00Z',
                    totalTokens: 20,
                    tokensWithUsage: 6,
                    usage_links_total: 11,
                },
                warnings: [],
                unresolved: [],
            };

            const result = normalizeLegacyUsageIndex(newShape);

            assert.strictEqual(result.summary.tokens_total, 20);
            assert.strictEqual(result.summary.tokens_with_usage, 6);
            assert.strictEqual(result.summary.tokens_without_usage, 14);
            assert.strictEqual(result.summary.usage_links_total, 11);
            assert.deepStrictEqual(result.summary.usage_links_by_kind, {});
            assert.strictEqual(result.summary.unresolved_total, 0);
        });

        it('normalizeLegacyUsageIndex handles empty usage array', () => {
            const legacy = {
                timestamp: '2024-01-01T00:00:00Z',
                totalTokens: 0,
                usage: [],
                unresolved: [],
            };

            const normalized = normalizeLegacyUsageIndex(legacy);

            assert.strictEqual(normalized.summary.tokens_total, 0);
            assert.strictEqual(normalized.summary.tokens_with_usage, 0);
            assert.strictEqual(normalized.summary.tokens_without_usage, 0);
            assert.strictEqual(normalized.summary.usage_links_total, 0);
            assert.strictEqual(normalized.entries.length, 0);
            assert.strictEqual(Object.keys(normalized.byPath).length, 0);
            assert.strictEqual(normalized.unresolved.length, 0);
        });

        it('normalizeLegacyUsageIndex handles missing properties gracefully', () => {
            const legacy = {
                totalTokens: 5,
                usage: [
                    {
                        tokenPath: 'color.primary',
                        usageCount: 1,
                        usedIn: [{ file: 'test.css' }], // missing context and property
                    },
                ],
                // missing timestamp and unresolved
            };

            const normalized = normalizeLegacyUsageIndex(legacy);

            assert.strictEqual(normalized.summary.tokens_total, 5);
            assert.strictEqual(normalized.summary.tokens_with_usage, 1);
            assert.strictEqual(normalized.summary.usage_links_total, 1);
            assert.strictEqual(normalized.summary.generatedAt, '');
            assert.strictEqual(normalized.unresolved.length, 0);

            // Check graceful handling of missing context/property
            const entry = normalized.byPath['color.primary'];
            assert.ok(entry);
            assert.strictEqual(entry.usedIn.length, 1);
            const usage = entry.usedIn[0];
            // When context is missing, kind/source fallback to 'other'/'unknown'
            assert.strictEqual(usage.kind, 'other');
            assert.strictEqual(usage.source, 'unknown');
            assert.strictEqual(usage.detail, 'unknown');
        });

        it('normalizeLegacyUsageIndex returns unknown input as-is', () => {
            const unknown = { someProperty: 'someValue' };
            const result = normalizeLegacyUsageIndex(unknown);

            // Should return as-is when it doesn't match expected patterns
            assert.strictEqual(result, unknown);
        });

        it('normalizeLegacyUsageIndex handles null/undefined input', () => {
            // null and undefined pass through unchanged
            assert.strictEqual(normalizeLegacyUsageIndex(null), null);
            assert.strictEqual(normalizeLegacyUsageIndex(undefined), undefined);
            // Empty object doesn't match legacy pattern (no usage array), returns as-is
            const emptyObj = {};
            const result = normalizeLegacyUsageIndex(emptyObj);
            assert.deepStrictEqual(result, emptyObj);
        });
    });
});
