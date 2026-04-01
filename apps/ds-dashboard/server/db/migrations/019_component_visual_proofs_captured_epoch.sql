-- Add numeric epoch for deterministic and efficient latest-first ordering.
ALTER TABLE component_visual_proofs ADD COLUMN captured_at_epoch INTEGER;

-- Backfill from captured_at where possible.
UPDATE component_visual_proofs
SET captured_at_epoch = CAST(strftime('%s', captured_at) AS INTEGER)
WHERE captured_at_epoch IS NULL
  AND captured_at IS NOT NULL
  AND TRIM(captured_at) != '';

-- Replace captured ordering index to prioritize numeric epoch.
DROP INDEX IF EXISTS idx_component_visual_proofs_component_captured;
CREATE INDEX IF NOT EXISTS idx_component_visual_proofs_component_captured
  ON component_visual_proofs(component_id, captured_at_epoch DESC, captured_at DESC);
