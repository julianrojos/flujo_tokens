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
  id         TEXT PRIMARY KEY,           -- tokenPath e.g. "primitives.blue.300"
  slash_path TEXT NOT NULL,              -- slash version e.g. "primitives/blue/300"
  css_var    TEXT UNIQUE NOT NULL,       -- CSS variable name e.g. "--primitives-blue-300"
  type       TEXT NOT NULL,              -- token type e.g. "color", "dimension"
  collection TEXT NOT NULL,              -- collection name e.g. "primitives"
  raw_value  TEXT NOT NULL               -- raw token value (JSON string for complex values)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_tokens_slash_path ON tokens(slash_path);
CREATE INDEX IF NOT EXISTS idx_tokens_css_var ON tokens(css_var);
CREATE INDEX IF NOT EXISTS idx_tokens_collection ON tokens(collection);
CREATE INDEX IF NOT EXISTS idx_tokens_type ON tokens(type);

-- ============================================================================
-- token_usage: Tracks where tokens are used (denormalized for performance)
-- ============================================================================
CREATE TABLE IF NOT EXISTS token_usage (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  token_path TEXT NOT NULL,
  kind       TEXT NOT NULL,           -- 'component-spec', 'css-alias', 'figma-alias'
  source     TEXT NOT NULL,           -- 'component-spec', 'css-alias', 'figma-variables'
  owner      TEXT NOT NULL,           -- file path or token path
  detail     TEXT NOT NULL,           -- property name or mode list
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  UNIQUE(token_path, kind, source, owner, detail)
);

-- Indexes for usage queries
CREATE INDEX IF NOT EXISTS idx_token_usage_token_path ON token_usage(token_path);
CREATE INDEX IF NOT EXISTS idx_token_usage_kind ON token_usage(kind);

-- ============================================================================
-- figma_aliases: Tracks Figma variable alias relationships
-- ============================================================================
CREATE TABLE IF NOT EXISTS figma_aliases (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  from_path  TEXT NOT NULL,
  to_path    TEXT NOT NULL,
  modes      TEXT NOT NULL,           -- JSON array of mode names
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  UNIQUE(from_path, to_path)
);

-- Indexes for alias lookups
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
  updated_at      INTEGER NOT NULL                     -- Updated timestamp (ms since epoch)
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
