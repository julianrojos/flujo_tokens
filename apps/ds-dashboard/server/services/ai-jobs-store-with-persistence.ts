/**
 * AI Jobs Store with SQLite Persistence
 *
 * Extends AiJobsStore with database persistence.
 * DB is optional - falls back to in-memory only if not provided.
 */

import Database from 'better-sqlite3';

import { AiJobsStore } from './ai-jobs-store.js';
import type {
    AiJobState,
    AiJobInput,
    ComponentDocOutput,
    AiUsageMetrics,
} from './ai-component-doc-schema.js';
import type { AiProviderName } from './ai-provider.js';
import { JobsRepository } from '../db/jobs-repository.js';

/**
 * Options for AiJobsStoreWithPersistence
 */
export interface AiJobsStoreWithPersistenceOptions {
    /** Optional database for persistence */
    db?: Database.Database;
    /** Stale threshold in ms (default: 5 minutes) */
    staleThresholdMs?: number;
}

/**
 * AI Jobs Store with optional SQLite persistence
 *
 * When DB is provided:
 * - Jobs are persisted on enqueue/complete/fail/cancel
 * - Events are appended to DB on pushEvent
 * - Stale running jobs are marked as failed on startup
 *
 * When DB is not provided:
 * - Falls back to pure in-memory behavior (existing AiJobsStore)
 */
export class AiJobsStoreWithPersistence extends AiJobsStore {
    private db: Database.Database | undefined;
    private jobsRepo: JobsRepository | undefined;
    private staleThresholdMs: number;

    constructor(options: AiJobsStoreWithPersistenceOptions = {}) {
        super();
        this.db = options.db;
        this.staleThresholdMs = options.staleThresholdMs ?? 300000; // 5 minutes

        if (this.db) {
            this.jobsRepo = new JobsRepository(this.db);
            // Mark stale running jobs as failed on startup
            const marked = this.jobsRepo.markStaleRunningJobsAsFailed(this.staleThresholdMs);
            if (marked > 0) {
                console.log(`[AiJobsStore] Marked ${marked} stale running job(s) as failed`);
            }
        }
    }

    /**
     * Override enqueue to persist job
     */
    override enqueue(input: AiJobInput): AiJobState {
        const job = super.enqueue(input);

        // Persist to DB (only job state, events are in-memory)
        if (this.jobsRepo) {
            this.jobsRepo.upsertJob(job);
        }

        return job;
    }

    /**
     * Override pushEvent - persist events to DB
     */
    override pushEvent(jobId: string, event: string, data?: unknown): void {
        // Call parent to update in-memory state
        super.pushEvent(jobId, event, data);

        // Persist event to DB
        if (this.jobsRepo) {
            // Access job via protected method from parent class
            const job = this.getJobById(jobId);
            if (job && job.events.length > 0) {
                const lastEvent = job.events[job.events.length - 1];
                this.jobsRepo.appendJobEvent(jobId, lastEvent);
            }
        }
    }

    /**
     * Override complete to persist job state
     */
    override complete(jobId: string, output: ComponentDocOutput, usage: AiUsageMetrics): void {
        super.complete(jobId, output, usage);

        // Persist to DB
        if (this.jobsRepo) {
            const job = this.getJobById(jobId);
            if (job) {
                this.jobsRepo.upsertJob(job);
            }
        }
    }

    /**
     * Override fail to persist job state
     */
    override fail(jobId: string, error: string, code: string, retryable: boolean): void {
        super.fail(jobId, error, code, retryable);

        // Persist to DB
        if (this.jobsRepo) {
            const job = this.getJobById(jobId);
            if (job) {
                this.jobsRepo.upsertJob(job);
            }
        }
    }

    /**
     * Override cancel to persist job state
     */
    override cancel(jobId: string): void {
        super.cancel(jobId);

        // Persist to DB
        if (this.jobsRepo) {
            const job = this.getJobById(jobId);
            if (job) {
                this.jobsRepo.upsertJob(job);
            }
        }
    }

    /**
     * Get a job by ID (from DB if available, otherwise from memory)
     */
    getJobPersistent(jobId: string): AiJobState | null {
        if (this.jobsRepo) {
            return this.jobsRepo.getJob(jobId);
        }
        // Fallback to in-memory
        const job = this.getJobById(jobId);
        return job || null;
    }

    /**
     * Get a job by idempotency key (from DB)
     */
    getJobByIdempotencyKeyPersistent(idempotencyKey: string): AiJobState | null {
        if (this.jobsRepo) {
            return this.jobsRepo.getJobByIdempotencyKey(idempotencyKey);
        }
        return null;
    }

    /**
     * List jobs with optional filters (from DB)
     */
    listJobsPersistent(provider?: AiProviderName, status?: string): AiJobState[] {
        if (this.jobsRepo) {
            return this.jobsRepo.listJobs(provider, status);
        }
        return [];
    }

    /**
     * Load historical jobs from DB into memory
     * Useful for recovering jobs after server restart
     */
    loadJobsFromDb(limit: number = 100): void {
        if (!this.jobsRepo) {
            return;
        }

        // Load recent jobs that are not in terminal states
        const jobs = this.jobsRepo.listJobs();
        const loaded = Math.min(jobs.length, limit);

        for (let i = 0; i < loaded; i++) {
            const job = jobs[i];
            // Only load non-terminal or recently completed jobs
            if (job.status === 'queued' || job.status === 'running' ||
                (job.status === 'completed' && Date.now() - job.updatedAt < 3600000)) {
                this.loadJobIntoMemory(job);
            }
        }

        console.log(`[AiJobsStore] Loaded ${loaded} job(s) from database`);
    }
}
