/**
 * Embedding Repository
 *
 * PostgreSQL-backed repository for vector embeddings (RAG on tokens/components/docs).
 */

import type { Sql } from 'postgres';

export interface DocumentChunk {
  id?: number;
  dsId: string;
  entityType: 'token' | 'component' | 'doc';
  entityId: string;
  chunkIndex: number;
  content: string;
  collection?: string;
  docType?: string;
  capturedAt?: Date;
  embedding: number[];
  meta?: Record<string, unknown>;
}

export interface SearchSimilarOptions {
  dsId: string;
  entityType?: string;
  docType?: string;
  queryEmbedding: number[];
  limit?: number;
}

export interface DocumentChunkResult {
  id: number;
  dsId: string;
  entityType: string;
  entityId: string;
  chunkIndex: number;
  content: string;
  collection?: string;
  docType?: string;
  capturedAt?: Date;
  meta?: Record<string, unknown>;
  similarity: number;
}

export class EmbeddingRepository {
  constructor(private sql: Sql) {}

  private static toVectorLiteral(values: number[]): string {
    if (!Array.isArray(values) || values.length === 0) {
      throw new Error('Embedding vector must be a non-empty number array');
    }
    const serialized = values.map((value) => {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) {
        throw new Error(`Embedding contains non-finite value: ${value}`);
      }
      return String(numeric);
    });
    return `[${serialized.join(',')}]`;
  }

  async upsertChunk(chunk: DocumentChunk): Promise<void> {
    await this.upsertChunks([chunk]);
  }

  async upsertChunks(chunks: DocumentChunk[]): Promise<void> {
    if (chunks.length === 0) {
      return;
    }

    const dsIds = chunks.map((chunk) => chunk.dsId);
    const entityTypes = chunks.map((chunk) => chunk.entityType);
    const entityIds = chunks.map((chunk) => chunk.entityId);
    const chunkIndices = chunks.map((chunk) => chunk.chunkIndex);
    const contents = chunks.map((chunk) => chunk.content);
    const collections = chunks.map((chunk) => chunk.collection ?? null);
    const docTypes = chunks.map((chunk) => chunk.docType ?? null);
    const capturedAts = chunks.map((chunk) =>
      chunk.capturedAt ? chunk.capturedAt.toISOString() : null,
    );
    const embeddings = chunks.map((chunk) =>
      EmbeddingRepository.toVectorLiteral(chunk.embedding),
    );
    const metas = chunks.map((chunk) =>
      chunk.meta ? JSON.stringify(chunk.meta) : null,
    );

    await this.sql.begin(async (tx) => {
      await tx`
        INSERT INTO document_chunks (
          ds_id, entity_type, entity_id, chunk_index, content,
          collection, doc_type, captured_at, embedding, meta
        )
        SELECT
          ds_id,
          entity_type,
          entity_id,
          chunk_index,
          content,
          collection,
          doc_type,
          captured_at,
          embedding_text::vector,
          meta
        FROM unnest(
          ${this.sql.array(dsIds)}::text[],
          ${this.sql.array(entityTypes)}::text[],
          ${this.sql.array(entityIds)}::text[],
          ${this.sql.array(chunkIndices)}::int[],
          ${this.sql.array(contents)}::text[],
          ${this.sql.array(collections)}::text[],
          ${this.sql.array(docTypes)}::text[],
          ${this.sql.array(capturedAts)}::timestamptz[],
          ${this.sql.array(embeddings)}::text[],
          ${this.sql.array(metas)}::jsonb[]
        ) AS t(
          ds_id,
          entity_type,
          entity_id,
          chunk_index,
          content,
          collection,
          doc_type,
          captured_at,
          embedding_text,
          meta
        )
        ON CONFLICT (ds_id, entity_type, entity_id, chunk_index) DO UPDATE SET
          content = EXCLUDED.content,
          collection = EXCLUDED.collection,
          doc_type = EXCLUDED.doc_type,
          captured_at = EXCLUDED.captured_at,
          embedding = EXCLUDED.embedding,
          meta = EXCLUDED.meta
      `;
    });
  }

  async searchSimilar(
    options: SearchSimilarOptions,
  ): Promise<DocumentChunkResult[]> {
    const { dsId, entityType, docType, queryEmbedding, limit = 10 } = options;
    const queryVector = EmbeddingRepository.toVectorLiteral(queryEmbedding);

    const rows = (await this.sql`
      SELECT
        id, ds_id, entity_type, entity_id, chunk_index, content,
        collection, doc_type, captured_at, meta,
        1 - (embedding <=> ${queryVector}::vector) as similarity
      FROM document_chunks
      WHERE ds_id = ${dsId}
      ${entityType ? this.sql`AND entity_type = ${entityType}` : this.sql``}
      ${docType ? this.sql`AND doc_type = ${docType}` : this.sql``}
      ORDER BY embedding <=> ${queryVector}::vector
      LIMIT ${limit}
    `) as Array<{
      id: number | string;
      ds_id: string;
      entity_type: string;
      entity_id: string;
      chunk_index: number | string;
      content: string;
      collection: string | null;
      doc_type: string | null;
      captured_at: Date | null;
      meta: Record<string, unknown> | null;
      similarity: number | string;
    }>;

    return rows.map((row) => ({
      id: Number(row.id),
      dsId: row.ds_id,
      entityType: row.entity_type,
      entityId: row.entity_id,
      chunkIndex: Number(row.chunk_index),
      content: row.content,
      collection: row.collection ?? undefined,
      docType: row.doc_type ?? undefined,
      capturedAt: row.captured_at ?? undefined,
      meta: row.meta ?? undefined,
      similarity: Number(row.similarity),
    }));
  }

  async deleteChunksByEntity(
    dsId: string,
    entityType: string,
    entityId: string,
  ): Promise<number> {
    const result = await this.sql`
      DELETE FROM document_chunks
      WHERE ds_id = ${dsId} AND entity_type = ${entityType} AND entity_id = ${entityId}
    `;
    return result.count ?? 0;
  }

  async deleteChunksByDs(dsId: string): Promise<number> {
    const result = await this.sql`
      DELETE FROM document_chunks WHERE ds_id = ${dsId}
    `;
    return result.count ?? 0;
  }

  async getChunkCount(dsId: string, entityType?: string): Promise<number> {
    const rows = entityType
      ? ((await this.sql`
        SELECT COUNT(*) as count FROM document_chunks
        WHERE ds_id = ${dsId} AND entity_type = ${entityType}
      `) as Array<{ count: number | string }>)
      : ((await this.sql`
        SELECT COUNT(*) as count FROM document_chunks WHERE ds_id = ${dsId}
      `) as Array<{ count: number | string }>);
    return Number(rows[0]?.count ?? 0);
  }
}
