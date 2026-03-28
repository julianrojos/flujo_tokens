-- Migration 009: Harden multi-tenant integrity for aliases and token usage
-- - figma_aliases becomes tenant-scoped (ds_id)
-- - token_usage_occurrences.token_id gets a real FK to tokens(id)

-- Rebuild figma_aliases with ds_id + FK
ALTER TABLE figma_aliases RENAME TO figma_aliases_old;

CREATE TABLE figma_aliases (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ds_id      TEXT NOT NULL REFERENCES design_systems(id) ON DELETE CASCADE,
  from_path  TEXT NOT NULL,
  to_path    TEXT NOT NULL,
  modes      TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  UNIQUE(ds_id, from_path, to_path)
);

-- Best-effort migration of legacy global aliases to the default system.
WITH candidate_ds AS (
  SELECT value AS ds_id, 0 AS priority, 0 AS created
  FROM app_settings
  WHERE key = 'default_system_id'
  UNION ALL
  SELECT id AS ds_id, 1 AS priority, created_at AS created
  FROM design_systems
),
target_ds AS (
  SELECT ds_id
  FROM candidate_ds
  ORDER BY priority ASC, created ASC
  LIMIT 1
)
INSERT INTO figma_aliases (ds_id, from_path, to_path, modes, created_at)
SELECT target_ds.ds_id, old.from_path, old.to_path, old.modes, old.created_at
FROM figma_aliases_old AS old
CROSS JOIN target_ds;

DROP TABLE figma_aliases_old;

CREATE INDEX idx_figma_aliases_ds_id ON figma_aliases(ds_id);
CREATE INDEX idx_figma_aliases_from ON figma_aliases(from_path);
CREATE INDEX idx_figma_aliases_to ON figma_aliases(to_path);

-- Rebuild token_usage_occurrences to enforce FK token_id -> tokens(id)
ALTER TABLE token_usage_occurrences RENAME TO token_usage_occurrences_old;

CREATE TABLE token_usage_occurrences (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ds_id      TEXT NOT NULL REFERENCES design_systems(id) ON DELETE CASCADE,
  token_id   TEXT NOT NULL REFERENCES tokens(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,
  source     TEXT NOT NULL,
  owner      TEXT NOT NULL,
  detail     TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  UNIQUE(ds_id, token_id, kind, source, owner, detail)
);

INSERT OR IGNORE INTO token_usage_occurrences (
  id, ds_id, token_id, kind, source, owner, detail, created_at
)
SELECT old.id, old.ds_id, old.token_id, old.kind, old.source, old.owner, old.detail, old.created_at
FROM token_usage_occurrences_old AS old
JOIN tokens t ON t.id = old.token_id AND t.ds_id = old.ds_id;

DROP TABLE token_usage_occurrences_old;

CREATE INDEX IF NOT EXISTS idx_token_usage_occurrences_ds_id ON token_usage_occurrences(ds_id);
CREATE INDEX IF NOT EXISTS idx_token_usage_occurrences_token_id ON token_usage_occurrences(token_id);
CREATE INDEX IF NOT EXISTS idx_token_usage_occurrences_kind ON token_usage_occurrences(kind);
CREATE INDEX IF NOT EXISTS idx_token_usage_occurrences_ds_token ON token_usage_occurrences(ds_id, token_id);
