/**
 * Embedding Repository Tests
 *
 * Tests for vector embedding operations with pgvector.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import type { Sql } from 'postgres';
import { createTestDatabase } from './test-db-helpers.js';
import { EmbeddingRepository } from './embedding-repository.js';

const EMBEDDING_DIMENSIONS = 1536;

function vec(...seed: number[]): number[] {
  if (seed.length > EMBEDDING_DIMENSIONS) {
    return seed.slice(0, EMBEDDING_DIMENSIONS);
  }
  return [...seed, ...new Array(EMBEDDING_DIMENSIONS - seed.length).fill(0)];
}

describe('EmbeddingRepository', () => {
  let sql: Sql | null = null;
  let repo: EmbeddingRepository | null = null;
  let cleanup: (() => Promise<void>) | null = null;

  beforeEach(async () => {
    try {
      const testDb = await createTestDatabase();
      sql = testDb.sql;
      cleanup = testDb.cleanup;
      repo = new EmbeddingRepository(sql);
    } catch (error) {
      if (error instanceof Error && error.message.includes('ECONNREFUSED')) {
        throw new Error(
          'PostgreSQL not available. Set DATABASE_URL to run these tests.',
        );
      }
      throw error;
    }
  });

  afterEach(async () => {
    if (cleanup) {
      await cleanup();
      cleanup = null;
    }
    sql = null;
    repo = null;
  });

  describe('upsertChunk()', () => {
    it('inserts a new chunk', async () => {
      if (!repo) return;
      const chunk = {
        dsId: 'ds-1',
        entityType: 'token' as const,
        entityId: 'token-1',
        chunkIndex: 0,
        content: 'primary: #ffffff',
        embedding: vec(0.1, 0.2, 0.3),
      };
      await repo.upsertChunk(chunk);
      const count = await repo.getChunkCount('ds-1', 'token');
      assert.strictEqual(count, 1);
    });

    it('updates existing chunk on conflict', async () => {
      if (!repo) return;
      const chunk = {
        dsId: 'ds-1',
        entityType: 'token' as const,
        entityId: 'token-1',
        chunkIndex: 0,
        content: 'primary: #ffffff',
        embedding: vec(0.1, 0.2, 0.3),
      };
      await repo.upsertChunk(chunk);

      const updatedChunk = {
        dsId: 'ds-1',
        entityType: 'token' as const,
        entityId: 'token-1',
        chunkIndex: 0,
        content: 'primary: #000000',
        embedding: vec(0.4, 0.5, 0.6),
      };
      await repo.upsertChunk(updatedChunk);

      const count = await repo.getChunkCount('ds-1', 'token');
      assert.strictEqual(count, 1);
    });

    it('handles optional fields', async () => {
      if (!repo) return;
      const chunk = {
        dsId: 'ds-1',
        entityType: 'component' as const,
        entityId: 'btn-1',
        chunkIndex: 0,
        content: '<Button>Click</Button>',
        collection: 'buttons',
        docType: 'react',
        embedding: vec(0.7, 0.8, 0.9),
      };
      await repo.upsertChunk(chunk);
      const count = await repo.getChunkCount('ds-1', 'component');
      assert.strictEqual(count, 1);
    });
  });

  describe('upsertChunks()', () => {
    it('inserts multiple chunks', async () => {
      if (!repo) return;
      const chunks = [
        {
          dsId: 'ds-1',
          entityType: 'token' as const,
          entityId: 'token-1',
          chunkIndex: 0,
          content: 'chunk 1',
          embedding: vec(0.1, 0.2, 0.3),
        },
        {
          dsId: 'ds-1',
          entityType: 'token' as const,
          entityId: 'token-2',
          chunkIndex: 0,
          content: 'chunk 2',
          embedding: vec(0.4, 0.5, 0.6),
        },
      ];
      await repo.upsertChunks(chunks);
      const count = await repo.getChunkCount('ds-1');
      assert.strictEqual(count, 2);
    });
  });

  describe('searchSimilar()', () => {
    it('finds similar chunks by cosine distance', async () => {
      if (!repo) return;
      const chunks = [
        {
          dsId: 'ds-1',
          entityType: 'token' as const,
          entityId: 'token-red',
          chunkIndex: 0,
          content: 'red color',
          embedding: vec(1, 0, 0),
        },
        {
          dsId: 'ds-1',
          entityType: 'token' as const,
          entityId: 'token-blue',
          chunkIndex: 0,
          content: 'blue color',
          embedding: vec(0, 1, 0),
        },
      ];
      await repo.upsertChunks(chunks);

      const results = await repo.searchSimilar({
        dsId: 'ds-1',
        queryEmbedding: vec(0.9, 0.1, 0),
        limit: 2,
      });

      assert.ok(results.length > 0);
      assert.strictEqual(results[0].entityId, 'token-red');
      assert.ok(results[0].similarity > results[1].similarity);
      assert.ok(results[0].similarity > 0.98);
      assert.ok(results[1].similarity < results[0].similarity);
    });

    it('filters by entity type', async () => {
      if (!repo) return;
      const chunks = [
        {
          dsId: 'ds-1',
          entityType: 'token' as const,
          entityId: 'token-1',
          chunkIndex: 0,
          content: 'token content',
          embedding: vec(0.1, 0.2, 0.3),
        },
        {
          dsId: 'ds-1',
          entityType: 'component' as const,
          entityId: 'comp-1',
          chunkIndex: 0,
          content: 'component content',
          embedding: vec(0.4, 0.5, 0.6),
        },
      ];
      await repo.upsertChunks(chunks);

      const results = await repo.searchSimilar({
        dsId: 'ds-1',
        entityType: 'component',
        queryEmbedding: vec(0.4, 0.5, 0.6),
        limit: 10,
      });

      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].entityType, 'component');
    });

    it('filters by doc type', async () => {
      if (!repo) return;
      const chunks = [
        {
          dsId: 'ds-1',
          entityType: 'doc' as const,
          entityId: 'doc-1',
          chunkIndex: 0,
          content: 'react docs content',
          docType: 'react',
          embedding: vec(0.2, 0.3, 0.4),
        },
        {
          dsId: 'ds-1',
          entityType: 'doc' as const,
          entityId: 'doc-2',
          chunkIndex: 0,
          content: 'figma docs content',
          docType: 'figma',
          embedding: vec(0.9, 0.1, 0.1),
        },
      ];
      await repo.upsertChunks(chunks);

      const results = await repo.searchSimilar({
        dsId: 'ds-1',
        entityType: 'doc',
        docType: 'figma',
        queryEmbedding: vec(0.9, 0.1, 0.1),
        limit: 10,
      });

      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].docType, 'figma');
      assert.strictEqual(results[0].entityId, 'doc-2');
    });
  });

  describe('deleteChunksByEntity()', () => {
    it('deletes chunks for specific entity', async () => {
      if (!repo) return;
      const chunks = [
        {
          dsId: 'ds-1',
          entityType: 'token' as const,
          entityId: 'token-1',
          chunkIndex: 0,
          content: 'chunk',
          embedding: vec(0.1, 0.2, 0.3),
        },
      ];
      await repo.upsertChunks(chunks);

      const deleted = await repo.deleteChunksByEntity(
        'ds-1',
        'token',
        'token-1',
      );
      assert.strictEqual(deleted, 1);

      const count = await repo.getChunkCount('ds-1', 'token');
      assert.strictEqual(count, 0);
    });
  });

  describe('deleteChunksByDs()', () => {
    it('deletes all chunks for design system', async () => {
      if (!repo) return;
      const chunks = [
        {
          dsId: 'ds-1',
          entityType: 'token' as const,
          entityId: 'token-1',
          chunkIndex: 0,
          content: 'chunk 1',
          embedding: vec(0.1, 0.2, 0.3),
        },
        {
          dsId: 'ds-1',
          entityType: 'component' as const,
          entityId: 'comp-1',
          chunkIndex: 0,
          content: 'chunk 2',
          embedding: vec(0.4, 0.5, 0.6),
        },
      ];
      await repo.upsertChunks(chunks);

      const deleted = await repo.deleteChunksByDs('ds-1');
      assert.strictEqual(deleted, 2);

      const count = await repo.getChunkCount('ds-1');
      assert.strictEqual(count, 0);
    });
  });

  describe('getChunkCount()', () => {
    it('returns correct count', async () => {
      if (!repo) return;
      const chunks = [
        {
          dsId: 'ds-1',
          entityType: 'token' as const,
          entityId: 'token-1',
          chunkIndex: 0,
          content: 'chunk',
          embedding: vec(0.1, 0.2, 0.3),
        },
      ];
      await repo.upsertChunks(chunks);

      const count = await repo.getChunkCount('ds-1', 'token');
      assert.strictEqual(count, 1);
    });

    it('returns 0 for non-existent ds', async () => {
      if (!repo) return;
      const count = await repo.getChunkCount('non-existent');
      assert.strictEqual(count, 0);
    });
  });
});
