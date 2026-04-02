-- Migration 021: Component editorial (human-authored) and Figma anatomy/properties
-- component_editorial is created on first PATCH /editorial, NOT during sync.
-- component_figma_anatomy is populated during sync from Figma plugin data.

-- Editorial data (human-authored, created on first edit)
CREATE TABLE IF NOT EXISTS component_editorial (
  component_id            INTEGER PRIMARY KEY REFERENCES components(id) ON DELETE CASCADE,
  summary_json            TEXT CHECK(summary_json IS NULL OR (json_valid(summary_json) AND json_type(summary_json) = 'object')),
  best_practices_json     TEXT CHECK(best_practices_json IS NULL OR (json_valid(best_practices_json) AND json_type(best_practices_json) = 'object')),
  accessibility_json      TEXT CHECK(accessibility_json IS NULL OR (json_valid(accessibility_json) AND json_type(accessibility_json) = 'object')),
  content_guidelines_json TEXT CHECK(content_guidelines_json IS NULL OR (json_valid(content_guidelines_json) AND json_type(content_guidelines_json) = 'object')),
  related_components_json TEXT CHECK(related_components_json IS NULL OR (json_valid(related_components_json) AND json_type(related_components_json) = 'array')),
  token_mapping_json      TEXT CHECK(token_mapping_json IS NULL OR (json_valid(token_mapping_json) AND json_type(token_mapping_json) = 'object')),
  qa_json                 TEXT CHECK(qa_json IS NULL OR (json_valid(qa_json) AND json_type(qa_json) = 'array')),
  updated_at              INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_component_editorial_updated_at
  ON component_editorial(updated_at DESC);

-- Figma anatomy + properties (structural, captured during sync)
CREATE TABLE IF NOT EXISTS component_figma_anatomy (
  component_id    INTEGER PRIMARY KEY REFERENCES components(id) ON DELETE CASCADE,
  anatomy_json    TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(anatomy_json) AND json_type(anatomy_json) = 'array'),
  properties_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(properties_json) AND json_type(properties_json) = 'array'),
  run_id          TEXT,
  captured_at     INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  schema_version  INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_component_figma_anatomy_component_id
  ON component_figma_anatomy(component_id);

CREATE INDEX IF NOT EXISTS idx_component_figma_anatomy_run
  ON component_figma_anatomy(run_id);
