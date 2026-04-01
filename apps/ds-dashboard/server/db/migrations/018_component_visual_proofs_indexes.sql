-- Improve component visual proof read performance for by-component scans and latest-first ordering.
CREATE INDEX IF NOT EXISTS idx_component_visual_proofs_component_id
  ON component_visual_proofs(component_id);

CREATE INDEX IF NOT EXISTS idx_component_visual_proofs_component_captured
  ON component_visual_proofs(component_id, captured_at DESC);
