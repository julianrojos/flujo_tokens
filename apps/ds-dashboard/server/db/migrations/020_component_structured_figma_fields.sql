-- Structured Figma persistence (DB-first)
-- No legacy JSON blobs in components. Repeating structures are normalized in child tables.

-- Scalar metadata kept in parent row
ALTER TABLE components ADD COLUMN figma_page_name TEXT;
CREATE INDEX IF NOT EXISTS idx_components_ds_id_page_name ON components(ds_id, figma_page_name);

-- Component variants captured from Figma component set variants
CREATE TABLE IF NOT EXISTS component_figma_variants (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  component_id     INTEGER NOT NULL REFERENCES components(id) ON DELETE CASCADE,
  variant_name     TEXT NOT NULL,
  node_id          TEXT NOT NULL DEFAULT '',
  properties_json  TEXT NOT NULL DEFAULT '{}' CHECK (
    json_valid(properties_json) AND json_type(properties_json) = 'object'
  ),
  run_id           TEXT,
  captured_at      INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  schema_version   INTEGER NOT NULL DEFAULT 1,
  UNIQUE(component_id, variant_name, node_id)
);
CREATE INDEX IF NOT EXISTS idx_component_figma_variants_component_id
  ON component_figma_variants(component_id);
CREATE INDEX IF NOT EXISTS idx_component_figma_variants_component_run
  ON component_figma_variants(component_id, run_id);

-- Raw token bindings from Figma nodes (evidence-level, non-editorial)
CREATE TABLE IF NOT EXISTS component_figma_token_bindings (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  component_id     INTEGER NOT NULL REFERENCES components(id) ON DELETE CASCADE,
  node_id          TEXT NOT NULL,
  node_name        TEXT NOT NULL,
  field            TEXT NOT NULL,
  variable_id      TEXT NOT NULL,
  token_path       TEXT,
  mode             TEXT NOT NULL DEFAULT '',
  run_id           TEXT,
  captured_at      INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  schema_version   INTEGER NOT NULL DEFAULT 1,
  UNIQUE(component_id, node_id, field, variable_id, mode)
);
CREATE INDEX IF NOT EXISTS idx_component_figma_bindings_component_id
  ON component_figma_token_bindings(component_id);
CREATE INDEX IF NOT EXISTS idx_component_figma_bindings_component_run
  ON component_figma_token_bindings(component_id, run_id);
CREATE INDEX IF NOT EXISTS idx_component_figma_bindings_variable_id
  ON component_figma_token_bindings(variable_id);
CREATE INDEX IF NOT EXISTS idx_component_figma_bindings_component_variable
  ON component_figma_token_bindings(component_id, variable_id);

-- Flattened layout rows derived from anatomy tree
CREATE TABLE IF NOT EXISTS component_figma_layout_rows (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  component_id     INTEGER NOT NULL REFERENCES components(id) ON DELETE CASCADE,
  node_id          TEXT NOT NULL,
  node_name        TEXT NOT NULL,
  depth            INTEGER NOT NULL DEFAULT 0,
  direction        TEXT,
  h_sizing         TEXT,
  v_sizing         TEXT,
  alignment_h      TEXT,
  alignment_v      TEXT,
  item_spacing     REAL,
  padding_top      REAL,
  padding_right    REAL,
  padding_bottom   REAL,
  padding_left     REAL,
  run_id           TEXT,
  captured_at      INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  schema_version   INTEGER NOT NULL DEFAULT 1,
  UNIQUE(component_id, node_id)
);
CREATE INDEX IF NOT EXISTS idx_component_figma_layout_component_id
  ON component_figma_layout_rows(component_id);
CREATE INDEX IF NOT EXISTS idx_component_figma_layout_component_run
  ON component_figma_layout_rows(component_id, run_id);
