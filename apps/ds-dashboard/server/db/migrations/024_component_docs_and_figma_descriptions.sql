-- Add DB-first docs storage and Figma description fields.
-- Required by:
-- - component_docs persistence on AI apply
-- - Figma descriptions rendering in preview/detail/docs modal

-- Components: store component-set description sync metadata
ALTER TABLE components ADD COLUMN figma_description TEXT;
ALTER TABLE components ADD COLUMN figma_descriptions_synced_at INTEGER;

-- Variants: store canonical key + variant description from Figma
ALTER TABLE component_figma_variants ADD COLUMN canonical_key TEXT;
ALTER TABLE component_figma_variants ADD COLUMN description TEXT;

-- DB-first applied docs storage (one active doc per component)
CREATE TABLE IF NOT EXISTS component_docs (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  component_id   INTEGER NOT NULL REFERENCES components(id) ON DELETE CASCADE,
  output_json    TEXT NOT NULL CHECK(json_valid(output_json)),
  editorial_json TEXT CHECK(editorial_json IS NULL OR json_valid(editorial_json)),
  job_id         TEXT,
  applied_at     INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  UNIQUE(component_id)
);
