-- Migration 008: Staging Tables for Atomic Imports
-- Adds staging tables for safe import with staging+swap pattern
-- Applied: 2026-03-27

-- ============================================================================
-- tokens_staging: Staging area for token imports
-- Allows validation before swapping into production tokens table
-- ============================================================================
CREATE TABLE IF NOT EXISTS tokens_staging (
  id              TEXT NOT NULL,                -- tokenPath e.g. "primitives.blue.300"
  run_id          TEXT NOT NULL,                -- UUID for this import run
  slash_path      TEXT NOT NULL,                -- slash version e.g. "primitives/blue/300"
  css_var         TEXT NOT NULL,                -- CSS variable name e.g. "--primitives-blue-300"
  type            TEXT NOT NULL,                -- token type e.g. "color", "dimension"
  collection      TEXT NOT NULL,                -- collection name e.g. "primitives"
  raw_value       TEXT NOT NULL,                -- raw token value (JSON string for complex values)
  created_at      INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  PRIMARY KEY (id, run_id)
);

-- Index for run-based queries and cleanup
CREATE INDEX IF NOT EXISTS idx_tokens_staging_run_id ON tokens_staging(run_id);

-- ============================================================================
-- token_mode_values_staging: Staging area for mode values
-- Allows validation before swapping into production token_mode_values table
-- ============================================================================
CREATE TABLE IF NOT EXISTS token_mode_values_staging (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id          TEXT NOT NULL,                -- UUID for this import run
  token_path      TEXT NOT NULL,
  mode            TEXT NOT NULL,                -- e.g. 'Default', 'Dark', 'Light'
  resolved_value  TEXT NOT NULL,                -- The actual value for this mode
  created_at      INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- Index for run-based queries and cleanup
CREATE INDEX IF NOT EXISTS idx_token_mode_values_staging_run_id ON token_mode_values_staging(run_id);

-- ============================================================================
-- token_usage_occurrences_staging: Staging area for usage occurrences
-- ============================================================================
CREATE TABLE IF NOT EXISTS token_usage_occurrences_staging (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id          TEXT NOT NULL,                -- UUID for this import run
  token_id        TEXT NOT NULL,                -- References tokens.id
  kind            TEXT NOT NULL,                -- 'component-spec', 'css-alias', 'figma-alias'
  source          TEXT NOT NULL,                -- 'component-spec', 'css-alias', 'figma-variables'
  owner           TEXT NOT NULL,                -- File path or token path
  detail          TEXT NOT NULL,                -- Property name or mode list
  created_at      INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- Index for run-based queries and cleanup
CREATE INDEX IF NOT EXISTS idx_token_usage_occurrences_staging_run_id ON token_usage_occurrences_staging(run_id);

-- ============================================================================
-- figma_aliases_staging: Staging area for Figma aliases
-- ============================================================================
CREATE TABLE IF NOT EXISTS figma_aliases_staging (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id          TEXT NOT NULL,                -- UUID for this import run
  from_path       TEXT NOT NULL,
  to_path         TEXT NOT NULL,
  modes           TEXT NOT NULL,                -- JSON array of mode names
  created_at      INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  UNIQUE(run_id, from_path, to_path)
);

-- Index for run-based queries and cleanup
CREATE INDEX IF NOT EXISTS idx_figma_aliases_staging_run_id ON figma_aliases_staging(run_id);
