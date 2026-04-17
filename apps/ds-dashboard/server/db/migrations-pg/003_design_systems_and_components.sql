-- Migration 003: Consolidated design systems and components schema
-- Version: 003
-- Key difference from legacy SQLite schema: consolidates migrations 003-034 plus 036, with NO staging tables and ON CONFLICT DO UPDATE instead

-- design_systems: Multi-tenant design system configurations
CREATE TABLE design_systems (
  id                              TEXT PRIMARY KEY,
  name                            TEXT NOT NULL,
  app_name                        TEXT,
  figma_file_id                   TEXT,
  figma_api_token                 TEXT,
  collections                     TEXT,
  compile_variables_on_capture    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_design_systems_name ON design_systems(name);

-- app_settings: Application-level settings
CREATE TABLE app_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_app_settings_key ON app_settings(key);

-- token_mode_values: Multi-mode token values
CREATE TABLE token_mode_values (
  id              BIGSERIAL PRIMARY KEY,
  ds_id           TEXT NOT NULL REFERENCES design_systems(id) ON DELETE CASCADE,
  token_path      TEXT NOT NULL,
  mode            TEXT NOT NULL,
  resolved_value  TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(ds_id, token_path, mode)
);

CREATE INDEX idx_token_mode_values_ds_id ON token_mode_values(ds_id);
CREATE INDEX idx_token_mode_values_token_path ON token_mode_values(token_path);
CREATE INDEX idx_token_mode_values_mode ON token_mode_values(mode);
CREATE INDEX idx_token_mode_values_ds_token ON token_mode_values(ds_id, token_path);
CREATE INDEX idx_token_mode_values_ds_token_mode ON token_mode_values(ds_id, token_path, mode);

-- components: Component registry entries
CREATE TABLE components (
  id              BIGSERIAL PRIMARY KEY,
  ds_id           TEXT NOT NULL REFERENCES design_systems(id) ON DELETE CASCADE,
  slug            TEXT NOT NULL,
  name            TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ready', 'needs-review', 'missing')),
  doc_type        TEXT NOT NULL DEFAULT 'component' CHECK (doc_type IN ('component', 'pattern', 'guideline')),
  figma_file_url  TEXT,
  figma_component_set_node_id TEXT,
  figma_page_name TEXT,
  figma_description TEXT,
  figma_descriptions_synced_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(ds_id, slug)
);

CREATE INDEX idx_components_ds_id ON components(ds_id);
CREATE INDEX idx_components_slug ON components(slug);
CREATE INDEX idx_components_status ON components(status);
CREATE INDEX idx_components_ds_id_page_name ON components(ds_id, figma_page_name);

-- component_specs: Component specification metadata
CREATE TABLE component_specs (
  id              BIGSERIAL PRIMARY KEY,
  component_id    BIGINT NOT NULL REFERENCES components(id) ON DELETE CASCADE,
  markdown_path   TEXT NOT NULL,
  doc_status      TEXT NOT NULL DEFAULT 'draft' CHECK (doc_status IN ('draft', 'ready', 'needs-review')),
  coverage        REAL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(component_id, markdown_path)
);

CREATE INDEX idx_component_specs_component_id ON component_specs(component_id);

-- component_visual_proofs: Visual proof images for components
CREATE TABLE component_visual_proofs (
  id              BIGSERIAL PRIMARY KEY,
  component_id    BIGINT NOT NULL REFERENCES components(id) ON DELETE CASCADE,
  image_path      TEXT NOT NULL,
  caption         TEXT,
  screenshot_url TEXT,
  captured_at     TIMESTAMPTZ,
  captured_at_epoch BIGINT,
  node_id         TEXT,
  image_sha256    TEXT,
  image_bytes     INTEGER,
  image_content_type TEXT,
  image_width    INTEGER,
  image_height   INTEGER,
  variants_count  INTEGER,
  variants_json   JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(component_id, image_path)
);

CREATE INDEX idx_component_visual_proofs_component_id ON component_visual_proofs(component_id);
CREATE INDEX idx_component_visual_proofs_component_captured ON component_visual_proofs(component_id, captured_at_epoch DESC, captured_at DESC);

-- token_usage_occurrences: Atomic token usage tracking
CREATE TABLE token_usage_occurrences (
  id              BIGSERIAL PRIMARY KEY,
  ds_id           TEXT NOT NULL REFERENCES design_systems(id) ON DELETE CASCADE,
  token_id        TEXT NOT NULL,
  kind            TEXT NOT NULL,
  source          TEXT NOT NULL,
  owner           TEXT NOT NULL,
  detail          TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(ds_id, token_id, kind, source, owner, detail),
  FOREIGN KEY (ds_id, token_id) REFERENCES tokens(ds_id, id) ON DELETE CASCADE
);

CREATE INDEX idx_token_usage_occurrences_ds_id ON token_usage_occurrences(ds_id);
CREATE INDEX idx_token_usage_occurrences_token_id ON token_usage_occurrences(token_id);
CREATE INDEX idx_token_usage_occurrences_kind ON token_usage_occurrences(kind);
CREATE INDEX idx_token_usage_occurrences_ds_token ON token_usage_occurrences(ds_id, token_id);
CREATE INDEX idx_token_usage_occurrences_ds_token_kind ON token_usage_occurrences(ds_id, token_id, kind);

-- token_graph: Token dependency graph (serialized JSON)
CREATE TABLE token_graph (
  id              BIGSERIAL PRIMARY KEY,
  ds_id           TEXT NOT NULL REFERENCES design_systems(id) ON DELETE CASCADE,
  graph_json      TEXT NOT NULL,
  generated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(ds_id)
);

CREATE INDEX idx_token_graph_ds_id ON token_graph(ds_id);

-- health_snapshots: Point-in-time health snapshots
CREATE TABLE health_snapshots (
  id              BIGSERIAL PRIMARY KEY,
  ds_id           TEXT NOT NULL REFERENCES design_systems(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL CHECK (kind IN ('tokens', 'components')),
  snapshot_json   JSONB NOT NULL,
  recorded_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(ds_id, kind)
);

CREATE INDEX idx_health_snapshots_ds_id ON health_snapshots(ds_id);
CREATE INDEX idx_health_snapshots_kind ON health_snapshots(kind);

-- health_history: Append-only health history log
CREATE TABLE health_history (
  id              BIGSERIAL PRIMARY KEY,
  ds_id           TEXT NOT NULL REFERENCES design_systems(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL CHECK (kind IN ('tokens', 'components')),
  entry_json      JSONB NOT NULL,
  recorded_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_health_history_ds_id ON health_history(ds_id);
CREATE INDEX idx_health_history_kind ON health_history(kind);
CREATE INDEX idx_health_history_recorded_at ON health_history(recorded_at);

-- component_figma_variants: Component variants captured from Figma
CREATE TABLE component_figma_variants (
  id               BIGSERIAL PRIMARY KEY,
  component_id     BIGINT NOT NULL REFERENCES components(id) ON DELETE CASCADE,
  variant_name     TEXT NOT NULL,
  node_id          TEXT NOT NULL DEFAULT '',
  properties_json  JSONB NOT NULL DEFAULT '{}',
  run_id           TEXT,
  captured_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  schema_version   INTEGER NOT NULL DEFAULT 1,
  canonical_key    TEXT,
  description      TEXT,
  UNIQUE(component_id, variant_name, node_id)
);

CREATE INDEX idx_component_figma_variants_component_id ON component_figma_variants(component_id);
CREATE INDEX idx_component_figma_variants_component_run ON component_figma_variants(component_id, run_id);

-- component_figma_token_bindings: Token bindings from Figma nodes
CREATE TABLE component_figma_token_bindings (
  id                BIGSERIAL PRIMARY KEY,
  component_id      BIGINT NOT NULL REFERENCES components(id) ON DELETE CASCADE,
  node_id           TEXT NOT NULL,
  node_name         TEXT NOT NULL,
  field             TEXT NOT NULL,
  variable_id       TEXT NOT NULL,
  token_path        TEXT,
  mode              TEXT NOT NULL DEFAULT '',
  run_id            TEXT,
  captured_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  schema_version    INTEGER NOT NULL DEFAULT 1,
  variant_node_id   TEXT NOT NULL DEFAULT '',
  variant_signature TEXT NOT NULL DEFAULT '',
  property_path     TEXT NOT NULL DEFAULT '',
  status            TEXT NOT NULL DEFAULT 'resolved' CHECK (status IN ('resolved', 'unresolved')),
  mode_id           TEXT NOT NULL DEFAULT '',
  mode_name         TEXT NOT NULL DEFAULT '',
  UNIQUE(component_id, variant_node_id, node_id, property_path, mode_id, variable_id)
);

CREATE INDEX idx_component_figma_bindings_component_id ON component_figma_token_bindings(component_id);
CREATE INDEX idx_component_figma_bindings_component_run ON component_figma_token_bindings(component_id, run_id);
CREATE INDEX idx_component_figma_bindings_variable_id ON component_figma_token_bindings(variable_id);
CREATE INDEX idx_component_figma_bindings_component_variable ON component_figma_token_bindings(component_id, variable_id);
CREATE INDEX idx_component_figma_bindings_variant_node ON component_figma_token_bindings(component_id, variant_node_id);
CREATE INDEX idx_component_figma_bindings_property_path ON component_figma_token_bindings(component_id, property_path);
CREATE INDEX idx_component_figma_bindings_status ON component_figma_token_bindings(component_id, status);

-- component_figma_layout_rows: Flattened layout rows from anatomy tree
CREATE TABLE component_figma_layout_rows (
  id               BIGSERIAL PRIMARY KEY,
  component_id     BIGINT NOT NULL REFERENCES components(id) ON DELETE CASCADE,
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
  captured_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  schema_version   INTEGER NOT NULL DEFAULT 1,
  UNIQUE(component_id, node_id)
);

CREATE INDEX idx_component_figma_layout_component_id ON component_figma_layout_rows(component_id);
CREATE INDEX idx_component_figma_layout_component_run ON component_figma_layout_rows(component_id, run_id);

-- component_editorial: Human-authored editorial data
CREATE TABLE component_editorial (
  component_id            BIGINT PRIMARY KEY REFERENCES components(id) ON DELETE CASCADE,
  summary_json            JSONB,
  behaviour_json          TEXT,
  accessibility_json      JSONB,
  content_guidelines_json JSONB,
  qa_json                 JSONB,
  accessibility_notes_json JSONB,
  variants_json           JSONB,
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_component_editorial_updated_at ON component_editorial(updated_at DESC);

-- component_docs: DB-first applied docs storage
CREATE TABLE component_docs (
  id             BIGSERIAL PRIMARY KEY,
  component_id   BIGINT NOT NULL REFERENCES components(id) ON DELETE CASCADE,
  output_json    JSONB NOT NULL,
  editorial_json JSONB,
  job_id         TEXT,
  applied_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(component_id)
);

-- component_figma_props: Captured properties from Figma
CREATE TABLE component_figma_props (
  id               BIGSERIAL PRIMARY KEY,
  component_id     BIGINT NOT NULL REFERENCES components(id) ON DELETE CASCADE,
  prop_name        TEXT NOT NULL,
  prop_type        TEXT NOT NULL CHECK (prop_type IN ('enum', 'text', 'boolean', 'instance_swap', 'slot')),
  prop_values_json JSONB,
  prop_default     TEXT,
  prop_required    BOOLEAN NOT NULL DEFAULT FALSE,
  prop_description TEXT NOT NULL DEFAULT '',
  run_id           TEXT,
  captured_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  schema_version   INTEGER NOT NULL DEFAULT 1,
  UNIQUE(component_id, prop_name)
);

CREATE INDEX idx_component_figma_props_component_id ON component_figma_props(component_id);
CREATE INDEX idx_component_figma_props_component_run ON component_figma_props(component_id, run_id);

-- Add unique index for composite FK on tokens
CREATE UNIQUE INDEX idx_tokens_ds_id_id_unique ON tokens(ds_id, id);
