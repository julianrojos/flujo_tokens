-- Migration 045: persist the database provider used to record/import each design system
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'design_systems'
      AND column_name = 'database_provider'
  ) THEN
    ALTER TABLE design_systems
      ADD COLUMN database_provider TEXT;
  END IF;
END
$$;
