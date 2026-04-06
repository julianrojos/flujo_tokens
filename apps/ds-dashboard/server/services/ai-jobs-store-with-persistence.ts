/**
 * AI Jobs Store with SQLite Persistence
 *
 * Extends AiJobsStore with database persistence.
 * DB is required for all operations.
 */

import { randomBytes } from 'node:crypto';

import Database from 'better-sqlite3';

import { AiJobsStore } from './ai-jobs-store.js';
import type {
    AiJobInput,
    AiJobState,
} from './ai-component-doc-schema.js';
import type { AiProviderName } from './ai-provider.js';
import { JobsRepository } from '../db/jobs-repository.js';

/**
 * Options for AiJobsStoreWithPersistence
 */
export interface AiJobsStoreWithPersistenceOptions {
    /** Database for persistence */
    db: Database.Database;
    /** Stale threshold in ms (default: 5 minutes) */
    staleThresholdMs?: number;
}

/**
 * AI Jobs Store with SQLite persistence
 *
 * DB is required:
 * - Jobs are persisted on enqueue/complete/fail/cancel
 * - Events are appended to DB on pushEvent
 * - Stale running jobs are marked as failed on startup
 */
export class AiJobsStoreWithPersistence extends AiJobsStore {
    private jobsRepo: JobsRepository;

    constructor(options: AiJobsStoreWithPersistenceOptions) {
        super();
        const staleThresholdMs = options.staleThresholdMs ?? 300000; // 5 minutes
        this.jobsRepo = new JobsRepository(options.db);

        // Mark stale running jobs as failed on startup
        const marked = this.jobsRepo.markStaleRunningJobsAsFailed(staleThresholdMs);
        if (marked > 0) {
            console.log(`[AiJobsStore] Marked ${marked} stale running job(s) as failed`);
        }
    }

    private isIdempotencyUniqueConstraintError(error: unknown): boolean {
        const message = error instanceof Error ? error.message : String(error);
        return message.includes('UNIQUE constraint failed: ai_jobs.idempotency_key');
    }

    private rehydratePersistentJobIfMissing(job: AiJobState): AiJobState {
        const existing = this.findById(job.id);
        if (existing) return existing;

        this.loadJobIntoMemory(job);
        const maxSeq = this.jobsRepo.getMaxEventSeq(job.id);
        this.setNextEventSeq(job.id, maxSeq + 1);

        if (job.status === 'queued') {
            this.addToQueue(job.input.provider, job.id);
        } else if (job.status === 'running') {
            this.incrementRunningCount(job.input.provider);
        }

        return this.findById(job.id) ?? job;
    }

    /**
     * Override enqueue to recover gracefully from DB idempotency uniqueness conflicts.
     * This can happen after restarts when memory index is cold but DB already has the key.
     */
    override enqueue(input: AiJobInput): AiJobState {
        const idempotencyKey = this.computeIdempotencyKey(input);

        try {
            return super.enqueue(input);
        } catch (error) {
            if (!this.isIdempotencyUniqueConstraintError(error)) {
                throw error;
            }

            const persistent = this.getJobByIdempotencyKeyPersistent(idempotencyKey);
            if (!persistent) {
                throw error;
            }

            // super.enqueue may have already inserted an in-memory queued job
            // before DB persistence failed with UNIQUE(idempotency_key). Remove
            // that orphan to avoid duplicate dequeues/executions.
            const orphan = this.findByIdempotencyKey(idempotencyKey);
            if (orphan && orphan.id !== persistent.id) {
                this.removeJobFromMemory(orphan.id);
            }
            // Reuse only active jobs. Terminal jobs (completed|failed|cancelled)
            // must allow a fresh rerun even with identical inputs.
            if (persistent.status === 'queued' || persistent.status === 'running') {
                return this.rehydratePersistentJobIfMissing(persistent);
            }

            // Terminal job — create a fresh rerun.
            // Preserve original input.idempotencyKey (user intent). Use a
            // separate override key for internal DB uniqueness.
            const rerunKey = `${idempotencyKey}:rerun:${Date.now()}:${randomBytes(4).toString('hex')}`;
            return super.enqueue(input, rerunKey);
        }
    }

