/**
 * AI Jobs Route Tests - Comprehensive coverage for security, idempotency, and state transitions
 */

import { describe, it, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { registerAiJobsRoutes } from './ai-jobs-route.js';
import { getAiJobsStore } from '../services/ai-jobs-store.js';

// Helper to create test app
function createTestApp() {
    const app = new Hono();
    registerAiJobsRoutes(app, { internalToken: 'test-token' });
    return app;
}

// Track created test files for cleanup
const testFilesCreated: string[] = [];

// Helper to cleanup store between tests
function cleanupStore() {
    const store = getAiJobsStore();
    (store as any).jobs.clear();
    (store as any).idempotencyIndex.clear();
    (store as any).queues.get('anthropic')?.splice(0);
    (store as any).queues.get('openai')?.splice(0);
    (store as any).queues.get('ollama')?.splice(0);
    (store as any).runningCount.set('anthropic', 0);
    (store as any).runningCount.set('openai', 0);
    (store as any).runningCount.set('ollama', 0);
    (store as any).nextEventSeq?.clear();
    (store as any).prompts?.clear();
    store.setOnJobStarted(undefined);
}

// Helper to track and cleanup test files
async function cleanupTestFiles() {
    for (const filePath of testFilesCreated) {
        try {
            await fs.rm(filePath, { force: true });
        } catch {
            // Ignore cleanup errors
        }
    }
    testFilesCreated.length = 0;
}

// Helper to create test file and track it
async function createTestFile(filePath: string, content: string): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, 'utf-8');
    testFilesCreated.push(filePath);
}

