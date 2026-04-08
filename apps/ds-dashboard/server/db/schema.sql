-- SQLite Schema for ds-dashboard server
-- Human-readable DDL reference (not executed directly at runtime)
-- Runtime migrations are in: migrations/001_initial.sql

-- Pragmas for production use
-- PRAGMA journal_mode = WAL;        -- Write-Ahead Logging for concurrent reads
-- PRAGMA synchronous = NORMAL;      -- Balanced durability/performance
-- PRAGMA busy_timeout = 5000;       -- Wait 5s for locks before failing

-- ============================================================================
-- schema_migrations: Tracks which migrations have been applied
-- ============================================================================
CREATE TABLE IF NOT EXISTS schema_migrations (
  version    INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- ============================================================================
-- db_meta: Database metadata (version, last rebuild, checksums, etc.)
-- ============================================================================
CREATE TABLE IF NOT EXISTS db_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Index for key lookups
CREATE INDEX IF NOT EXISTS idx_db_meta_key ON db_meta(key);

-- ============================================================================
-- tokens: Cached token data for fast lookups
-- Simplified schema for token caching (no mode tracking, no timestamps)
-- ============================================================================
CREATE TABLE IF NOT EXISTS tokens (
  ds_id      TEXT NOT NULL REFERENCES design_systems(id) ON DELETE CASCADE,
  id         TEXT NOT NULL,              -- tokenPath e.g. "primitives.blue.300"
  slash_path TEXT NOT NULL,              -- slash version e.g. "primitives/blue/300"
  css_var    TEXT NOT NULL,              -- CSS variable name e.g. "--primitives-blue-300"
  type       TEXT NOT NULL,              -- token type e.g. "color", "dimension"
  collection TEXT NOT NULL,              -- collection name e.g. "primitives"
  raw_value  TEXT NOT NULL,              -- raw token value (JSON string for complex values)
  PRIMARY KEY (ds_id, id),
  UNIQUE(ds_id, css_var)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_tokens_ds_slash_path ON tokens(ds_id, slash_path);
CREATE INDEX IF NOT EXISTS idx_tokens_id ON tokens(id);
CREATE INDEX IF NOT EXISTS idx_tokens_collection ON tokens(collection);
CREATE INDEX IF NOT EXISTS idx_tokens_type ON tokens(type);
CREATE INDEX IF NOT EXISTS idx_tokens_ds_id ON tokens(ds_id);
CREATE INDEX IF NOT EXISTS idx_tokens_ds_css_var ON tokens(ds_id, css_var);

-- ============================================================================
-- figma_aliases: Tracks Figma variable alias relationships
-- ============================================================================
CREATE TABLE IF NOT EXISTS figma_aliases (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ds_id      TEXT NOT NULL REFERENCES design_systems(id) ON DELETE CASCADE,
  from_path  TEXT NOT NULL,
  to_path    TEXT NOT NULL,
  modes      TEXT NOT NULL,           -- JSON array of mode names
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  UNIQUE(ds_id, from_path, to_path)
);

-- Indexes for alias lookups
CREATE INDEX IF NOT EXISTS idx_figma_aliases_ds_id ON figma_aliases(ds_id);
CREATE INDEX IF NOT EXISTS idx_figma_aliases_from ON figma_aliases(from_path);
CREATE INDEX IF NOT EXISTS idx_figma_aliases_to ON figma_aliases(to_path);

-- ============================================================================
-- ai_jobs: Persistent storage for AI-generated jobs (AiJobState)
-- Aligned with AiJobState interface in ai-component-doc-schema.ts
-- ============================================================================
CREATE TABLE IF NOT EXISTS ai_jobs (
  id              TEXT PRIMARY KEY,                    -- Unique job ID (UUID)
  idempotency_key TEXT UNIQUE NOT NULL,                -- Idempotency key for deduplication
  status          TEXT NOT NULL,                       -- 'queued'|'running'|'completed'|'failed'|'cancelled'
  provider        TEXT NOT NULL,                       -- 'anthropic'|'openai'|'ollama'
  input_json      TEXT NOT NULL,                       -- JSON: AiJobInput
  output_json     TEXT,                                -- JSON: ComponentDocOutput (when completed)
  usage_json      TEXT,                                -- JSON: AiUsageMetrics (when completed)
  error           TEXT,                                -- Error message (when failed)
  error_code      TEXT,                                -- Error code (when failed)
  retryable       INTEGER,                             -- 1 if retryable, 0 if not (when failed)
  created_at      INTEGER NOT NULL,                    -- Created timestamp (ms since epoch)
  updated_at      INTEGER NOT NULL,                    -- Updated timestamp (ms since epoch)
  editorial_patch_json TEXT CHECK(
    editorial_patch_json IS NULL OR (json_valid(editorial_patch_json) AND json_type(editorial_patch_json) = 'object')
  )                                                     -- JSON: EditorialPatch (structured AI suggestion)
);

-- Indexes for job queries
CREATE INDEX IF NOT EXISTS idx_ai_jobs_status ON ai_jobs(status);
CREATE INDEX IF NOT EXISTS idx_ai_jobs_idempotency_key ON ai_jobs(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_ai_jobs_provider ON ai_jobs(provider);

-- ============================================================================
-- job_events: Append-only event log for ai_jobs (AiJobEvent)
-- Aligned with AiJobEvent interface in ai-component-doc-schema.ts
-- ============================================================================
CREATE TABLE IF NOT EXISTS job_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id     TEXT NOT NULL REFERENCES ai_jobs(id) ON DELETE CASCADE,
  seq        INTEGER NOT NULL,                        -- Sequential event number
  ts         INTEGER NOT NULL,                        -- Event timestamp (ms since epoch)
  event      TEXT NOT NULL,                           -- Event name e.g. 'created', 'started', 'completed'
  data       TEXT,                                    -- JSON: optional event data
  UNIQUE(job_id, seq)
);

-- Index for event lookups by job
CREATE INDEX IF NOT EXISTS idx_job_events_job_id ON job_events(job_id);

-- ============================================================================
-- app_settings: Application-level settings (Migration 007)
-- ============================================================================
CREATE TABLE IF NOT EXISTS app_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- ============================================================================
-- design_systems: Multi-tenant design system configurations (Migration 007)
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

-- ============================================================================
-- token_mode_values: Multi-mode token values (Migration 007)
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
CREATE INDEX IF NOT EXISTS idx_token_mode_values_ds_token ON token_mode_values(ds_id, token_path);
CREATE INDEX IF NOT EXISTS idx_token_mode_values_ds_token_mode ON token_mode_values(ds_id, token_path, mode);

-- ============================================================================
-- tokens: Extended with ds_id for multi-tenancy (Migration 007)
-- Note: ds_id column added via ALTER TABLE in migration 007
-- ============================================================================
-- Original columns: id, slash_path, css_var, type, collection, raw_value
-- Added column: ds_id TEXT REFERENCES design_systems(id) ON DELETE CASCADE

-- ============================================================================
-- components: Component registry entries (Migration 007)
-- Extended with scalar structured metadata (Migration 020)
-- ============================================================================
CREATE TABLE IF NOT EXISTS components (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  ds_id           TEXT NOT NULL REFERENCES design_systems(id) ON DELETE CASCADE,
  slug            TEXT NOT NULL,                    -- e.g. 'button', 'card'
  name            TEXT NOT NULL,                    -- Display name e.g. 'Button'
  status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ready', 'needs-review', 'missing')),
  doc_type        TEXT NOT NULL DEFAULT 'component' CHECK (doc_type IN ('component', 'pattern', 'guideline')),
  figma_file_url  TEXT,
  figma_component_set_node_id TEXT,
  figma_page_name TEXT,                             -- Figma page containing the component (Migration 020)
  figma_description TEXT,                           -- Component set description from Figma (S-02)
  figma_descriptions_synced_at INTEGER,             -- Timestamp of last Figma description sync (S-02)
  created_at      INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_at      INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  UNIQUE(ds_id, slug)
);

-- Index for querying components by page (useful for page-level audits)
CREATE INDEX IF NOT EXISTS idx_components_ds_id_page_name ON components(ds_id, figma_page_name);

-- ============================================================================
-- component_figma_variants: Structured variants captured from Figma (Migration 020)
-- ============================================================================
CREATE TABLE IF NOT EXISTS component_figma_variants (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  component_id     INTEGER NOT NULL REFERENCES components(id) ON DELETE CASCADE,
  variant_name     TEXT NOT NULL,
  node_id          TEXT NOT NULL DEFAULT '',
  canonical_key    TEXT,                             -- "Prop=Val|Prop=Val" sorted (S-02)
  properties_json  TEXT NOT NULL DEFAULT '{}' CHECK (
    json_valid(properties_json) AND json_type(properties_json) = 'object'
  ),
  description      TEXT,                             -- Variant description from Figma (S-02)
  run_id           TEXT,
  captured_at      INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  schema_version   INTEGER NOT NULL DEFAULT 1,
  UNIQUE(component_id, variant_name, node_id)
);
CREATE INDEX IF NOT EXISTS idx_component_figma_variants_component_id
  ON component_figma_variants(component_id);
CREATE INDEX IF NOT EXISTS idx_component_figma_variants_component_run
  ON component_figma_variants(component_id, run_id);

-- ============================================================================
-- component_figma_token_bindings: Raw Figma node/field variable bindings (Migration 020)
-- ============================================================================
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

-- ============================================================================
-- component_figma_layout_rows: Flattened layout metadata per anatomy node (Migration 020)
-- ============================================================================
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

-- ============================================================================
-- component_editorial: Human-authored component spec data (Migration 021)
-- Created on first PATCH /editorial, NOT during sync
-- ============================================================================
CREATE TABLE IF NOT EXISTS component_editorial (
  component_id            INTEGER PRIMARY KEY REFERENCES components(id) ON DELETE CASCADE,
  summary_json            TEXT CHECK(summary_json IS NULL OR (json_valid(summary_json) AND json_type(summary_json) = 'object')),
  best_practices_json     TEXT CHECK(best_practices_json IS NULL OR (json_valid(best_practices_json) AND json_type(best_practices_json) = 'object')),
  accessibility_json      TEXT CHECK(accessibility_json IS NULL OR (json_valid(accessibility_json) AND json_type(accessibility_json) = 'object')),
  content_guidelines_json TEXT CHECK(content_guidelines_json IS NULL OR (json_valid(content_guidelines_json) AND json_type(content_guidelines_json) = 'object')),
  related_components_json TEXT CHECK(related_components_json IS NULL OR (json_valid(related_components_json) AND json_type(related_components_json) = 'array')),
  token_mapping_json      TEXT CHECK(token_mapping_json IS NULL OR (json_valid(token_mapping_json) AND json_type(token_mapping_json) = 'object')),
  qa_json                 TEXT CHECK(qa_json IS NULL OR (json_valid(qa_json) AND json_type(qa_json) = 'array')),
  accessibility_notes_json TEXT CHECK(accessibility_notes_json IS NULL OR (json_valid(accessibility_notes_json) AND json_type(accessibility_notes_json) = 'array')),
  variants_json           TEXT CHECK(variants_json IS NULL OR (json_valid(variants_json) AND json_type(variants_json) = 'array')),
  tokens_json             TEXT CHECK(tokens_json IS NULL OR (json_valid(tokens_json) AND json_type(tokens_json) = 'array')),
  updated_at              INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_component_editorial_updated_at
  ON component_editorial(updated_at DESC);

-- ============================================================================
-- component_docs: AI-generated component documentation (S-02)
-- One active doc per component; upsert on apply.
-- ============================================================================
CREATE TABLE IF NOT EXISTS component_docs (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  component_id   INTEGER NOT NULL REFERENCES components(id) ON DELETE CASCADE,
  output_json    TEXT NOT NULL CHECK(json_valid(output_json)),
  editorial_json TEXT CHECK(editorial_json IS NULL OR json_valid(editorial_json)),
  job_id         TEXT,
  applied_at     INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  UNIQUE(component_id)
);

-- ============================================================================
-- component_specs: Component specification metadata (Migration 007)
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

-- ============================================================================
-- component_visual_proofs: Visual proof images for components (Migration 007)
-- ============================================================================
CREATE TABLE IF NOT EXISTS component_visual_proofs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  component_id    INTEGER NOT NULL REFERENCES components(id) ON DELETE CASCADE,
  image_path      TEXT NOT NULL,                  -- Relative path to image file
  screenshot_url  TEXT,
  caption         TEXT,
  captured_at     TEXT,
  captured_at_epoch INTEGER,
  node_id         TEXT,
  image_sha256    TEXT,
  image_bytes     INTEGER,
  image_content_type TEXT,
  image_width     INTEGER,
  image_height    INTEGER,
  variants_count  INTEGER,
  variants_json   TEXT,
  created_at      INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  UNIQUE(component_id, image_path)
);
CREATE INDEX IF NOT EXISTS idx_component_visual_proofs_component_id
  ON component_visual_proofs(component_id);
CREATE INDEX IF NOT EXISTS idx_component_visual_proofs_component_captured
  ON component_visual_proofs(component_id, captured_at_epoch DESC, captured_at DESC);

-- ============================================================================
-- token_usage_occurrences: Atomic token usage tracking (Migration 007)
-- ============================================================================
CREATE TABLE IF NOT EXISTS token_usage_occurrences (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  ds_id           TEXT NOT NULL REFERENCES design_systems(id) ON DELETE CASCADE,
  token_id        TEXT NOT NULL,
  kind            TEXT NOT NULL,                  -- 'component-spec', 'css-alias', 'figma-alias'
  source          TEXT NOT NULL,                  -- 'component-spec', 'css-alias', 'figma-variables'
  owner           TEXT NOT NULL,                  -- File path or token path
  detail          TEXT NOT NULL,                  -- Property name or mode list
  created_at      INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  UNIQUE(ds_id, token_id, kind, source, owner, detail),
  FOREIGN KEY (ds_id, token_id) REFERENCES tokens(ds_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_token_usage_occurrences_ds_id ON token_usage_occurrences(ds_id);
CREATE INDEX IF NOT EXISTS idx_token_usage_occurrences_token_id ON token_usage_occurrences(token_id);
CREATE INDEX IF NOT EXISTS idx_token_usage_occurrences_kind ON token_usage_occurrences(kind);
CREATE INDEX IF NOT EXISTS idx_token_usage_occurrences_ds_token ON token_usage_occurrences(ds_id, token_id);
CREATE INDEX IF NOT EXISTS idx_token_usage_occurrences_ds_token_kind ON token_usage_occurrences(ds_id, token_id, kind);

-- ============================================================================
-- token_graph: Token dependency graph (Migration 007)
-- ============================================================================
CREATE TABLE IF NOT EXISTS token_graph (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  ds_id           TEXT NOT NULL REFERENCES design_systems(id) ON DELETE CASCADE,
  graph_json      TEXT NOT NULL,                  -- Serialized graph structure
  generated_at    INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  UNIQUE(ds_id)
);

-- ============================================================================
-- health_snapshots: Point-in-time health snapshots (Migration 007)
-- ============================================================================
CREATE TABLE IF NOT EXISTS health_snapshots (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  ds_id           TEXT NOT NULL REFERENCES design_systems(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL CHECK (kind IN ('tokens', 'components')),
  snapshot_json   TEXT NOT NULL,                  -- Complete snapshot data
  recorded_at     INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  UNIQUE(ds_id, kind)
);

-- ============================================================================
-- health_history: Append-only health history log (Migration 007)
-- ============================================================================
CREATE TABLE IF NOT EXISTS health_history (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  ds_id           TEXT NOT NULL REFERENCES design_systems(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL CHECK (kind IN ('tokens', 'components')),
  entry_json      TEXT NOT NULL,                  -- Single history entry
  recorded_at     INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- ============================================================================
-- tokens_staging: Staging area for token imports (Migration 008)
-- ============================================================================
CREATE TABLE IF NOT EXISTS tokens_staging (
  id              TEXT NOT NULL,                -- tokenPath e.g. "primitives.blue.300"
  run_id          TEXT NOT NULL,                -- UUID for this import run
  ds_id           TEXT NOT NULL REFERENCES design_systems(id) ON DELETE CASCADE,
  slash_path      TEXT NOT NULL,                -- slash version e.g. "primitives/blue/300"
  css_var         TEXT NOT NULL,                -- CSS variable name e.g. "--primitives-blue-300"
  type            TEXT NOT NULL,                -- token type e.g. "color", "dimension"
  collection      TEXT NOT NULL,                -- collection name e.g. "primitives"
  raw_value       TEXT NOT NULL,                -- raw token value (JSON string for complex values)
  created_at      INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  PRIMARY KEY (id, run_id)
);

-- ============================================================================
-- token_mode_values_staging: Staging area for mode values (Migration 008)
-- ============================================================================
CREATE TABLE IF NOT EXISTS token_mode_values_staging (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id          TEXT NOT NULL,                -- UUID for this import run
  ds_id           TEXT NOT NULL REFERENCES design_systems(id) ON DELETE CASCADE,
  token_path      TEXT NOT NULL,
  mode            TEXT NOT NULL,                -- e.g. 'Default', 'Dark', 'Light'
  resolved_value  TEXT NOT NULL,                -- The actual value for this mode
  created_at      INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- ============================================================================
-- token_usage_occurrences_staging: Staging area for usage occurrences (Migration 008)
-- ============================================================================
CREATE TABLE IF NOT EXISTS token_usage_occurrences_staging (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id          TEXT NOT NULL,                -- UUID for this import run
  ds_id           TEXT NOT NULL REFERENCES design_systems(id) ON DELETE CASCADE,
  token_id        TEXT NOT NULL,                -- References tokens.id
  kind            TEXT NOT NULL,                -- 'component-spec', 'css-alias', 'figma-alias'
  source          TEXT NOT NULL,                -- 'component-spec', 'css-alias', 'figma-variables'
  owner           TEXT NOT NULL,                -- File path or token path
  detail          TEXT NOT NULL,                -- Property name or mode list
  created_at      INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- ============================================================================
-- figma_aliases_staging: Staging area for Figma aliases (Migration 008)
-- ============================================================================
CREATE TABLE IF NOT EXISTS figma_aliases_staging (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id          TEXT NOT NULL,                -- UUID for this import run
  ds_id           TEXT NOT NULL REFERENCES design_systems(id) ON DELETE CASCADE,
  from_path       TEXT NOT NULL,
  to_path         TEXT NOT NULL,
  modes           TEXT NOT NULL,                -- JSON array of mode names
  created_at      INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  UNIQUE(run_id, ds_id, from_path, to_path)
);

CREATE INDEX IF NOT EXISTS idx_tokens_staging_ds_run ON tokens_staging(ds_id, run_id);
CREATE INDEX IF NOT EXISTS idx_token_mode_values_staging_ds_run ON token_mode_values_staging(ds_id, run_id);
CREATE INDEX IF NOT EXISTS idx_token_usage_occurrences_staging_ds_run ON token_usage_occurrences_staging(ds_id, run_id);
CREATE INDEX IF NOT EXISTS idx_figma_aliases_staging_ds_run ON figma_aliases_staging(ds_id, run_id);
