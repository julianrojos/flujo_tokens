-- Migration 041: persist component import snapshot metadata per design system
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'design_systems'
      AND column_name = 'detected_components_count'
  ) THEN
    ALTER TABLE design_systems
      ADD COLUMN detected_components_count INTEGER;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'design_systems'
      AND column_name = 'imported_components_count'
  ) THEN
    ALTER TABLE design_systems
      ADD COLUMN imported_components_count INTEGER;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'design_systems'
      AND column_name = 'pending_components_count'
  ) THEN
    ALTER TABLE design_systems
      ADD COLUMN pending_components_count INTEGER;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'design_systems'
      AND column_name = 'imported_component_names'
  ) THEN
    ALTER TABLE design_systems
      ADD COLUMN imported_component_names TEXT;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'design_systems'
      AND column_name = 'pending_component_names'
  ) THEN
    ALTER TABLE design_systems
      ADD COLUMN pending_component_names TEXT;
  END IF;
END
$$;
