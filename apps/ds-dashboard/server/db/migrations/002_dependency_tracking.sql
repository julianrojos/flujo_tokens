-- Migration 002: Dependency tracking tables
-- Track DS parent/child relationships and usage data

-- Consumers: Design System files and their consuming files
CREATE TABLE IF NOT EXISTS ds_consumers (
  id TEXT PRIMARY KEY,                    -- UUID
  ds_file_key TEXT NOT NULL,             -- Design System file key
  consumer_file_key TEXT NOT NULL,       -- Consumer file key
  consumer_name TEXT NOT NULL,           -- Human-readable name
  sync_interval_hours INTEGER NOT NULL DEFAULT 24,  -- How often to sync
  max_stale_hours INTEGER NOT NULL DEFAULT 72,     -- Max age before considered stale
  enabled BOOLEAN NOT NULL DEFAULT TRUE, -- Whether to include in syncs
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  -- Unique constraint: one consumer entry per DS/consumer pair
  UNIQUE (ds_file_key, consumer_file_key)
);

-- Sync runs: Individual sync operations for each consumer
CREATE TABLE IF NOT EXISTS ds_sync_runs (
  id TEXT PRIMARY KEY,                    -- UUID
  consumer_id TEXT NOT NULL,              -- FK to ds_consumers.id
  synced_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  duration_ms INTEGER NOT NULL,           -- How long the sync took
  status TEXT NOT NULL CHECK (status IN ('ok', 'error', 'partial', 'skipped')),
  error_message TEXT,                     -- Error details if status='error'
  ds_last_modified TEXT,                  -- DS file lastModified at sync time
  consumer_last_modified TEXT,            -- Consumer file lastModified at sync time
  component_count INTEGER NOT NULL DEFAULT 0,  -- Number of component instances found
  variable_count INTEGER NOT NULL DEFAULT 0,    -- Number of variable bindings found
  warning_count INTEGER NOT NULL DEFAULT 0,    -- Number of warnings generated
  FOREIGN KEY (consumer_id) REFERENCES ds_consumers(id) ON DELETE CASCADE
);

-- Component usage: Aggregated component instance data per sync run
CREATE TABLE IF NOT EXISTS ds_component_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,                   -- FK to ds_sync_runs.id
  component_key TEXT NOT NULL,            -- DS component key (stable identifier)
  component_name TEXT NOT NULL,           -- DS component name
  instance_count INTEGER NOT NULL,        -- How many instances found
  sample_node_ids_json TEXT,              -- JSON array of up to 20 sample node IDs
  FOREIGN KEY (run_id) REFERENCES ds_sync_runs(id) ON DELETE CASCADE
);

-- Variable usage: Aggregated variable binding data per sync run
CREATE TABLE IF NOT EXISTS ds_variable_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,                   -- FK to ds_sync_runs.id
  variable_key TEXT NOT NULL,             -- DS variable key (stable identifier)
  variable_name TEXT NOT NULL,            -- DS variable name
  variable_type TEXT NOT NULL,            -- Variable type (COLOR, FLOAT, STRING, etc.)
  node_count INTEGER NOT NULL,            -- How many nodes use this variable
  sample_node_ids_json TEXT,              -- JSON array of up to 20 sample node IDs
  FOREIGN KEY (run_id) REFERENCES ds_sync_runs(id) ON DELETE CASCADE
);

-- Sync warnings: Issues detected during sync runs
CREATE TABLE IF NOT EXISTS ds_sync_warnings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,                   -- FK to ds_sync_runs.id
  code TEXT NOT NULL,                     -- Warning code (e.g., 'component_missing')
  message TEXT NOT NULL,                  -- Human-readable warning message
  node_id TEXT,                          -- Optional node ID for context
  FOREIGN KEY (run_id) REFERENCES ds_sync_runs(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_ds_consumers_ds_file_enabled ON ds_consumers(ds_file_key, enabled);
CREATE INDEX IF NOT EXISTS idx_ds_consumers_created_at ON ds_consumers(created_at);
CREATE INDEX IF NOT EXISTS idx_ds_consumers_ds_file_created ON ds_consumers(ds_file_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ds_sync_runs_consumer_synced ON ds_sync_runs(consumer_id, synced_at DESC);
CREATE INDEX IF NOT EXISTS idx_ds_component_usage_run_id ON ds_component_usage(run_id);
CREATE INDEX IF NOT EXISTS idx_ds_variable_usage_run_id ON ds_variable_usage(run_id);
CREATE INDEX IF NOT EXISTS idx_ds_component_usage_component_key ON ds_component_usage(component_key);
CREATE INDEX IF NOT EXISTS idx_ds_variable_usage_variable_key ON ds_variable_usage(variable_key);
CREATE INDEX IF NOT EXISTS idx_ds_sync_warnings_run_id ON ds_sync_warnings(run_id);
