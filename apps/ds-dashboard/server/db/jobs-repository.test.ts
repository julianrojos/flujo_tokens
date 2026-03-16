/**
 * Jobs Repository Tests
 *
 * Tests for AI job persistence using :memory: database.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import Database from 'better-sqlite3';
import { bootstrapDatabase } from './db-service.js';
import { JobsRepository } from './jobs-repository.js';
import type { AiJobState, AiJobInput } from '../services/ai-component-doc-schema.js';

describe('jobs-repository', () => {
    let db: Database.Database;
    let repo: JobsRepository;

    beforeEach(() => {
        db = bootstrapDatabase({ dbPath: ':memory:' });
        repo = new JobsRepository(db);
    });

    afterEach(() => {
        if (db) {
            db.close();
        }
    });

    function createTestJob(overrides?: Partial<AiJobState>): AiJobState {
        const baseJob: AiJobState = {
            id: 'job-123',
            idempotencyKey: 'idem-456',
            input: {
                type: 'GENERATE_COMPONENT_DOC',
                provider: 'anthropic',
                componentId: 'comp-789',
            },
            status: 'pending',
            events: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };

        return { ...baseJob, ...overrides };
    }

    describe('upsertJob()', () => {
        it('inserts a new job', () => {
            const job = createTestJob();
            repo.upsertJob(job);

            const retrieved = repo.getJob(job.id);
            assert.ok(retrieved);
            assert.strictEqual(retrieved.id, job.id);
            assert.strictEqual(retrieved.status, job.status);
        });

        it('replaces existing job with same id', () => {
            const job1 = createTestJob({ status: 'pending' });
            const job2 = createTestJob({ status: 'running', updatedAt: Date.now() });

            repo.upsertJob(job1);
            repo.upsertJob(job2);

            const retrieved = repo.getJob(job1.id);
            assert.ok(retrieved);
            assert.strictEqual(retrieved.status, 'running');
            assert.strictEqual(retrieved.updatedAt, job2.updatedAt);
        });
    });

    describe('getJob()', () => {
        it('returns null for non-existent job', () => {
            const job = repo.getJob('nonexistent');
            assert.strictEqual(job, null);
        });

        it('retrieves job with all fields', () => {
            const job = createTestJob({
                status: 'completed',
                error: undefined,
                errorCode: undefined,
                retryable: undefined,
            });
            repo.upsertJob(job);

            const retrieved = repo.getJob(job.id);
            assert.ok(retrieved);
            assert.strictEqual(retrieved.id, job.id);
            assert.strictEqual(retrieved.idempotencyKey, job.idempotencyKey);
            assert.strictEqual(retrieved.status, job.status);
            assert.strictEqual(retrieved.input.provider, job.input.provider);
        });
    });

    describe('getJobByIdempotencyKey()', () => {
        it('retrieves job by idempotency key', () => {
            const job = createTestJob();
            repo.upsertJob(job);

            const retrieved = repo.getJobByIdempotencyKey(job.idempotencyKey);
            assert.ok(retrieved);
            assert.strictEqual(retrieved.id, job.id);
        });

        it('returns null for non-existent idempotency key', () => {
            const job = repo.getJobByIdempotencyKey('nonexistent');
            assert.strictEqual(job, null);
        });
    });

    describe('listJobs()', () => {
        it('lists all jobs ordered by created_at DESC', () => {
            const job1 = createTestJob({ id: 'job-1', idempotencyKey: 'idem-1', createdAt: 1000 });
            const job2 = createTestJob({ id: 'job-2', idempotencyKey: 'idem-2', createdAt: 2000 });
            const job3 = createTestJob({ id: 'job-3', idempotencyKey: 'idem-3', createdAt: 3000 });

            repo.upsertJob(job1);
            repo.upsertJob(job2);
            repo.upsertJob(job3);

            const jobs = repo.listJobs();
            assert.strictEqual(jobs.length, 3);
            assert.strictEqual(jobs[0].id, 'job-3'); // Most recent first
            assert.strictEqual(jobs[1].id, 'job-2');
            assert.strictEqual(jobs[2].id, 'job-1');
        });

        it('filters by provider', () => {
            const job1 = createTestJob({ id: 'job-1', idempotencyKey: 'idem-1', input: { ...createTestJob().input, provider: 'anthropic' } });
            const job2 = createTestJob({ id: 'job-2', idempotencyKey: 'idem-2', input: { ...createTestJob().input, provider: 'openai' } });

            repo.upsertJob(job1);
            repo.upsertJob(job2);

            const anthropicJobs = repo.listJobs('anthropic');
            assert.strictEqual(anthropicJobs.length, 1);
            assert.strictEqual(anthropicJobs[0].id, 'job-1');
        });

        it('filters by status', () => {
            const job1 = createTestJob({ id: 'job-1', idempotencyKey: 'idem-1', status: 'pending' });
            const job2 = createTestJob({ id: 'job-2', idempotencyKey: 'idem-2', status: 'completed' });

            repo.upsertJob(job1);
            repo.upsertJob(job2);

            const pendingJobs = repo.listJobs(undefined, 'pending');
            assert.strictEqual(pendingJobs.length, 1);
            assert.strictEqual(pendingJobs[0].id, 'job-1');
        });
    });

    describe('appendJobEvent()', () => {
        it('appends events to job', () => {
            const job = createTestJob();
            repo.upsertJob(job);

            repo.appendJobEvent(job.id, { seq: 1, ts: Date.now(), event: 'created' });
            repo.appendJobEvent(job.id, { seq: 2, ts: Date.now(), event: 'started' });

            const events = repo.getJobEvents(job.id);
            assert.strictEqual(events.length, 2);
            assert.strictEqual(events[0].event, 'created');
            assert.strictEqual(events[1].event, 'started');
        });

        it('preserves event data', () => {
            const job = createTestJob();
            repo.upsertJob(job);

            repo.appendJobEvent(job.id, {
                seq: 1,
                ts: Date.now(),
                event: 'completed',
                data: { duration: 1234 },
            });

            const events = repo.getJobEvents(job.id);
            assert.strictEqual(events.length, 1);
            assert.deepStrictEqual(events[0].data, { duration: 1234 });
        });
    });

    describe('markStaleRunningJobsAsFailed()', () => {
        it('marks stale running jobs as failed', () => {
            const oldTimestamp = Date.now() - 400000; // 400 seconds ago (> 300s threshold)
            const recentTimestamp = Date.now() - 10000; // 10 seconds ago

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

            repo.upsertJob(staleJob);
            repo.upsertJob(recentJob);

            const marked = repo.markStaleRunningJobsAsFailed(300000);
            assert.strictEqual(marked, 1);

            const staleRetrieved = repo.getJob('stale');
            assert.strictEqual(staleRetrieved?.status, 'failed');
            assert.strictEqual(staleRetrieved?.errorCode, 'server_restart');

            const recentRetrieved = repo.getJob('recent');
            assert.strictEqual(recentRetrieved?.status, 'running');
        });

        it('returns 0 when no stale jobs', () => {
            const marked = repo.markStaleRunningJobsAsFailed(300000);
            assert.strictEqual(marked, 0);
        });
    });

    describe('getJobEvents()', () => {
        it('returns events ordered by seq ASC', () => {
            const job = createTestJob();
            repo.upsertJob(job);

            repo.appendJobEvent(job.id, { seq: 3, ts: 3000, event: 'event3' });
            repo.appendJobEvent(job.id, { seq: 1, ts: 1000, event: 'event1' });
            repo.appendJobEvent(job.id, { seq: 2, ts: 2000, event: 'event2' });

            const events = repo.getJobEvents(job.id);
            assert.strictEqual(events.length, 3);
            assert.strictEqual(events[0].event, 'event1');
            assert.strictEqual(events[1].event, 'event2');
            assert.strictEqual(events[2].event, 'event3');
        });

        it('returns empty array for job with no events', () => {
            const job = createTestJob();
            repo.upsertJob(job);

            const events = repo.getJobEvents(job.id);
            assert.strictEqual(events.length, 0);
        });
    });
});
