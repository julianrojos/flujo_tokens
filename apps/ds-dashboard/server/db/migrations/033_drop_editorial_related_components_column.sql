-- Migration 033: Drop legacy related_components_json from component_editorial
-- related_components is no longer part of the editorial contract or AI pipeline.

ALTER TABLE component_editorial RENAME TO component_editorial_old_033;

CREATE TABLE component_editorial (
  component_id            INTEGER PRIMARY KEY REFERENCES components(id) ON DELETE CASCADE,
  summary_json            TEXT CHECK(summary_json IS NULL OR (json_valid(summary_json) AND json_type(summary_json) = 'object')),
  properties_json         TEXT CHECK(properties_json IS NULL OR (json_valid(properties_json) AND json_type(properties_json) = 'array')),
  behaviour_json          TEXT CHECK(behaviour_json IS NULL OR (json_valid(behaviour_json) AND json_type(behaviour_json) = 'text')),
  accessibility_json      TEXT CHECK(accessibility_json IS NULL OR (json_valid(accessibility_json) AND json_type(accessibility_json) = 'object')),
  content_guidelines_json TEXT CHECK(content_guidelines_json IS NULL OR (json_valid(content_guidelines_json) AND json_type(content_guidelines_json) = 'object')),
  qa_json                 TEXT CHECK(qa_json IS NULL OR (json_valid(qa_json) AND json_type(qa_json) = 'array')),
  accessibility_notes_json TEXT CHECK(accessibility_notes_json IS NULL OR (json_valid(accessibility_notes_json) AND json_type(accessibility_notes_json) = 'array')),
  variants_json           TEXT CHECK(variants_json IS NULL OR (json_valid(variants_json) AND json_type(variants_json) = 'array')),
  updated_at              INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

INSERT INTO component_editorial (
  component_id,
  summary_json,
  properties_json,
  behaviour_json,
  accessibility_json,
  content_guidelines_json,
  qa_json,
  accessibility_notes_json,
  variants_json,
  updated_at
)
SELECT
  component_id,
  summary_json,
  properties_json,
  behaviour_json,
  accessibility_json,
  content_guidelines_json,
  qa_json,
  accessibility_notes_json,
  variants_json,
  updated_at
FROM component_editorial_old_033;

DROP TABLE component_editorial_old_033;

CREATE INDEX IF NOT EXISTS idx_component_editorial_updated_at
  ON component_editorial(updated_at DESC);
