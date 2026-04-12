-- Migration 034: Hard cut properties — Figma capture becomes source of truth
-- 1. Remove properties_json from component_editorial (no longer editorial)
-- 2. Create component_figma_props table for captured properties (snapshot: 1 row per property per component)

-- 1. Drop properties_json from component_editorial
-- Need to handle columns that may or may not exist depending on migration path
-- (behaviour_json added in 032, variants_json in 026, accessibility_notes_json in 033)

-- Recreate table with canonical columns (Migration 032 already added behaviour_json)
CREATE TABLE component_editorial_new (
  component_id            INTEGER PRIMARY KEY REFERENCES components(id) ON DELETE CASCADE,
  summary_json            TEXT CHECK(summary_json IS NULL OR (json_valid(summary_json) AND json_type(summary_json) = 'object')),
  behaviour_json          TEXT CHECK(behaviour_json IS NULL OR (json_valid(behaviour_json) AND json_type(behaviour_json) = 'text')),
  accessibility_json      TEXT CHECK(accessibility_json IS NULL OR (json_valid(accessibility_json) AND json_type(accessibility_json) = 'object')),
  content_guidelines_json TEXT CHECK(content_guidelines_json IS NULL OR (json_valid(content_guidelines_json) AND json_type(content_guidelines_json) = 'object')),
  qa_json                 TEXT CHECK(qa_json IS NULL OR (json_valid(qa_json) AND json_type(qa_json) = 'array')),
  accessibility_notes_json TEXT CHECK(accessibility_notes_json IS NULL OR (json_valid(accessibility_notes_json) AND json_type(accessibility_notes_json) = 'array')),
  variants_json           TEXT CHECK(variants_json IS NULL OR (json_valid(variants_json) AND json_type(variants_json) = 'array')),
  updated_at              INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- Copy data using subquery for potentially missing columns
INSERT INTO component_editorial_new (
  component_id, summary_json, behaviour_json, accessibility_json,
  content_guidelines_json, qa_json, accessibility_notes_json, variants_json, updated_at
)
SELECT
  component_id, summary_json,
  (SELECT behaviour_json FROM component_editorial ce2 WHERE ce2.component_id = component_editorial.component_id),
  accessibility_json,
  content_guidelines_json, qa_json, accessibility_notes_json, variants_json, updated_at
FROM component_editorial;

DROP TABLE component_editorial;
ALTER TABLE component_editorial_new RENAME TO component_editorial;

CREATE INDEX IF NOT EXISTS idx_component_editorial_updated_at
  ON component_editorial(updated_at DESC);

-- 2. Create component_figma_props table for captured properties
CREATE TABLE IF NOT EXISTS component_figma_props (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  component_id     INTEGER NOT NULL REFERENCES components(id) ON DELETE CASCADE,
  prop_name        TEXT NOT NULL,
  prop_type        TEXT NOT NULL CHECK (prop_type IN ('enum', 'text', 'boolean', 'instance_swap', 'slot')),
  prop_values_json TEXT,                             -- JSON array of string values (for enum types)
  prop_default     TEXT,                             -- JSON-encoded default value
  prop_required    INTEGER NOT NULL DEFAULT 0 CHECK (prop_required IN (0, 1)),
  prop_description TEXT NOT NULL DEFAULT '',
  run_id           TEXT,
  captured_at      INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  schema_version   INTEGER NOT NULL DEFAULT 1,
  UNIQUE(component_id, prop_name)
);

CREATE INDEX IF NOT EXISTS idx_component_figma_props_component_id
  ON component_figma_props(component_id);
CREATE INDEX IF NOT EXISTS idx_component_figma_props_component_run
  ON component_figma_props(component_id, run_id);
