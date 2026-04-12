-- Migration 029: Add top-level spec properties to component_editorial
-- Enables editing the same Properties table currently shown on component detail.

ALTER TABLE component_editorial ADD COLUMN properties_json TEXT
  CHECK(properties_json IS NULL OR (json_valid(properties_json) AND json_type(properties_json) = 'array'));
