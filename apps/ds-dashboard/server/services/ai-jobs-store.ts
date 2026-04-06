/**
 * AI Jobs Store
 * In-memory FIFO job queue with idempotency, concurrency control, and cleanup
 */

import { createHash, randomBytes } from 'node:crypto';
import type {
    AiJobState,
    AiJobInput,
    AiJobEvent,
    ComponentDocOutput,
    AiUsageMetrics,
} from './ai-component-doc-schema.js';
import type { EditorialPatch } from './ai-editorial-patch-schema.js';
import type { ValidationReport } from './ai-validation-report-schema.js';
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
 * Job TTL in milliseconds (24 hours)
 */
const JOB_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Cleanup interval in milliseconds (1 hour)
 */
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Maximum number of events retained per job (ring-buffer behavior)
 */
const MAX_EVENTS_PER_JOB = 100;
const IDEMPOTENCY_HASH_VERSION = 2;

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
        ['gemini', []],
    ]);
    private nextEventSeq: Map<string, number> = new Map();
    private runningCount: Map<AiProviderName, number> = new Map([
        ['anthropic', 0],
        ['openai', 0],
        ['ollama', 0],
        ['gemini', 0],
    ]);
    private cleanupTimer: ReturnType<typeof setInterval> | null = null;
    private prompts: Map<string, string> = new Map();
    private onJobStarted?: (job: AiJobState) => void;

    constructor() {
        // Initialize queues
        this.queues.set('anthropic', []);
        this.queues.set('openai', []);
        this.queues.set('ollama', []);
        this.queues.set('gemini', []);
        this.runningCount.set('anthropic', 0);
        this.runningCount.set('openai', 0);
        this.runningCount.set('ollama', 0);
        this.runningCount.set('gemini', 0);
    }

    /**
     * Generate a unique job ID
     */
    generateJobId(): string {
        const timestamp = Date.now();
        const random = randomBytes(4).toString('hex');
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
            hashVersion: IDEMPOTENCY_HASH_VERSION,
            type: input.type,
            provider: input.provider,
            systemId: input.systemId || '',
            componentId: input.componentId,
            figmaUrl: input.figmaUrl || '',
            model: input.model || '',
            systemPrompt: String(input.systemPrompt || '').trim(),
            userPrompt: String(input.userPrompt || '').trim(),
            dryRun: Boolean(input.dryRun),
        };

        return createHash('sha256')
            .update(JSON.stringify(data))
            .digest('hex')
            .slice(0, 16);
    }

    /**
     * Enqueue a new job
     * @param input - Job input parameters
     * @param idempotencyKeyOverride - Optional override for the idempotency key
     *   used for indexing and job state. When provided, this key is used for
     *   idempotency lookup instead of the auto-computed hash.
     *   Use this for internal rerun flows where the derived key must differ
     *   from the user-provided input.idempotencyKey.
     * @returns Created job state
     */
    enqueue(input: AiJobInput, idempotencyKeyOverride?: string): AiJobState {
        // Check capacity
        if (this.jobs.size >= MAX_JOBS) {
            const error = new Error('Job queue is at capacity') as Error & { code: string; retryable: boolean };
            error.code = 'ai.job.queue_full';
            error.retryable = true;
            throw error;
        }

        // Compute the key used for index lookup and job state.
        const effectiveKey = idempotencyKeyOverride ?? this.computeIdempotencyKey(input);

        // Check for existing active job — for normal enqueue this uses the
        // computed key; for reruns this uses the override key (protects against
        // rare concurrent rerun collisions on the same derived key).
        const existingJobId = this.idempotencyIndex.get(effectiveKey);
        if (existingJobId) {
            const existingJob = this.jobs.get(existingJobId);
            if (existingJob && (existingJob.status === 'queued' || existingJob.status === 'running')) {
                return existingJob;
            }
        }

        // Create new job
        const now = Date.now();
        const job: AiJobState = {
            id: this.generateJobId(),
            input,
            status: 'queued',
            idempotencyKey: effectiveKey,
            events: [],
            createdAt: now,
            updatedAt: now,
        };

        // Store job and initialize event sequence counter
        this.jobs.set(job.id, job);
        this.idempotencyIndex.set(effectiveKey, job.id);
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

        job.events.push(jobEvent);
        // Maintain a fixed-size ring buffer while preserving monotonic seq values.
        if (job.events.length > MAX_EVENTS_PER_JOB) {
            job.events.splice(0, job.events.length - MAX_EVENTS_PER_JOB);
        }
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
     * Update the pipeline stage for a job
     * @param jobId - Job ID
     * @param stage - Pipeline stage
     */
    setPipelineStage(jobId: string, stage: 'extracting' | 'patching' | 'validating'): void {
        const job = this.jobs.get(jobId);
        if (!job) {
            return;
        }

        job.pipelineStage = stage;
        job.updatedAt = Date.now();
        this.pushEvent(job.id, `pipeline.stage_${stage}`, {});
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
     * @param editorialPatch - Optional editorial patch
     * @param options - Optional validation report and publish gate
     */
    complete(
        jobId: string,
        output: ComponentDocOutput,
        usage: AiUsageMetrics,
        editorialPatch?: EditorialPatch,
        options?: {
            validationReport?: ValidationReport;
            canPublish?: boolean;
            pipelineSeverity?: 'blocking' | 'warning' | 'info';
            pipelineScore?: number;
        },
    ): void {
        const job = this.jobs.get(jobId);
        if (!job) {
            return;
        }

        // Pipeline stage is transient runtime state; clear it on terminal completion.
        job.pipelineStage = null;
        job.status = 'completed';
        job.output = output;
        job.usage = usage;
        job.editorialPatch = editorialPatch;
        if (options?.validationReport !== undefined) {
            job.validationReport = options.validationReport;
        }
        if (options?.canPublish !== undefined) {
            job.canPublish = options.canPublish;
        }
        if (options?.pipelineSeverity !== undefined) {
            job.pipelineSeverity = options.pipelineSeverity;
        }
        if (options?.pipelineScore !== undefined) {
            job.pipelineScore = options.pipelineScore;
        }
        job.updatedAt = Date.now();

        this.pushEvent(job.id, 'job.completed', {
            hasOutput: !!output,
            usage,
            hasEditorialPatch: !!editorialPatch,
            hasValidationReport: !!options?.validationReport,
            canPublish: options?.canPublish,
            pipelineSeverity: options?.pipelineSeverity,
            pipelineScore: options?.pipelineScore,
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
     * Set next event sequence for a job (protected for subclass rehydration)
     * @param jobId - Job ID
     * @param nextSeq - Next sequence number
     */
    protected setNextEventSeq(jobId: string, nextSeq: number): void {
        this.nextEventSeq.set(jobId, nextSeq);
    }

    /**
     * Add job to provider queue (protected for subclass rehydration)
     * @param provider - Provider name
     * @param jobId - Job ID
     */
    protected addToQueue(provider: AiProviderName, jobId: string): void {
        const queue = this.queues.get(provider);
        if (queue && !queue.includes(jobId)) {
            queue.push(jobId);
        }
    }

    /**
     * Increment running count for provider (protected for subclass rehydration)
     * @param provider - Provider name
     */
    protected incrementRunningCount(provider: AiProviderName): void {
        const current = this.runningCount.get(provider) || 0;
        this.runningCount.set(provider, current + 1);
    }

    /**
     * Remove a job from in-memory structures (jobs/index/queues/seq/prompts).
     * Intended for subclass recovery paths when enqueue partially succeeds.
     */
    protected removeJobFromMemory(jobId: string): void {
        const job = this.jobs.get(jobId);
        if (!job) return;

        // Remove from queue if queued/pending.
        if (job.status === 'queued' || job.status === 'pending') {
            const queue = this.queues.get(job.input.provider);
            if (queue) {
                const index = queue.indexOf(jobId);
                if (index !== -1) {
                    queue.splice(index, 1);
                }
            }
        }

        // Keep running counters consistent when removing a running job.
        if (job.status === 'running') {
            const running = this.runningCount.get(job.input.provider) || 0;
            this.runningCount.set(job.input.provider, Math.max(0, running - 1));
        }

        // Remove idempotency key only if it still points to this job.
        const mappedJobId = this.idempotencyIndex.get(job.idempotencyKey);
        if (mappedJobId === jobId) {
            this.idempotencyIndex.delete(job.idempotencyKey);
        }

        this.prompts.delete(jobId);
        this.nextEventSeq.delete(jobId);
        this.jobs.delete(jobId);
    }

    /**
     * Get max concurrent jobs per provider (protected for subclass access)
     */
    protected getMaxConcurrentPerProvider(): number {
        return MAX_CONCURRENT_PER_PROVIDER;
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
        throw new Error('[AiJobsStore] Store not initialized. Call initializeAiJobsStore() before use.');
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
