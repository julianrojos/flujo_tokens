/**
 * Jobs Repository
 *
 * SQLite-backed persistence for AI jobs (AiJobState).
 * Provides CRUD operations for ai_jobs and job_events tables.
 *
 * PERSISTENCE CONTRACT:
 * - Job snapshot MUST be persisted BEFORE appending events (FK order)
 * - Events are appended with monotonic seq per job_id
 * - INSERT OR REPLACE is dangerous - use ON CONFLICT DO UPDATE instead
 * - Recovery must rehydrate nextEventSeq = max(seq)+1 to avoid UNIQUE violations
 */

import Database from 'better-sqlite3';

import type { AiJobState, AiJobEvent, AiJobInput, AiJobStatus } from '../services/ai-component-doc-schema.js';
import type { ComponentDocOutput } from '../services/ai-component-doc-schema.js';
import type { AiUsageMetrics } from '../services/ai-component-doc-schema.js';
import type { EditorialPatch } from '../services/ai-editorial-patch-schema.js';
import type { ValidationReport } from '../services/ai-validation-report-schema.js';

/**
 * Database row type for ai_jobs table
 */
interface AiJobRow {
    id: string;
    idempotency_key: string;
    status: string;
    provider: string;
    input_json: string;
    output_json: string | null;
    usage_json: string | null;
    editorial_patch_json: string | null;
    validation_report_json: string | null;
    can_publish: number | null;
    pipeline_severity: string | null;
    pipeline_score: number | null;
    pipeline_stage: string | null;
    error: string | null;
    error_code: string | null;
    retryable: number | null;
    created_at: number;
    updated_at: number;
}

/**
 * Jobs Repository for persistent AI job storage
 */
export class JobsRepository {
    private db: Database.Database;

    constructor(db: Database.Database) {
        this.db = db;
    }

    /**
     * Insert or update a job (upsert)
     * Uses ON CONFLICT DO UPDATE to preserve related job_events (unlike INSERT OR REPLACE)
     */
    upsertJob(job: AiJobState): void {
        const stmt = this.db.prepare(`
            INSERT INTO ai_jobs (
                id, idempotency_key, status, provider,
                input_json, output_json, usage_json, editorial_patch_json,
                validation_report_json, can_publish, pipeline_severity, pipeline_score, pipeline_stage,
                error, error_code, retryable,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                idempotency_key = excluded.idempotency_key,
                status = excluded.status,
                provider = excluded.provider,
                input_json = excluded.input_json,
                output_json = excluded.output_json,
                usage_json = excluded.usage_json,
                editorial_patch_json = excluded.editorial_patch_json,
                validation_report_json = excluded.validation_report_json,
                can_publish = excluded.can_publish,
                pipeline_severity = excluded.pipeline_severity,
                pipeline_score = excluded.pipeline_score,
                pipeline_stage = excluded.pipeline_stage,
                error = excluded.error,
                error_code = excluded.error_code,
                retryable = excluded.retryable,
                updated_at = excluded.updated_at
        `);

        stmt.run(
            job.id,
            job.idempotencyKey,
            job.status,
            job.input.provider,
            JSON.stringify(job.input),
            job.output ? JSON.stringify(job.output) : null,
            job.usage ? JSON.stringify(job.usage) : null,
            job.editorialPatch ? JSON.stringify(job.editorialPatch) : null,
            job.validationReport ? JSON.stringify(job.validationReport) : null,
            job.canPublish !== undefined ? (job.canPublish ? 1 : 0) : null,
            job.pipelineSeverity ?? null,
            job.pipelineScore ?? null,
            job.pipelineStage ?? null,
            job.error ?? null,
            job.errorCode ?? null,
            job.retryable !== undefined ? (job.retryable ? 1 : 0) : null,
            job.createdAt,
            job.updatedAt
        );
    }

    /**
     * Get max event sequence number for a job
     * Returns 0 if job has no events (first event will be seq=1)
     */
    getMaxEventSeq(jobId: string): number {
        const stmt = this.db.prepare(`
            SELECT COALESCE(MAX(seq), 0) as maxSeq
            FROM job_events
            WHERE job_id = ?
        `);
        const result = stmt.get(jobId) as { maxSeq: number };
        return result.maxSeq;
    }

