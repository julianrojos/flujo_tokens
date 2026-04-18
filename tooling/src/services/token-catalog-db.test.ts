import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildTokenCatalogFromDbRows,
} from './token-catalog-db.js';
import { generateGraphReport } from './token-graph.js';

describe('token-catalog-db', () => {
  it('maps database rows into a token catalog suitable for graph analysis', () => {
    const registry = buildTokenCatalogFromDbRows(
      [
        {
          path: 'color.base',
          cssVar: '--color-base',
          type: 'color',
          resolvedValue: '#ffffff',
          collection: 'primitives',
          aliasOf: null,
        },
        {
          path: 'color.semantic',
          cssVar: '--color-semantic',
          type: 'color',
          resolvedValue: '#ffffff',
          collection: 'semantic',
          aliasOf: 'color.base',
        },
      ],
      '2024-01-01T00:00:00Z',
    );

    assert.equal(registry.meta.generatedAt, '2024-01-01T00:00:00Z');
    assert.equal(registry.meta.version, 'database');
    assert.equal(registry.entries.length, 2);
    assert.deepEqual(registry.entries[0], {
      id: 'color.base',
      path: 'color.base',
      $value: '#ffffff',
      type: 'color',
      collection: 'primitives',
      cssVar: '--color-base',
      aliases: undefined,
    });
    assert.deepEqual(registry.entries[1], {
      id: 'color.semantic',
      path: 'color.semantic',
      $value: '#ffffff',
      type: 'color',
      collection: 'semantic',
      cssVar: '--color-semantic',
      aliases: ['color.base'],
    });
  });

  it('produces the same graph report shape from database-backed registry rows', () => {
    const registry = buildTokenCatalogFromDbRows(
      [
        {
          path: 'color.base',
          cssVar: '--color-base',
          type: 'color',
          resolvedValue: '#ffffff',
          collection: 'primitives',
          aliasOf: null,
        },
        {
          path: 'color.semantic',
          cssVar: '--color-semantic',
          type: 'color',
          resolvedValue: '#ffffff',
          collection: 'semantic',
          aliasOf: 'color.base',
        },
      ],
      '2024-01-01T00:00:00Z',
    );

    const report = generateGraphReport(registry, {
      indirectionThreshold: 1,
      maxItems: 10,
    });

    assert.equal(report.summary.totalNodes, 2);
    assert.equal(report.summary.totalEdges, 1);
    assert.equal(report.summary.cycleCount, 0);
    assert.equal(report.summary.unresolvedAliasCount, 0);
    assert.deepEqual(report.unresolvedAliases, []);
    assert.deepEqual(report.collisions, []);
  });
});
