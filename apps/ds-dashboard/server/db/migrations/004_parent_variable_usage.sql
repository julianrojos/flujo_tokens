-- Migration 004: Persist DS parent-file variable usage snapshots
-- Stores usage captured from the design system source file itself (not consumer files).

CREATE TABLE IF NOT EXISTS ds_parent_variable_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ds_file_key TEXT NOT NULL,
  variable_key TEXT NOT NULL,
  variable_name TEXT NOT NULL,
  variable_type TEXT NOT NULL,
  node_count INTEGER NOT NULL,
  sample_node_ids_json TEXT,
  captured_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (ds_file_key, variable_key)
);

CREATE INDEX IF NOT EXISTS idx_ds_parent_variable_usage_ds_file
  ON ds_parent_variable_usage(ds_file_key);

CREATE INDEX IF NOT EXISTS idx_ds_parent_variable_usage_var_key
  ON ds_parent_variable_usage(variable_key);
