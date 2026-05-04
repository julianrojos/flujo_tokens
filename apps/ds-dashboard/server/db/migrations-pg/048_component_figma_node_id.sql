-- Migration 048: Component Figma identity and fingerprint
-- Version: 048
-- PostgreSQL migration

ALTER TABLE components
  ADD COLUMN IF NOT EXISTS figma_node_id TEXT;

ALTER TABLE components
  ADD COLUMN IF NOT EXISTS figma_content_fingerprint TEXT;

UPDATE components
SET figma_node_id = figma_component_set_node_id
WHERE figma_node_id IS NULL
  AND figma_component_set_node_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_components_ds_figma_node_id
  ON components(ds_id, figma_node_id)
  WHERE figma_node_id IS NOT NULL;
