-- Initial database schema migration
-- Version: 001
-- Description: Create all base tables and indexes for ds-dashboard

-- db_meta: Database metadata (version, last rebuild, checksums, etc.)
CREATE TABLE db_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX idx_db_meta_key ON db_meta(key);

-- tokens: Cached token data for fast lookups
CREATE TABLE tokens (
  id         TEXT PRIMARY KEY,
  slash_path TEXT NOT NULL,
  css_var    TEXT UNIQUE NOT NULL,
  type       TEXT NOT NULL,
  collection TEXT NOT NULL,
  raw_value  TEXT NOT NULL
);

CREATE INDEX idx_tokens_slash_path ON tokens(slash_path);
CREATE INDEX idx_tokens_css_var ON tokens(css_var);
CREATE INDEX idx_tokens_collection ON tokens(collection);
CREATE INDEX idx_tokens_type ON tokens(type);

-- token_usage: Tracks where tokens are used (denormalized for performance)
CREATE TABLE token_usage (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  token_path TEXT NOT NULL,
  kind       TEXT NOT NULL,
  source     TEXT NOT NULL,
  owner      TEXT NOT NULL,
  detail     TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  UNIQUE(token_path, kind, source, owner, detail)
);

CREATE INDEX idx_token_usage_token_path ON token_usage(token_path);
CREATE INDEX idx_token_usage_kind ON token_usage(kind);

-- figma_aliases: Tracks Figma variable alias relationships
CREATE TABLE figma_aliases (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  from_path  TEXT NOT NULL,
  to_path    TEXT NOT NULL,
  modes      TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  UNIQUE(from_path, to_path)
);

CREATE INDEX idx_figma_aliases_from ON figma_aliases(from_path);
CREATE INDEX idx_figma_aliases_to ON figma_aliases(to_path);

-- ai_jobs: Persistent storage for AI-generated jobs
CREATE TABLE ai_jobs (
  id              TEXT PRIMARY KEY,
  idempotency_key TEXT UNIQUE NOT NULL,
  status          TEXT NOT NULL,
  provider        TEXT NOT NULL,
  input_json      TEXT NOT NULL,
  output_json     TEXT,
  usage_json      TEXT,
  error           TEXT,
  error_code      TEXT,
  retryable       INTEGER,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

CREATE INDEX idx_ai_jobs_status ON ai_jobs(status);
CREATE INDEX idx_ai_jobs_idempotency_key ON ai_jobs(idempotency_key);
CREATE INDEX idx_ai_jobs_provider ON ai_jobs(provider);

-- job_events: Append-only event log for ai_jobs
CREATE TABLE job_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id     TEXT NOT NULL REFERENCES ai_jobs(id) ON DELETE CASCADE,
  seq        INTEGER NOT NULL,
  ts         INTEGER NOT NULL,
  event      TEXT NOT NULL,
  data       TEXT,
  UNIQUE(job_id, seq)
);

CREATE INDEX idx_job_events_job_id ON job_events(job_id);
