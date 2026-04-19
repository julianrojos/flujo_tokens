/**
 * Jobs Repository Tests
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import type { Sql } from 'postgres';

import { createTestDatabase } from './test-db-helpers.js';
import { JobsRepository } from './jobs-repository.js';
import type { AiJobEvent, AiJobState } from '../services/ai-component-doc-schema.js';

describe('jobs-repository', () => {
  let sql: Sql;
  let cleanup: () => Promise<void>;
  let repo: JobsRepository;

  beforeEach(async () => {
    ({ sql, cleanup } = await createTestDatabase());
    repo = new JobsRepository(sql);
  });

  afterEach(async () => {
    await cleanup();
  });

  function createTestJob(overrides?: Partial<AiJobState>): AiJobState {
    const now = Date.now();
    const baseJob: AiJobState = {
      id: 'job-123',
      idempotencyKey: 'idem-456',
      input: {
        type: 'GENERATE_COMPONENT_DOC',
        provider: 'anthropic',
        componentId: 'comp-789',
      },
      status: 'queued',
      events: [],
      createdAt: now,
      updatedAt: now,
    };

    return { ...baseJob, ...overrides };
  }

  describe('upsertJob()', () => {
    it('inserts a new job', async () => {
      const job = createTestJob();
      await repo.upsertJob(job);

      const retrieved = await repo.getJob(job.id);
      assert.ok(retrieved);
      assert.equal(retrieved.id, job.id);
      assert.equal(retrieved.status, job.status);
    });

    it('updates existing job on conflict', async () => {
      const job1 = createTestJob({ status: 'queued' });
      const job2 = createTestJob({ status: 'running', updatedAt: Date.now() + 1000 });

      await repo.upsertJob(job1);
      await repo.upsertJob(job2);

      const retrieved = await repo.getJob(job1.id);
      assert.ok(retrieved);
      assert.equal(retrieved.status, 'running');
      assert.equal(retrieved.updatedAt, job2.updatedAt);
    });
  });

  describe('getJob()', () => {
    it('returns null when job does not exist', async () => {
      const job = await repo.getJob('nonexistent');
      assert.equal(job, null);
    });

    it('returns persisted job', async () => {
      const job = createTestJob({
        status: 'completed',
        error: undefined,
        errorCode: undefined,
        retryable: undefined,
      });
      await repo.upsertJob(job);

      const retrieved = await repo.getJob(job.id);
      assert.ok(retrieved);
      assert.equal(retrieved.id, job.id);
      assert.equal(retrieved.idempotencyKey, job.idempotencyKey);
      assert.equal(retrieved.status, job.status);
      assert.equal(retrieved.input.provider, job.input.provider);
    });
  });

  describe('getJobByIdempotencyKey()', () => {
    it('returns matching job', async () => {
      const job = createTestJob();
      await repo.upsertJob(job);

      const retrieved = await repo.getJobByIdempotencyKey(job.idempotencyKey);
      assert.ok(retrieved);
      assert.equal(retrieved.id, job.id);
    });

    it('returns null when no job matches', async () => {
      const job = await repo.getJobByIdempotencyKey('nonexistent');
      assert.equal(job, null);
    });
  });

  describe('getActiveJobByIdempotencyKey()', () => {
    it('returns the active job when terminal rows share the same key', async () => {
      const now = Date.now();
      const terminal = createTestJob({
        id: 'job-terminal',
        idempotencyKey: 'shared-key',
        status: 'completed',
        updatedAt: now - 1000,
      });
      const active = createTestJob({
        id: 'job-active',
        idempotencyKey: 'shared-key',
        status: 'queued',
        updatedAt: now,
      });

      await repo.upsertJob(terminal);
      await repo.upsertJob(active);

      const retrieved = await repo.getActiveJobByIdempotencyKey('shared-key');
      assert.ok(retrieved);
      assert.equal(retrieved.id, 'job-active');
      assert.equal(retrieved.status, 'queued');
    });
  });

  describe('listJobs()', () => {
    it('lists jobs sorted by created_at desc', async () => {
      const job1 = createTestJob({ id: 'job-1', idempotencyKey: 'idem-1', createdAt: 1000 });
      const job2 = createTestJob({ id: 'job-2', idempotencyKey: 'idem-2', createdAt: 2000 });
      const job3 = createTestJob({ id: 'job-3', idempotencyKey: 'idem-3', createdAt: 3000 });

      await repo.upsertJob(job1);
      await repo.upsertJob(job2);
      await repo.upsertJob(job3);

      const jobs = await repo.listJobs();
      assert.equal(jobs.length, 3);
      assert.equal(jobs[0].id, 'job-3');
      assert.equal(jobs[1].id, 'job-2');
      assert.equal(jobs[2].id, 'job-1');
    });

    it('filters by provider', async () => {
      const baseInput = createTestJob().input;
      const job1 = createTestJob({
        id: 'job-1',
        idempotencyKey: 'idem-1',
        input: { ...baseInput, provider: 'anthropic' },
      });
      const job2 = createTestJob({
        id: 'job-2',
        idempotencyKey: 'idem-2',
        input: { ...baseInput, provider: 'openai' },
      });

      await repo.upsertJob(job1);
      await repo.upsertJob(job2);

      const anthropicJobs = await repo.listJobs('anthropic');
      assert.equal(anthropicJobs.length, 1);
      assert.equal(anthropicJobs[0].id, 'job-1');
    });

    it('filters by status', async () => {
      const job1 = createTestJob({ id: 'job-1', idempotencyKey: 'idem-1', status: 'queued' });
      const job2 = createTestJob({ id: 'job-2', idempotencyKey: 'idem-2', status: 'completed' });

      await repo.upsertJob(job1);
      await repo.upsertJob(job2);

      const queuedJobs = await repo.listJobs(undefined, 'queued');
      assert.equal(queuedJobs.length, 1);
      assert.equal(queuedJobs[0].id, 'job-1');
    });

    it('filters by provider and status together', async () => {
      const baseInput = createTestJob().input;
      const job1 = createTestJob({
        id: 'job-1',
        idempotencyKey: 'idem-1',
        input: { ...baseInput, provider: 'anthropic' },
        status: 'queued',
      });
      const job2 = createTestJob({
        id: 'job-2',
        idempotencyKey: 'idem-2',
        input: { ...baseInput, provider: 'anthropic' },
        status: 'completed',
      });
      const job3 = createTestJob({
        id: 'job-3',
        idempotencyKey: 'idem-3',
        input: { ...baseInput, provider: 'openai' },
        status: 'queued',
      });

      await repo.upsertJob(job1);
      await repo.upsertJob(job2);
      await repo.upsertJob(job3);

      const jobs = await repo.listJobs('anthropic', 'queued');
      assert.equal(jobs.length, 1);
      assert.equal(jobs[0].id, 'job-1');
    });
  });

  describe('appendJobEvent() and getJobEvents()', () => {
    it('appends and returns events in seq order', async () => {
      const job = createTestJob();
      await repo.upsertJob(job);

      await repo.appendJobEvent(job.id, { seq: 3, ts: 3000, event: 'event3' });
      await repo.appendJobEvent(job.id, { seq: 1, ts: 1000, event: 'event1' });
      await repo.appendJobEvent(job.id, { seq: 2, ts: 2000, event: 'event2' });

      const events = await repo.getJobEvents(job.id);
      assert.equal(events.length, 3);
      assert.equal(events[0].event, 'event1');
      assert.equal(events[1].event, 'event2');
      assert.equal(events[2].event, 'event3');
    });

    it('persists event data payload', async () => {
      const job = createTestJob();
      await repo.upsertJob(job);

      await repo.appendJobEvent(job.id, {
        seq: 1,
        ts: Date.now(),
        event: 'completed',
        data: { duration: 1234 },
      });

      const events = await repo.getJobEvents(job.id);
      assert.equal(events.length, 1);
      assert.deepEqual(events[0].data, { duration: 1234 });
    });

    it('returns empty list when no events exist', async () => {
      const job = createTestJob();
      await repo.upsertJob(job);

      const events = await repo.getJobEvents(job.id);
      assert.equal(events.length, 0);
    });

    it('returns max event seq', async () => {
      const job = createTestJob();
      await repo.upsertJob(job);

      await repo.appendJobEvent(job.id, { seq: 1, ts: 1000, event: 'event1' });
      await repo.appendJobEvent(job.id, { seq: 4, ts: 4000, event: 'event4' });

      const maxSeq = await repo.getMaxEventSeq(job.id);
      assert.equal(maxSeq, 4);
    });
  });

  describe('markStaleRunningJobsAsFailed()', () => {
    it('marks only stale running jobs', async () => {
      const oldTimestamp = Date.now() - 400000;
      const recentTimestamp = Date.now() - 10000;

      const staleJob = createTestJob({
        id: 'stale',
        idempotencyKey: 'idem-stale',
        status: 'running',
        createdAt: oldTimestamp,
        updatedAt: oldTimestamp,
      });
      const recentJob = createTestJob({
        id: 'recent',
        idempotencyKey: 'idem-recent',
        status: 'running',
        createdAt: recentTimestamp,
        updatedAt: recentTimestamp,
      });

      await repo.upsertJob(staleJob);
      await repo.upsertJob(recentJob);

      const marked = await repo.markStaleRunningJobsAsFailed(300000);
      assert.equal(marked, 1);

      const staleRetrieved = await repo.getJob('stale');
      assert.equal(staleRetrieved?.status, 'failed');
      assert.equal(staleRetrieved?.errorCode, 'server_restart');

      const recentRetrieved = await repo.getJob('recent');
      assert.equal(recentRetrieved?.status, 'running');
    });

    it('returns 0 when no stale jobs exist', async () => {
      const marked = await repo.markStaleRunningJobsAsFailed(300000);
      assert.equal(marked, 0);
    });
  });

  describe('persistTransition()', () => {
    it('persists job snapshot and event atomically', async () => {
      const job = createTestJob();
      const event: AiJobEvent = {
        seq: 1,
        ts: Date.now(),
        event: 'test',
        data: { foo: 'bar' },
      };

      await repo.persistTransition(job, event);

      const persistedJob = await repo.getJob(job.id);
      assert.ok(persistedJob);
      assert.equal(persistedJob.id, job.id);

      const persistedEvents = await repo.getJobEvents(job.id);
      assert.equal(persistedEvents.length, 1);
      assert.equal(persistedEvents[0].event, 'test');
      assert.deepEqual(persistedEvents[0].data, { foo: 'bar' });
    });

    it('rolls back job update when event insert fails', async () => {
      const base = createTestJob({
        id: 'rollback-job',
        idempotencyKey: 'idem-rollback',
        status: 'queued',
      });
      await repo.upsertJob(base);
      await repo.appendJobEvent(base.id, { seq: 1, ts: Date.now(), event: 'job.queued' });

      const next = createTestJob({
        id: base.id,
        idempotencyKey: base.idempotencyKey,
        status: 'completed',
        updatedAt: Date.now() + 10_000,
      });
      const duplicateEvent: AiJobEvent = {
        seq: 1,
        ts: Date.now(),
        event: 'job.completed',
      };

      await assert.rejects(repo.persistTransition(next, duplicateEvent));

      const reloaded = await repo.getJob(base.id);
      assert.ok(reloaded);
      assert.equal(reloaded.status, 'queued');
    });
  });

  describe('editorialPatch persistence', () => {
    it('persists editorial patch when present', async () => {
      const patch = {
        schemaVersion: 1,
        summary: { purpose: 'AI suggested purpose' },
        best_practices: { do: ['Do this'], dont: ['Do that'] },
      };

      const job = createTestJob({
        status: 'completed',
        output: {
          schemaVersion: 1,
          componentId: 'comp-789',
          title: 'Test',
          summary: 'Test',
          anatomy: [],
          variants: [],
          tokens: [],
          accessibilityNotes: [],
          markdown: '# Test',
        },
        editorialPatch: patch,
      });

      await repo.upsertJob(job);

      const retrieved = await repo.getJob(job.id);
      assert.ok(retrieved);
      assert.deepEqual(retrieved.editorialPatch, patch);
    });

    it('keeps editorialPatch undefined when absent', async () => {
      const job = createTestJob({
        status: 'completed',
        output: {
          schemaVersion: 1,
          componentId: 'comp-789',
          title: 'Test',
          summary: 'Test',
          anatomy: [],
          variants: [],
          tokens: [],
          accessibilityNotes: [],
          markdown: '# Test',
        },
      });

      await repo.upsertJob(job);

      const retrieved = await repo.getJob(job.id);
      assert.ok(retrieved);
      assert.equal(retrieved.editorialPatch, undefined);
    });

    it('updates editorialPatch on conflict update', async () => {
      const job = createTestJob({
        status: 'completed',
        output: {
          schemaVersion: 1,
          componentId: 'comp-789',
          title: 'Test',
          summary: 'Test',
          anatomy: [],
          variants: [],
          tokens: [],
          accessibilityNotes: [],
          markdown: '# Test',
        },
        editorialPatch: { schemaVersion: 1, summary: { purpose: 'v1' } },
      });

      await repo.upsertJob(job);

      job.editorialPatch = { schemaVersion: 1, summary: { purpose: 'v2' } };
      await repo.upsertJob(job);

      const retrieved = await repo.getJob(job.id);
      assert.ok(retrieved);
      assert.deepEqual(retrieved.editorialPatch, {
        schemaVersion: 1,
        summary: { purpose: 'v2' },
      });
    });
  });
});
