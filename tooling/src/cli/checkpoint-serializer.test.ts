/**
 * Checkpoint Serializer Tests
 *
 * Unit tests for checkpoint serialization/deserialization.
 * Verifies round-trip integrity: serialize -> deserialize == original
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
    serializeIndexingContext,
    createIndexingContextFromSerialized,
    serializeTokenGraph,
    deserializeTokenGraph,
    serializeCssCollisionMap,
    deserializeCssCollisionMap,
    toSummarySnapshot,
    fromSummarySnapshot
} from './checkpoint-serializer.js';

import type { IndexingContext, TokenGraph, ExecutionSummary, CssVarCollision, CssVarOwner } from '../types/tokens.js';
import { createSummary, createProcessingContext } from '../runtime/context.js';

describe('checkpoint-serializer', () => {
    describe('serializeIndexingContext / createIndexingContextFromSerialized', () => {
        it('should round-trip an empty indexing context', () => {
            const summary = createSummary();
            const original: Readonly<IndexingContext> = createProcessingContext({
                summary,
                refMap: new Map(),
                valueMap: new Map(),
                collisionKeys: new Set(),
                idToVarName: new Map(),
                idToTokenKey: new Map()
            });

            const serialized = serializeIndexingContext(original);
            const deserialized = createIndexingContextFromSerialized(serialized);

            assert.strictEqual(deserialized.refMap.size, 0);
            assert.strictEqual(deserialized.valueMap.size, 0);
            assert.strictEqual(deserialized.collisionKeys.size, 0);
            assert.strictEqual(deserialized.idToVarName.size, 0);
            assert.strictEqual(deserialized.idToTokenKey.size, 0);
        });

        it('should round-trip an indexing context with data', () => {
            const summary = createSummary();
            const original: Readonly<IndexingContext> = createProcessingContext({
                summary,
                refMap: new Map([['color.primary', '--color-primary'], ['size.medium', '--size-medium']]),
                valueMap: new Map([['color.primary', { $value: '#FF0000', $type: 'color' }]]),
                collisionKeys: new Set(['--font-weight-regular']),
                idToVarName: new Map([['figma-var-123', '--color-primary']]),
                idToTokenKey: new Map([['figma-var-123', 'color.primary']])
            });

            const serialized = serializeIndexingContext(original);
            const deserialized = createIndexingContextFromSerialized(serialized);

            assert.strictEqual(deserialized.refMap.size, 2);
            assert.strictEqual(deserialized.refMap.get('color.primary'), '--color-primary');
            assert.strictEqual(deserialized.valueMap.size, 1);
            assert.strictEqual(deserialized.collisionKeys.size, 1);
            assert.strictEqual(deserialized.idToVarName.size, 1);
            assert.strictEqual(deserialized.idToTokenKey.size, 1);
        });
    });

    describe('serializeTokenGraph / deserializeTokenGraph', () => {
        it('should round-trip an empty token graph', () => {
            const original: TokenGraph = {
                nodes: new Map(),
                edges: new Map(),
                reverseEdges: new Map(),
                collections: new Map(),
                modes: new Map(),
                pathToNodeId: new Map(),
                idToNodeId: new Map(),
                cycleNodeIds: new Set()
            };

            const serialized = serializeTokenGraph(original);
            const deserialized = deserializeTokenGraph(serialized);

            assert.strictEqual(deserialized.nodes.size, 0);
            assert.strictEqual(deserialized.edges.size, 0);
            assert.strictEqual(deserialized.reverseEdges.size, 0);
            assert.strictEqual(deserialized.collections.size, 0);
            assert.strictEqual(deserialized.modes.size, 0);
            assert.strictEqual(deserialized.pathToNodeId.size, 0);
            assert.strictEqual(deserialized.idToNodeId.size, 0);
            assert.strictEqual(deserialized.cycleNodeIds.size, 0);
        });

        it('should round-trip a token graph with nodes and edges', () => {
            const original: TokenGraph = {
                nodes: new Map([
                    ['color.primary', {
                        id: 'color.primary',
                        path: ['color', 'primary'],
                        value: '#FF0000',
                        type: 'color',
                        aliases: [],
                        dependents: ['button.primary'],
                        metadata: { collection: 'global', cssVar: '--color-primary' }
                    }]
                ]),
                edges: new Map([
                    ['button.primary', [{
                        from: 'button.primary',
                        to: 'color.primary',
                        kind: 'w3c-ref',
                        ref: '{color.primary}'
                    }]]
                ]),
                reverseEdges: new Map([
                    ['color.primary', [{
                        from: 'button.primary',
                        to: 'color.primary',
                        kind: 'w3c-ref',
                        ref: '{color.primary}'
                    }]]
                ]),
                collections: new Map([['global', ['color.primary']]]),
                modes: new Map([['modeDesktop', { key: 'modeDesktop', selector: '[data-theme="desktop"]', isDefault: true }]]),
                pathToNodeId: new Map([['color.primary', 'color.primary']]),
                idToNodeId: new Map([['figma-var-123', 'color.primary']]),
                cycleNodeIds: new Set()
            };

            const serialized = serializeTokenGraph(original);
            const deserialized = deserializeTokenGraph(serialized);

            assert.strictEqual(deserialized.nodes.size, 1);
            assert.strictEqual(deserialized.edges.size, 1);
            assert.strictEqual(deserialized.reverseEdges.size, 1);
            assert.strictEqual(deserialized.collections.size, 1);
            assert.strictEqual(deserialized.modes.size, 1);
            assert.strictEqual(deserialized.pathToNodeId.size, 1);
            assert.strictEqual(deserialized.idToNodeId.size, 1);
            assert.strictEqual(deserialized.cycleNodeIds.size, 0);

            // Verify node data
            const node = deserialized.nodes.get('color.primary');
            assert.ok(node);
            assert.strictEqual(node.value, '#FF0000');
            assert.strictEqual(node.type, 'color');
            assert.strictEqual(node.metadata.cssVar, '--color-primary');

            // Verify edge data
            const edges = deserialized.edges.get('button.primary');
            assert.ok(edges);
            assert.strictEqual(edges.length, 1);
            assert.strictEqual(edges[0].kind, 'w3c-ref');
        });

        it('should round-trip a token graph with cycles', () => {
            const original: TokenGraph = {
                nodes: new Map([
                    ['a', { id: 'a', path: ['a'], value: 'a', type: 'string', aliases: [], dependents: ['b'], metadata: { collection: 'test' } }],
                    ['b', { id: 'b', path: ['b'], value: 'b', type: 'string', aliases: [], dependents: ['a'], metadata: { collection: 'test' } }]
                ]),
                edges: new Map([
                    ['a', [{ from: 'a', to: 'b', kind: 'w3c-ref', ref: '{b}' }]],
                    ['b', [{ from: 'b', to: 'a', kind: 'w3c-ref', ref: '{a}' }]]
                ]),
                reverseEdges: new Map([
                    ['a', [{ from: 'b', to: 'a', kind: 'w3c-ref', ref: '{a}' }]],
                    ['b', [{ from: 'a', to: 'b', kind: 'w3c-ref', ref: '{b}' }]]
                ]),
                collections: new Map([['test', ['a', 'b']]]),
                modes: new Map(),
                pathToNodeId: new Map(),
                idToNodeId: new Map(),
                cycleNodeIds: new Set(['a', 'b'])
            };

            const serialized = serializeTokenGraph(original);
            const deserialized = deserializeTokenGraph(serialized);

            assert.strictEqual(deserialized.cycleNodeIds.size, 2);
            assert.ok(deserialized.cycleNodeIds.has('a'));
            assert.ok(deserialized.cycleNodeIds.has('b'));
        });
    });

    describe('serializeCssCollisionMap / deserializeCssCollisionMap', () => {
        it('should round-trip an empty collision map', () => {
            const original = new Map<string, CssVarCollision>();
            const serialized = serializeCssCollisionMap(original);
            const deserialized = deserializeCssCollisionMap(serialized);
            assert.strictEqual(deserialized.size, 0);
        });

        it('should round-trip a collision map with collisions', () => {
            const collision: CssVarCollision = {
                first: { tokenKey: 'font.weight.regular', tokenPath: 'font.weight.regular', id: 'figma-weight-1' },
                others: new Map([
                    ['text.body', { tokenKey: 'text.body', tokenPath: 'text.body', id: 'figma-weight-2' }],
                    ['button.label', { tokenKey: 'button.label', tokenPath: 'button.label' }]
                ])
            };

            const original = new Map<string, CssVarCollision>([['--font-weight-regular', collision]]);
            const serialized = serializeCssCollisionMap(original);
            const deserialized = deserializeCssCollisionMap(serialized);

            assert.strictEqual(deserialized.size, 1);
            const deserializedCollision = deserialized.get('--font-weight-regular');
            assert.ok(deserializedCollision);
            assert.strictEqual(deserializedCollision.first.tokenKey, 'font.weight.regular');
            assert.strictEqual(deserializedCollision.others.size, 2);
            assert.ok(deserializedCollision.others.has('text.body'));
            assert.ok(deserializedCollision.others.has('button.label'));
        });

        it('should preserve collision with no others (single owner)', () => {
            const collision: CssVarCollision = {
                first: { tokenKey: 'color.primary', tokenPath: 'color.primary' },
                others: new Map()
            };

            const original = new Map<string, CssVarCollision>([['--color-primary', collision]]);
            const serialized = serializeCssCollisionMap(original);
            const deserialized = deserializeCssCollisionMap(serialized);

            assert.strictEqual(deserialized.size, 1);
            const deserializedCollision = deserialized.get('--color-primary');
            assert.ok(deserializedCollision);
            assert.strictEqual(deserializedCollision.others.size, 0);
        });
    });

    describe('toSummarySnapshot / fromSummarySnapshot', () => {
        it('should round-trip an empty summary', () => {
            const original = createSummary();
            const snapshot = toSummarySnapshot(original);
            const deserialized = fromSummarySnapshot(snapshot);

            assert.strictEqual(deserialized.totalTokens, 0);
            assert.strictEqual(deserialized.successCount, 0);
            assert.strictEqual(deserialized.unresolvedRefs.length, 0);
            assert.strictEqual(deserialized.invalidNames.length, 0);
            assert.strictEqual(deserialized.circularDeps, 0);
            assert.strictEqual(deserialized.depthLimitHits, 0);
            assert.strictEqual(deserialized.cssVarNameCollisions, 0);
            assert.strictEqual(deserialized.invalidTokens.length, 0);

            // Internal dedupe sets are reset in fromSummarySnapshot
            assert.ok(deserialized.countedTokenKeys instanceof Set);
            assert.ok(deserialized.countedGeneratedKeys instanceof Set);
            assert.ok(deserialized.countedTokenTypeKeys instanceof Set);
        });

        it('should round-trip a summary with data', () => {
            const original: ExecutionSummary = {
                totalTokens: 318,
                successCount: 316,
                unresolvedRefs: ['{missing.token}', '{broken.ref}'],
                invalidNames: ['--invalid-name'],
                circularDeps: 2,
                depthLimitHits: 1,
                cssVarNameCollisions: 2,
                cssVarNameCollisionDetails: [
                    '--font-weight-regular (font.weight.regular + 1 others)',
                    '--font-weight-bold (font.weight.bold + 2 others)'
                ],
                invalidTokens: ['missing-type-token (Missing $type)'],
                tokenTypeCounts: { color: 127, dimension: 183, string: 8 },
                countedTokenKeys: new Set(['color.primary', 'size.medium']),
                countedGeneratedKeys: new Set(['--color-primary', '--size-medium']),
                countedTokenTypeKeys: new Set(['color.primary::color'])
            };

            const snapshot = toSummarySnapshot(original);
            const deserialized = fromSummarySnapshot(snapshot);

            assert.strictEqual(deserialized.totalTokens, 318);
            assert.strictEqual(deserialized.successCount, 316);
            assert.strictEqual(deserialized.unresolvedRefs.length, 2);
            assert.strictEqual(deserialized.invalidNames.length, 1);
            assert.strictEqual(deserialized.circularDeps, 2);
            assert.strictEqual(deserialized.depthLimitHits, 1);
            assert.strictEqual(deserialized.cssVarNameCollisions, 2);
            assert.strictEqual(deserialized.cssVarNameCollisionDetails.length, 2);
            assert.strictEqual(deserialized.invalidTokens.length, 1);
            assert.deepStrictEqual(deserialized.tokenTypeCounts, { color: 127, dimension: 183, string: 8 });

            // Internal dedupe sets are reset
            assert.strictEqual(deserialized.countedTokenKeys.size, 0);
            assert.strictEqual(deserialized.countedGeneratedKeys.size, 0);
            assert.strictEqual(deserialized.countedTokenTypeKeys.size, 0);
        });

        it('should create independent copies (not shared references)', () => {
            const original = createSummary();
            original.unresolvedRefs.push('{test.ref}');
            original.invalidNames.push('--test');

            const snapshot = toSummarySnapshot(original);
            const deserialized = fromSummarySnapshot(snapshot);

            // Modify original
            original.unresolvedRefs.push('{another.ref}');

            // Deserialized should not be affected
            assert.strictEqual(deserialized.unresolvedRefs.length, 1);
            assert.strictEqual(deserialized.unresolvedRefs[0], '{test.ref}');
        });
    });
});
