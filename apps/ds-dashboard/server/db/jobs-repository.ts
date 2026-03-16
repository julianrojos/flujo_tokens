/**
 * Jobs Repository
 *
 * SQLite-backed persistence for AI jobs (AiJobState).
 * Provides CRUD operations for ai_jobs and job_events tables.
 */

import Database from 'better-sqlite3';

import type { AiJobState, AiJobEvent, AiJobInput, AiJobStatus } from '../services/ai-component-doc-schema.js';
import type { ComponentDocOutput } from '../services/ai-component-doc-schema.js';
import type { AiUsageMetrics } from '../services/ai-component-doc-schema.js';

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
     * Insert or replace a job (upsert)
     */
    upsertJob(job: AiJobState): void {
        const stmt = this.db.prepare(`
            INSERT OR REPLACE INTO ai_jobs (
                id, idempotency_key, status, provider,
                input_json, output_json, usage_json,
                error, error_code, retryable,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run(
            job.id,
            job.idempotencyKey,
            job.status,
            job.input.provider,
            JSON.stringify(job.input),
            job.output ? JSON.stringify(job.output) : null,
            job.usage ? JSON.stringify(job.usage) : null,
            job.error ?? null,
            job.errorCode ?? null,
            job.retryable !== undefined ? (job.retryable ? 1 : 0) : null,
            job.createdAt,
            job.updatedAt
        );
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
            error: row.error ?? undefined,
            errorCode: row.error_code ?? undefined,
            retryable: row.retryable !== null ? row.retryable === 1 : undefined,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    }
}
