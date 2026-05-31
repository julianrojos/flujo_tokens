/**
 * Figma Token Sync Tests
 *
 * Tests for token sync utilities.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildTokenNodeFromFigmaVariable,
  sanitizeCollectionSlug,
  syncFigmaTokensToDatabase,
} from './figma-token-sync.js';
import type { FigmaVariablesResponse } from '../utils/figma.js';

function createVariablesPayload(): FigmaVariablesResponse {
  return {
    meta: {
      variableCollections: {
        'VariableCollectionId:1': {
          id: 'VariableCollectionId:1',
          name: 'Primitives',
          modes: [{ modeId: '1:0', name: 'Mode 1' }],
        },
      },
      variables: {
        'VariableID:1': {
          id: 'VariableID:1',
          name: 'color/brand/primary',
          variableCollectionId: 'VariableCollectionId:1',
          resolvedType: 'COLOR',
          valuesByMode: {
            '1:0': { r: 0.1, g: 0.2, b: 0.3, a: 1 },
          },
        },
      },
    },
  };
}

function createFakeTx(recordedSql: string[]) {
  const fakeTx = Object.assign(
    async (strings: TemplateStringsArray, ..._values: unknown[]) => {
      recordedSql.push(String(strings[0] || '').trim());
      return [];
    },
    {
      unsafe: async (text: string, ..._values: unknown[]) => {
        recordedSql.push(String(text || '').trim());
        return [];
      },
    },
  );
  return fakeTx;
}

describe('figma-token-sync', () => {
  describe('buildTokenNodeFromFigmaVariable()', () => {
    it('FLOAT variables are emitted as dimension tokens', () => {
      const variableRecord = {
        id: 'VariableID:1:2',
        name: 'Blur/100',
        resolvedType: 'FLOAT',
      };
      const token = buildTokenNodeFromFigmaVariable(variableRecord, 8);

      assert.deepStrictEqual(token, {
        $id: 'VariableID:1:2',
        $value: 8,
        $type: 'dimension',
      });
    });

    it('FLOAT font-weight variables are emitted as fontWeight tokens', () => {
      const variableRecord = {
        id: 'VariableID:1:3',
        name: 'Body/Font Weight Regular',
        resolvedType: 'FLOAT',
      };
      const token = buildTokenNodeFromFigmaVariable(variableRecord, 400);

      assert.deepStrictEqual(token, {
        $id: 'VariableID:1:3',
        $value: 400,
        $type: 'fontWeight',
      });
    });

    it('STRING font-family variables are emitted as fontFamily tokens', () => {
      const variableRecord = {
        id: 'VariableID:1:4',
        name: 'Body/Font Family',
        resolvedType: 'STRING',
      };
      const token = buildTokenNodeFromFigmaVariable(variableRecord, 'IBM Plex Sans');

      assert.deepStrictEqual(token, {
        $id: 'VariableID:1:4',
        $value: 'IBM Plex Sans',
        $type: 'fontFamily',
      });
    });
  });

  describe('sanitizeCollectionSlug', () => {
    it('normalizes diacritics in collection names', () => {
      assert.equal(sanitizeCollectionSlug('Tipografía'), 'tipografia');
      assert.equal(sanitizeCollectionSlug('Acción'), 'accion');
      assert.equal(sanitizeCollectionSlug('España'), 'espana');
    });

    it('falls back to imported for empty names', () => {
      assert.equal(sanitizeCollectionSlug(''), 'imported');
      assert.equal(sanitizeCollectionSlug('   '), 'imported');
    });
  });

  describe('syncFigmaTokensToDatabase()', () => {
    it('persists token rows and derived relations into the database', async () => {
      const payload = createVariablesPayload();
      const recordedSql: string[] = [];
      let bootstrapCalls = 0;
      let fetchCalls = 0;

      const fakeTx = createFakeTx(recordedSql);

      const result = await syncFigmaTokensToDatabase({
        system: {
          id: 'demo',
          paths: {
            databaseUrl: 'postgres://demo',
          },
        },
        fileKey: 'dummy',
        source: 'mcp',
        fetchMcpVariablesFn: async () => {
          fetchCalls += 1;
          return payload;
        },
        fetchRestVariablesFn: async () => {
          throw new Error('REST should not be used');
        },
        bootstrapDatabaseFn: async (databaseUrl) => {
          bootstrapCalls += 1;
          assert.equal(databaseUrl, 'postgres://demo');
          return {
            begin: async (handler: (tx: typeof fakeTx) => Promise<void>) => {
              await handler(fakeTx);
            },
            end: async () => undefined,
          } as never;
        },
      });

      assert.equal(fetchCalls, 1);
      assert.equal(bootstrapCalls, 1);
      assert.equal(result.reason, 'persisted');
      assert.equal(result.tokens_written, 1);
      assert.equal(result.tokens_total, 1);
      assert.deepEqual(result.collections, ['Primitives']);
      assert.equal(recordedSql.some((query) => query.startsWith('DELETE FROM tokens')), true);
      assert.equal(recordedSql.some((query) => query.startsWith('INSERT INTO tokens')), true);
      assert.equal(recordedSql.some((query) => query.startsWith('INSERT INTO token_mode_values')), true);
      assert.equal(recordedSql.some((query) => query.startsWith('INSERT INTO token_graph')), true);
    });

    it('emits incremental progress snapshots while persisting token data', async () => {
      const payload = createVariablesPayload();
      const progressSnapshots: Array<{ completed: number; total: number; remaining: number; slug?: string; state: string }> = [];

      const fakeTx = createFakeTx([]);

      const result = await syncFigmaTokensToDatabase({
        system: {
          id: 'demo',
          paths: {
            databaseUrl: 'postgres://demo',
          },
        },
        fileKey: 'dummy',
        source: 'mcp',
        fetchMcpVariablesFn: async () => payload,
        fetchRestVariablesFn: async () => {
          throw new Error('REST should not be used');
        },
        bootstrapDatabaseFn: async () => {
          return {
            begin: async (handler: (tx: typeof fakeTx) => Promise<void>) => {
              await handler(fakeTx);
            },
            end: async () => undefined,
          } as never;
        },
        onProgress: (snapshot) => {
          progressSnapshots.push(snapshot);
        },
      });

      assert.equal(result.reason, 'persisted');
      assert.ok(progressSnapshots.length >= 3);
      assert.equal(progressSnapshots[0]?.state, 'starting');
      assert.equal(progressSnapshots[0]?.completed, 0);
      assert.equal(progressSnapshots[0]?.total, 3);
      assert.equal(progressSnapshots.at(-1)?.state, 'completed');
      assert.equal(progressSnapshots.at(-1)?.completed, 3);
      assert.equal(progressSnapshots.at(-1)?.remaining, 0);
    });

    it('supports dry-run without opening the database', async () => {
      const payload = createVariablesPayload();
      let bootstrapCalls = 0;

      const result = await syncFigmaTokensToDatabase({
        system: {
          id: 'demo',
          paths: {
            databaseUrl: 'postgres://demo',
          },
        },
        fileKey: 'dummy',
        source: 'mcp',
        dryRun: true,
        fetchMcpVariablesFn: async () => payload,
        bootstrapDatabaseFn: async () => {
          bootstrapCalls += 1;
          throw new Error('database should not be opened in dry-run');
        },
      });

      assert.equal(bootstrapCalls, 0);
      assert.equal(result.dryRun, true);
      assert.equal(result.tokens_planned, 1);
      assert.equal(result.collections_planned, 1);
      assert.deepEqual(result.collections, ['Primitives']);
    });

    it('returns a typed failure when databaseUrl is missing', async () => {
      const result = await syncFigmaTokensToDatabase({
        system: {
          id: 'demo',
        },
        fileKey: 'dummy',
        source: 'mcp',
        fetchMcpVariablesFn: async () => createVariablesPayload(),
      });

      assert.equal(result.attempted, false);
      assert.equal(result.reason, 'system-database-url-missing');
    });
  });
});
