/**
 * AI Jobs Store with PostgreSQL Persistence
 *
 * Extends AiJobsStore with database persistence.
 * DB is required for all operations.
 */

import { randomBytes } from 'node:crypto';

import type { Sql } from 'postgres';

import { AiJobsStore } from './ai-jobs-store.js';
import type { AiJobInput, AiJobState } from './ai-component-doc-schema.js';
import type { AiProviderName } from './ai-provider.js';
import { JobsRepository } from '../db/jobs-repository.js';

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

  private isIdempotencyUniqueConstraintError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return message.includes('duplicate key');
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

      const orphan = this.findByIdempotencyKey(idempotencyKey);
      if (orphan && orphan.id !== persistent.id) {
        this.removeJobFromMemory(orphan.id);
      }

      if (persistent.status === 'queued' || persistent.status === 'running') {
        return this.rehydratePersistentJobIfMissing(persistent);
      }

      const rerunKey = `${idempotencyKey}:rerun:${Date.now()}:${randomBytes(4).toString('hex')}`;
      return super.enqueue(input, rerunKey);
    }
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
      if (this.shouldPersistSnapshot(job, lastEvent.event)) {
        await this.jobsRepo.persistTransition(job, lastEvent);
        return;
      }

      await this.jobsRepo.appendJobEvent(jobId, lastEvent);
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

  async getJobByIdempotencyKeyPersistent(
    idempotencyKey: string,
  ): Promise<AiJobState | null> {
    return this.jobsRepo.getJobByIdempotencyKey(idempotencyKey);
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
      'ollama',
      'gemini',
      'opencode',
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
