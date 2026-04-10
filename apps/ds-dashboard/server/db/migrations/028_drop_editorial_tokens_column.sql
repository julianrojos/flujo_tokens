-- Migration 028: Remove legacy editorial tokens column from component_editorial
-- Tokens remain part of imported design-system/runtime token tables and Figma capture.
-- This only removes the dead editorial column from the edit-docs flow.

ALTER TABLE component_editorial RENAME TO component_editorial_old;

CREATE TABLE component_editorial (
  component_id             INTEGER PRIMARY KEY REFERENCES components(id) ON DELETE CASCADE,
  summary_json             TEXT CHECK(summary_json IS NULL OR (json_valid(summary_json) AND json_type(summary_json) = 'object')),
  best_practices_json      TEXT CHECK(best_practices_json IS NULL OR (json_valid(best_practices_json) AND json_type(best_practices_json) = 'object')),
  accessibility_json       TEXT CHECK(accessibility_json IS NULL OR (json_valid(accessibility_json) AND json_type(accessibility_json) = 'object')),
  content_guidelines_json  TEXT CHECK(content_guidelines_json IS NULL OR (json_valid(content_guidelines_json) AND json_type(content_guidelines_json) = 'object')),
  related_components_json  TEXT CHECK(related_components_json IS NULL OR (json_valid(related_components_json) AND json_type(related_components_json) = 'array')),
  token_mapping_json       TEXT CHECK(token_mapping_json IS NULL OR (json_valid(token_mapping_json) AND json_type(token_mapping_json) = 'object')),
  qa_json                  TEXT CHECK(qa_json IS NULL OR (json_valid(qa_json) AND json_type(qa_json) = 'array')),
  accessibility_notes_json TEXT CHECK(accessibility_notes_json IS NULL OR (json_valid(accessibility_notes_json) AND json_type(accessibility_notes_json) = 'array')),
  variants_json            TEXT CHECK(variants_json IS NULL OR (json_valid(variants_json) AND json_type(variants_json) = 'array')),
  updated_at               INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

INSERT INTO component_editorial (
  component_id,
  summary_json,
  best_practices_json,
  accessibility_json,
  content_guidelines_json,
  related_components_json,
  token_mapping_json,
  qa_json,
  accessibility_notes_json,
  variants_json,
  updated_at
)
SELECT
  component_id,
  summary_json,
  best_practices_json,
  accessibility_json,
  content_guidelines_json,
  related_components_json,
  token_mapping_json,
  qa_json,
  accessibility_notes_json,
  variants_json,
  updated_at
FROM component_editorial_old;

DROP TABLE component_editorial_old;

CREATE INDEX IF NOT EXISTS idx_component_editorial_updated_at
  ON component_editorial(updated_at DESC);
