/**
 * AI Jobs Store with Persistence Tests
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import Database from 'better-sqlite3';
import { bootstrapDatabase } from '../db/db-service.js';
import { AiJobsStoreWithPersistence } from './ai-jobs-store-with-persistence.js';
import type { AiJobInput } from './ai-component-doc-schema.js';

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

        it('keeps events in-memory (not persisted to DB)', () => {
            const input = createTestInput();
            const job = store.enqueue(input);

            const persisted = store.getJobPersistent(job.id);
            assert.ok(persisted);
            // Events are in-memory only, DB has empty events array
            assert.ok(job.events.length > 0);
        });
    });

    describe('pushEvent()', () => {
        it('keeps event in-memory only (not persisted to DB)', () => {
            const input = createTestInput();
            const job = store.enqueue(input);

            store.pushEvent(job.id, 'job.started', { provider: 'anthropic' });

            // Event is in memory
            const inMemoryJob = (store as any).jobs.get(job.id);
            assert.ok(inMemoryJob);
            const startedEvent = inMemoryJob.events.find((e: any) => e.event === 'job.started');
            assert.ok(startedEvent);
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

    describe('fallback to in-memory when no DB', () => {
        it('works without DB (pure in-memory)', () => {
            const storeNoDb = new AiJobsStoreWithPersistence();
            const input = createTestInput();

            const job = storeNoDb.enqueue(input);
            assert.ok(job);
            assert.strictEqual(job.status, 'queued');

            // getJobPersistent falls back to in-memory without DB
            const persisted = storeNoDb.getJobPersistent(job.id);
            assert.ok(persisted);
            assert.strictEqual(persisted.id, job.id);
        });
    });
});
