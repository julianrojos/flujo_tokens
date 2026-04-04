-- Migration 007: Design Systems Multi-Tenancy Support
-- Adds tables for multi-design-system support with SQLite as single source of truth
-- Applied: 2026-03-27

-- ============================================================================
-- app_settings: Application-level settings
-- ============================================================================
CREATE TABLE IF NOT EXISTS app_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- Index for key lookups
CREATE INDEX IF NOT EXISTS idx_app_settings_key ON app_settings(key);

-- ============================================================================
-- design_systems: Multi-tenant design system configurations
-- Replaces tooling/config/design-systems.json as single source of truth
-- ============================================================================
CREATE TABLE IF NOT EXISTS design_systems (
  id                              TEXT PRIMARY KEY,
  name                            TEXT NOT NULL,
  app_name                        TEXT,
  figma_file_id                   TEXT,
  figma_api_token                 TEXT,
  collections                     TEXT,                    -- JSON array of collection names
  compile_variables_on_capture    INTEGER NOT NULL DEFAULT 1 CHECK (compile_variables_on_capture IN (0, 1)),
  created_at                      INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_at                      INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- Index for name lookups
CREATE INDEX IF NOT EXISTS idx_design_systems_name ON design_systems(name);

-- ============================================================================
-- token_mode_values: Multi-mode token values (separated from tokens table)
-- Allows tokens to have different values per mode (Default, Dark, etc.)
-- ============================================================================
CREATE TABLE IF NOT EXISTS token_mode_values (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  ds_id           TEXT NOT NULL REFERENCES design_systems(id) ON DELETE CASCADE,
  token_path      TEXT NOT NULL,
  mode            TEXT NOT NULL,                    -- e.g. 'Default', 'Dark', 'Light'
  resolved_value  TEXT NOT NULL,                    -- The actual value for this mode
  created_at      INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  UNIQUE(ds_id, token_path, mode)
);

-- Indexes for mode queries
CREATE INDEX IF NOT EXISTS idx_token_mode_values_ds_id ON token_mode_values(ds_id);
CREATE INDEX IF NOT EXISTS idx_token_mode_values_token_path ON token_mode_values(token_path);
CREATE INDEX IF NOT EXISTS idx_token_mode_values_mode ON token_mode_values(mode);

-- ============================================================================
-- tokens: Extend existing table with ds_id for multi-tenancy
-- Note: ds_id is introduced here and constrained in follow-up hardening migrations
-- ============================================================================
ALTER TABLE tokens ADD COLUMN ds_id TEXT REFERENCES design_systems(id) ON DELETE CASCADE;

-- Index for multi-tenant queries
CREATE INDEX IF NOT EXISTS idx_tokens_ds_id ON tokens(ds_id);

-- Composite index for unique token per system
CREATE INDEX IF NOT EXISTS idx_tokens_ds_id_id ON tokens(ds_id, id);

-- ============================================================================
-- components: Component registry entries
-- ============================================================================
CREATE TABLE IF NOT EXISTS components (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  ds_id           TEXT NOT NULL REFERENCES design_systems(id) ON DELETE CASCADE,
  slug            TEXT NOT NULL,                    -- e.g. 'button', 'card'
  name            TEXT NOT NULL,                    -- Display name e.g. 'Button'
  status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ready', 'needs-review', 'missing')),
  doc_type        TEXT NOT NULL DEFAULT 'component' CHECK (doc_type IN ('component', 'pattern', 'guideline')),
  created_at      INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_at      INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  UNIQUE(ds_id, slug)
);

-- Indexes for component queries
CREATE INDEX IF NOT EXISTS idx_components_ds_id ON components(ds_id);
CREATE INDEX IF NOT EXISTS idx_components_slug ON components(slug);
CREATE INDEX IF NOT EXISTS idx_components_status ON components(status);

-- ============================================================================
-- component_specs: Component specification metadata
-- Note: markdownContent stored in filesystem, only path tracked in DB
-- ============================================================================
CREATE TABLE IF NOT EXISTS component_specs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  component_id    INTEGER NOT NULL REFERENCES components(id) ON DELETE CASCADE,
  markdown_path   TEXT NOT NULL,                  -- Relative path to .md file
  doc_status      TEXT NOT NULL DEFAULT 'draft' CHECK (doc_status IN ('draft', 'ready', 'needs-review')),
  coverage        REAL DEFAULT 0,                 -- Coverage percentage 0-100
  created_at      INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_at      INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  UNIQUE(component_id, markdown_path)
);

