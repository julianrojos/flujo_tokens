-- Add pipeline columns to ai_jobs that were added to 001_initial.sql but never backfilled via ALTER TABLE
ALTER TABLE ai_jobs
  ADD COLUMN IF NOT EXISTS editorial_patch_json  JSONB,
  ADD COLUMN IF NOT EXISTS validation_report_json JSONB,
  ADD COLUMN IF NOT EXISTS can_publish            BOOLEAN,
  ADD COLUMN IF NOT EXISTS pipeline_severity      TEXT,
  ADD COLUMN IF NOT EXISTS pipeline_score         DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS pipeline_stage         TEXT;
