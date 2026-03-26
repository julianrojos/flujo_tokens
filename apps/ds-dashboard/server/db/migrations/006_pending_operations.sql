-- Migration 006: Pending operations write-ahead log
-- Tracks in-progress operations that span multiple systems (FS, DB, config)
-- to enable recovery after server crashes.

CREATE TABLE IF NOT EXISTS pending_operations (
  id           TEXT PRIMARY KEY,
  type         TEXT NOT NULL,
  payload      TEXT NOT NULL,           -- JSON
  status       TEXT NOT NULL DEFAULT 'in_progress'
               CHECK (status IN ('in_progress', 'completed', 'abandoned')),
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_pending_operations_status_type
  ON pending_operations(status, type);
