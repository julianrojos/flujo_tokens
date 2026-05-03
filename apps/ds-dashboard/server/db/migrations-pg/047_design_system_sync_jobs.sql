-- Migration 047: Design system sync jobs
-- Version: 047
-- PostgreSQL migration

CREATE TABLE design_system_sync_jobs (
  job_id        TEXT PRIMARY KEY,
  -- Historical identifier for the design system that produced the job.
  -- Intentionally not a foreign key so sync history survives design system deletion.
  system_id     TEXT NOT NULL,
  operation_name TEXT NOT NULL,
  label         TEXT NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('queued', 'running', 'success', 'error', 'cancelled')),
  request_id    TEXT,
  started_at    TIMESTAMPTZ,
  finished_at   TIMESTAMPTZ,
  result_json   JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_design_system_sync_jobs_system_id
  ON design_system_sync_jobs(system_id, updated_at DESC);
