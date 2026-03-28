-- Migration 012: Remove unused token_graph_staging staging table
-- This table was never populated/swap-applied in DB-native sync flow.

DROP INDEX IF EXISTS idx_token_graph_staging_run_id;
DROP TABLE IF EXISTS token_graph_staging;
