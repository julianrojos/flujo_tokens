-- Migration 036: Add ds_id to figma_aliases for multi-tenant alias resolution.
ALTER TABLE figma_aliases
  ADD COLUMN IF NOT EXISTS ds_id TEXT;

UPDATE figma_aliases
SET ds_id = ''
WHERE ds_id IS NULL;

ALTER TABLE figma_aliases
  ALTER COLUMN ds_id SET NOT NULL;

DROP INDEX IF EXISTS idx_figma_aliases_from;
DROP INDEX IF EXISTS idx_figma_aliases_to;

CREATE INDEX IF NOT EXISTS idx_figma_aliases_ds_from ON figma_aliases(ds_id, from_path);
CREATE INDEX IF NOT EXISTS idx_figma_aliases_ds_to ON figma_aliases(ds_id, to_path);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'figma_aliases_ds_from_to_key'
      AND conrelid = 'figma_aliases'::regclass
  ) THEN
    ALTER TABLE figma_aliases
      ADD CONSTRAINT figma_aliases_ds_from_to_key UNIQUE (ds_id, from_path, to_path);
  END IF;
END $$;
