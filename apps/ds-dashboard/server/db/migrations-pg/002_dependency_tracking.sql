-- Migration 002: Dependency tracking tables
-- Version: 002
-- PostgreSQL migration

-- Consumers: Design System files and their consuming files
CREATE TABLE ds_consumers (
  id TEXT PRIMARY KEY,
  ds_file_key TEXT NOT NULL,
  consumer_file_key TEXT NOT NULL,
  consumer_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ds_file_key, consumer_file_key)
);

-- Sync runs: Individual sync operations for each consumer
CREATE TABLE ds_sync_runs (
  id TEXT PRIMARY KEY,
  consumer_id TEXT NOT NULL REFERENCES ds_consumers(id) ON DELETE CASCADE,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  duration_ms INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ok', 'error', 'partial', 'skipped')),
  error_message TEXT,
  ds_last_modified TEXT,
  consumer_last_modified TEXT,
  component_count INTEGER NOT NULL DEFAULT 0,
  variable_count INTEGER NOT NULL DEFAULT 0,
  warning_count INTEGER NOT NULL DEFAULT 0,
  local_component_used_count INTEGER,
  parent_derived_component_count INTEGER,
  local_variable_defined_count INTEGER,
  local_variable_used_count INTEGER
);

-- Component usage: Aggregated component instance data per sync run
CREATE TABLE ds_component_usage (
  id BIGSERIAL PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES ds_sync_runs(id) ON DELETE CASCADE,
  component_key TEXT NOT NULL,
  component_name TEXT NOT NULL,
  instance_count INTEGER NOT NULL,
  sample_node_ids_json JSONB
);

-- Variable usage: Aggregated variable binding data per sync run
CREATE TABLE ds_variable_usage (
  id BIGSERIAL PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES ds_sync_runs(id) ON DELETE CASCADE,
  variable_key TEXT NOT NULL,
  variable_name TEXT NOT NULL,
  variable_type TEXT NOT NULL,
  node_count INTEGER NOT NULL,
  sample_node_ids_json JSONB
);

-- Sync warnings: Issues detected during sync runs
CREATE TABLE ds_sync_warnings (
  id BIGSERIAL PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES ds_sync_runs(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  message TEXT NOT NULL,
  node_id TEXT
);

-- Parent variable usage: DS source file variable usage
CREATE TABLE ds_parent_variable_usage (
  id BIGSERIAL PRIMARY KEY,
  ds_file_key TEXT NOT NULL,
  variable_key TEXT NOT NULL,
  variable_name TEXT NOT NULL,
  variable_type TEXT NOT NULL,
  node_count INTEGER NOT NULL,
  sample_node_ids_json JSONB,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ds_file_key, variable_key)
);

-- Pending operations write-ahead log
CREATE TABLE pending_operations (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'abandoned')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- Indexes for performance
CREATE INDEX idx_ds_consumers_created_at ON ds_consumers(created_at);
CREATE INDEX idx_ds_consumers_ds_file_created ON ds_consumers(ds_file_key, created_at DESC);
CREATE INDEX idx_ds_sync_runs_consumer_synced ON ds_sync_runs(consumer_id, synced_at DESC);
CREATE INDEX idx_ds_component_usage_run_id ON ds_component_usage(run_id);
CREATE INDEX idx_ds_variable_usage_run_id ON ds_variable_usage(run_id);
CREATE INDEX idx_ds_component_usage_component_key ON ds_component_usage(component_key);
CREATE INDEX idx_ds_variable_usage_variable_key ON ds_variable_usage(variable_key);
CREATE INDEX idx_ds_sync_warnings_run_id ON ds_sync_warnings(run_id);
CREATE INDEX idx_ds_parent_variable_usage_ds_file ON ds_parent_variable_usage(ds_file_key);
CREATE INDEX idx_ds_parent_variable_usage_var_key ON ds_parent_variable_usage(variable_key);
CREATE INDEX idx_pending_operations_status_type ON pending_operations(status, type);
