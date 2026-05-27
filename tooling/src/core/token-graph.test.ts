import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createSummary, createProcessingContext } from '../runtime/context.js';
import { createTokenGraph, buildEmittableKeySetFromGraph } from './token-graph.js';

describe('token-graph', () => {
  it('deduplicates collection membership while preserving public array output', () => {
    const ctx = createProcessingContext({
      summary: createSummary(),
      refMap: new Map(),
      valueMap: new Map([
        ['color.primary', { $value: '#fff', $type: 'color' }],
        ['color.secondary', { $value: '#000', $type: 'color' }],
      ]),
      collisionKeys: new Set(),
      idToVarName: new Map(),
      idToTokenKey: new Map(),
    });

    const graph = createTokenGraph(ctx);
    const keys = Array.from(graph.collections.keys());

    assert.deepEqual(keys, ['color']);
    assert.deepEqual(graph.collections.get('color'), ['color.primary', 'color.secondary']);
  });

  it('builds an emittable key set from graph nodes', () => {
    const graph = createTokenGraph(createProcessingContext({
      summary: createSummary(),
      refMap: new Map(),
      valueMap: new Map([
        ['color.primary', { $value: '#fff', $type: 'color' }],
        ['shadow.card', { $value: [{ offsetX: 1, offsetY: 1, blur: 2, color: '#000' }], $type: 'shadow' }],
      ]),
      collisionKeys: new Set(),
      idToVarName: new Map(),
      idToTokenKey: new Map(),
    }));

    const emittable = buildEmittableKeySetFromGraph(graph);
    assert.equal(emittable.has('color.primary'), true);
    assert.equal(emittable.has('shadow.card'), true);
  });
});
