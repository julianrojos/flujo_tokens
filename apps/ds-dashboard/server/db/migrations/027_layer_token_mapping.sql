-- Migration 027: Recreate component_figma_token_bindings for Layer Token Mapping
-- No backward compatibility required: legacy binding rows are discarded.

DROP TABLE IF EXISTS component_figma_token_bindings;

CREATE TABLE component_figma_token_bindings (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  component_id      INTEGER NOT NULL REFERENCES components(id) ON DELETE CASCADE,
  node_id           TEXT NOT NULL,
  node_name         TEXT NOT NULL,
  field             TEXT NOT NULL,
  variable_id       TEXT NOT NULL,
  token_path        TEXT,
  mode              TEXT NOT NULL DEFAULT '',
  run_id            TEXT,
  captured_at       INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  schema_version    INTEGER NOT NULL DEFAULT 1,
  variant_node_id   TEXT NOT NULL DEFAULT '',
  variant_signature TEXT NOT NULL DEFAULT '',
  property_path     TEXT NOT NULL DEFAULT '',
  status            TEXT NOT NULL DEFAULT 'resolved' CHECK (status IN ('resolved', 'unresolved')),
  mode_id           TEXT NOT NULL DEFAULT '',
  mode_name         TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_component_figma_bindings_component_id
  ON component_figma_token_bindings(component_id);
CREATE INDEX IF NOT EXISTS idx_component_figma_bindings_component_run
  ON component_figma_token_bindings(component_id, run_id);
CREATE INDEX IF NOT EXISTS idx_component_figma_bindings_variable_id
  ON component_figma_token_bindings(variable_id);
CREATE INDEX IF NOT EXISTS idx_component_figma_bindings_component_variable
  ON component_figma_token_bindings(component_id, variable_id);
CREATE INDEX IF NOT EXISTS idx_component_figma_bindings_variant_node
  ON component_figma_token_bindings(component_id, variant_node_id);
CREATE INDEX IF NOT EXISTS idx_component_figma_bindings_property_path
  ON component_figma_token_bindings(component_id, property_path);
CREATE INDEX IF NOT EXISTS idx_component_figma_bindings_status
  ON component_figma_token_bindings(component_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS udx_component_figma_bindings_layer_token_mapping
  ON component_figma_token_bindings(component_id, variant_node_id, node_id, property_path, mode_id, variable_id);
