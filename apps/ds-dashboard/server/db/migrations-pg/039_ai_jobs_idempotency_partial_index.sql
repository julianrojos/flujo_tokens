-- Replace the global unique constraint on idempotency_key with a partial index
-- that only enforces uniqueness for active jobs (queued/running).
-- Completed/failed/cancelled jobs may share an idempotency_key so users can
-- re-run documentation generation for the same component.
ALTER TABLE ai_jobs DROP CONSTRAINT IF EXISTS ai_jobs_idempotency_key_key;

CREATE UNIQUE INDEX IF NOT EXISTS ai_jobs_idempotency_key_active_uniq
  ON ai_jobs (idempotency_key)
  WHERE status IN ('queued', 'running');
