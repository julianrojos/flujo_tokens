-- Migration 026: Add variants_json and tokens_json to component_editorial
-- Supports the edit-component-docs page with variant and token editorial fields.

ALTER TABLE component_editorial ADD COLUMN variants_json TEXT
  CHECK(variants_json IS NULL OR (json_valid(variants_json) AND json_type(variants_json) = 'array'));

ALTER TABLE component_editorial ADD COLUMN tokens_json TEXT
  CHECK(tokens_json IS NULL OR (json_valid(tokens_json) AND json_type(tokens_json) = 'array'));
