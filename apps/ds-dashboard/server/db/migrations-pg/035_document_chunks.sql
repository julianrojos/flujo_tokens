-- Migration 035: Document chunks for vector embeddings (RAG)
-- Version: 035
-- PostgreSQL migration
--
-- IMPORTANT: The embedding column uses vector(1536) which must match EMBEDDING_DIMENSIONS
-- in your environment. If you change EMBEDDING_DIMENSIONS from the default (1536), you must
-- recreate this table: TRUNCATE document_chunks; DROP TABLE document_chunks; (then rerun migration)

-- document_chunks: Vector embeddings for RAG on tokens/components/docs
CREATE TABLE document_chunks (
  id           BIGSERIAL PRIMARY KEY,
  ds_id        TEXT NOT NULL,
  entity_type  TEXT NOT NULL,
  entity_id    TEXT NOT NULL,
  chunk_index  INT  NOT NULL,
  content      TEXT NOT NULL,
  collection   TEXT,
  doc_type     TEXT,
  captured_at  TIMESTAMPTZ,
  embedding    vector(1536) NOT NULL,
  meta         JSONB,
  UNIQUE (ds_id, entity_type, entity_id, chunk_index)
);

-- HNSW index for approximate nearest neighbor search
CREATE INDEX ON document_chunks USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Indexes for filtering
CREATE INDEX ON document_chunks (ds_id, entity_type, doc_type);
