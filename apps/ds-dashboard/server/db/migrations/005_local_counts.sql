-- Migration 005: Local counts for adoption tracking
-- Add nullable columns to track local (non-DS) component/variable counts in consumer files

ALTER TABLE ds_sync_runs ADD COLUMN local_component_defined_count INTEGER DEFAULT NULL;
ALTER TABLE ds_sync_runs ADD COLUMN local_component_used_count INTEGER DEFAULT NULL;
ALTER TABLE ds_sync_runs ADD COLUMN local_variable_defined_count INTEGER DEFAULT NULL;
ALTER TABLE ds_sync_runs ADD COLUMN local_variable_used_count INTEGER DEFAULT NULL;
