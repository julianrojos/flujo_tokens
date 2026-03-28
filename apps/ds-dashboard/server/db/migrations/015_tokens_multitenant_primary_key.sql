-- Migration 015: Rebuild tokens for true multi-tenant keys
-- - Remove global uniqueness from tokens.id and tokens.css_var
-- - Enforce tenant-scoped keys:
--     PRIMARY KEY (ds_id, id)
--     UNIQUE (ds_id, css_var)
-- - Rebuild token_usage_occurrences to keep composite FK integrity

ALTER TABLE token_usage_occurrences RENAME TO token_usage_occurrences_old3;
ALTER TABLE tokens RENAME TO tokens_old3;

CREATE TABLE tokens (
  ds_id      TEXT NOT NULL REFERENCES design_systems(id) ON DELETE CASCADE,
  id         TEXT NOT NULL,
  slash_path TEXT NOT NULL,
  css_var    TEXT NOT NULL,
  type       TEXT NOT NULL,
  collection TEXT NOT NULL,
  raw_value  TEXT NOT NULL,
  PRIMARY KEY (ds_id, id),
  UNIQUE(ds_id, css_var)
);

INSERT OR IGNORE INTO tokens (
  ds_id, id, slash_path, css_var, type, collection, raw_value
)
SELECT ds_id, id, slash_path, css_var, type, collection, raw_value
FROM tokens_old3
WHERE ds_id IS NOT NULL;

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
FROM token_usage_occurrences_old3 AS old
JOIN tokens t ON t.ds_id = old.ds_id AND t.id = old.token_id;

DROP TABLE token_usage_occurrences_old3;
DROP TABLE tokens_old3;

CREATE INDEX IF NOT EXISTS idx_tokens_ds_id ON tokens(ds_id);
CREATE INDEX IF NOT EXISTS idx_tokens_id ON tokens(id);
CREATE INDEX IF NOT EXISTS idx_tokens_ds_css_var ON tokens(ds_id, css_var);
CREATE INDEX IF NOT EXISTS idx_tokens_ds_slash_path ON tokens(ds_id, slash_path);
CREATE INDEX IF NOT EXISTS idx_tokens_collection ON tokens(collection);
CREATE INDEX IF NOT EXISTS idx_tokens_type ON tokens(type);

CREATE INDEX IF NOT EXISTS idx_token_usage_occurrences_ds_id ON token_usage_occurrences(ds_id);
CREATE INDEX IF NOT EXISTS idx_token_usage_occurrences_token_id ON token_usage_occurrences(token_id);
CREATE INDEX IF NOT EXISTS idx_token_usage_occurrences_kind ON token_usage_occurrences(kind);
CREATE INDEX IF NOT EXISTS idx_token_usage_occurrences_ds_token ON token_usage_occurrences(ds_id, token_id);
