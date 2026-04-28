ALTER TABLE ds_sync_runs
  ADD COLUMN IF NOT EXISTS parent_derived_component_count INTEGER;
