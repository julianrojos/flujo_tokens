-- Migration 014: Hardening staging tenant isolation + token_mode_values performance
-- - Rebuild staging tables with ds_id NOT NULL
-- - Add composite indexes for token_mode_values lookup paths

DROP INDEX IF EXISTS idx_tokens_staging_ds_run;
DROP INDEX IF EXISTS idx_token_mode_values_staging_ds_run;
DROP INDEX IF EXISTS idx_token_usage_occurrences_staging_ds_run;
DROP INDEX IF EXISTS idx_figma_aliases_staging_ds_run;
DROP INDEX IF EXISTS idx_tokens_staging_run_id;
DROP INDEX IF EXISTS idx_token_mode_values_staging_run_id;
DROP INDEX IF EXISTS idx_token_usage_occurrences_staging_run_id;
DROP INDEX IF EXISTS idx_figma_aliases_staging_run_id;

DROP TABLE IF EXISTS tokens_staging;
DROP TABLE IF EXISTS token_mode_values_staging;
DROP TABLE IF EXISTS token_usage_occurrences_staging;
DROP TABLE IF EXISTS figma_aliases_staging;

CREATE TABLE tokens_staging (
  id              TEXT NOT NULL,
  run_id          TEXT NOT NULL,
  ds_id           TEXT NOT NULL REFERENCES design_systems(id) ON DELETE CASCADE,
  slash_path      TEXT NOT NULL,
  css_var         TEXT NOT NULL,
  type            TEXT NOT NULL,
  collection      TEXT NOT NULL,
  raw_value       TEXT NOT NULL,
  created_at      INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  PRIMARY KEY (id, run_id)
);

CREATE TABLE token_mode_values_staging (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id          TEXT NOT NULL,
  ds_id           TEXT NOT NULL REFERENCES design_systems(id) ON DELETE CASCADE,
  token_path      TEXT NOT NULL,
  mode            TEXT NOT NULL,
  resolved_value  TEXT NOT NULL,
  created_at      INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

CREATE TABLE token_usage_occurrences_staging (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id          TEXT NOT NULL,
  ds_id           TEXT NOT NULL REFERENCES design_systems(id) ON DELETE CASCADE,
  token_id        TEXT NOT NULL,
  kind            TEXT NOT NULL,
  source          TEXT NOT NULL,
  owner           TEXT NOT NULL,
  detail          TEXT NOT NULL,
  created_at      INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

CREATE TABLE figma_aliases_staging (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id          TEXT NOT NULL,
  ds_id           TEXT NOT NULL REFERENCES design_systems(id) ON DELETE CASCADE,
  from_path       TEXT NOT NULL,
  to_path         TEXT NOT NULL,
  modes           TEXT NOT NULL,
  created_at      INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  UNIQUE(run_id, ds_id, from_path, to_path)
);

CREATE INDEX IF NOT EXISTS idx_tokens_staging_ds_run ON tokens_staging(ds_id, run_id);
CREATE INDEX IF NOT EXISTS idx_token_mode_values_staging_ds_run ON token_mode_values_staging(ds_id, run_id);
CREATE INDEX IF NOT EXISTS idx_token_usage_occurrences_staging_ds_run ON token_usage_occurrences_staging(ds_id, run_id);
CREATE INDEX IF NOT EXISTS idx_figma_aliases_staging_ds_run ON figma_aliases_staging(ds_id, run_id);

CREATE INDEX IF NOT EXISTS idx_token_mode_values_ds_token ON token_mode_values(ds_id, token_path);
CREATE INDEX IF NOT EXISTS idx_token_mode_values_ds_token_mode ON token_mode_values(ds_id, token_path, mode);
