-- Migration 043: tokens multitenant keys
-- Preserve token ids and css vars within each design system instead of globally.

ALTER TABLE tokens DROP CONSTRAINT IF EXISTS tokens_pkey;
ALTER TABLE tokens DROP CONSTRAINT IF EXISTS tokens_css_var_key;
ALTER TABLE tokens ALTER COLUMN ds_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tokens_ds_css_var_key'
      AND conrelid = 'tokens'::regclass
  ) THEN
    ALTER TABLE tokens
      ADD CONSTRAINT tokens_ds_css_var_key UNIQUE (ds_id, css_var);
  END IF;
END $$;

ALTER TABLE tokens
  ADD CONSTRAINT tokens_pkey PRIMARY KEY (ds_id, id);
