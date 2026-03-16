/**
 * AI Jobs Store
 * In-memory FIFO job queue with idempotency, concurrency control, and cleanup
 */

import crypto from 'crypto';
import type {
    AiJobState,
    AiJobInput,
    AiJobEvent,
    ComponentDocOutput,
    AiUsageMetrics,
} from './ai-component-doc-schema.js';
import type { AiProviderName } from './ai-provider.js';

/**
 * Maximum number of concurrent jobs per provider
 */
const MAX_CONCURRENT_PER_PROVIDER = 3;

/**
 * Maximum total jobs in store
 */
const MAX_JOBS = 200;

/**
 * Maximum events per job (ring buffer)
 */
const MAX_EVENTS_PER_JOB = 100;

/**
 * Job TTL in milliseconds (24 hours)
 */
const JOB_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Cleanup interval in milliseconds (1 hour)
 */
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

/**
 * AI Jobs Store class
 */
export class AiJobsStore {
    private jobs: Map<string, AiJobState> = new Map();
    private idempotencyIndex: Map<string, string> = new Map();
    private queues: Map<AiProviderName, string[]> = new Map([
        ['anthropic', []],
        ['openai', []],
        ['ollama', []],
    ]);
    private nextEventSeq: Map<string, number> = new Map();
    private runningCount: Map<AiProviderName, number> = new Map([
        ['anthropic', 0],
        ['openai', 0],
        ['ollama', 0],
    ]);
    private cleanupTimer: ReturnType<typeof setInterval> | null = null;
    private prompts: Map<string, string> = new Map();
    private onJobStarted?: (job: AiJobState) => void;

    constructor() {
        // Initialize queues
        this.queues.set('anthropic', []);
        this.queues.set('openai', []);
        this.queues.set('ollama', []);
        this.runningCount.set('anthropic', 0);
        this.runningCount.set('openai', 0);
        this.runningCount.set('ollama', 0);
    }

    /**
     * Generate a unique job ID
     */
    generateJobId(): string {
        const timestamp = Date.now();
        const random = crypto.randomBytes(4).toString('hex');
        return `ai_${timestamp}_${random}`;
    }

    /**
     * Compute idempotency key from job input
     * @param input - Job input
     * @returns Idempotency key
     */
    computeIdempotencyKey(input: AiJobInput): string {
        if (input.idempotencyKey) {
            return input.idempotencyKey;
        }

        const data = {
            type: input.type,
            provider: input.provider,
            componentId: input.componentId,
            figmaUrl: input.figmaUrl || '',
            model: input.model || '',
        };

        return crypto
            .createHash('sha256')
            .update(JSON.stringify(data))
            .digest('hex')
            .slice(0, 16);
    }

    /**
     * Enqueue a new job
     * @param input - Job input parameters
     * @returns Created job state
     */
    enqueue(input: AiJobInput): AiJobState {
        // Check capacity
        if (this.jobs.size >= MAX_JOBS) {
            const error = new Error('Job queue is at capacity') as Error & { code: string; retryable: boolean };
            error.code = 'ai.job.queue_full';
            error.retryable = true;
            throw error;
        }

        const idempotencyKey = this.computeIdempotencyKey(input);

        // Check for existing job with same idempotency key
        // Reuse only for non-terminal states (queued|running) and completed
        // Allow new job for terminal failure states (failed|cancelled)
        const existingJobId = this.idempotencyIndex.get(idempotencyKey);
        if (existingJobId) {
            const existingJob = this.jobs.get(existingJobId);
            if (existingJob && (existingJob.status === 'queued' || existingJob.status === 'running' || existingJob.status === 'completed')) {
                return existingJob;
            }
        }

        // Create new job
        const now = Date.now();
        const job: AiJobState = {
            id: this.generateJobId(),
            input,
            status: 'queued',
            idempotencyKey,
            events: [],
            createdAt: now,
            updatedAt: now,
        };

        // Store job and initialize event sequence counter
        this.jobs.set(job.id, job);
        this.idempotencyIndex.set(idempotencyKey, job.id);
        this.nextEventSeq.set(job.id, 1);

        // Add to queue
        const queue = this.queues.get(input.provider);
        if (queue) {
            queue.push(job.id);
        }

        // Initialize event
        this.pushEvent(job.id, 'job.queued', { provider: input.provider });

        return job;
    }

