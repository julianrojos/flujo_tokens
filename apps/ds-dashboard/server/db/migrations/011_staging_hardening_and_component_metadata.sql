-- Migration 011: Staging hardening + component metadata enrichment
-- - Add tenant scope (ds_id) to staging tables for safer concurrent runs
-- - Add Figma metadata columns to components and visual proofs

-- ============================================================================
-- Staging hardening: add ds_id columns
-- ============================================================================
ALTER TABLE tokens_staging ADD COLUMN ds_id TEXT;
ALTER TABLE token_mode_values_staging ADD COLUMN ds_id TEXT;
ALTER TABLE token_usage_occurrences_staging ADD COLUMN ds_id TEXT;
ALTER TABLE figma_aliases_staging ADD COLUMN ds_id TEXT;

CREATE INDEX IF NOT EXISTS idx_tokens_staging_ds_run ON tokens_staging(ds_id, run_id);
CREATE INDEX IF NOT EXISTS idx_token_mode_values_staging_ds_run ON token_mode_values_staging(ds_id, run_id);
CREATE INDEX IF NOT EXISTS idx_token_usage_occurrences_staging_ds_run ON token_usage_occurrences_staging(ds_id, run_id);
CREATE INDEX IF NOT EXISTS idx_figma_aliases_staging_ds_run ON figma_aliases_staging(ds_id, run_id);

-- ============================================================================
-- Component metadata enrichment
-- ============================================================================
ALTER TABLE components ADD COLUMN figma_file_url TEXT;
ALTER TABLE components ADD COLUMN figma_component_set_node_id TEXT;
ALTER TABLE component_visual_proofs ADD COLUMN screenshot_url TEXT;

