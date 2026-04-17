import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { after, before, describe, it } from 'node:test';

import { TokenRepository } from '../db/token-repository.js';
import { createTestDatabase } from '../db/test-db-helpers.js';
import { refreshTokenGraphDbOnly } from './ops-db-maintenance-service.ts';

describe('ops-db-maintenance-service', () => {
  let originalConsoleWarn: typeof console.warn;

  before(() => {
    originalConsoleWarn = console.warn;
    console.warn = () => {};
  });

  after(() => {
    console.warn = originalConsoleWarn;
  });

  it('refreshTokenGraphDbOnly upserts token_graph for the same design system', async () => {
    const originalSkipChecksums = process.env.SKIP_MIGRATION_CHECKSUMS;
    process.env.SKIP_MIGRATION_CHECKSUMS = 'true';

    const { sql, cleanup } = await createTestDatabase({
      designSystems: [{ id: 'sys-01', name: 'System 01' }],
    });

    try {
      const emitChunk = () => {};
      const tokenRepo = new TokenRepository(sql);
      const sha256Text = (value: string): string =>
        createHash('sha256').update(value, 'utf8').digest('hex');

      await sql`
        INSERT INTO tokens (id, ds_id, slash_path, css_var, type, collection, raw_value)
        VALUES (
          ${'color.primary'},
          ${'sys-01'},
          ${'color/primary'},
          ${'--color-primary'},
          ${'color'},
          ${'Primitives'},
          ${'#ffffff'}
        )
      `;
      await sql`
        INSERT INTO token_mode_values (ds_id, token_path, mode, resolved_value)
        VALUES (
          ${'sys-01'},
          ${'color.primary'},
          ${'Default'},
          ${'#ffffff'}
        )
      `;

      const firstResult = await refreshTokenGraphDbOnly({
        systemId: 'sys-01',
        emitChunk,
        sql,
        tokenRepo,
        sha256Text,
      });

      const firstRows = (await sql`
        SELECT graph_json, generated_at
        FROM token_graph
        WHERE ds_id = ${'sys-01'}
      `) as Array<{ graph_json: string; generated_at: Date }>;

      assert.equal(firstResult.ok, true);
      assert.equal(firstRows.length, 1);
      const firstGraph = JSON.parse(firstRows[0].graph_json) as {
        summary: { nodes: number };
        fingerprint: string;
      };
      assert.equal(firstGraph.summary.nodes, 1);

      await sql`
        INSERT INTO tokens (id, ds_id, slash_path, css_var, type, collection, raw_value)
        VALUES (
          ${'color.secondary'},
          ${'sys-01'},
          ${'color/secondary'},
          ${'--color-secondary'},
          ${'color'},
          ${'Primitives'},
          ${'#000000'}
        )
      `;
      await sql`
        INSERT INTO token_mode_values (ds_id, token_path, mode, resolved_value)
        VALUES (
          ${'sys-01'},
          ${'color.secondary'},
          ${'Default'},
          ${'#000000'}
        )
      `;

      const secondResult = await refreshTokenGraphDbOnly({
        systemId: 'sys-01',
        emitChunk,
        sql,
        tokenRepo,
        sha256Text,
      });

      const secondRows = (await sql`
        SELECT graph_json, generated_at
        FROM token_graph
        WHERE ds_id = ${'sys-01'}
      `) as Array<{ graph_json: string; generated_at: Date }>;

      assert.equal(secondResult.ok, true);
      assert.equal(secondRows.length, 1);

      const secondGraph = JSON.parse(secondRows[0].graph_json) as {
        summary: { nodes: number };
        fingerprint: string;
      };
      assert.equal(secondGraph.summary.nodes, 2);
      assert.notEqual(secondGraph.fingerprint, firstGraph.fingerprint);
    } finally {
      await cleanup();
      if (originalSkipChecksums === undefined) {
        delete process.env.SKIP_MIGRATION_CHECKSUMS;
      } else {
        process.env.SKIP_MIGRATION_CHECKSUMS = originalSkipChecksums;
      }
    }
  });
});