    /**
     * Try to dequeue a job for a provider
     * @param provider - Provider name
     * @returns Dequeued job or null
     */
    tryDequeue(provider: AiProviderName): AiJobState | null {
        const running = this.runningCount.get(provider) || 0;
        if (running >= MAX_CONCURRENT_PER_PROVIDER) {
            return null;
        }

        const queue = this.queues.get(provider);
        if (!queue || queue.length === 0) {
            return null;
        }

        const jobId = queue.shift();
        if (!jobId) {
            return null;
        }

        const job = this.jobs.get(jobId);
        if (!job) {
            return null;
        }

        // Update job status
        job.status = 'running';
        job.updatedAt = Date.now();

        // Increment running count
        this.runningCount.set(provider, running + 1);

        this.pushEvent(job.id, 'job.started', { provider });

        if (this.onJobStarted) {
            this.onJobStarted(job);
        }

        return job;
    }

    /**
     * Try to dequeue the next job for a provider
     * @param provider - Provider name
     */
    tryDequeueNext(provider: AiProviderName): void {
        const running = this.runningCount.get(provider) || 0;
        if (running > 0) {
            this.runningCount.set(provider, running - 1);
        }
        this.tryDequeue(provider);
    }

    /**
     * Push an event to a job's event log
     * @param jobId - Job ID
     * @param event - Event name
     * @param data - Optional event data
     */
    pushEvent(jobId: string, event: string, data?: unknown): void {
        const job = this.jobs.get(jobId);
        if (!job) {
            return;
        }

        // Get and increment sequence counter (monotonic, not affected by ring buffer)
        let seq = this.nextEventSeq.get(jobId) || 1;
        const jobEvent: AiJobEvent = {
            seq: seq++,
            ts: Date.now(),
            event,
            data,
        };
        this.nextEventSeq.set(jobId, seq);

        // Ring buffer: remove oldest if at capacity
        if (job.events.length >= MAX_EVENTS_PER_JOB) {
            job.events.shift();
        }

        job.events.push(jobEvent);
        job.updatedAt = Date.now();
    }

    /**
     * Set the prompt for a job (redacted, for debugging)
     * @param jobId - Job ID
     * @param prompt - Redacted prompt
     */
    setPrompt(jobId: string, prompt: string): void {
        this.prompts.set(jobId, prompt);
    }

    /**
     * Get prompt for a job
     * @param jobId - Job ID
     * @returns Redacted prompt or undefined
     */
    getPrompt(jobId: string): string | undefined {
        return this.prompts.get(jobId);
    }

    /**
     * Complete a job with output
     * @param jobId - Job ID
     * @param output - Generated output
     * @param usage - Usage metrics
     */
    complete(jobId: string, output: ComponentDocOutput, usage: AiUsageMetrics): void {
        const job = this.jobs.get(jobId);
        if (!job) {
            return;
        }

        job.status = 'completed';
        job.output = output;
        job.usage = usage;
        job.updatedAt = Date.now();

        this.pushEvent(job.id, 'job.completed', {
            hasOutput: !!output,
            usage,
        });
    }

    /**
     * Fail a job with error
     * @param jobId - Job ID
     * @param error - Error message
     * @param code - Error code
     * @param retryable - Whether the error is retryable
     */
    fail(jobId: string, error: string, code: string, retryable: boolean): void {
        const job = this.jobs.get(jobId);
        if (!job) {
            return;
        }

        job.status = 'failed';
        job.error = error;
        job.errorCode = code;
        job.retryable = retryable;
        job.updatedAt = Date.now();

        this.pushEvent(job.id, 'job.failed', { code, error, retryable });
    }

    /**
     * Cancel a job
     * @param jobId - Job ID
     */
    cancel(jobId: string): void {
        const job = this.jobs.get(jobId);
        if (!job) {
            return;
        }

        // Can only cancel queued jobs
        if (job.status !== 'queued' && job.status !== 'pending') {
            return;
        }

        job.status = 'cancelled';
        job.updatedAt = Date.now();

        // Remove from queue
        const queue = this.queues.get(job.input.provider);
        if (queue) {
            const index = queue.indexOf(jobId);
            if (index !== -1) {
                queue.splice(index, 1);
            }
        }

        this.pushEvent(job.id, 'job.cancelled', {});
    }

