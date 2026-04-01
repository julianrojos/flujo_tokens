-- Migration 016: add composite index for token usage access patterns
-- Improves queries filtered by ds_id and grouped or filtered by token_id/kind.

CREATE INDEX IF NOT EXISTS idx_token_usage_occurrences_ds_token_kind
ON token_usage_occurrences(ds_id, token_id, kind);
