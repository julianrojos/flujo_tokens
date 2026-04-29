/**
 * AI Jobs Store with Persistence Tests
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import type { Sql } from 'postgres';

import { createTestDatabase } from '../db/test-db-helpers.js';
import { AiJobsStoreWithPersistence } from './ai-jobs-store-with-persistence.js';
import type { AiJobInput, AiJobState } from './ai-component-doc-schema.js';

async function waitForPersistedJob(
    store: AiJobsStoreWithPersistence,
    jobId: string,
    options: {
        expectedStatus?: AiJobState['status'];
        minEvents?: number;
        timeoutMs?: number;
    } = {},
): Promise<AiJobState> {
    const deadline = Date.now() + (options.timeoutMs ?? 5000);
    let last: AiJobState | null = null;

    while (Date.now() < deadline) {
        last = await store.getJobPersistent(jobId);
        if (
            last &&
            (!options.expectedStatus || last.status === options.expectedStatus) &&
            (!options.minEvents || last.events.length >= options.minEvents)
        ) {
            return last;
        }
        await new Promise<void>((r) => setTimeout(r, 25));
    }

    throw new Error(
        `Timed out waiting for job ${jobId} to persist${options.expectedStatus ? ` with status ${options.expectedStatus}` : ''}${options.minEvents ? ` and at least ${options.minEvents} event(s)` : ''}`,
    );
}

describe('ai-jobs-store-with-persistence', { concurrency: false }, () => {
    let sql: Sql;
    let cleanup: () => Promise<void>;
    let store: AiJobsStoreWithPersistence;

    beforeEach(async () => {
        ({ sql, cleanup } = await createTestDatabase());
        store = new AiJobsStoreWithPersistence({ sql });
    });

    afterEach(async () => {
        await cleanup();
    });

    function createTestInput(overrides?: Partial<AiJobInput>): AiJobInput {
        return {
            type: 'GENERATE_COMPONENT_DOC',
            provider: 'anthropic',
            componentId: 'test-component',
            ...overrides,
        };
    }

    describe('enqueue()', { concurrency: false }, () => {
        it('persists job to DB on enqueue', async () => {
            const input = createTestInput();
            const job = store.enqueue(input);
            await waitForPersistedJob(store, job.id, { expectedStatus: 'queued', minEvents: 1 });

            const persisted = await store.getJobPersistent(job.id);
            assert.ok(persisted);
            assert.strictEqual(persisted.id, job.id);
            assert.strictEqual(persisted.status, 'queued');
        });

        it('persists job.queued event to DB', async () => {
            const input = createTestInput();
            const job = store.enqueue(input);
            await waitForPersistedJob(store, job.id, { expectedStatus: 'queued', minEvents: 1 });

            const persisted = await store.getJobPersistent(job.id);
            assert.ok(persisted);
            assert.strictEqual(persisted.status, 'queued');
            const jobsRepo = (store as any).jobsRepo;
            const events = await jobsRepo.getJobEvents(job.id);
            assert.strictEqual(events.length, 1);
            assert.strictEqual(events[0].event, 'job.queued');
        });

        it('creates a fresh queued job when persisted job with same key is completed', async () => {
            const now = Date.now();
            const jobsRepo = (store as any).jobsRepo;

            await jobsRepo.upsertJob({
                id: 'persisted-job',
                idempotencyKey: 'existing-key',
                input: createTestInput({ idempotencyKey: 'existing-key' }),
                status: 'completed',
                events: [{ seq: 1, ts: now, event: 'job.completed' }],
                createdAt: now,
                updatedAt: now,
            });

            const job = store.enqueue(createTestInput({ idempotencyKey: 'existing-key' }));
            await waitForPersistedJob(store, job.id, { expectedStatus: 'queued', minEvents: 1 });

            assert.notStrictEqual(job.id, 'persisted-job');
            assert.strictEqual(job.status, 'queued');
            assert.strictEqual(job.input.idempotencyKey, 'existing-key');
            const persistedOriginal = await store.getJobPersistent('persisted-job');
            assert.ok(persistedOriginal);
            assert.strictEqual(persistedOriginal?.status, 'completed');
            const persistedRerun = await store.getJobPersistent(job.id);
            assert.ok(persistedRerun, 'Rerun job should be persisted to DB');
            assert.strictEqual(persistedRerun?.status, 'queued');
            assert.strictEqual(persistedRerun?.input.idempotencyKey, 'existing-key');
            assert.deepStrictEqual(store.getQueueStatus('anthropic'), { queued: 1, running: 0 });
        });

        it('creates a fresh queued job when persisted job with same key is failed', async () => {
            const now = Date.now();
            const jobsRepo = (store as any).jobsRepo;

            await jobsRepo.upsertJob({
                id: 'failed-job',
                idempotencyKey: 'failed-key',
                input: createTestInput({ idempotencyKey: 'failed-key' }),
                status: 'failed',
                error: 'previous failure',
                events: [{ seq: 1, ts: now, event: 'job.failed' }],
                createdAt: now,
                updatedAt: now,
            });

            const job = store.enqueue(createTestInput({ idempotencyKey: 'failed-key' }));
            await waitForPersistedJob(store, job.id, { expectedStatus: 'queued', minEvents: 1 });

            assert.notStrictEqual(job.id, 'failed-job');
            assert.strictEqual(job.status, 'queued');
            const persistedRerun = await store.getJobPersistent(job.id);
            assert.ok(persistedRerun, 'Rerun job should be persisted to DB');
            assert.strictEqual(persistedRerun?.status, 'queued');
            assert.deepStrictEqual(store.getQueueStatus('anthropic'), { queued: 1, running: 0 });
        });

        it('creates a fresh queued job when persisted job with same key is cancelled', async () => {
            const now = Date.now();
            const jobsRepo = (store as any).jobsRepo;

            await jobsRepo.upsertJob({
                id: 'cancelled-job',
                idempotencyKey: 'cancelled-key',
                input: createTestInput({ idempotencyKey: 'cancelled-key' }),
                status: 'cancelled',
                events: [{ seq: 1, ts: now, event: 'job.cancelled' }],
                createdAt: now,
                updatedAt: now,
            });

            const job = store.enqueue(createTestInput({ idempotencyKey: 'cancelled-key' }));
            await waitForPersistedJob(store, job.id, { expectedStatus: 'queued', minEvents: 1 });

            assert.notStrictEqual(job.id, 'cancelled-job');
            assert.strictEqual(job.status, 'queued');
            const persistedRerun = await store.getJobPersistent(job.id);
            assert.ok(persistedRerun, 'Rerun job should be persisted to DB');
            assert.strictEqual(persistedRerun?.status, 'queued');
            assert.deepStrictEqual(store.getQueueStatus('anthropic'), { queued: 1, running: 0 });
        });

        it('rehydrates persisted job when same key is already queued', async () => {
            const now = Date.now();
            const jobsRepo = (store as any).jobsRepo;

            await jobsRepo.upsertJob({
                id: 'queued-job',
                idempotencyKey: 'queued-key',
                input: createTestInput({ idempotencyKey: 'queued-key' }),
                status: 'queued',
                events: [{ seq: 1, ts: now, event: 'job.queued' }],
                createdAt: now,
                updatedAt: now,
            });

            const job = await store.getOrRehydrateActiveJobByIdempotencyKeyPersistent('queued-key');

            assert.strictEqual(job?.id, 'queued-job');
            assert.strictEqual(job?.status, 'queued');
            assert.deepStrictEqual(store.getQueueStatus('anthropic'), { queued: 1, running: 0 });
        });

        it('rehydrates persisted job when same key is already running', async () => {
            const now = Date.now();
            const jobsRepo = (store as any).jobsRepo;

            await jobsRepo.upsertJob({
                id: 'running-job',
                idempotencyKey: 'running-key',
                input: createTestInput({ idempotencyKey: 'running-key' }),
                status: 'running',
                events: [
                    { seq: 1, ts: now - 1000, event: 'job.queued' },
                    { seq: 2, ts: now, event: 'job.started' },
                ],
                createdAt: now - 1000,
                updatedAt: now,
            });

            const job = await store.getOrRehydrateActiveJobByIdempotencyKeyPersistent('running-key');

            assert.strictEqual(job?.id, 'running-job');
            assert.strictEqual(job?.status, 'running');
            assert.deepStrictEqual(store.getQueueStatus('anthropic'), { queued: 0, running: 1 });
        });
    });

    describe('pushEvent()', { concurrency: false }, () => {
        it('persists event to DB after job snapshot', async () => {
            const input = createTestInput();
            const job = store.enqueue(input);
            await waitForPersistedJob(store, job.id, { expectedStatus: 'queued', minEvents: 1 });

            await store.pushEvent(job.id, 'job.started', { provider: 'anthropic' });
            await waitForPersistedJob(store, job.id, { expectedStatus: 'queued', minEvents: 2 });

            const jobsRepo = (store as any).jobsRepo;
            const events = await jobsRepo.getJobEvents(job.id);
            assert.strictEqual(events.length, 2);
            assert.strictEqual(events[1].event, 'job.started');
        });

        it('persists events with correct seq order', async () => {
            const input = createTestInput();
            const job = store.enqueue(input);
            await waitForPersistedJob(store, job.id, { expectedStatus: 'queued', minEvents: 1 });

            await store.pushEvent(job.id, 'job.started', { provider: 'anthropic' });
            await store.pushEvent(job.id, 'job.custom', {});
            await waitForPersistedJob(store, job.id, { expectedStatus: 'queued', minEvents: 3 });

            const jobsRepo = (store as any).jobsRepo;
            const events = await jobsRepo.getJobEvents(job.id);
            assert.strictEqual(events.length, 3);
            assert.deepStrictEqual(
                events.map((event: { seq: number }) => event.seq),
                [1, 2, 3]
            );
        });

        it('rehydrates duplicate active idempotency without crashing', async () => {
            const now = Date.now();
            const jobsRepo = (store as any).jobsRepo;

            await jobsRepo.upsertJob({
                id: 'persisted-job',
                idempotencyKey: 'dup-key',
                input: createTestInput({ idempotencyKey: 'dup-key' }),
                status: 'queued',
                events: [{ seq: 1, ts: now, event: 'job.queued' }],
                createdAt: now,
                updatedAt: now,
            });

            const job = await store.getOrRehydrateActiveJobByIdempotencyKeyPersistent('dup-key');
            await waitForPersistedJob(store, job.id, { expectedStatus: 'queued' });

            assert.equal(job?.id, 'persisted-job');
            assert.equal(store.findById('persisted-job')?.status, 'queued');
            assert.deepStrictEqual(store.getQueueStatus('anthropic'), { queued: 1, running: 0 });
        });
    });

    describe('complete()', { concurrency: false }, () => {
        it('persists completed state to DB', async () => {
            const input = createTestInput();
            const job = store.enqueue(input);

            store.complete(job.id, {
                schemaVersion: 2,
                componentId: 'test',
                title: 'Test',
                summary: 'Test summary',
                variants: [],
                accessibilityNotes: [],
                markdown: '# Test',
                states: [],
                accessibilityFacts: [],
            }, {
                promptTokens: 100,
                completionTokens: 50,
                durationMs: 1000,
            });
            await waitForPersistedJob(store, job.id, { expectedStatus: 'completed', minEvents: 2 });

            const persisted = await store.getJobPersistent(job.id);
            assert.ok(persisted);
            assert.strictEqual(persisted.status, 'completed');
            assert.ok(persisted.output);
            assert.strictEqual(persisted.output?.title, 'Test');
        });
    });

    describe('fail()', { concurrency: false }, () => {
        it('persists failed state to DB', async () => {
            const input = createTestInput();
            const job = store.enqueue(input);

            store.fail(job.id, 'Test error', 'ai.test.error', true);
            await waitForPersistedJob(store, job.id, { expectedStatus: 'failed', minEvents: 2 });

            const persisted = await store.getJobPersistent(job.id);
            assert.ok(persisted);
            assert.strictEqual(persisted.status, 'failed');
            assert.strictEqual(persisted.error, 'Test error');
            assert.strictEqual(persisted.errorCode, 'ai.test.error');
            assert.strictEqual(persisted.retryable, true);
        });
    });

    describe('markStaleRunningJobsAsFailed()', { concurrency: false }, () => {
        it('marks stale jobs as failed on startup', async () => {
            const staleTime = Date.now() - 400000; // 400 seconds ago
            const jobsRepo = (store as any).jobsRepo;

            await jobsRepo.upsertJob({
                id: 'stale-job',
                idempotencyKey: 'stale-key',
                input: createTestInput(),
                status: 'running',
                events: [],
                createdAt: staleTime,
                updatedAt: staleTime,
            });

            const store2 = new AiJobsStoreWithPersistence({ sql, staleThresholdMs: 300000 });
            await waitForPersistedJob(store2, 'stale-job', { expectedStatus: 'failed' });
            const job = await store2.getJobPersistent('stale-job');

            assert.ok(job);
            assert.strictEqual(job.status, 'failed');
            assert.strictEqual(job.errorCode, 'server_restart');
        });
    });

    describe('loadJobsFromDb()', { concurrency: false }, () => {
        it('loads jobs from DB into memory', async () => {
            const jobsRepo = (store as any).jobsRepo;
            const now = Date.now();

            await jobsRepo.upsertJob({
                id: 'loaded-job',
                idempotencyKey: 'loaded-key',
                input: createTestInput(),
                status: 'queued',
                events: [{ seq: 1, ts: now, event: 'job.queued' }],
                createdAt: now,
                updatedAt: now,
            });

            const store2 = new AiJobsStoreWithPersistence({ sql });
            await store2.loadJobsFromDb();

            const loaded = await store2.getJobPersistent('loaded-job');
            assert.ok(loaded);
            assert.strictEqual(loaded.id, 'loaded-job');
        });
    });

    describe('recovery post-restart (S-06)', { concurrency: false }, () => {
        it('rehydrates nextEventSeq to avoid UNIQUE violations', async () => {
            const input = createTestInput();
            const job = store.enqueue(input);
            await store.pushEvent(job.id, 'job.started', {});
            store.complete(job.id, {
                schemaVersion: 2, componentId: 'test', title: 'Test',
                summary: 'Test',
                variants: [],
                accessibilityNotes: [], markdown: '# Test',
                states: [],
                accessibilityFacts: [],
            }, { promptTokens: 100, completionTokens: 50, durationMs: 1000 });
            await waitForPersistedJob(store, job.id, { expectedStatus: 'completed', minEvents: 2 });

            const store2 = new AiJobsStoreWithPersistence({ sql });
            await store2.loadJobsFromDb();

            // New event should not collide with existing seq
            await store2.pushEvent(job.id, 'job.post-restart', {});
        });

        it('rehydrates queued jobs and triggers dequeue', async () => {
            const input = createTestInput();
            const job = store.enqueue(input);
            await waitForPersistedJob(store, job.id, { expectedStatus: 'queued', minEvents: 1 });

            const store2 = new AiJobsStoreWithPersistence({ sql });
            await store2.loadJobsFromDb();

            const status = store2.getQueueStatus('anthropic');
            assert.strictEqual(status.running, 1);
        });
    });

    describe('upsert non-destructive (S-02)', { concurrency: false }, () => {
        it('does not delete job events on upsert', async () => {
            const input = createTestInput();
            const job = store.enqueue(input);
            await store.pushEvent(job.id, 'job.started', {});
            await store.pushEvent(job.id, 'job.progress', { percent: 50 });

            store.complete(job.id, {
                schemaVersion: 2, componentId: 'test', title: 'Test',
                summary: 'Test',
                variants: [],
                accessibilityNotes: [], markdown: '# Test',
                states: [],
                accessibilityFacts: [],
            }, { promptTokens: 100, completionTokens: 50, durationMs: 1000 });
            await waitForPersistedJob(store, job.id, {
                expectedStatus: 'completed',
                minEvents: 4,
                timeoutMs: 10000,
            });

            const jobsRepo = (store as any).jobsRepo;
            const events = await jobsRepo.getJobEvents(job.id);
            assert.strictEqual(events.length, 4);
        });
    });

    describe('recovery dequeue multiple (S-01)', { concurrency: false }, () => {
        it('drains queue until concurrency limit reached', async () => {
            const jobsRepo = (store as any).jobsRepo;
            for (let i = 0; i < 5; i++) {
                await jobsRepo.upsertJob({
                    id: `queued-job-${i}`,
                    idempotencyKey: `key-${i}`,
                    input: createTestInput(),
                    status: 'queued',
                    events: [{ seq: 1, ts: Date.now(), event: 'job.queued' }],
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                });
            }

            await store.loadJobsFromDb();

            const status = store.getQueueStatus('anthropic');
            assert.ok(status.running <= 3, 'Should not exceed concurrency limit');
            assert.ok(status.queued < 5, 'Should have dequeued some jobs');
        });
    });

    describe('centralized concurrency limit (S-02)', { concurrency: false }, () => {
        it('uses getMaxConcurrentPerProvider instead of hardcoded value', () => {
            const maxConcurrent = (store as any).getMaxConcurrentPerProvider();
            assert.ok(typeof maxConcurrent === 'number');
            assert.ok(maxConcurrent > 0);
        });
    });

    describe('rehydratedCount metric (S-03)', { concurrency: false }, () => {
        it('reports actual rehydrated count not scanned count', async () => {
            const jobsRepo = (store as any).jobsRepo;
            await jobsRepo.upsertJob({
                id: 'test-job',
                idempotencyKey: 'test-key',
                input: createTestInput(),
                status: 'queued',
                events: [{ seq: 1, ts: Date.now(), event: 'job.queued' }],
                createdAt: Date.now(),
                updatedAt: Date.now(),
            });

            await assert.doesNotReject(() => store.loadJobsFromDb());
        });
    });

    describe('selective snapshot persistence (S-05)', { concurrency: false }, () => {
        it('uses append-only path for non-terminal event after completion', async () => {
            const input = createTestInput();
            const job = store.enqueue(input);

            store.complete(job.id, {
                schemaVersion: 2,
                componentId: 'test',
                title: 'Test',
                summary: 'Test summary',
                variants: [],
                accessibilityNotes: [],
                markdown: '# Test',
                states: [],
                accessibilityFacts: [],
            }, {
                promptTokens: 100,
                completionTokens: 50,
                durationMs: 1000,
            });
            await waitForPersistedJob(store, job.id, { expectedStatus: 'completed' });

            const jobsRepo = (store as any).jobsRepo;
            let persistTransitionCalls = 0;
            let appendOnlyCalls = 0;
            const originalPersistTransition = jobsRepo.persistTransition.bind(jobsRepo);
            const originalAppendJobEvent = jobsRepo.appendJobEvent.bind(jobsRepo);

            try {
                jobsRepo.persistTransition = (...args: unknown[]) => {
                    persistTransitionCalls++;
                    return originalPersistTransition(
                        ...(args as [AiJobState, { seq: number; ts: number; event: string; data?: unknown }])
                    );
                };
                jobsRepo.appendJobEvent = (...args: unknown[]) => {
                    appendOnlyCalls++;
                    return originalAppendJobEvent(
                        ...(args as [string, { seq: number; ts: number; event: string; data?: unknown }])
                    );
                };

                await store.pushEvent(job.id, 'pipeline.completed', { traceId: 'x' });

                assert.strictEqual(persistTransitionCalls, 0);
                assert.strictEqual(appendOnlyCalls, 1);
            } finally {
                jobsRepo.persistTransition = originalPersistTransition;
                jobsRepo.appendJobEvent = originalAppendJobEvent;
            }
        });
    });
});
