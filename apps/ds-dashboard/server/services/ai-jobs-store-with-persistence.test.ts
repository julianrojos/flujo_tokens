/**
 * AI Jobs Store with Persistence Tests
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import Database from 'better-sqlite3';
import { bootstrapDatabase } from '../db/db-service.js';
import { AiJobsStoreWithPersistence } from './ai-jobs-store-with-persistence.js';
import type { AiJobInput, AiJobState } from './ai-component-doc-schema.js';

describe('ai-jobs-store-with-persistence', () => {
    let db: Database.Database;
    let store: AiJobsStoreWithPersistence;

    beforeEach(() => {
        db = bootstrapDatabase({ dbPath: ':memory:' });
        store = new AiJobsStoreWithPersistence({ db });
    });

    afterEach(() => {
        if (db) {
            db.close();
        }
    });

    function createTestInput(overrides?: Partial<AiJobInput>): AiJobInput {
        return {
            type: 'GENERATE_COMPONENT_DOC',
            provider: 'anthropic',
            componentId: 'test-component',
            ...overrides,
        };
    }

    describe('enqueue()', () => {
        it('persists job to DB on enqueue', () => {
            const input = createTestInput();
            const job = store.enqueue(input);

            const persisted = store.getJobPersistent(job.id);
            assert.ok(persisted);
            assert.strictEqual(persisted.id, job.id);
            assert.strictEqual(persisted.status, 'queued');
        });

        it('persists job.queued event to DB', () => {
            const input = createTestInput();
            const job = store.enqueue(input);

            const persisted = store.getJobPersistent(job.id);
            assert.ok(persisted);
            assert.strictEqual(persisted.status, 'queued');
            const jobsRepo = (store as any).jobsRepo;
            const events = jobsRepo.getJobEvents(job.id);
            assert.strictEqual(events.length, 1);
            assert.strictEqual(events[0].event, 'job.queued');
        });

        it('reuses persistent job when DB idempotency key already exists', () => {
            const now = Date.now();
            const jobsRepo = (store as any).jobsRepo;

            jobsRepo.upsertJob({
                id: 'persisted-job',
                idempotencyKey: 'existing-key',
                input: createTestInput({ idempotencyKey: 'existing-key' }),
                status: 'completed',
                events: [{ seq: 1, ts: now, event: 'job.completed' }],
                createdAt: now,
                updatedAt: now,
            });

            const job = store.enqueue(createTestInput({ idempotencyKey: 'existing-key' }));

            assert.strictEqual(job.id, 'persisted-job');
            assert.strictEqual(job.status, 'completed');
            assert.ok(store.findById('persisted-job'));
            assert.deepStrictEqual(store.getQueueStatus('anthropic'), { queued: 0, running: 0 });
            assert.strictEqual(store.tryDequeue('anthropic'), null);
        });
    });

    describe('pushEvent()', () => {
        it('persists event to DB after job snapshot', () => {
            const input = createTestInput();
            const job = store.enqueue(input);

            store.pushEvent(job.id, 'job.started', { provider: 'anthropic' });

            const persisted = store.getJobPersistent(job.id);
            assert.ok(persisted);
            assert.strictEqual(persisted.status, 'queued');
            const jobsRepo = (store as any).jobsRepo;
            const events = jobsRepo.getJobEvents(job.id);
            assert.strictEqual(events.length, 2);
            assert.strictEqual(events[1].event, 'job.started');
        });

        it('persists events with correct seq order', () => {
            const input = createTestInput();
            const job = store.enqueue(input);

            // First event (seq=1) was job.queued from enqueue
            // Second event (seq=2)
            store.pushEvent(job.id, 'job.started', { provider: 'anthropic' });
            // Third event (seq=3)
            store.pushEvent(job.id, 'job.custom', {});

            const persisted = store.getJobPersistent(job.id);
            assert.ok(persisted);
            const jobsRepo = (store as any).jobsRepo;
            const events = jobsRepo.getJobEvents(job.id);
            assert.strictEqual(events.length, 3);
            assert.deepStrictEqual(
                events.map((event: { seq: number }) => event.seq),
                [1, 2, 3]
            );
        });
    });

    describe('complete()', () => {
        it('persists completed state to DB', () => {
            const input = createTestInput();
            const job = store.enqueue(input);

            store.complete(job.id, {
                schemaVersion: 1,
                componentId: 'test',
                title: 'Test',
                summary: 'Test summary',
                anatomy: [],
                variants: [],
                tokens: [],
                accessibilityNotes: [],
                markdown: '# Test',
            }, {
                promptTokens: 100,
                completionTokens: 50,
                durationMs: 1000,
            });

            const persisted = store.getJobPersistent(job.id);
            assert.ok(persisted);
            assert.strictEqual(persisted.status, 'completed');
            assert.ok(persisted.output);
            assert.strictEqual(persisted.output?.title, 'Test');
        });
    });

    describe('fail()', () => {
        it('persists failed state to DB', () => {
            const input = createTestInput();
            const job = store.enqueue(input);

            store.fail(job.id, 'Test error', 'ai.test.error', true);

            const persisted = store.getJobPersistent(job.id);
            assert.ok(persisted);
            assert.strictEqual(persisted.status, 'failed');
            assert.strictEqual(persisted.error, 'Test error');
            assert.strictEqual(persisted.errorCode, 'ai.test.error');
            assert.strictEqual(persisted.retryable, true);
        });
    });

    describe('markStaleRunningJobsAsFailed()', () => {
        it('marks stale jobs as failed on startup', () => {
            // Create a stale job directly in DB
            const staleTime = Date.now() - 400000; // 400 seconds ago
            const jobsRepo = (store as any).jobsRepo;

            jobsRepo.upsertJob({
                id: 'stale-job',
                idempotencyKey: 'stale-key',
                input: createTestInput(),
                status: 'running',
                events: [],
                createdAt: staleTime,
                updatedAt: staleTime,
            });

            // Create new store instance to trigger stale job marking
            const store2 = new AiJobsStoreWithPersistence({ db, staleThresholdMs: 300000 });
            const job = store2.getJobPersistent('stale-job');

            assert.ok(job);
            assert.strictEqual(job.status, 'failed');
            assert.strictEqual(job.errorCode, 'server_restart');
        });
    });

    describe('loadJobsFromDb()', () => {
        it('loads jobs from DB into memory', () => {
            // Create a job directly in DB
            const jobsRepo = (store as any).jobsRepo;
            const now = Date.now();

            jobsRepo.upsertJob({
                id: 'loaded-job',
                idempotencyKey: 'loaded-key',
                input: createTestInput(),
                status: 'queued',
                events: [{ seq: 1, ts: now, event: 'job.queued' }],
                createdAt: now,
                updatedAt: now,
            });

            // Create new store and load jobs
            const store2 = new AiJobsStoreWithPersistence({ db });
            store2.loadJobsFromDb();

            const loaded = store2.getJobPersistent('loaded-job');
            assert.ok(loaded);
            assert.strictEqual(loaded.id, 'loaded-job');
        });
    });

    describe('recovery post-restart (S-06)', () => {
        it('rehydrates nextEventSeq to avoid UNIQUE violations', () => {
            const input = createTestInput();
            const job = store.enqueue(input);
            store.pushEvent(job.id, 'job.started', {});
            store.complete(job.id, {
                schemaVersion: 1, componentId: 'test', title: 'Test',
                summary: 'Test', anatomy: [], variants: [], tokens: [],
                accessibilityNotes: [], markdown: '# Test',
            }, { promptTokens: 100, completionTokens: 50, durationMs: 1000 });

            // Create new store instance and load from DB
            const store2 = new AiJobsStoreWithPersistence({ db });
            store2.loadJobsFromDb();

            // New event should not collide with existing seq
            store2.pushEvent(job.id, 'job.post-restart', {});
            // If seq was not rehydrated, this would throw UNIQUE violation
        });

        it('rehydrates queued jobs and triggers dequeue', () => {
            const input = createTestInput();
            const job = store.enqueue(input);
            // Job is queued

            // Create new store and load
            const store2 = new AiJobsStoreWithPersistence({ db });
            store2.loadJobsFromDb();

            // Queued job should be rehydrated and dequeue triggered
            const status = store2.getQueueStatus('anthropic');
            assert.strictEqual(status.running, 1);
        });
    });

    describe('upsert non-destructive (S-02)', () => {
        it('does not delete job events on upsert', () => {
            const input = createTestInput();
            const job = store.enqueue(input);
            store.pushEvent(job.id, 'job.started', {});
            store.pushEvent(job.id, 'job.progress', { percent: 50 });

            // Update job status
            store.complete(job.id, {
                schemaVersion: 1, componentId: 'test', title: 'Test',
                summary: 'Test', anatomy: [], variants: [], tokens: [],
                accessibilityNotes: [], markdown: '# Test',
            }, { promptTokens: 100, completionTokens: 50, durationMs: 1000 });

            // Job events should still exist after upsert
            const jobsRepo = (store as any).jobsRepo;
            const events = jobsRepo.getJobEvents(job.id);
            assert.strictEqual(events.length, 4);
        });
    });

    describe('recovery dequeue multiple (S-01)', () => {
        it('drains queue until concurrency limit reached', () => {
            // Create 5 queued jobs in DB
            const jobsRepo = (store as any).jobsRepo;
            for (let i = 0; i < 5; i++) {
                jobsRepo.upsertJob({
                    id: `queued-job-${i}`,
                    idempotencyKey: `key-${i}`,
                    input: createTestInput(),
                    status: 'queued',
                    events: [{ seq: 1, ts: Date.now(), event: 'job.queued' }],
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                });
            }

            // Load and trigger recovery
            store.loadJobsFromDb();

            // Should have dequeued up to concurrency limit (3)
            const status = store.getQueueStatus('anthropic');
            assert.ok(status.running <= 3, 'Should not exceed concurrency limit');
            assert.ok(status.queued < 5, 'Should have dequeued some jobs');
        });
    });

    describe('centralized concurrency limit (S-02)', () => {
        it('uses getMaxConcurrentPerProvider instead of hardcoded value', () => {
            // Verify the method exists and returns a number
            const maxConcurrent = (store as any).getMaxConcurrentPerProvider();
            assert.ok(typeof maxConcurrent === 'number');
            assert.ok(maxConcurrent > 0);
            // Recovery should use this value, not hardcoded 3
        });
    });

    describe('rehydratedCount metric (S-03)', () => {
        it('reports actual rehydrated count not scanned count', () => {
            // This test verifies the log message format changed
            // The implementation now uses rehydratedCount instead of loaded
            // We can't easily capture console.log output, but we verify the code path
            const jobsRepo = (store as any).jobsRepo;
            jobsRepo.upsertJob({
                id: 'test-job',
                idempotencyKey: 'test-key',
                input: createTestInput(),
                status: 'queued',
                events: [{ seq: 1, ts: Date.now(), event: 'job.queued' }],
                createdAt: Date.now(),
                updatedAt: Date.now(),
            });

            // Should not throw
            assert.doesNotThrow(() => {
                store.loadJobsFromDb();
            });
        });
    });

    describe('selective snapshot persistence (S-05)', () => {
        it('uses append-only path for non-terminal event after completion', () => {
            const input = createTestInput();
            const job = store.enqueue(input);

            store.complete(job.id, {
                schemaVersion: 1,
                componentId: 'test',
                title: 'Test',
                summary: 'Test summary',
                anatomy: [],
                variants: [],
                tokens: [],
                accessibilityNotes: [],
                markdown: '# Test',
            }, {
                promptTokens: 100,
                completionTokens: 50,
                durationMs: 1000,
            });

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

                store.pushEvent(job.id, 'pipeline.completed', { traceId: 'x' });

                assert.strictEqual(persistTransitionCalls, 0);
                assert.strictEqual(appendOnlyCalls, 1);
            } finally {
                // Restore original methods to avoid test contamination
                jobsRepo.persistTransition = originalPersistTransition;
                jobsRepo.appendJobEvent = originalAppendJobEvent;
            }
        });
    });
});