    /**
     * Override pushEvent - persist job snapshot + event atomically
     * PERSISTENCE CONTRACT: job snapshot MUST be persisted BEFORE appending event (FK order)
     */
    override pushEvent(jobId: string, event: string, data?: unknown): void {
        // Call parent to update in-memory state first
        super.pushEvent(jobId, event, data);

        // Persist to DB using selective snapshot strategy:
        // - keep snapshot freshness for queued/running jobs (stale recovery safety)
        // - always persist snapshot on terminal job.* events
        // - append-only for non-critical events after terminal states
        const job = this.getJobById(jobId);
        if (job && job.events.length > 0) {
            const lastEvent = job.events[job.events.length - 1];
            if (this.shouldPersistSnapshot(job, lastEvent.event)) {
                // Atomic transaction: job + event or nothing
                this.jobsRepo.persistTransition(job, lastEvent);
                return;
            }

            this.jobsRepo.appendJobEvent(jobId, lastEvent);
        }
    }

    private shouldPersistSnapshot(job: AiJobState, eventName: string): boolean {
        if (job.status === 'queued' || job.status === 'running') {
            return true;
        }

        return (
            eventName === 'job.completed' ||
            eventName === 'job.failed' ||
            eventName === 'job.cancelled'
        );
    }

    /**
     * Get a job by ID (from DB)
     */
    getJobPersistent(jobId: string): AiJobState | null {
        return this.jobsRepo.getJob(jobId);
    }

    /**
     * Get a job by idempotency key (from DB)
     */
    getJobByIdempotencyKeyPersistent(idempotencyKey: string): AiJobState | null {
        return this.jobsRepo.getJobByIdempotencyKey(idempotencyKey);
    }

    /**
     * List jobs with optional filters (from DB)
     */
    listJobsPersistent(provider?: AiProviderName, status?: string): AiJobState[] {
        return this.jobsRepo.listJobs(provider, status);
    }

    /**
     * Load jobs from database and rehydrate in-memory state
     * @param limit Maximum number of jobs to load (default: 100)
     * @param options Loading options
     */
    loadJobsFromDb(limit: number = 100, options: { autoResume?: boolean } = {}): void {
        // Load recent jobs that are not in terminal states
        const jobs = this.jobsRepo.listJobs();
        let rehydratedCount = 0;

        for (let i = 0; i < jobs.length && rehydratedCount < limit; i++) {
            const job = jobs[i];
            // Only load non-terminal or recently completed jobs
            if (job.status === 'queued' || job.status === 'running' ||
                (job.status === 'completed' && Date.now() - job.updatedAt < 3600000)) {
                const existingJob = this.getJobById(job.id);
                // Load job into memory
                this.loadJobIntoMemory(job);
                // Rehydrate nextEventSeq = max(seq)+1 to avoid UNIQUE violations
                const maxSeq = this.jobsRepo.getMaxEventSeq(job.id);
                this.setNextEventSeq(job.id, maxSeq + 1);
                // Rehydrate queues for queued jobs (no cast needed - input.provider is AiProviderName)
                if (job.status === 'queued') {
                    this.addToQueue(job.input.provider, job.id);
                }
                // Rehydrate runningCount for running jobs (avoid double-counting)
                if (job.status === 'running') {
                    // Use pre-load state to avoid suppressing first count after loadJobIntoMemory.
                    if (!existingJob || existingJob.status !== 'running') {
                        this.incrementRunningCount(job.input.provider);
                    }
                }
                rehydratedCount++;
            }
        }

        console.log(`[AiJobsStore] Rehydrated ${rehydratedCount} job(s) from database`);

        // Auto-resume queued jobs by default for backward compatibility
        if (options.autoResume !== false) {
            this.triggerRecoveryDequeue();
        }
    }

    /**
     * Resume execution of recovered queued jobs
     * Call this after setting up job execution handlers
     */
    resumeRecoveredQueue(): void {
        this.triggerRecoveryDequeue();
    }

    /**
     * Trigger tryDequeue for recovered queued jobs after restart
     * This ensures jobs queued before restart resume execution
     * Drains queue until concurrency limit reached per provider
     */
    private triggerRecoveryDequeue(): void {
        const providers: AiProviderName[] = ['anthropic', 'openai', 'ollama', 'gemini'];
        const maxConcurrent = this.getMaxConcurrentPerProvider();

        for (const provider of providers) {
            // Drain queue until concurrency limit reached
            // This ensures all recovered queued jobs get a chance to run
            let status = this.getQueueStatus(provider);
            while (status.queued > 0 && status.running < maxConcurrent) {
                this.tryDequeue(provider);
                status = this.getQueueStatus(provider);
            }
        }
    }
}
