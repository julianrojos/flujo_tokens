ALTER TABLE ds_sync_runs
  ADD COLUMN IF NOT EXISTS consumer_usage_details_json JSONB;
