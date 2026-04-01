-- Add rich metadata columns for component visual proofs
ALTER TABLE component_visual_proofs ADD COLUMN captured_at TEXT;
ALTER TABLE component_visual_proofs ADD COLUMN node_id TEXT;
ALTER TABLE component_visual_proofs ADD COLUMN image_sha256 TEXT;
ALTER TABLE component_visual_proofs ADD COLUMN image_bytes INTEGER;
ALTER TABLE component_visual_proofs ADD COLUMN image_content_type TEXT;
ALTER TABLE component_visual_proofs ADD COLUMN image_width INTEGER;
ALTER TABLE component_visual_proofs ADD COLUMN image_height INTEGER;
ALTER TABLE component_visual_proofs ADD COLUMN variants_count INTEGER;
ALTER TABLE component_visual_proofs ADD COLUMN variants_json TEXT;
