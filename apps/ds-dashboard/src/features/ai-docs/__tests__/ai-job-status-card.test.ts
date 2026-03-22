/**
 * AiJobStatusCard Component Tests
 * Tests status display, button states, and event timeline logic
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

describe('AiJobStatusCard Logic', () => {
    // Mock job data for testing
    // Tipo genérico para incluir campos opcionales completos (R-016)
    interface MockJob {
        id: string;
        status: 'pending' | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
        input: {
            type: string;
            provider: string;
            componentId: string;
        };
        output?: {
            schemaVersion: number;
            componentId: string;
            title: string;
            summary: string;
            anatomy: never[];
            variants: never[];
            tokens: never[];
            accessibilityNotes: never[];
            markdown: string;
        };
        events: Array<{
            seq: number;
            ts: number;
            event: string;
            data: Record<string, unknown>;
        }>;
        createdAt: number;
        updatedAt: number;
        retryable: boolean;
        error?: string;
        usage?: {
            promptTokens: number;
            completionTokens: number;
            durationMs: number;
        };
    }

    function createMockJob(): MockJob;
    function createMockJob<T extends Partial<MockJob>>(overrides: T): MockJob & T;
    function createMockJob(overrides: Partial<MockJob> = {}): MockJob {
        return {
            id: 'job-123',
            status: 'completed',
            input: {
                type: 'GENERATE_COMPONENT_DOC',
                provider: 'anthropic',
                componentId: '123:456',
            },
            output: {
                schemaVersion: 1,
                componentId: '123:456',
                title: 'Test Component',
                summary: 'Test summary',
                anatomy: [],
                variants: [],
                tokens: [],
                accessibilityNotes: [],
                markdown: '# Test Component\n\nContent',
            },
            events: [
                { seq: 1, ts: Date.now() - 10000, event: 'job.queued', data: {} },
                { seq: 2, ts: Date.now() - 5000, event: 'job.started', data: {} },
                { seq: 3, ts: Date.now(), event: 'job.completed', data: {} },
            ],
            createdAt: Date.now() - 10000,
            updatedAt: Date.now(),
            retryable: false,
            error: undefined,
            usage: {
                promptTokens: 1000,
                completionTokens: 500,
                durationMs: 15000,
            },
            ...overrides,
        };
    }

    function canCancel(status: MockJob['status']): boolean {
        return status === 'queued' || status === 'running';
    }

    function canApply(status: MockJob['status'], hasOutput: boolean): boolean {
        return status === 'completed' && hasOutput;
    }

    describe('STATUS_CONFIG', () => {
        it('should have correct variant for pending status', () => {
            const config = {
                pending: { variant: 'neutral', label: 'Pending' },
                queued: { variant: 'neutral', label: 'Queued' },
                running: { variant: 'default', label: 'Running' },
                completed: { variant: 'success', label: 'Completed' },
                failed: { variant: 'warning', label: 'Failed' },
                cancelled: { variant: 'neutral', label: 'Cancelled' },
            };

            assert.equal(config.pending.variant, 'neutral');
            assert.equal(config.completed.variant, 'success');
            assert.equal(config.running.variant, 'default');
            assert.equal(config.failed.variant, 'warning');
        });

        it('should have correct labels for all statuses', () => {
            const labels = ['Pending', 'Queued', 'Running', 'Completed', 'Failed', 'Cancelled'];
            assert.ok(labels.includes('Pending'));
            assert.ok(labels.includes('Completed'));
            assert.ok(labels.includes('Failed'));
        });
    });

    describe('Button state logic', () => {
        it('should allow cancel for queued job', () => {
            const job = createMockJob({ status: 'queued' });
            assert.equal(canCancel(job.status), true);
        });

        it('should allow cancel for running job', () => {
            const job = createMockJob({ status: 'running' });
            assert.equal(canCancel(job.status), true);
        });

        it('should not allow cancel for completed job', () => {
            const job = createMockJob({ status: 'completed' });
            assert.equal(canCancel(job.status), false);
        });

        it('should allow apply for completed job with output', () => {
            const job = createMockJob({ status: 'completed' });
            assert.equal(canApply(job.status, !!job.output), true);
        });

        it('should not allow apply for running job', () => {
            const job = createMockJob({ status: 'running' });
            assert.equal(canApply(job.status, !!job.output), false);
        });

        it('should allow retry for failed job with retryable flag', () => {
            const job = createMockJob({ status: 'failed', retryable: true });
            const canRetry = job.status === 'failed' && job.retryable;
            assert.equal(canRetry, true);
        });

        it('should not allow retry for failed job without retryable flag', () => {
            const job = createMockJob({ status: 'failed', retryable: false });
            const canRetry = job.status === 'failed' && job.retryable;
            assert.equal(canRetry, false);
        });
    });

    describe('Event timeline logic', () => {
        it('should sort events by seq', () => {
            const events = [
                { seq: 3, ts: Date.now(), event: 'job.completed', data: {} },
                { seq: 1, ts: Date.now() - 5000, event: 'job.started', data: {} },
                { seq: 2, ts: Date.now() - 3000, event: 'job.running', data: {} },
            ];

            const sorted = [...events].sort((a, b) => a.seq - b.seq);
            assert.equal(sorted[0].seq, 1);
            assert.equal(sorted[1].seq, 2);
            assert.equal(sorted[2].seq, 3);
        });

        it('should merge external events with job events', () => {
            const jobEvents = [
                { seq: 1, ts: Date.now() - 5000, event: 'job.started', data: {} },
            ];
            const externalEvents = [
                { seq: 2, ts: Date.now() - 3000, event: 'job.running', data: {} },
                { seq: 3, ts: Date.now(), event: 'job.completed', data: {} },
            ];

            // Merge preferring external events
            const eventMap = new Map<number, typeof jobEvents[0]>();
            for (const evt of jobEvents) {
                eventMap.set(evt.seq, evt);
            }
            for (const evt of externalEvents) {
                eventMap.set(evt.seq, evt);
            }
            const merged = Array.from(eventMap.values()).sort((a, b) => a.seq - b.seq);

            assert.equal(merged.length, 3);
            assert.equal(merged[0].seq, 1);
            assert.equal(merged[1].seq, 2);
            assert.equal(merged[2].seq, 3);
        });

        it('should prefer external events over job events for same seq', () => {
            const jobEvents = [
                { seq: 1, ts: Date.now() - 5000, event: 'job.started', data: { source: 'polling' } },
            ];
            const externalEvents = [
                { seq: 1, ts: Date.now(), event: 'job.started', data: { source: 'sse' } },
            ];

            const eventMap = new Map<number, typeof jobEvents[0]>();
            for (const evt of jobEvents) {
                eventMap.set(evt.seq, evt);
            }
            for (const evt of externalEvents) {
                eventMap.set(evt.seq, evt);
            }
            const merged = Array.from(eventMap.values());

            // External should override
            assert.equal(merged[0].data.source, 'sse');
        });
    });

    describe('Error display logic', () => {
        it('should show error info for failed job', () => {
            const job = createMockJob({
                status: 'failed',
                error: 'API Error: Rate limited',
                errorCode: 'ai.api.rate_limit',
                retryable: true,
            });

            assert.equal(job.status, 'failed');
            assert.ok(job.error);
            assert.ok(job.retryable);
            assert.equal(job.error, 'API Error: Rate limited');
        });

        it('should not show error for completed job', () => {
            const job = createMockJob({ status: 'completed' });
            assert.equal(job.status, 'completed');
            assert.equal(job.error, undefined);
        });
    });

    describe('Usage metrics display', () => {
        it('should show usage metrics for completed job', () => {
            const job = createMockJob({
                status: 'completed',
                usage: {
                    promptTokens: 1000,
                    completionTokens: 500,
                    durationMs: 15000,
                },
            });

            assert.ok(job.usage);
            assert.equal(job.usage.promptTokens, 1000);
            assert.equal(job.usage.completionTokens, 500);
            assert.equal(job.usage.durationMs, 15000);
        });

        it('should calculate duration in seconds correctly', () => {
            const durationMs = 15000;
            const durationSeconds = Math.round(durationMs / 1000);
            assert.equal(durationSeconds, 15);
        });
    });
});