-- Index for spec lookups
CREATE INDEX IF NOT EXISTS idx_component_specs_component_id ON component_specs(component_id);

-- ============================================================================
-- component_visual_proofs: Visual proof images for components
-- ============================================================================
CREATE TABLE IF NOT EXISTS component_visual_proofs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  component_id    INTEGER NOT NULL REFERENCES components(id) ON DELETE CASCADE,
  image_path      TEXT NOT NULL,                  -- Relative path to image file
  caption         TEXT,
  created_at      INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  UNIQUE(component_id, image_path)
);

-- Index for proof lookups
CREATE INDEX IF NOT EXISTS idx_component_visual_proofs_component_id ON component_visual_proofs(component_id);

-- ============================================================================
-- token_usage_occurrences: Atomic token usage tracking
-- Replaces denormalized token_usage table with atomic occurrences
-- ============================================================================
CREATE TABLE IF NOT EXISTS token_usage_occurrences (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  ds_id           TEXT NOT NULL REFERENCES design_systems(id) ON DELETE CASCADE,
  token_id        TEXT NOT NULL,                  -- References tokens.id
  kind            TEXT NOT NULL,                  -- 'component-spec', 'css-alias', 'figma-alias'
  source          TEXT NOT NULL,                  -- 'component-spec', 'css-alias', 'figma-variables'
  owner           TEXT NOT NULL,                  -- File path or token path
  detail          TEXT NOT NULL,                  -- Property name or mode list
  created_at      INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  UNIQUE(ds_id, token_id, kind, source, owner, detail)
);

-- Indexes for usage queries
CREATE INDEX IF NOT EXISTS idx_token_usage_occurrences_ds_id ON token_usage_occurrences(ds_id);
CREATE INDEX IF NOT EXISTS idx_token_usage_occurrences_token_id ON token_usage_occurrences(token_id);
CREATE INDEX IF NOT EXISTS idx_token_usage_occurrences_kind ON token_usage_occurrences(kind);

-- Composite index for efficient grouping
CREATE INDEX IF NOT EXISTS idx_token_usage_occurrences_ds_token ON token_usage_occurrences(ds_id, token_id);

-- ============================================================================
-- token_graph: Token dependency graph (serialized JSON)
-- Stores the complete graph structure as opaque JSON
-- ============================================================================
CREATE TABLE IF NOT EXISTS token_graph (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  ds_id           TEXT NOT NULL REFERENCES design_systems(id) ON DELETE CASCADE,
  graph_json      TEXT NOT NULL,                  -- Serialized graph structure
  generated_at    INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  UNIQUE(ds_id)
);

-- Index for system lookup
CREATE INDEX IF NOT EXISTS idx_token_graph_ds_id ON token_graph(ds_id);

-- ============================================================================
-- health_snapshots: Point-in-time health snapshots
-- ============================================================================
CREATE TABLE IF NOT EXISTS health_snapshots (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  ds_id           TEXT NOT NULL REFERENCES design_systems(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL CHECK (kind IN ('tokens', 'components')),
  snapshot_json   TEXT NOT NULL,                  -- Complete snapshot data
  recorded_at     INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  UNIQUE(ds_id, kind)
);

-- Indexes for health queries
CREATE INDEX IF NOT EXISTS idx_health_snapshots_ds_id ON health_snapshots(ds_id);
CREATE INDEX IF NOT EXISTS idx_health_snapshots_kind ON health_snapshots(kind);

-- ============================================================================
-- health_history: Append-only health history log
-- ============================================================================
CREATE TABLE IF NOT EXISTS health_history (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  ds_id           TEXT NOT NULL REFERENCES design_systems(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL CHECK (kind IN ('tokens', 'components')),
  entry_json      TEXT NOT NULL,                  -- Single history entry
  recorded_at     INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- Indexes for history queries
CREATE INDEX IF NOT EXISTS idx_health_history_ds_id ON health_history(ds_id);
CREATE INDEX IF NOT EXISTS idx_health_history_kind ON health_history(kind);
CREATE INDEX IF NOT EXISTS idx_health_history_recorded_at ON health_history(recorded_at);
