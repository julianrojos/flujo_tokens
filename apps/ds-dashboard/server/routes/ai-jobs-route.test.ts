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
import { getAiJobsStore, initializeAiJobsStore, AiJobsStore } from '../services/ai-jobs-store.js';
import { EDITORIAL_PATCH_SCHEMA_VERSION } from '../services/ai-editorial-patch-schema.js';
import { AI_PROVIDER_ORDER } from '../../src/types/ai-provider-catalog.ts';

// Helper to create test app
function createTestApp(options?: {
    getSystemContext?: (systemHeader: string) => unknown;
    componentRepo?: any;
}) {
    const defaultGetSystemContext = (systemHeader: string) => {
        const systemId = String(systemHeader || '').trim() || 'sys-test';
        return {
            systemId,
            docsDir: path.join(REPO_ROOT, 'design-systems', systemId, 'docs'),
        };
    };
    const app = new Hono();
    registerAiJobsRoutes(app, {
        internalToken: 'test-token',
        getSystemContext: options?.getSystemContext || defaultGetSystemContext,
        componentRepo: options?.componentRepo,
    });
    return app;
}

// Track created test files for cleanup
const testFilesCreated: string[] = [];
const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(TEST_DIR, '../../../..');

// Helper to cleanup store between tests
function cleanupStore() {
    initializeAiJobsStore(new AiJobsStore());
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

        it('should return Gemini-specific API key guidance when key is missing', async () => {
            cleanupStore();
            const app = createTestApp();

            const prevGeminiKey = process.env.GEMINI_API_KEY;
            const prevGoogleKey = process.env.GOOGLE_API_KEY;
            delete process.env.GEMINI_API_KEY;
            delete process.env.GOOGLE_API_KEY;

            try {
                const res = await app.request('/api/ai/jobs', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '127.0.0.1' },
                    body: JSON.stringify({
                        type: 'GENERATE_COMPONENT_DOC',
                        provider: 'gemini',
                        componentId: '68:4097',
                    }),
                });

                assert.equal(res.status, 400);
                const json = await res.json();
                assert.equal(json.code, 'ai.input.missing_provider_key');
                assert.match(json.message, /GEMINI_API_KEY \(or GOOGLE_API_KEY\)/);
            } finally {
                if (prevGeminiKey === undefined) {
                    delete process.env.GEMINI_API_KEY;
                } else {
                    process.env.GEMINI_API_KEY = prevGeminiKey;
                }
                if (prevGoogleKey === undefined) {
                    delete process.env.GOOGLE_API_KEY;
                } else {
                    process.env.GOOGLE_API_KEY = prevGoogleKey;
                }
            }
        });

        it('should accept gemini provider with GOOGLE_API_KEY fallback', async () => {
            cleanupStore();
            const app = createTestApp();

            const prevGeminiKey = process.env.GEMINI_API_KEY;
            const prevGoogleKey = process.env.GOOGLE_API_KEY;
            delete process.env.GEMINI_API_KEY;
            process.env.GOOGLE_API_KEY = 'fake-google-key-for-test';

            try {
                const res = await app.request('/api/ai/jobs', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '127.0.0.1' },
                    body: JSON.stringify({
                        type: 'GENERATE_COMPONENT_DOC',
                        provider: 'gemini',
                        componentId: '68:4097',
                        dryRun: true,
                    }),
                });

                assert.equal(res.status, 202);
                const json = await res.json();
                assert.equal(json.ok, true);
                assert.ok(json.jobId);
            } finally {
                if (prevGeminiKey === undefined) {
                    delete process.env.GEMINI_API_KEY;
                } else {
                    process.env.GEMINI_API_KEY = prevGeminiKey;
                }
                if (prevGoogleKey === undefined) {
                    delete process.env.GOOGLE_API_KEY;
                } else {
                    process.env.GOOGLE_API_KEY = prevGoogleKey;
                }
            }
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

        it('stores resolved systemId on the enqueued job input', async () => {
            cleanupStore();
            const prevApiKey = process.env.ANTHROPIC_API_KEY;
            process.env.ANTHROPIC_API_KEY = 'fake-key-for-test';
            const app = createTestApp({
                getSystemContext: (systemHeader: string) => ({
                    systemId: String(systemHeader || 'core'),
                    docsDir: path.join(REPO_ROOT, 'tmp/ai-jobs-route/core-docs'),
                }),
            });

            try {
                const res = await app.request('/api/ai/jobs', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-forwarded-for': '127.0.0.1',
                        'x-ds-system': 'core',
                    },
                    body: JSON.stringify({
                        type: 'GENERATE_COMPONENT_DOC',
                        provider: 'anthropic',
                        componentId: '68:4097',
                        dryRun: true,
                    }),
                });

                assert.equal(res.status, 202);
                const json = await res.json();
                const job = getAiJobsStore().findById(String(json.jobId));
                assert.equal(job?.input.systemId, 'core');
            } finally {
                if (prevApiKey === undefined) {
                    delete process.env.ANTHROPIC_API_KEY;
                } else {
                    process.env.ANTHROPIC_API_KEY = prevApiKey;
                }
            }
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

        it('should still create job when immediate dequeue throws', async () => {
            cleanupStore();
            const app = createTestApp();
            const store = getAiJobsStore();
            const prevApiKey = process.env.ANTHROPIC_API_KEY;
            process.env.ANTHROPIC_API_KEY = 'fake-key-for-test';
            const originalTryDequeue = store.tryDequeue.bind(store);
            const originalSetTimeout = globalThis.setTimeout;
            let dequeueAttempts = 0;
            try {
                globalThis.setTimeout = (((handler: (...args: unknown[]) => void) => {
                    handler();
                    return { unref: () => undefined } as unknown as ReturnType<typeof setTimeout>;
                }) as unknown) as typeof globalThis.setTimeout;
                (store as unknown as { tryDequeue: typeof originalTryDequeue }).tryDequeue = () => {
                    dequeueAttempts += 1;
                    throw new Error('dequeue failed');
                };

                const res = await app.request('/api/ai/jobs', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '127.0.0.1' },
                    body: JSON.stringify({
                        type: 'GENERATE_COMPONENT_DOC',
                        provider: 'anthropic',
                        componentId: '68:4097',
                    }),
                });

                assert.equal(res.status, 202);
                const json = await res.json();
                assert.equal(json.ok, true);
                assert.equal(typeof json.jobId, 'string');
                assert.equal(json.jobId.startsWith('ai_'), true);
                assert.equal(dequeueAttempts, 2, 'should retry dequeue once after initial failure');
            } finally {
                (store as unknown as { tryDequeue: typeof originalTryDequeue }).tryDequeue = originalTryDequeue;
                globalThis.setTimeout = originalSetTimeout;
                if (prevApiKey === undefined) {
                    delete process.env.ANTHROPIC_API_KEY;
                } else {
                    process.env.ANTHROPIC_API_KEY = prevApiKey;
                }
            }
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
                schemaVersion: 2,
                componentId: '68:4097',
                title: 'Test',
                summary: 'Test',
                anatomy: [],
                variants: [],
                tokens: [],
                accessibilityNotes: [],
                markdown: '# Test',
                states: [],
                accessibilityFacts: [],
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
            assert.ok('hasEditorialPatch' in json);
            assert.equal(json.done, true);
            assert.equal(json.nextCursor, null);
            assert.equal(json.hasEditorialPatch, false);
        });

        it('should return previewMarkdown for completed job without editorial patch', async () => {
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
                schemaVersion: 2,
                componentId: '68:4097',
                title: 'Test Button',
                summary: 'Test summary',
                anatomy: [],
                variants: [],
                tokens: [],
                accessibilityNotes: [],
                markdown: '# Test Button\n\nTest summary',
                states: [],
                accessibilityFacts: [],
            }, {
                promptTokens: 10,
                completionTokens: 5,
                durationMs: 100,
            });

            const res = await app.request(`/api/ai/jobs/${job.id}`, {
                headers: { 'x-forwarded-for': '127.0.0.1' },
            });

            assert.equal(res.status, 200);
            const json = await res.json();
            assert.ok('previewMarkdown' in json);
            assert.ok(typeof json.previewMarkdown === 'string');
            assert.ok(json.previewMarkdown.includes('# Test Button'));
        });

        it('should return previewMarkdown with editorial sections when patch exists', async () => {
            cleanupStore();
            const app = createTestApp();
            const store = getAiJobsStore();

            const editorialPatch = {
                schemaVersion: 2,
                summary: { purpose: 'AI suggested purpose' },
                related_components: ['Icon'],
                qa: ['Check hover'],
                content_guidelines: { rules: [] },
                accessibility: { role: 'button', labeling: { rules: [] }, notes: [] },
            };
            const job = store.enqueue({
                type: 'GENERATE_COMPONENT_DOC',
                provider: 'anthropic',
                componentId: '68:4097',
                dryRun: true,
            });
            store.complete(job.id, {
                schemaVersion: 2,
                componentId: '68:4097',
                title: 'Test Button',
                summary: 'Test summary',
                anatomy: [],
                variants: [],
                tokens: [],
                accessibilityNotes: [],
                markdown: '# Test Button\n\nTest summary',
                states: [],
                accessibilityFacts: [],
            }, {
                promptTokens: 10,
                completionTokens: 5,
                durationMs: 100,
            }, editorialPatch);

            const res = await app.request(`/api/ai/jobs/${job.id}`, {
                headers: { 'x-forwarded-for': '127.0.0.1' },
            });

            assert.equal(res.status, 200);
            const json = await res.json();
            assert.deepEqual(json.editorialPatch?.summary, { purpose: 'AI suggested purpose' });
            assert.ok(typeof json.previewMarkdown === 'string');
            assert.ok(json.previewMarkdown.includes('# Test Button'));
            assert.ok(json.previewMarkdown.includes('## Editorial: Purpose & Usage'));
            assert.ok(json.previewMarkdown.includes('**Purpose:** AI suggested purpose'));
        });
    });

    describe('POST /api/ai/jobs/:id/apply (S-10: DB-first)', () => {
        it('does not expose legacy /apply-editorial route', async () => {
            cleanupStore();
            const app = createTestApp();

            const res = await app.request('/api/ai/jobs/unknown-job-id/apply-editorial', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '127.0.0.1' },
                body: JSON.stringify({}),
            });

            assert.equal(res.status, 404);
        });

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

        it('should reject with 422 when canPublish is false', async () => {
            cleanupStore();
            const prevShadow = process.env.AI_VALIDATION_SHADOW;
            delete process.env.AI_VALIDATION_SHADOW;
            const app = createTestApp();
            const store = getAiJobsStore();

            const job = store.enqueue({
                type: 'GENERATE_COMPONENT_DOC',
                provider: 'anthropic',
                componentId: '68:4097',
                dryRun: true,
            });

            store.complete(job.id, {
                schemaVersion: 2,
                componentId: '68:4097',
                title: 'Blocked Apply',
                summary: 'Blocked',
                anatomy: [],
                variants: [],
                tokens: [],
                accessibilityNotes: [],
                markdown: '# Blocked',
                states: [],
                accessibilityFacts: [],
            }, {
                promptTokens: 1,
                completionTokens: 1,
                durationMs: 1,
            }, undefined, {
                canPublish: false,
            });

            const res = await app.request(`/api/ai/jobs/${job.id}/apply`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '127.0.0.1' },
                body: JSON.stringify({}),
            });

            assert.equal(res.status, 422);
            const json = await res.json();
            assert.equal(json.code, 'ai.validation.blocked');

            if (prevShadow !== undefined) {
                process.env.AI_VALIDATION_SHADOW = prevShadow;
            } else {
                delete process.env.AI_VALIDATION_SHADOW;
            }
        });

        it('should return 404 when no matching component in registry', async () => {
            cleanupStore();
            const app = createTestApp({
                componentRepo: {
                    getComponentByFigmaNodeId: () => null,
                },
            });
            const store = getAiJobsStore();

            const job = store.enqueue({
                type: 'GENERATE_COMPONENT_DOC',
                provider: 'anthropic',
                componentId: '68:4097',
                dryRun: true,
            });

            store.complete(job.id, {
                schemaVersion: 2,
                componentId: '68:4097',
                title: 'No Component',
                summary: 'No component',
                anatomy: [],
                variants: [],
                tokens: [],
                accessibilityNotes: [],
                markdown: '# No Component',
                states: [],
                accessibilityFacts: [],
            }, {
                promptTokens: 1,
                completionTokens: 1,
                durationMs: 1,
            });

            const res = await app.request(`/api/ai/jobs/${job.id}/apply`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '127.0.0.1' },
                body: JSON.stringify({}),
            });

            assert.equal(res.status, 404);
            const json = await res.json();
            assert.equal(json.code, 'ai.apply.no_component');
        });

        it('should return 409 when x-ds-system conflicts with job systemId', async () => {
            cleanupStore();
            const app = createTestApp({
                componentRepo: {
                    getComponentByFigmaNodeId: () => ({ id: 42, slug: 'button' }),
                    saveComponentDoc: () => {},
                },
            });
            const store = getAiJobsStore();

            const job = store.enqueue({
                type: 'GENERATE_COMPONENT_DOC',
                provider: 'anthropic',
                componentId: '68:4097',
                dryRun: true,
                systemId: 'core',
            });

            store.complete(job.id, {
                schemaVersion: 2,
                componentId: '68:4097',
                title: 'Button',
                summary: 'A button component',
                anatomy: [],
                variants: [],
                tokens: [],
                accessibilityNotes: [],
                markdown: '# Button',
                states: [],
                accessibilityFacts: [],
            }, {
                promptTokens: 1,
                completionTokens: 1,
                durationMs: 1,
            });

            const res = await app.request(`/api/ai/jobs/${job.id}/apply`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-forwarded-for': '127.0.0.1',
                    'x-ds-system': 'other-system',
                },
                body: JSON.stringify({}),
            });

            assert.equal(res.status, 409);
            const json = await res.json();
            assert.equal(json.code, 'ai.input.conflict');
        });

        it('should return 500 when component lookup throws', async () => {
            cleanupStore();
            const app = createTestApp({
                componentRepo: {
                    getComponentByFigmaNodeId: () => {
                        throw new Error('DB read failed');
                    },
                },
            });
            const store = getAiJobsStore();

            const job = store.enqueue({
                type: 'GENERATE_COMPONENT_DOC',
                provider: 'anthropic',
                componentId: '68:4097',
                dryRun: true,
            });

            store.complete(job.id, {
                schemaVersion: 2,
                componentId: '68:4097',
                title: 'Button',
                summary: 'A button component',
                anatomy: [],
                variants: [],
                tokens: [],
                accessibilityNotes: [],
                markdown: '# Button',
                states: [],
                accessibilityFacts: [],
            }, {
                promptTokens: 1,
                completionTokens: 1,
                durationMs: 1,
            });

            const res = await app.request(`/api/ai/jobs/${job.id}/apply`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '127.0.0.1' },
                body: JSON.stringify({}),
            });

            assert.equal(res.status, 500);
            const json = await res.json();
            assert.equal(json.code, 'ai.apply.lookup_failed');
        });

        it('should save to DB and return { ok, componentId, appliedAt }', async () => {
            cleanupStore();
            let savedDoc: any = null;
            const app = createTestApp({
                componentRepo: {
                    getComponentByFigmaNodeId: () => ({ id: 42, slug: 'button' }),
                    saveComponentDoc: (_id: number, data: any) => { savedDoc = data; },
                },
            });
            const store = getAiJobsStore();

            const job = store.enqueue({
                type: 'GENERATE_COMPONENT_DOC',
                provider: 'anthropic',
                componentId: '68:4097',
                dryRun: true,
            });

            store.complete(job.id, {
                schemaVersion: 2,
                componentId: '68:4097',
                title: 'Button',
                summary: 'A button component',
                anatomy: [],
                variants: [],
                tokens: [],
                accessibilityNotes: [],
                markdown: '# Button\n\nA button component.',
                states: [],
                accessibilityFacts: [],
            }, {
                promptTokens: 1,
                completionTokens: 1,
                durationMs: 1,
            });

            const res = await app.request(`/api/ai/jobs/${job.id}/apply`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '127.0.0.1' },
                body: JSON.stringify({}),
            });

            assert.equal(res.status, 200);
            const json = await res.json();
            assert.equal(json.ok, true);
            assert.equal(json.componentId, 42);
            assert.ok(typeof json.appliedAt === 'number');

            // Verify DB save
            assert.ok(savedDoc !== null);
            assert.ok(savedDoc.outputJson.includes('Button'));
            assert.ok(typeof savedDoc.jobId === 'string');
        });

        it('includes editorialJson in DB save when patch exists', async () => {
            cleanupStore();
            let savedDoc: any = null;
            const app = createTestApp({
                componentRepo: {
                    getComponentByFigmaNodeId: () => ({ id: 99, slug: 'card' }),
                    saveComponentDoc: (_id: number, data: any) => { savedDoc = data; },
                },
            });
            const store = getAiJobsStore();

            const job = store.enqueue({
                type: 'GENERATE_COMPONENT_DOC',
                provider: 'anthropic',
                componentId: '68:5000',
                dryRun: true,
            });

            store.complete(job.id, {
                schemaVersion: 2,
                componentId: '68:5000',
                title: 'Card',
                summary: 'Card component',
                anatomy: [],
                variants: [],
                tokens: [],
                accessibilityNotes: [],
                markdown: '# Card',
                states: [],
                accessibilityFacts: [],
            }, {
                promptTokens: 1,
                completionTokens: 1,
                durationMs: 1,
            }, {
                schemaVersion: 2,
                summary: { purpose: 'Container for content' },
                related_components: [],
                qa: [],
                content_guidelines: { rules: [] },
                accessibility: { role: 'article', labeling: { rules: [] }, notes: [] },
            });

            const res = await app.request(`/api/ai/jobs/${job.id}/apply`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '127.0.0.1' },
                body: JSON.stringify({}),
            });

            assert.equal(res.status, 200);
            const json = await res.json();
            assert.equal(json.ok, true);
            assert.equal(json.componentId, 99);

            assert.ok(savedDoc !== null);
            assert.ok(savedDoc.editorialJson !== null);
            assert.ok(savedDoc.editorialJson.includes('Container for content'));
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
                schemaVersion: 2,
                componentId: '68:4097',
                title: 'Test',
                summary: 'Test',
                anatomy: [],
                variants: [],
                tokens: [],
                accessibilityNotes: [],
                markdown: '# Test',
                states: [],
                accessibilityFacts: [],
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

    describe('GET /api/ai/providers/health', () => {
        let originalFetch: typeof globalThis.fetch;

        beforeEach(() => {
            originalFetch = globalThis.fetch;
            cleanupStore();
        });

        afterEach(() => {
            globalThis.fetch = originalFetch;
        });

        it('returns 400 for invalid provider', async () => {
            const app = createTestApp();
            const res = await app.request('/api/ai/providers/health?provider=invalid', {
                method: 'GET',
                headers: { 'x-forwarded-for': '127.0.0.1' },
            });

            assert.equal(res.status, 400);
            const json = await res.json();
            assert.equal(json.code, 'ai.input.invalid');
        });

        it('returns healthy checks for ollama when reachable and model exists', async () => {
            globalThis.fetch = async () =>
                new Response(
                    JSON.stringify({
                        models: [{ name: 'llama3.2:latest' }],
                    }),
                    { status: 200, headers: { 'Content-Type': 'application/json' } },
                );

            const app = createTestApp();
            const res = await app.request('/api/ai/providers/health?provider=ollama&model=llama3.2', {
                method: 'GET',
                headers: { 'x-forwarded-for': '127.0.0.1' },
            });

            assert.equal(res.status, 200);
            const json = await res.json();
            assert.equal(json.ok, true);
            assert.equal(json.checks.provider.ready, true);
            assert.equal(json.checks.model.ready, true);
            assert.equal(json.overallReady, false, 'without plugin connection figma check should fail');
        });

        it('returns model not available for ollama when tags do not include model', async () => {
            globalThis.fetch = async () =>
                new Response(
                    JSON.stringify({
                        models: [{ name: 'qwen2.5:7b-instruct' }],
                    }),
                    { status: 200, headers: { 'Content-Type': 'application/json' } },
                );

            const app = createTestApp();
            const res = await app.request('/api/ai/providers/health?provider=ollama&model=llama3.2', {
                method: 'GET',
                headers: { 'x-forwarded-for': '127.0.0.1' },
            });

            assert.equal(res.status, 200);
            const json = await res.json();
            assert.equal(json.ok, true);
            assert.equal(json.checks.model.ready, false);
            assert.equal(json.checks.model.status, 'error');
        });

        it('returns model warning when provider key is missing for cloud providers', async () => {
            const prevOpenAi = process.env.OPENAI_API_KEY;
            delete process.env.OPENAI_API_KEY;

            try {
                const app = createTestApp();
                const res = await app.request('/api/ai/providers/health?provider=openai&model=gpt-4o-mini-2024-07-18', {
                    method: 'GET',
                    headers: { 'x-forwarded-for': '127.0.0.1' },
                });

                assert.equal(res.status, 200);
                const json = await res.json();
                assert.equal(json.ok, true);
                assert.equal(json.checks.provider.ready, false);
                assert.equal(json.checks.provider.status, 'error');
                assert.equal(json.checks.model.ready, false);
                assert.equal(json.checks.model.status, 'warning');
            } finally {
                if (prevOpenAi === undefined) {
                    delete process.env.OPENAI_API_KEY;
                } else {
                    process.env.OPENAI_API_KEY = prevOpenAi;
                }
            }
        });
    });

    describe('GET /api/ai/providers/configured', () => {
        it('returns defaultProvider null when no explicit env vars are set', async () => {
            cleanupStore();
            const app = createTestApp();
            const prevAnthropic = process.env.ANTHROPIC_API_KEY;
            const prevOpenAi = process.env.OPENAI_API_KEY;
            const prevGemini = process.env.GEMINI_API_KEY;
            const prevGoogle = process.env.GOOGLE_API_KEY;
            const prevOllamaUrl = process.env.OLLAMA_BASE_URL;
            const prevOllamaModel = process.env.AI_OLLAMA_MODEL;
            const prevOllamaTimeout = process.env.AI_OLLAMA_TIMEOUT_MS;
            delete process.env.ANTHROPIC_API_KEY;
            delete process.env.OPENAI_API_KEY;
            delete process.env.GEMINI_API_KEY;
            delete process.env.GOOGLE_API_KEY;
            delete process.env.OLLAMA_BASE_URL;
            delete process.env.AI_OLLAMA_MODEL;
            delete process.env.AI_OLLAMA_TIMEOUT_MS;

            try {
                const res = await app.request('/api/ai/providers/configured', {
                    method: 'GET',
                    headers: { 'x-forwarded-for': '127.0.0.1' },
                });

                assert.equal(res.status, 200);
                const json = await res.json();
                assert.equal(json.ok, true);
                assert.equal(json.defaultProvider, null);
                assert.deepEqual(json.configuredProviders, []);
            } finally {
                if (prevAnthropic === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = prevAnthropic;
                if (prevOpenAi === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = prevOpenAi;
                if (prevGemini === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = prevGemini;
                if (prevGoogle === undefined) delete process.env.GOOGLE_API_KEY; else process.env.GOOGLE_API_KEY = prevGoogle;
                if (prevOllamaUrl === undefined) delete process.env.OLLAMA_BASE_URL; else process.env.OLLAMA_BASE_URL = prevOllamaUrl;
                if (prevOllamaModel === undefined) delete process.env.AI_OLLAMA_MODEL; else process.env.AI_OLLAMA_MODEL = prevOllamaModel;
                if (prevOllamaTimeout === undefined) delete process.env.AI_OLLAMA_TIMEOUT_MS; else process.env.AI_OLLAMA_TIMEOUT_MS = prevOllamaTimeout;
            }
        });

        it('prioritizes first configured provider in alphabetical UI order', async () => {
            cleanupStore();
            const app = createTestApp();
            const prevGemini = process.env.GEMINI_API_KEY;
            const prevOpenAi = process.env.OPENAI_API_KEY;
            process.env.GEMINI_API_KEY = 'gemini-key';
            process.env.OPENAI_API_KEY = 'openai-key';

            try {
                const res = await app.request('/api/ai/providers/configured', {
                    method: 'GET',
                    headers: { 'x-forwarded-for': '127.0.0.1' },
                });

                assert.equal(res.status, 200);
                const json = await res.json();
                assert.equal(json.ok, true);
                assert.equal(json.defaultProvider, 'gemini');
                assert.deepEqual(json.configuredProviders, ['gemini', 'openai']);
            } finally {
                if (prevGemini === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = prevGemini;
                if (prevOpenAi === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = prevOpenAi;
            }
        });

        it('does not treat AI_OLLAMA_TIMEOUT_MS alone as explicit Ollama configuration', async () => {
            cleanupStore();
            const app = createTestApp();
            const prevOllamaUrl = process.env.OLLAMA_BASE_URL;
            const prevOllamaModel = process.env.AI_OLLAMA_MODEL;
            const prevOllamaTimeout = process.env.AI_OLLAMA_TIMEOUT_MS;
            delete process.env.OLLAMA_BASE_URL;
            delete process.env.AI_OLLAMA_MODEL;
            process.env.AI_OLLAMA_TIMEOUT_MS = '5000';

            try {
                const res = await app.request('/api/ai/providers/configured', {
                    method: 'GET',
                    headers: { 'x-forwarded-for': '127.0.0.1' },
                });
                assert.equal(res.status, 200);
                const json = await res.json();
                assert.equal(json.ok, true);
                assert.equal(json.defaultProvider, null);
                assert.deepEqual(json.configuredProviders, []);
            } finally {
                if (prevOllamaUrl === undefined) delete process.env.OLLAMA_BASE_URL; else process.env.OLLAMA_BASE_URL = prevOllamaUrl;
                if (prevOllamaModel === undefined) delete process.env.AI_OLLAMA_MODEL; else process.env.AI_OLLAMA_MODEL = prevOllamaModel;
                if (prevOllamaTimeout === undefined) delete process.env.AI_OLLAMA_TIMEOUT_MS; else process.env.AI_OLLAMA_TIMEOUT_MS = prevOllamaTimeout;
            }
        });

        it('keeps configured providers order aligned with frontend catalog', async () => {
            cleanupStore();
            const app = createTestApp();
            const prevAnthropic = process.env.ANTHROPIC_API_KEY;
            const prevOpenAi = process.env.OPENAI_API_KEY;
            const prevGemini = process.env.GEMINI_API_KEY;
            const prevGoogle = process.env.GOOGLE_API_KEY;
            const prevOllamaUrl = process.env.OLLAMA_BASE_URL;
            const prevOllamaModel = process.env.AI_OLLAMA_MODEL;

            process.env.ANTHROPIC_API_KEY = 'anthropic-key';
            process.env.OPENAI_API_KEY = 'openai-key';
            process.env.GEMINI_API_KEY = 'gemini-key';
            delete process.env.GOOGLE_API_KEY;
            process.env.OLLAMA_BASE_URL = 'http://localhost:11434';
            process.env.AI_OLLAMA_MODEL = 'llama3.2';

            try {
                const res = await app.request('/api/ai/providers/configured', {
                    method: 'GET',
                    headers: { 'x-forwarded-for': '127.0.0.1' },
                });

                assert.equal(res.status, 200);
                const json = await res.json();
                assert.equal(json.ok, true);
                assert.deepEqual(json.configuredProviders, [...AI_PROVIDER_ORDER]);
                assert.equal(json.defaultProvider, AI_PROVIDER_ORDER[0]);
            } finally {
                if (prevAnthropic === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = prevAnthropic;
                if (prevOpenAi === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = prevOpenAi;
                if (prevGemini === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = prevGemini;
                if (prevGoogle === undefined) delete process.env.GOOGLE_API_KEY; else process.env.GOOGLE_API_KEY = prevGoogle;
                if (prevOllamaUrl === undefined) delete process.env.OLLAMA_BASE_URL; else process.env.OLLAMA_BASE_URL = prevOllamaUrl;
                if (prevOllamaModel === undefined) delete process.env.AI_OLLAMA_MODEL; else process.env.AI_OLLAMA_MODEL = prevOllamaModel;
            }
        });
    });

    describe('GET /api/ai/prompts/defaults', () => {
        it('returns default system/user prompts with placeholder list', async () => {
            cleanupStore();
            const app = createTestApp();

            const res = await app.request('/api/ai/prompts/defaults', {
                method: 'GET',
                headers: { 'x-forwarded-for': '127.0.0.1' },
            });

            assert.equal(res.status, 200);
            const json = await res.json();
            assert.equal(json.ok, true);
            assert.equal(typeof json.systemPrompt, 'string');
            assert.equal(typeof json.userPrompt, 'string');
            assert.deepEqual(json.placeholders, [
                '{{componentId}}',
                '{{componentSpecJson}}',
                '{{existingEditorialJsonBlock}}',
            ]);
            assert.match(json.systemPrompt, /JSON object/);
            assert.match(json.userPrompt, /\{\{componentId\}\}/);
        });
    });

    describe('POST /api/ai/prompts/preview', () => {
        it('returns 400 when componentId is missing', async () => {
            cleanupStore();
            const app = createTestApp();

            const res = await app.request('/api/ai/prompts/preview', {
                method: 'POST',
                headers: { 'x-forwarded-for': '127.0.0.1', 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            });

            assert.equal(res.status, 400);
            const json = await res.json();
            assert.equal(json.code, 'ai.input.invalid');
        });

        it('returns rendered preview using fallback spec when plugin is disconnected', async () => {
            cleanupStore();
            const app = createTestApp();

            const res = await app.request('/api/ai/prompts/preview', {
                method: 'POST',
                headers: { 'x-forwarded-for': '127.0.0.1', 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    componentId: '68:4097',
                }),
            });

            assert.equal(res.status, 200);
            const json = await res.json();
            assert.equal(json.ok, true);
            assert.equal(json.specSource, 'fallback');
            assert.equal(typeof json.systemPrompt, 'string');
            assert.equal(typeof json.userPrompt, 'string');
            assert.match(json.userPrompt, /68:4097/);
        });

        it('returns 400 when custom user prompt template omits required componentSpecJson placeholder', async () => {
            cleanupStore();
            const app = createTestApp();

            const res = await app.request('/api/ai/prompts/preview', {
                method: 'POST',
                headers: { 'x-forwarded-for': '127.0.0.1', 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    componentId: '68:4097',
                    userPrompt: 'Generate docs for {{componentId}} only.',
                }),
            });

            assert.equal(res.status, 400);
            const json = await res.json();
            assert.equal(json.code, 'ai.input.invalid');
            assert.match(String(json.message || ''), /\{\{componentSpecJson\}\}/);
        });
    });

    describe('GET /api/ai/docs/status', () => {
        it('returns 503 when component repository is not available', async () => {
            cleanupStore();
            const app = createTestApp();

            const res = await app.request('/api/ai/docs/status', {
                method: 'GET',
                headers: { 'x-forwarded-for': '127.0.0.1' },
            });

            assert.equal(res.status, 503);
            const json = await res.json();
            assert.equal(json.code, 'ai.status.unavailable');
        });

        it('rejects unauthorized requests from non-loopback', async () => {
            cleanupStore();
            const app = createTestApp();

            // Non-loopback IP should require token
            const res = await app.request('/api/ai/docs/status', {
                method: 'GET',
                headers: { 'x-forwarded-for': '192.168.1.1' },
            });

            assert.equal(res.status, 401);
        });

        it('returns 400 when x-ds-system cannot be resolved', async () => {
            cleanupStore();
            const app = createTestApp({
                getSystemContext: () => {
                    throw new Error('Unknown design system: "ghost"');
                },
            });

            const res = await app.request('/api/ai/docs/status', {
                method: 'GET',
                headers: {
                    'x-forwarded-for': '127.0.0.1',
                    'x-ds-system': 'ghost',
                },
            });

            assert.equal(res.status, 400);
            const json = await res.json();
            assert.equal(json.code, 'ai.input.invalid');
        });

        it('returns 500 when resolved docsDir is outside repo root', async () => {
            cleanupStore();
            const app = createTestApp({
                getSystemContext: () => ({
                    systemId: 'core',
                    docsDir: '/tmp/unsafe-docs-dir',
                }),
            });

            const res = await app.request('/api/ai/docs/status', {
                method: 'GET',
                headers: {
                    'x-forwarded-for': '127.0.0.1',
                    'x-ds-system': 'core',
                },
            });

            assert.equal(res.status, 500);
            const json = await res.json();
            assert.equal(json.code, 'ai.input.invalid');
            assert.equal(json.message, 'Design system docs directory is invalid.');
        });
    });

    describe('GET /api/ai/jobs/:id/events', () => {
        it('returns 404 for non-existent job', async () => {
            cleanupStore();
            const app = createTestApp();

            const res = await app.request('/api/ai/jobs/non-existent-id/events', {
                method: 'GET',
                headers: { 'x-forwarded-for': '127.0.0.1' },
            });

            assert.equal(res.status, 404);
        });

        it('returns events stream for existing job with proper SSE format', async () => {
            cleanupStore();
            const app = createTestApp();
            const store = getAiJobsStore();

            // Create a completed job with events
            const job = store.enqueue({
                type: 'GENERATE_COMPONENT_DOC',
                provider: 'anthropic',
                componentId: '68:4097',
                dryRun: true,
            });

            // Add events to the job
            store.pushEvent(job.id, 'job.started', { message: 'Job started' });
            store.pushEvent(job.id, 'job.progress', { message: 'Processing...' });
            store.complete(job.id, {
                schemaVersion: 2,
                componentId: '68:4097',
                title: 'Test',
                summary: 'Test',
                anatomy: [],
                variants: [],
                tokens: [],
                accessibilityNotes: [],
                markdown: '# Test',
                states: [],
                accessibilityFacts: [],
            }, {
                promptTokens: 100,
                completionTokens: 50,
                durationMs: 1000,
            });

            const res = await app.request(`/api/ai/jobs/${job.id}/events`, {
                method: 'GET',
                headers: { 'x-forwarded-for': '127.0.0.1' },
            });

            assert.equal(res.status, 200);
            assert.equal(res.headers.get('content-type'), 'text/event-stream');

            // Verify SSE body contains events with id and event: done
            const body = await res.text();
            const lines = body.split('\n');
            const eventLines = lines.filter(l => l.startsWith('id:') || l.startsWith('event:') || l.startsWith('data:'));

            // Should have at least one event with id
            const hasId = eventLines.some(l => l.startsWith('id:'));
            assert.ok(hasId, 'SSE should contain events with id field');

            // Should have event: done for completed job
            const hasDone = eventLines.some(l => l.startsWith('event:') && l.includes('done'));
            assert.ok(hasDone, 'SSE should contain event: done for completed job');
        });

        it('respects cursor query param and filters events', async () => {
            cleanupStore();
            const app = createTestApp();
            const store = getAiJobsStore();
            const cursor = 2;

            // Create a completed job with multiple events
            const job = store.enqueue({
                type: 'GENERATE_COMPONENT_DOC',
                provider: 'anthropic',
                componentId: '68:4097',
                dryRun: true,
            });

            // Add events with known seq numbers
            store.pushEvent(job.id, 'job.started', { message: 'Started' });
            store.pushEvent(job.id, 'job.progress', { message: 'Processing...' });
            store.pushEvent(job.id, 'job.completed', { message: 'Done' });

            store.complete(job.id, {
                schemaVersion: 2,
                componentId: '68:4097',
                title: 'Test',
                summary: 'Test',
                anatomy: [],
                variants: [],
                tokens: [],
                accessibilityNotes: [],
                markdown: '# Test',
                states: [],
                accessibilityFacts: [],
            }, {
                promptTokens: 100,
                completionTokens: 50,
                durationMs: 1000,
            });

            // Derive expected seqs from the job's actual event stream (deterministic)
            const expectedSeqs = (store.findById(job.id)?.events ?? [])
                .filter((e) => e.seq > cursor)
                .map((e) => e.seq);

            // Request with cursor
            const res = await app.request(`/api/ai/jobs/${job.id}/events?cursor=${cursor}`, {
                method: 'GET',
                headers: { 'x-forwarded-for': '127.0.0.1' },
            });

            assert.equal(res.status, 200);

            // Verify SSE body matches expected filtered seqs exactly
            const body = await res.text();
            const idLines = body.split('\n').filter(l => l.startsWith('id:'));
            assert.equal(idLines.length, expectedSeqs.length);

            const actualSeqs = idLines.map((line) => parseInt(line.replace('id:', '').trim(), 10));
            assert.deepEqual(actualSeqs, expectedSeqs);
        });
    });

    describe('GET /api/ai/jobs/:id/diff', () => {
        it('returns 404 for non-existent job', async () => {
            cleanupStore();
            const app = createTestApp();

            const res = await app.request('/api/ai/jobs/non-existent-id/diff', {
                method: 'GET',
                headers: { 'x-forwarded-for': '127.0.0.1' },
            });

            assert.equal(res.status, 404);
        });

        it('returns 400 when job is not completed', async () => {
            cleanupStore();
            const app = createTestApp();
            const store = getAiJobsStore();

            // Create a queued job (not completed)
            const job = store.enqueue({
                type: 'GENERATE_COMPONENT_DOC',
                provider: 'anthropic',
                componentId: '68:4097',
                dryRun: true,
            });

            // Try to get diff - should fail because job not completed
            const res = await app.request(`/api/ai/jobs/${job.id}/diff`, {
                method: 'GET',
                headers: { 'x-forwarded-for': '127.0.0.1' },
            });

            assert.equal(res.status, 400);
            const json = await res.json();
            assert.equal(json.code, 'ai.job.not_completed');
        });

        it('returns hasPrevious: false when job has no editorialPatch', async () => {
            cleanupStore();
            const app = createTestApp();
            const store = getAiJobsStore();

            // Create and complete a job without editorialPatch
            const job = store.enqueue({
                type: 'GENERATE_COMPONENT_DOC',
                provider: 'anthropic',
                componentId: '68:4097',
                dryRun: true,
            });

            store.complete(job.id, {
                schemaVersion: 2,
                componentId: '68:4097',
                title: 'Test Component',
                summary: 'A test component',
                anatomy: [],
                variants: [],
                tokens: [],
                accessibilityNotes: [],
                markdown: '# Test',
                states: [],
                accessibilityFacts: [],
            }, {
                promptTokens: 100,
                completionTokens: 50,
                durationMs: 1000,
            });

            const res = await app.request(`/api/ai/jobs/${job.id}/diff`, {
                method: 'GET',
                headers: { 'x-forwarded-for': '127.0.0.1' },
            });

            assert.equal(res.status, 200);
            const json = await res.json();
            assert.equal(json.hasPrevious, false);
            assert.equal(json.diff, '');
            assert.ok(json.stats.added > 0);
        });

        it('returns 503 when component repository is unavailable but job has editorialPatch', async () => {
            cleanupStore();
            const app = createTestApp();
            const store = getAiJobsStore();

            // Create and complete a job with editorialPatch but no componentRepo in test app
            const job = store.enqueue({
                type: 'GENERATE_COMPONENT_DOC',
                provider: 'anthropic',
                componentId: '68:4097',
                dryRun: true,
            });

            store.complete(job.id, {
                schemaVersion: 2,
                componentId: '68:4097',
                title: 'Test Component',
                summary: 'A test component',
                anatomy: [],
                variants: [],
                tokens: [],
                accessibilityNotes: [],
                markdown: '# Test',
                states: [],
                accessibilityFacts: [],
            }, {
                promptTokens: 100,
                completionTokens: 50,
                durationMs: 1000,
            }, {
                schemaVersion: EDITORIAL_PATCH_SCHEMA_VERSION,
                summary: { purpose: 'Test purpose' },
            });

            const res = await app.request(`/api/ai/jobs/${job.id}/diff`, {
                method: 'GET',
                headers: { 'x-forwarded-for': '127.0.0.1' },
            });

            assert.equal(res.status, 503);
        });

        it('returns hasPrevious: false when component is not found in DB', async () => {
            cleanupStore();
            const componentRepo = {
                getComponentByFigmaNodeId: () => null,
                getEditorial: () => null,
            };
            const app = createTestApp({ componentRepo });
            const store = getAiJobsStore();

            const job = store.enqueue({
                type: 'GENERATE_COMPONENT_DOC',
                provider: 'anthropic',
                componentId: '68:4097',
                dryRun: true,
            });

            store.complete(job.id, {
                schemaVersion: 2,
                componentId: '68:4097',
                title: 'Test Component',
                summary: 'A test component',
                anatomy: [],
                variants: [],
                tokens: [],
                accessibilityNotes: [],
                markdown: '# Test',
                states: [],
                accessibilityFacts: [],
            }, {
                promptTokens: 100,
                completionTokens: 50,
                durationMs: 1000,
            }, {
                schemaVersion: EDITORIAL_PATCH_SCHEMA_VERSION,
                summary: { purpose: 'Test purpose' },
            });

            const res = await app.request(`/api/ai/jobs/${job.id}/diff`, {
                method: 'GET',
                headers: { 'x-forwarded-for': '127.0.0.1' },
            });

            assert.equal(res.status, 200);
            const json = await res.json();
            assert.equal(json.hasPrevious, false);
            assert.ok(json.stats.added > 0);
        });

        it('returns hasPrevious: false when component exists but has no editorial', async () => {
            cleanupStore();
            const componentRepo = {
                getComponentByFigmaNodeId: () => ({ id: 1, slug: 'button' }),
                getEditorial: () => null,
            };
            const app = createTestApp({ componentRepo });
            const store = getAiJobsStore();

            const job = store.enqueue({
                type: 'GENERATE_COMPONENT_DOC',
                provider: 'anthropic',
                componentId: '68:4097',
                dryRun: true,
            });

            store.complete(job.id, {
                schemaVersion: 2,
                componentId: '68:4097',
                title: 'Test Component',
                summary: 'A test component',
                anatomy: [],
                variants: [],
                tokens: [],
                accessibilityNotes: [],
                markdown: '# Test',
                states: [],
                accessibilityFacts: [],
            }, {
                promptTokens: 100,
                completionTokens: 50,
                durationMs: 1000,
            }, {
                schemaVersion: EDITORIAL_PATCH_SCHEMA_VERSION,
                summary: { purpose: 'New purpose' },
            });

            const res = await app.request(`/api/ai/jobs/${job.id}/diff`, {
                method: 'GET',
                headers: { 'x-forwarded-for': '127.0.0.1' },
            });

            assert.equal(res.status, 200);
            const json = await res.json();
            assert.equal(json.hasPrevious, false);
            assert.ok(json.stats.added > 0);
        });

        it('returns hasPrevious: true with diff when component has existing editorial', async () => {
            cleanupStore();
            const componentRepo = {
                getComponentByFigmaNodeId: () => ({ id: 1, slug: 'button' }),
                getEditorial: () => ({
                    id: 1,
                    component_id: 1,
                    summary: { purpose: 'Old purpose', when_to_use: 'Old usage' },
                    created_at: Date.now(),
                    updated_at: Date.now(),
                }),
            };
            const app = createTestApp({ componentRepo });
            const store = getAiJobsStore();

            const job = store.enqueue({
                type: 'GENERATE_COMPONENT_DOC',
                provider: 'anthropic',
                componentId: '68:4097',
                dryRun: true,
            });

            store.complete(job.id, {
                schemaVersion: 2,
                componentId: '68:4097',
                title: 'Test Component',
                summary: 'A test component',
                anatomy: [],
                variants: [],
                tokens: [],
                accessibilityNotes: [],
                markdown: '# Test',
                states: [],
                accessibilityFacts: [],
            }, {
                promptTokens: 100,
                completionTokens: 50,
                durationMs: 1000,
            }, {
                schemaVersion: EDITORIAL_PATCH_SCHEMA_VERSION,
                summary: { purpose: 'New purpose', when_to_use: 'New usage' },
            });

            const res = await app.request(`/api/ai/jobs/${job.id}/diff`, {
                method: 'GET',
                headers: { 'x-forwarded-for': '127.0.0.1' },
            });

            assert.equal(res.status, 200);
            const json = await res.json();
            assert.equal(json.hasPrevious, true);
            assert.ok(json.diff !== undefined && json.diff.length > 0);
            assert.ok(json.stats.added > 0 || json.stats.removed > 0);
        });

        it('returns 500 when componentRepo throws during lookup', async () => {
            cleanupStore();
            const componentRepo = {
                getComponentByFigmaNodeId: () => {
                    throw new Error('DB connection lost');
                },
                getEditorial: () => null,
            };
            const app = createTestApp({ componentRepo });
            const store = getAiJobsStore();

            const job = store.enqueue({
                type: 'GENERATE_COMPONENT_DOC',
                provider: 'anthropic',
                componentId: '68:4097',
                dryRun: true,
            });

            store.complete(job.id, {
                schemaVersion: 2,
                componentId: '68:4097',
                title: 'Test Component',
                summary: 'A test component',
                anatomy: [],
                variants: [],
                tokens: [],
                accessibilityNotes: [],
                markdown: '# Test',
                states: [],
                accessibilityFacts: [],
            }, {
                promptTokens: 100,
                completionTokens: 50,
                durationMs: 1000,
            }, {
                schemaVersion: EDITORIAL_PATCH_SCHEMA_VERSION,
                summary: { purpose: 'Test purpose' },
            });

            const res = await app.request(`/api/ai/jobs/${job.id}/diff`, {
                method: 'GET',
                headers: { 'x-forwarded-for': '127.0.0.1' },
            });

            assert.equal(res.status, 500);
            const json = await res.json();
            assert.equal(json.code, 'ai.diff.computation_failed');
        });
    });

    // Global cleanup after all tests
    after(async () => {
        await cleanupTestFiles();
    });
});
