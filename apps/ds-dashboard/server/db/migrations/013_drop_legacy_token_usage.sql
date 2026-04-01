-- Migration 013: Drop legacy token_usage table
-- token_usage_occurrences is the canonical DB-native source for token usage.

DROP INDEX IF EXISTS idx_token_usage_token_path;
DROP INDEX IF EXISTS idx_token_usage_kind;
DROP TABLE IF EXISTS token_usage;
