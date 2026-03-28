-- Migration 010: Enforce tenant-consistent FK for token usage
-- token_usage_occurrences must reference tokens by (ds_id, id)

-- Ensure parent composite key is explicitly unique for FK target
CREATE UNIQUE INDEX IF NOT EXISTS idx_tokens_ds_id_id_unique ON tokens(ds_id, id);

-- Rebuild token_usage_occurrences with composite FK
ALTER TABLE token_usage_occurrences RENAME TO token_usage_occurrences_old2;

CREATE TABLE token_usage_occurrences (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ds_id      TEXT NOT NULL REFERENCES design_systems(id) ON DELETE CASCADE,
  token_id   TEXT NOT NULL,
  kind       TEXT NOT NULL,
  source     TEXT NOT NULL,
  owner      TEXT NOT NULL,
  detail     TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  UNIQUE(ds_id, token_id, kind, source, owner, detail),
  FOREIGN KEY (ds_id, token_id) REFERENCES tokens(ds_id, id) ON DELETE CASCADE
);

INSERT OR IGNORE INTO token_usage_occurrences (
  id, ds_id, token_id, kind, source, owner, detail, created_at
)
SELECT old.id, old.ds_id, old.token_id, old.kind, old.source, old.owner, old.detail, old.created_at
FROM token_usage_occurrences_old2 AS old
JOIN tokens t ON t.ds_id = old.ds_id AND t.id = old.token_id;

DROP TABLE token_usage_occurrences_old2;

CREATE INDEX IF NOT EXISTS idx_token_usage_occurrences_ds_id ON token_usage_occurrences(ds_id);
CREATE INDEX IF NOT EXISTS idx_token_usage_occurrences_token_id ON token_usage_occurrences(token_id);
CREATE INDEX IF NOT EXISTS idx_token_usage_occurrences_kind ON token_usage_occurrences(kind);
CREATE INDEX IF NOT EXISTS idx_token_usage_occurrences_ds_token ON token_usage_occurrences(ds_id, token_id);
