/**
 * AI Jobs Store with PostgreSQL Persistence
 *
 * Extends AiJobsStore with database persistence.
 * DB is required for all operations.
 */

import type { Sql } from 'postgres';

import { AiJobsStore } from './ai-jobs-store.js';
import type { AiJobInput, AiJobState } from './ai-component-doc-schema.js';
import type { AiProviderName } from './ai-provider.js';
import { JobsRepository } from '../db/jobs-repository.js';

const IDENTITY_ACTIVE_UNIQUE_CONSTRAINT = 'ai_jobs_idempotency_key_active_uniq';

export interface AiJobsStoreWithPersistenceOptions {
  sql: Sql;
  staleThresholdMs?: number;
}

export class AiJobsStoreWithPersistence extends AiJobsStore {
  private jobsRepo: JobsRepository;

  constructor(options: AiJobsStoreWithPersistenceOptions) {
    super();
    const staleThresholdMs = options.staleThresholdMs ?? 300000;
    this.jobsRepo = new JobsRepository(options.sql);

    this.jobsRepo
      .markStaleRunningJobsAsFailed(staleThresholdMs)
      .then((marked) => {
        if (marked > 0) {
          console.log(
            `[AiJobsStore] Marked ${marked} stale running job(s) as failed`,
          );
        }
      })
      .catch((error) => {
        console.error(
          '[AiJobsStore] Error marking stale running jobs as failed:',
          error instanceof Error ? error.message : String(error),
        );
      });
  }

  isIdempotencyUniqueConstraintError(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const record = error as {
      code?: unknown;
      constraint_name?: unknown;
      message?: unknown;
    };
    const code = String(record.code ?? '');
    const constraintName = String(record.constraint_name ?? '');
    if (code !== '23505') return false;
    if (constraintName === IDENTITY_ACTIVE_UNIQUE_CONSTRAINT) return true;
    const message = String(record.message ?? '');
    return message.includes(IDENTITY_ACTIVE_UNIQUE_CONSTRAINT);
  }

  private rehydratePersistentJobIfMissing(job: AiJobState): AiJobState {
    const existing = this.findById(job.id);
    if (existing) return existing;

    this.loadJobIntoMemory(job);
    this.jobsRepo
      .getMaxEventSeq(job.id)
      .then((maxSeq) => {
        this.setNextEventSeq(job.id, maxSeq + 1);
      })
      .catch((error) => {
        console.error(
          `[AiJobsStore] Error getting max event sequence for job ${job.id}:`,
          error instanceof Error ? error.message : String(error),
        );
      });

    if (job.status === 'queued') {
      this.addToQueue(job.input.provider, job.id);
    } else if (job.status === 'running') {
      this.incrementRunningCount(job.input.provider);
    }

    return this.findById(job.id) ?? job;
  }

  override enqueue(input: AiJobInput): AiJobState {
    return super.enqueue(input);
  }

  override async pushEvent(
    jobId: string,
    event: string,
    data?: unknown,
  ): Promise<void> {
    super.pushEvent(jobId, event, data);

    const job = this.getJobById(jobId);
    if (job && job.events.length > 0) {
      const lastEvent = job.events[job.events.length - 1];
      try {
        if (this.shouldPersistSnapshot(job, lastEvent.event)) {
          await this.jobsRepo.persistTransition(job, lastEvent);
          return;
        }

        await this.jobsRepo.appendJobEvent(jobId, lastEvent);
      } catch (error) {
        if (!this.isIdempotencyUniqueConstraintError(error)) {
          throw error;
        }

        const persistent = await this.getActiveJobByIdempotencyKeyPersistent(
          job.idempotencyKey,
        ).catch((lookupError) => {
          console.error(
            `[AiJobsStore] Error resolving persistent job for idempotency key ${job.idempotencyKey}:`,
            lookupError instanceof Error
              ? lookupError.message
              : String(lookupError),
          );
          return null;
        });

        if (!persistent) {
          console.warn(
            `[AiJobsStore] Ignored duplicate active job persistence for ${job.idempotencyKey} because the existing row could not be resolved.`,
          );
          return;
        }

        if (persistent.id !== job.id) {
          this.removeJobFromMemory(job.id);
          this.loadJobIntoMemory(persistent);
          const maxSeq = await this.jobsRepo.getMaxEventSeq(persistent.id);
          this.setNextEventSeq(persistent.id, maxSeq + 1);
          if (persistent.status === 'queued') {
            this.addToQueue(persistent.input.provider, persistent.id);
          } else if (persistent.status === 'running') {
            this.incrementRunningCount(persistent.input.provider);
          }
        }

        console.warn(
          `[AiJobsStore] Ignored duplicate active job persistence for idempotency key ${job.idempotencyKey}; reusing persistent job ${persistent.id}.`,
        );
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

  async getJobPersistent(jobId: string): Promise<AiJobState | null> {
    return this.jobsRepo.getJob(jobId);
  }

  async getActiveJobByIdempotencyKeyPersistent(
    idempotencyKey: string,
  ): Promise<AiJobState | null> {
    return this.jobsRepo.getActiveJobByIdempotencyKey(idempotencyKey);
  }

  async getOrRehydrateActiveJobByIdempotencyKeyPersistent(
    idempotencyKey: string,
  ): Promise<AiJobState | null> {
    const persistent = await this.getActiveJobByIdempotencyKeyPersistent(
      idempotencyKey,
    );
    if (!persistent) {
      return null;
    }

    return this.rehydratePersistentJobIfMissing(persistent);
  }

  async listJobsPersistent(
    provider?: AiProviderName,
    status?: string,
  ): Promise<AiJobState[]> {
    return this.jobsRepo.listJobs(provider, status);
  }

  async loadJobsFromDb(
    limit: number = 100,
    options: { autoResume?: boolean } = {},
  ): Promise<void> {
    const jobs = await this.jobsRepo.listJobs();
    let rehydratedCount = 0;

    for (let i = 0; i < jobs.length && rehydratedCount < limit; i++) {
      const job = jobs[i];
      if (
        job.status === 'queued' ||
        job.status === 'running' ||
        (job.status === 'completed' && Date.now() - job.updatedAt < 3600000)
      ) {
        const existingJob = this.getJobById(job.id);
        this.loadJobIntoMemory(job);
        const maxSeq = await this.jobsRepo.getMaxEventSeq(job.id);
        this.setNextEventSeq(job.id, maxSeq + 1);
        if (job.status === 'queued') {
          this.addToQueue(job.input.provider, job.id);
        }
        if (job.status === 'running') {
          if (!existingJob || existingJob.status !== 'running') {
            this.incrementRunningCount(job.input.provider);
          }
        }
        rehydratedCount++;
      }
    }

    console.log(
      `[AiJobsStore] Rehydrated ${rehydratedCount} job(s) from database`,
    );

    if (options.autoResume !== false) {
      this.triggerRecoveryDequeue();
    }
  }

  resumeRecoveredQueue(): void {
    this.triggerRecoveryDequeue();
  }

  private triggerRecoveryDequeue(): void {
    const providers: AiProviderName[] = [
      'anthropic',
      'openai',
      'openrouter',
      'ollama',
      'gemini',
    ];
    const maxConcurrent = this.getMaxConcurrentPerProvider();

    for (const provider of providers) {
      let status = this.getQueueStatus(provider);
      while (status.queued > 0 && status.running < maxConcurrent) {
        this.tryDequeue(provider);
        status = this.getQueueStatus(provider);
      }
    }
  }
}
