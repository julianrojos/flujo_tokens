-- Migration 032: Add behaviour_json to component_editorial
-- Stores authored behavior guidance for the detail and edit-docs flows.

ALTER TABLE component_editorial ADD COLUMN behaviour_json TEXT
  CHECK(behaviour_json IS NULL OR (json_valid(behaviour_json) AND json_type(behaviour_json) = 'text'));
