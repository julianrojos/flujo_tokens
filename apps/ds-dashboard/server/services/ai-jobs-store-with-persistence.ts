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
        if (this.jobsRepo) {
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
     * Override enqueue - delegates to parent (pushEvent handles persistence)
     */
    override enqueue(input: AiJobInput): AiJobState {
        return super.enqueue(input);
    }

    /**
     * Override complete - delegates to parent (pushEvent handles persistence)
     */
    override complete(jobId: string, output: ComponentDocOutput, usage: AiUsageMetrics): void {
        super.complete(jobId, output, usage);
    }

    /**
     * Override fail - delegates to parent (pushEvent handles persistence)
     */
    override fail(jobId: string, error: string, code: string, retryable: boolean): void {
        super.fail(jobId, error, code, retryable);
    }

    /**
     * Override cancel - delegates to parent (pushEvent handles persistence)
     */
    override cancel(jobId: string): void {
        super.cancel(jobId);
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
     * Load jobs from database and rehydrate in-memory state
     * @param limit Maximum number of jobs to load (default: 100)
     * @param options Loading options
     */
    loadJobsFromDb(limit: number = 100, options: { autoResume?: boolean } = {}): void {
        if (!this.jobsRepo) {
            return;
        }

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
        const providers: AiProviderName[] = ['anthropic', 'openai', 'ollama'];
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