    /**
     * Find a job by ID
     * @param jobId - Job ID
     * @returns Job state or undefined
     */
    findById(jobId: string): AiJobState | undefined {
        return this.jobs.get(jobId);
    }

    /**
     * Find a job by idempotency key
     * @param key - Idempotency key
     * @returns Job state or undefined
     */
    findByIdempotencyKey(key: string): AiJobState | undefined {
        const jobId = this.idempotencyIndex.get(key);
        if (!jobId) {
            return undefined;
        }
        return this.jobs.get(jobId);
    }

    /**
     * Find a job by ID (protected for subclass access)
     * @param id - Job ID
     * @returns Job state or undefined
     */
    protected getJobById(id: string): AiJobState | undefined {
        return this.jobs.get(id);
    }

    /**
     * Load a job into memory (protected for subclass access)
     * Atomically updates both jobs map and idempotency index
     * @param job - Job state to load
     */
    protected loadJobIntoMemory(job: AiJobState): void {
        this.jobs.set(job.id, job);
        this.idempotencyIndex.set(job.idempotencyKey, job.id);
    }

    /**
     * Get queue status for a provider
     * @param provider - Provider name
     * @returns Queue status
     */
    getQueueStatus(provider: AiProviderName): {
        queued: number;
        running: number;
    } {
        return {
            queued: (this.queues.get(provider)?.length || 0),
            running: this.runningCount.get(provider) || 0,
        };
    }

    /**
     * Register a callback invoked whenever a job transitions to running.
     * The callback is responsible for launching execution.
     */
    setOnJobStarted(handler: ((job: AiJobState) => void) | undefined): void {
        this.onJobStarted = handler;
    }

    /**
     * Start cleanup timer
     */
    startCleanup(): void {
        if (this.cleanupTimer) {
            return;
        }

        this.cleanupTimer = setInterval(() => {
            this.cleanup();
        }, CLEANUP_INTERVAL_MS);

        // Allow timer to not keep process alive
        if (this.cleanupTimer.unref) {
            this.cleanupTimer.unref();
        }
    }

    /**
     * Stop cleanup timer
     */
    stopCleanup(): void {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
    }

    /**
     * Cleanup old jobs
     */
    private cleanup(): void {
        const now = Date.now();
        const toRemove: string[] = [];

        for (const [jobId, job] of this.jobs) {
            if (now - job.updatedAt > JOB_TTL_MS) {
                toRemove.push(jobId);
            }
        }

        for (const jobId of toRemove) {
            const job = this.jobs.get(jobId);
            if (job) {
                // Remove from queue if queued
                if (job.status === 'queued') {
                    const queue = this.queues.get(job.input.provider);
                    if (queue) {
                        const index = queue.indexOf(jobId);
                        if (index !== -1) {
                            queue.splice(index, 1);
                        }
                    }
                }

                // Remove from idempotency index
                this.idempotencyIndex.delete(job.idempotencyKey);

                // Remove prompt
                this.prompts.delete(jobId);

                // Remove event sequence counter (prevent memory leak)
                this.nextEventSeq.delete(jobId);

                // Remove job
                this.jobs.delete(jobId);
            }
        }
    }
}

// Singleton instance
let storeInstance: AiJobsStore | null = null;

/**
 * Get the AI jobs store singleton
 * @returns AiJobsStore instance
 */
export function getAiJobsStore(): AiJobsStore {
    if (!storeInstance) {
        storeInstance = new AiJobsStore();
        storeInstance.startCleanup();
    }
    return storeInstance;
}

/**
 * Initialize the AI jobs store singleton with an external instance
 * This allows wiring a persistent store (AiJobsStoreWithPersistence) to the singleton
 * @param instance - The AiJobsStore instance to use as the singleton
 */
export function initializeAiJobsStore(instance: AiJobsStore): void {
    // Stop cleanup on old instance if it exists
    if (storeInstance) {
        storeInstance.stopCleanup();
    }
    storeInstance = instance;
    storeInstance.startCleanup();
}
