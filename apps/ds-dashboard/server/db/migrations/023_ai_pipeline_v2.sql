-- AI Pipeline v2: Add columns for 3-stage pipeline
-- All columns are nullable; NULL = not yet determined (job in progress)
-- Re-run safety is handled by schema_migrations tracking in db-service.

ALTER TABLE ai_jobs ADD COLUMN validation_report_json TEXT;
ALTER TABLE ai_jobs ADD COLUMN can_publish INTEGER;       -- NULL=pending, 0=false, 1=true
ALTER TABLE ai_jobs ADD COLUMN pipeline_severity TEXT;    -- 'blocking'|'warning'|'info'|NULL
ALTER TABLE ai_jobs ADD COLUMN pipeline_score INTEGER;    -- 0-100|NULL
ALTER TABLE ai_jobs ADD COLUMN pipeline_stage TEXT;       -- 'extracting'|'patching'|'validating'|NULL