    /**
     * Append an event to a job's event log
     */
    appendJobEvent(jobId: string, event: AiJobEvent): void {
        const stmt = this.db.prepare(`
            INSERT INTO job_events (job_id, seq, ts, event, data)
            VALUES (?, ?, ?, ?, ?)
        `);

        stmt.run(
            jobId,
            event.seq,
            event.ts,
            event.event,
            event.data ? JSON.stringify(event.data) : null
        );
    }

    /**
     * Get a job by ID
     */
    getJob(id: string): AiJobState | null {
        const stmt = this.db.prepare(`SELECT * FROM ai_jobs WHERE id = ?`);
        const row = stmt.get(id) as AiJobRow | undefined;

        if (!row) return null;

        return this.rowToJob(row);
    }

    /**
     * Get a job by idempotency key
     */
    getJobByIdempotencyKey(idempotencyKey: string): AiJobState | null {
        const stmt = this.db.prepare(`SELECT * FROM ai_jobs WHERE idempotency_key = ?`);
        const row = stmt.get(idempotencyKey) as AiJobRow | undefined;

        if (!row) return null;

        return this.rowToJob(row);
    }

    /**
     * List jobs with optional filters
     */
    listJobs(provider?: string, status?: string): AiJobState[] {
        let sql = 'SELECT * FROM ai_jobs WHERE 1=1';
        const params: unknown[] = [];

        if (provider) {
            sql += ' AND provider = ?';
            params.push(provider);
        }

        if (status) {
            sql += ' AND status = ?';
            params.push(status);
        }

        sql += ' ORDER BY created_at DESC';

        const stmt = this.db.prepare(sql);
        const rows = stmt.all(...params) as AiJobRow[];

        return rows.map((row) => this.rowToJob(row));
    }

    /**
     * Mark stale running jobs as failed
     * Returns the number of jobs marked as failed
     */
    markStaleRunningJobsAsFailed(staleThresholdMs: number = 300000): number {
        const cutoff = Date.now() - staleThresholdMs;

        const stmt = this.db.prepare(`
            UPDATE ai_jobs
            SET status = 'failed',
                error = 'Job stuck in running state (server restart)',
                error_code = 'server_restart',
                retryable = 1,
                updated_at = ?
            WHERE status = 'running' AND updated_at < ?
        `);

        const result = stmt.run(Date.now(), cutoff);
        return result.changes;
    }

    /**
     * Get events for a job
     */
    getJobEvents(jobId: string): AiJobEvent[] {
        const stmt = this.db.prepare(`
            SELECT seq, ts, event, data
            FROM job_events
            WHERE job_id = ?
            ORDER BY seq ASC
        `);

        const rows = stmt.all(jobId) as Array<{
            seq: number;
            ts: number;
            event: string;
            data: string | null;
        }>;

        return rows.map((row) => ({
            seq: row.seq,
            ts: row.ts,
            event: row.event,
            data: row.data ? JSON.parse(row.data) : undefined,
        }));
    }

    /**
     * Atomically persist job snapshot + event in correct order
     * Uses transaction to ensure both succeed or both fail
     */
    persistTransition(job: AiJobState, event: AiJobEvent): void {
        const tx = this.db.transaction(() => {
            this.upsertJob(job);
            this.appendJobEvent(job.id, event);
        });
        tx();
    }

    /**
     * Convert database row to AiJobState
     */
    private rowToJob(row: AiJobRow): AiJobState {
        const events = this.getJobEvents(row.id);

        return {
            id: row.id,
            input: JSON.parse(row.input_json) as AiJobInput,
            status: row.status as AiJobStatus,
            idempotencyKey: row.idempotency_key,
            events,
            output: row.output_json ? JSON.parse(row.output_json) as ComponentDocOutput : undefined,
            usage: row.usage_json ? JSON.parse(row.usage_json) as AiUsageMetrics : undefined,
            editorialPatch: row.editorial_patch_json
                ? JSON.parse(row.editorial_patch_json) as EditorialPatch
                : undefined,
            validationReport: row.validation_report_json
                ? JSON.parse(row.validation_report_json) as ValidationReport
                : undefined,
            canPublish: row.can_publish !== null ? row.can_publish === 1 : undefined,
            pipelineSeverity: row.pipeline_severity as 'blocking' | 'warning' | 'info' | undefined,
            pipelineScore: row.pipeline_score ?? undefined,
            pipelineStage: row.pipeline_stage as 'extracting' | 'patching' | 'validating' | undefined,
            error: row.error ?? undefined,
            errorCode: row.error_code ?? undefined,
            retryable: row.retryable !== null ? row.retryable === 1 : undefined,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    }
}
