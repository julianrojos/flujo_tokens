-- Migration 040: rename_component_specs_markdown_path_to_doc_path
-- Keep the stored path field aligned with the neutral `docPath` naming used in code.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'component_specs'
      AND column_name = 'markdown_path'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'component_specs'
      AND column_name = 'doc_path'
  ) THEN
    ALTER TABLE component_specs
      RENAME COLUMN markdown_path TO doc_path;
  END IF;
END
$$;
