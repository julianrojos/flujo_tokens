-- Migration 037: Drop legacy figma_aliases unique constraint and keep ds-scoped uniqueness.
ALTER TABLE figma_aliases
  DROP CONSTRAINT IF EXISTS figma_aliases_from_path_to_path_key;

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