describe('ai-jobs-route', () => {
    describe('POST /api/ai/jobs', () => {
        it('should reject missing required fields', async () => {
            cleanupStore();
            const app = createTestApp();

            const res = await app.request('/api/ai/jobs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '127.0.0.1' },
                body: JSON.stringify({}),
            });

            assert.equal(res.status, 400);
            const json = await res.json();
            assert.equal(json.ok, false);
            assert.equal(json.code, 'ai.input.invalid');
        });

        it('should reject invalid provider', async () => {
            cleanupStore();
            const app = createTestApp();

            const res = await app.request('/api/ai/jobs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '127.0.0.1' },
                body: JSON.stringify({
                    type: 'GENERATE_COMPONENT_DOC',
                    provider: 'invalid',
                    componentId: '68:4097',
                }),
            });

            assert.equal(res.status, 400);
            const json = await res.json();
            assert.equal(json.code, 'ai.input.invalid');
        });

        it('should reject missing componentId', async () => {
            cleanupStore();
            const app = createTestApp();

            const res = await app.request('/api/ai/jobs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '127.0.0.1' },
                body: JSON.stringify({
                    type: 'GENERATE_COMPONENT_DOC',
                    provider: 'anthropic',
                }),
            });

            assert.equal(res.status, 400);
            const json = await res.json();
            assert.equal(json.code, 'ai.input.invalid');
        });

        it('should return 400 when API key is missing', async () => {
            cleanupStore();
            const app = createTestApp();

            const res = await app.request('/api/ai/jobs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '127.0.0.1' },
                body: JSON.stringify({
                    type: 'GENERATE_COMPONENT_DOC',
                    provider: 'anthropic',
                    componentId: '68:4097',
                }),
            });

            assert.equal(res.status, 400);
            const json = await res.json();
            assert.equal(json.code, 'ai.input.missing_provider_key');
        });

        it('should return 202 with valid request (dryRun)', async () => {
            cleanupStore();
            const app = createTestApp();
            process.env.ANTHROPIC_API_KEY = 'fake-key-for-test';

            const res = await app.request('/api/ai/jobs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '127.0.0.1' },
                body: JSON.stringify({
                    type: 'GENERATE_COMPONENT_DOC',
                    provider: 'anthropic',
                    componentId: '68:4097',
                    dryRun: true,
                }),
            });

            delete process.env.ANTHROPIC_API_KEY;
            assert.equal(res.status, 202);
            const json = await res.json();
            assert.equal(json.ok, true);
            assert.ok(json.jobId);
        });

        it('should return same job for duplicate idempotency key', async () => {
            cleanupStore();
            const store = getAiJobsStore();

            // Create job directly to test idempotency
            const job1 = store.enqueue({
                type: 'GENERATE_COMPONENT_DOC',
                provider: 'anthropic',
                componentId: '68:4097',
                dryRun: true,
                idempotencyKey: 'test-key-123',
            });

            const job2 = store.enqueue({
                type: 'GENERATE_COMPONENT_DOC',
                provider: 'anthropic',
                componentId: '68:4097',
                dryRun: true,
                idempotencyKey: 'test-key-123',
            });

            assert.equal(job1.id, job2.id, 'Same idempotency key should return same job');
        });

        it('should allow new enqueue for failed job with same key', async () => {
            cleanupStore();
            const store = getAiJobsStore();

            // Create and fail a job
            const job1 = store.enqueue({
                type: 'GENERATE_COMPONENT_DOC',
                provider: 'anthropic',
                componentId: '68:4097',
                dryRun: true,
                idempotencyKey: 'test-key-failed',
            });
            store.fail(job1.id, 'Test failure', 'ai.test.error', false);

            // Should allow new job with same key since previous failed
            const job2 = store.enqueue({
                type: 'GENERATE_COMPONENT_DOC',
                provider: 'anthropic',
                componentId: '68:4097',
                dryRun: true,
                idempotencyKey: 'test-key-failed',
            });

            assert.notEqual(job1.id, job2.id, 'Failed job should allow new enqueue');
        });

    });

    describe('GET /api/ai/jobs/:id', () => {
        it('should return 404 for unknown job', async () => {
            cleanupStore();
            const app = createTestApp();

            const res = await app.request('/api/ai/jobs/unknown-job-id', {
                headers: { 'x-forwarded-for': '127.0.0.1' },
            });

            assert.equal(res.status, 404);
            const json = await res.json();
            assert.equal(json.code, 'ai.job.not_found');
        });

        it('should return job with done and nextCursor fields', async () => {
            cleanupStore();
            const app = createTestApp();
            const store = getAiJobsStore();

            // Create and complete a job
            const job = store.enqueue({
                type: 'GENERATE_COMPONENT_DOC',
                provider: 'anthropic',
                componentId: '68:4097',
                dryRun: true,
            });
            store.complete(job.id, {
                schemaVersion: 1,
                componentId: '68:4097',
                title: 'Test',
                summary: 'Test',
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

            const res = await app.request(`/api/ai/jobs/${job.id}`, {
                headers: { 'x-forwarded-for': '127.0.0.1' },
            });

            assert.equal(res.status, 200);
            const json = await res.json();
            assert.ok('done' in json);
            assert.ok('nextCursor' in json);
            assert.equal(json.done, true);
            assert.equal(json.nextCursor, null);
        });
    });

    describe('POST /api/ai/jobs/:id/apply', () => {
        it('should return 404 for unknown job', async () => {
            cleanupStore();
            const app = createTestApp();

            const res = await app.request('/api/ai/jobs/unknown-job-id/apply', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '127.0.0.1' },
                body: JSON.stringify({}),
            });

            assert.equal(res.status, 404);
            const json = await res.json();
            assert.equal(json.code, 'ai.job.not_found');
        });

        it('should return 409 for non-completed job', async () => {
            cleanupStore();
            const app = createTestApp();
            const store = getAiJobsStore();

            const job = store.enqueue({
                type: 'GENERATE_COMPONENT_DOC',
                provider: 'anthropic',
                componentId: '68:4097',
                dryRun: true,
            });

            const res = await app.request(`/api/ai/jobs/${job.id}/apply`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '127.0.0.1' },
                body: JSON.stringify({}),
            });

            assert.equal(res.status, 409);
            const json = await res.json();
            assert.equal(json.code, 'ai.job.not_completed');
        });

        it('should block path traversal in outputPath', async () => {
            cleanupStore();
            const app = createTestApp();
            const store = getAiJobsStore();

            const job = store.enqueue({
                type: 'GENERATE_COMPONENT_DOC',
                provider: 'anthropic',
                componentId: '68:4097',
                dryRun: true,
            });

            store.complete(job.id, {
                schemaVersion: 1,
                componentId: '68:4097',
                title: 'Test Component',
                summary: 'Test',
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

            const res = await app.request(`/api/ai/jobs/${job.id}/apply`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '127.0.0.1' },
                body: JSON.stringify({
                    outputPath: '../../../etc/passwd',
                }),
            });

            assert.equal(res.status, 403);
            const json = await res.json();
            assert.equal(json.code, 'ai.apply.path_blocked');
        });

        it('should block paths outside docs/components', async () => {
            cleanupStore();
            const app = createTestApp();
            const store = getAiJobsStore();

            const job = store.enqueue({
                type: 'GENERATE_COMPONENT_DOC',
                provider: 'anthropic',
                componentId: '68:4097',
                dryRun: true,
            });

            store.complete(job.id, {
                schemaVersion: 1,
                componentId: '68:4097',
                title: 'Test Component',
                summary: 'Test',
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

            const res = await app.request(`/api/ai/jobs/${job.id}/apply`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '127.0.0.1' },
                body: JSON.stringify({
                    outputPath: 'apps/other-app',
                }),
            });

            assert.equal(res.status, 403);
            const json = await res.json();
            assert.equal(json.code, 'ai.apply.path_blocked');
        });

        it('should return 409 when file exists and overwrite=false', async () => {
            cleanupStore();
            const app = createTestApp();
            const store = getAiJobsStore();
            const title = 'Existing File Case';
            // Use same path resolution as the route: REPO_ROOT = project root
            // Use file URL to get directory path in ESM
            const testDir = path.dirname(fileURLToPath(import.meta.url));
            const REPO_ROOT = path.resolve(testDir, '../../../..');
            const filePath = path.join(REPO_ROOT, 'docs/components/existing-file-case.md');

            await createTestFile(filePath, '# existing');

            const job = store.enqueue({
                type: 'GENERATE_COMPONENT_DOC',
                provider: 'anthropic',
                componentId: '68:4097',
                dryRun: true,
            });

            store.complete(job.id, {
                schemaVersion: 1,
                componentId: '68:4097',
                title,
                summary: 'Test',
                anatomy: [],
                variants: [],
                tokens: [],
                accessibilityNotes: [],
                markdown: '# New Content',
            }, {
                promptTokens: 1,
                completionTokens: 1,
                durationMs: 1,
            });

            const res = await app.request(`/api/ai/jobs/${job.id}/apply`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '127.0.0.1' },
                body: JSON.stringify({ overwrite: false }),
            });

            assert.equal(res.status, 409);
            const json = await res.json();
            assert.equal(json.code, 'ai.apply.file_exists');

            await fs.rm(filePath, { force: true });
        });

        it('should overwrite file when overwrite=true', async () => {
            cleanupStore();
            const app = createTestApp();
            const store = getAiJobsStore();
            const title = 'Overwrite File Case';
            // Use same path resolution as the route: REPO_ROOT = project root
            const testDir = path.dirname(fileURLToPath(import.meta.url));
            const REPO_ROOT = path.resolve(testDir, '../../../..');
            const filePath = path.join(REPO_ROOT, 'docs/components/overwrite-file-case.md');

            // Clean up any residual file from previous runs
            await fs.rm(filePath, { force: true });
            await fs.rm(`${filePath}.tmp`, { force: true });

            await createTestFile(filePath, '# old');

            const job = store.enqueue({
                type: 'GENERATE_COMPONENT_DOC',
                provider: 'anthropic',
                componentId: '68:4097',
                dryRun: true,
            });

            store.complete(job.id, {
                schemaVersion: 1,
                componentId: '68:4097',
                title,
                summary: 'Test',
                anatomy: [],
                variants: [],
                tokens: [],
                accessibilityNotes: [],
                markdown: '# New Overwritten Content',
            }, {
                promptTokens: 1,
                completionTokens: 1,
                durationMs: 1,
            });

            const res = await app.request(`/api/ai/jobs/${job.id}/apply`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '127.0.0.1' },
                body: JSON.stringify({ overwrite: true }),
            });

            assert.equal(res.status, 200);
            const json = await res.json();
            assert.equal(json.ok, true);
            assert.equal(json.overwritten, true);

            const current = await fs.readFile(filePath, 'utf-8');
            assert.equal(current, '# New Overwritten Content');

            await fs.rm(filePath, { force: true });
        });
    });

    describe('POST /api/ai/jobs/:id/cancel', () => {
        it('should return 404 for unknown job', async () => {
            cleanupStore();
            const app = createTestApp();

            const res = await app.request('/api/ai/jobs/unknown-job-id/cancel', {
                method: 'POST',
                headers: { 'x-forwarded-for': '127.0.0.1' },
            });

            assert.equal(res.status, 404);
            const json = await res.json();
            assert.equal(json.code, 'ai.job.not_found');
        });

        it('should cancel a queued job', async () => {
            cleanupStore();
            const app = createTestApp();
            const store = getAiJobsStore();

            const job = store.enqueue({
                type: 'GENERATE_COMPONENT_DOC',
                provider: 'anthropic',
                componentId: '68:4097',
                dryRun: true,
            });

            const res = await app.request(`/api/ai/jobs/${job.id}/cancel`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '127.0.0.1' },
                body: JSON.stringify({}),
            });

            assert.equal(res.status, 200);
            const json = await res.json();
            assert.equal(json.ok, true);
            assert.equal(json.status, 'cancelled');
        });

        it('should return 409 for completed job', async () => {
            cleanupStore();
            const app = createTestApp();
            const store = getAiJobsStore();

            const job = store.enqueue({
                type: 'GENERATE_COMPONENT_DOC',
                provider: 'anthropic',
                componentId: '68:4097',
                dryRun: true,
            });

            store.complete(job.id, {
                schemaVersion: 1,
                componentId: '68:4097',
                title: 'Test',
                summary: 'Test',
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

            const res = await app.request(`/api/ai/jobs/${job.id}/cancel`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '127.0.0.1' },
                body: JSON.stringify({}),
            });

            assert.equal(res.status, 409);
            const json = await res.json();
            assert.equal(json.code, 'ai.job.not_cancelable');
        });

        it('should return 409 for running job', async () => {
            cleanupStore();
            const app = createTestApp();
            const store = getAiJobsStore();

            const job = store.enqueue({
                type: 'GENERATE_COMPONENT_DOC',
                provider: 'anthropic',
                componentId: '68:4097',
                dryRun: true,
            });

            const dequeued = store.tryDequeue('anthropic');
            assert.ok(dequeued);

            const res = await app.request(`/api/ai/jobs/${job.id}/cancel`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '127.0.0.1' },
                body: JSON.stringify({}),
            });

            assert.equal(res.status, 409);
            const json = await res.json();
            assert.equal(json.code, 'ai.job.not_cancelable');
        });
    });

    describe('POST /api/ai/jobs ollama health-check', () => {
        let originalFetch: typeof globalThis.fetch;

        beforeEach(() => {
            originalFetch = globalThis.fetch;
            cleanupStore();
        });

        afterEach(() => {
            globalThis.fetch = originalFetch;
        });

        it('should return 503 when Ollama is unreachable', async () => {
            // Mock fetch to simulate Ollama being down
            globalThis.fetch = async () => {
                throw new Error('Connection refused');
            };

            const app = createTestApp();

            const res = await app.request('/api/ai/jobs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '127.0.0.1' },
                body: JSON.stringify({
                    type: 'GENERATE_COMPONENT_DOC',
                    provider: 'ollama',
                    componentId: '68:4097',
                }),
            });

            assert.equal(res.status, 503);
            const json = await res.json();
            assert.equal(json.ok, false);
            assert.equal(json.code, 'ai.ollama.unavailable');
            assert.equal(json.retryable, true);
        });

        it('should return 503 when Ollama returns non-OK status', async () => {
            // Mock fetch to return non-OK response
            globalThis.fetch = async () => {
                return new Response(null, { status: 500 });
            };

            const app = createTestApp();

            const res = await app.request('/api/ai/jobs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '127.0.0.1' },
                body: JSON.stringify({
                    type: 'GENERATE_COMPONENT_DOC',
                    provider: 'ollama',
                    componentId: '68:4097',
                }),
            });

            assert.equal(res.status, 503);
            const json = await res.json();
            assert.equal(json.code, 'ai.ollama.unavailable');
        });

        it('should accept job when Ollama is healthy', async () => {
            // Mock fetch to return OK response
            globalThis.fetch = async () => {
                return new Response(JSON.stringify({ models: [] }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                });
            };

            const app = createTestApp();

            const res = await app.request('/api/ai/jobs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '127.0.0.1' },
                body: JSON.stringify({
                    type: 'GENERATE_COMPONENT_DOC',
                    provider: 'ollama',
                    componentId: '68:4097',
                }),
            });

            assert.equal(res.status, 202);
            const json = await res.json();
            assert.equal(json.ok, true);
            assert.ok(json.jobId);
        });

        it('should not require API key for ollama provider', async () => {
            // Mock fetch to return OK response
            globalThis.fetch = async () => {
                return new Response(JSON.stringify({ models: [] }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                });
            };

            const app = createTestApp();

            const res = await app.request('/api/ai/jobs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '127.0.0.1' },
                body: JSON.stringify({
                    type: 'GENERATE_COMPONENT_DOC',
                    provider: 'ollama',
                    componentId: '68:4097',
                }),
            });

            // Should NOT return missing_provider_key error
            assert.equal(res.status, 202, 'ollama should not require API key');
            const json = await res.json();
            assert.equal(json.ok, true);
        });

        it('should not execute Ollama health-check for cloud providers', async () => {
            // Set up valid API key so request passes initial validation
            const prevApiKey = process.env.ANTHROPIC_API_KEY;
            try {
                process.env.ANTHROPIC_API_KEY = 'fake-key-for-test';

                let fetchCalled = false;
                // Mock fetch to track if it was called
                globalThis.fetch = async () => {
                    fetchCalled = true;
                    throw new Error('Should not be called');
                };

                const app = createTestApp();

                const res = await app.request('/api/ai/jobs', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-forwarded-for': '127.0.0.1',
                        'x-internal-token': 'test-token', // Required for cloud providers
                    },
                    body: JSON.stringify({
                        type: 'GENERATE_COMPONENT_DOC',
                        provider: 'anthropic',
                        componentId: '68:4097',
                    }),
                });

                // Verify fetch was NOT called for Ollama health-check (mock throws if fetch is invoked)
                assert.equal(fetchCalled, false, 'Ollama health-check should not be called for cloud providers');
            } finally {
                // Restore API key
                if (prevApiKey === undefined) {
                    delete process.env.ANTHROPIC_API_KEY;
                } else {
                    process.env.ANTHROPIC_API_KEY = prevApiKey;
                }
            }
        });
    });

    // Global cleanup after all tests
    after(async () => {
        await cleanupTestFiles();
    });
});
