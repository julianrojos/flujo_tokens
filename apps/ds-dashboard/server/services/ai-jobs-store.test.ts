/**
 * AI Jobs Store Tests
 *
 * Tests for AiJobsStore covering FIFO queue, concurrency, idempotency,
 * ring buffer events, and TTL cleanup.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { AiJobsStore } from './ai-jobs-store.js';
import type { AiJobInput, ComponentDocOutput, AiUsageMetrics } from './ai-component-doc-schema.js';

// Helper fixtures to avoid repetition
function makeInput(overrides: Partial<AiJobInput> = {}): AiJobInput {
  return {
    type: 'GENERATE_COMPONENT_DOC',
    provider: 'anthropic',
    componentId: '68:1',
    ...overrides,
  };
}

function makeOutput(): ComponentDocOutput {
  return {
    schemaVersion: 2,
    componentId: '68:1',
    title: 'Test',
    summary: 'Test',
    variants: [],
    accessibilityNotes: [],
    markdown: '# Test',
    states: [],
    accessibilityFacts: [],
  };
}

function makeUsage(): AiUsageMetrics {
  return {
    promptTokens: 10,
    completionTokens: 5,
    durationMs: 100,
  };
}

describe('ai-jobs-store', () => {
  let store: AiJobsStore;

  beforeEach(() => {
    store = new AiJobsStore();
  });

  afterEach(() => {
    store.stopCleanup();
  });

  describe('generateJobId', () => {
    it('should generate ID with format ai_${timestamp}_${hex}', () => {
      const jobId = store.generateJobId();

      assert.ok(jobId.startsWith('ai_'), 'Job ID should start with ai_');

      const parts = jobId.split('_');
      assert.equal(parts.length, 3, 'Job ID should have 3 parts');

      const timestamp = parseInt(parts[1], 10);
      assert.ok(!isNaN(timestamp), 'Timestamp should be a number');
      assert.ok(timestamp > 0, 'Timestamp should be positive');

      const hex = parts[2];
      assert.ok(/^[0-9a-f]+$/.test(hex), 'Hex part should be valid hexadecimal');
      assert.equal(hex.length, 8, 'Hex part should be 8 characters');
    });
  });

  describe('computeIdempotencyKey', () => {
    it('should use explicit key if provided', () => {
      const input = makeInput({ idempotencyKey: 'custom-key-123' });
      const key = store.computeIdempotencyKey(input);

      assert.equal(key, 'custom-key-123');
    });

    it('should produce deterministic hash for same input', () => {
      const input1 = makeInput({
        componentId: '68:1',
        figmaUrl: 'https://figma.com/file/abc',
        model: 'claude-sonnet-4-20250514',
      });

      const input2 = makeInput({
        componentId: '68:1',
        figmaUrl: 'https://figma.com/file/abc',
        model: 'claude-sonnet-4-20250514',
      });

      const key1 = store.computeIdempotencyKey(input1);
      const key2 = store.computeIdempotencyKey(input2);

      assert.equal(key1, key2, 'Same input should produce same key');
      assert.equal(key1.length, 16, 'Key should be 16 characters (64-bit hash)');
    });

    it('should produce a versioned hash value for the current algorithm', () => {
      const input = makeInput({
        componentId: '68:1',
        figmaUrl: 'https://figma.com/file/abc',
        model: 'claude-sonnet-4-20250514',
      });
      const key = store.computeIdempotencyKey(input);

      assert.equal(key, '2e2c73ed1e49dd5d');
    });

    it('should produce different hash for different input', () => {
      const input1 = makeInput({ componentId: '68:1' });
      const input2 = makeInput({ componentId: '68:2' });

      const key1 = store.computeIdempotencyKey(input1);
      const key2 = store.computeIdempotencyKey(input2);

      assert.notEqual(key1, key2, 'Different input should produce different key');
    });

    it('should include systemId in hash input', () => {
      const input1 = makeInput({ componentId: '68:1', systemId: 'core' });
      const input2 = makeInput({ componentId: '68:1', systemId: 'marketing' });

      const key1 = store.computeIdempotencyKey(input1);
      const key2 = store.computeIdempotencyKey(input2);

      assert.notEqual(key1, key2, 'Different systems should not share idempotency keys');
    });

    it('should normalize prompt whitespace in hash input', () => {
      const input1 = makeInput({
        systemPrompt: 'System prompt',
        userPrompt: 'User prompt',
      });
      const input2 = makeInput({
        systemPrompt: '  System prompt  \n',
        userPrompt: '\nUser prompt   ',
      });

      const key1 = store.computeIdempotencyKey(input1);
      const key2 = store.computeIdempotencyKey(input2);

      assert.equal(key1, key2, 'Whitespace-only prompt differences should not change idempotency');
    });
  });

  describe('enqueue', () => {
    it('should create job with status queued', () => {
      const input = makeInput();
      const job = store.enqueue(input);

      assert.ok(job.id, 'Job should have an ID');
      assert.equal(job.status, 'queued', 'Job status should be queued');
      assert.equal(job.input.type, input.type);
      assert.equal(job.input.provider, input.provider);
      assert.equal(job.input.componentId, input.componentId);
      assert.ok(job.createdAt > 0, 'Job should have createdAt timestamp');
      assert.ok(job.updatedAt > 0, 'Job should have updatedAt timestamp');
    });

    it('should add job to provider queue', () => {
      const input = makeInput();
      const job = store.enqueue(input);

      const status = store.getQueueStatus('anthropic');
      assert.equal(status.queued, 1, 'Queue should have 1 job');
      assert.equal(status.running, 0, 'No jobs running yet');
    });

    it('should throw ai.job.queue_full when at capacity (200 jobs)', () => {
      // Simulate 200 jobs without actually enqueueing 200 times
      for (let i = 0; i < 200; i++) {
        (store as any).jobs.set(`fake_${i}`, { id: `fake_${i}` });
      }

      assert.throws(() => {
        store.enqueue(makeInput());
      }, (err: any) => {
        assert.equal(err.code, 'ai.job.queue_full');
        assert.equal(err.retryable, true);
        return true;
      });
    });

    it('should return existing job for same idempotency key (queued)', () => {
      const input = makeInput({ idempotencyKey: 'test-key-1' });
      const job1 = store.enqueue(input);
      const job2 = store.enqueue(input);

      assert.equal(job1.id, job2.id, 'Same key should return same job');
    });

    it('should return existing job for same idempotency key (running)', () => {
      const input = makeInput({ idempotencyKey: 'test-key-2' });
      const job = store.enqueue(input);
      store.tryDequeue('anthropic'); // Move to running

      const job2 = store.enqueue(input);
      assert.equal(job.id, job2.id, 'Same key should return same running job');
    });

    it('should create new job for same idempotency key when previous job is completed', () => {
      const input = makeInput({ idempotencyKey: 'test-key-3' });
      const job = store.enqueue(input);
      store.tryDequeue('anthropic');
      store.complete(job.id, makeOutput(), makeUsage());

      const job2 = store.enqueue(input);
      assert.notEqual(job.id, job2.id, 'Completed job should not be reused — a new job must be created');
    });

    it('should create new job for same key if previous job failed', () => {
      const input = makeInput({ idempotencyKey: 'test-key-failed' });
      const job1 = store.enqueue(input);
      store.tryDequeue('anthropic');
      store.fail(job1.id, 'Test error', 'ai.llm.timeout', true);

      const job2 = store.enqueue(input);
      assert.notEqual(job1.id, job2.id, 'Failed job should allow new job with same key');
      assert.equal(job2.status, 'queued', 'New job should be queued');
    });

    it('should create new job for same key if previous job was cancelled', () => {
      const input = makeInput({ idempotencyKey: 'test-key-cancelled' });
      const job1 = store.enqueue(input);
      store.cancel(job1.id);

      const job2 = store.enqueue(input);
      assert.notEqual(job1.id, job2.id, 'Cancelled job should allow new job with same key');
    });
  });

  describe('tryDequeue', () => {
    it('should return jobs in FIFO order', () => {
      const job1 = store.enqueue(makeInput({ componentId: '68:1' }));
      const job2 = store.enqueue(makeInput({ componentId: '68:2' }));
      const job3 = store.enqueue(makeInput({ componentId: '68:3' }));

      const dequeued1 = store.tryDequeue('anthropic');
      const dequeued2 = store.tryDequeue('anthropic');
      const dequeued3 = store.tryDequeue('anthropic');

      assert.equal(dequeued1?.id, job1.id, 'First job should be dequeued first');
      assert.equal(dequeued2?.id, job2.id, 'Second job should be dequeued second');
      assert.equal(dequeued3?.id, job3.id, 'Third job should be dequeued third');
    });

    it('should change job status to running', () => {
      const job = store.enqueue(makeInput());
      assert.equal(job.status, 'queued');

      const dequeued = store.tryDequeue('anthropic');
      assert.equal(dequeued?.status, 'running', 'Dequeued job status should be running');
    });

    it('should return null when queue is empty', () => {
      const dequeued = store.tryDequeue('anthropic');
      assert.equal(dequeued, null, 'Empty queue should return null');
    });

    it('should respect MAX_CONCURRENT_PER_PROVIDER (3)', () => {
      // Enqueue 4 jobs
      store.enqueue(makeInput({ componentId: '68:1' }));
      store.enqueue(makeInput({ componentId: '68:2' }));
      store.enqueue(makeInput({ componentId: '68:3' }));
      store.enqueue(makeInput({ componentId: '68:4' }));

      // Dequeue 3 jobs (max concurrent)
      store.tryDequeue('anthropic');
      store.tryDequeue('anthropic');
      store.tryDequeue('anthropic');

      // 4th dequeue should return null
      const dequeued4 = store.tryDequeue('anthropic');
      assert.equal(dequeued4, null, 'Should not exceed max concurrent jobs');

      const status = store.getQueueStatus('anthropic');
      assert.equal(status.running, 3, 'Should have 3 running jobs');
      assert.equal(status.queued, 1, 'Should have 1 job still queued');
    });

    it('should track running count per provider separately', () => {
      // Enqueue for both providers
      store.enqueue(makeInput({ provider: 'anthropic' }));
      store.enqueue(makeInput({ provider: 'openai' }));

      // Dequeue anthropic
      store.tryDequeue('anthropic');

      // Openai should still be able to dequeue
      const openaiJob = store.tryDequeue('openai');
      assert.ok(openaiJob, 'OpenAI should be able to dequeue independently');

      const anthropicStatus = store.getQueueStatus('anthropic');
      const openaiStatus = store.getQueueStatus('openai');
      assert.equal(anthropicStatus.running, 1);
      assert.equal(openaiStatus.running, 1);
    });
  });

  describe('tryDequeueNext', () => {
    it('should decrement running count and dequeue next job', () => {
      store.enqueue(makeInput({ componentId: '68:1' }));
      store.enqueue(makeInput({ componentId: '68:2' }));

      // Dequeue first job (job1 running, job2 queued)
      const running = store.tryDequeue('anthropic');
      assert.ok(running, 'First job should be dequeued');
      assert.equal(store.getQueueStatus('anthropic').running, 1);
      assert.equal(store.getQueueStatus('anthropic').queued, 1);

      // Complete the running job
      store.complete(running!.id, makeOutput(), makeUsage());

      // Manually trigger tryDequeueNext to dequeue the next job (complete doesn't auto-trigger)
      store.tryDequeueNext('anthropic');

      // After completion + tryDequeueNext, running should be 1 and job2 should be dequeued
      const status = store.getQueueStatus('anthropic');
      assert.equal(status.running, 1, 'Second job should be running after completion');
      assert.equal(status.queued, 0, 'Queue should be empty after second job dequeued');
    });

    it('should not throw when running count is zero', () => {
      // With no running jobs, tryDequeueNext should be a no-op
      assert.doesNotThrow(() => {
        store.tryDequeueNext('anthropic');
      });

      const status = store.getQueueStatus('anthropic');
      assert.equal(status.running, 0, 'Running count should remain 0');
    });

    it('should decrement from 2 to 1 correctly', () => {
      // Enqueue and dequeue 2 jobs
      store.enqueue(makeInput({ componentId: '68:1' }));
      store.enqueue(makeInput({ componentId: '68:2' }));
      const running1 = store.tryDequeue('anthropic');
      const running2 = store.tryDequeue('anthropic');

      assert.equal(store.getQueueStatus('anthropic').running, 2);
      assert.ok(running1, 'First running job should exist');
      assert.ok(running2, 'Second running job should exist');

      // Complete one job
      store.complete(running1.id, makeOutput(), makeUsage());

      // Manually trigger tryDequeueNext to decrement running count
      store.tryDequeueNext('anthropic');

      // Running should be 1 after tryDequeueNext
      const status = store.getQueueStatus('anthropic');
      assert.equal(status.running, 1, 'Running count should decrement from 2 to 1');
    });
  });

  describe('pushEvent', () => {
    it('should add event with sequential seq number', () => {
      const job = store.enqueue(makeInput());

      // enqueue already adds 'job.queued' event with seq 1
      store.pushEvent(job.id, 'job.started');
      store.pushEvent(job.id, 'job.completed');

      const updatedJob = store.findById(job.id);
      assert.equal(updatedJob?.events.length, 3);
      assert.equal(updatedJob?.events[0].seq, 1); // job.queued
      assert.equal(updatedJob?.events[1].seq, 2); // job.started
      assert.equal(updatedJob?.events[2].seq, 3); // job.completed
    });

    it('should maintain monotonic seq across ring buffer wrap', () => {
      const job = store.enqueue(makeInput());

      // enqueue already adds 'job.queued' event with seq 1
      // Push 100 more events (total 101, exceeds MAX_EVENTS_PER_JOB=100)
      for (let i = 2; i <= 101; i++) {
        store.pushEvent(job.id, `event-${i}`);
      }

      const updatedJob = store.findById(job.id);
      assert.equal(updatedJob?.events.length, 100, 'Should have max 100 events');

      // First event seq should be 2 (event 1 'job.queued' was discarded)
      assert.equal(updatedJob?.events[0].seq, 2, 'First remaining event should have seq 2');
      assert.equal(updatedJob?.events[99].seq, 101, 'Last event should have seq 101');
    });

    it('should be no-op for non-existent job', () => {
      // Should not throw
      assert.doesNotThrow(() => {
        store.pushEvent('non-existent-job', 'test.event');
      });
    });
  });

  describe('complete', () => {
    it('should set job status to completed with output', () => {
      const job = store.enqueue(makeInput());
      store.tryDequeue('anthropic');

      const output = {
        schemaVersion: 2,
        componentId: '68:1',
        title: 'Test',
        summary: 'Test',
        variants: [],
        accessibilityNotes: [],
        markdown: '# Test',
        states: [],
        accessibilityFacts: [],
      };

      const usage = {
        promptTokens: 100,
        completionTokens: 50,
        durationMs: 1000,
      };

      store.complete(job.id, output, usage);

      const completedJob = store.findById(job.id);
      assert.equal(completedJob?.status, 'completed');
      assert.deepEqual(completedJob?.output, output);
      assert.deepEqual(completedJob?.usage, usage);
    });

    it('should be no-op for non-existent job', () => {
      assert.doesNotThrow(() => {
        store.complete('non-existent', {} as any, {} as any);
      });
    });

    it('should store validationReport and canPublish when provided in options', () => {
      const job = store.enqueue(makeInput());
      store.tryDequeue('anthropic');

      const output = makeOutput();
      const usage = makeUsage();
      const editorialPatch = {
        schemaVersion: 2 as const,
        summary: { purpose: 'Test' },
      };
      const validationReport = {
        schemaVersion: 1,
        passes: true,
        severity: 'info' as const,
        score: 90,
        structureWarnings: [],
        missingSections: [],
        unsupportedClaims: [],
        editorialConflicts: [],
        terminologyMismatches: [],
        a11yWarnings: [],
        notes: [],
      };

      store.complete(job.id, output, usage, editorialPatch, {
        validationReport,
        canPublish: true,
        pipelineSeverity: 'info',
        pipelineScore: 90,
      });

      const completedJob = store.findById(job.id);
      assert.equal(completedJob?.status, 'completed');
      assert.equal(completedJob?.canPublish, true);
      assert.equal(completedJob?.pipelineSeverity, 'info');
      assert.equal(completedJob?.pipelineScore, 90);
      assert.deepEqual(completedJob?.validationReport, validationReport);
      assert.equal(completedJob?.editorialPatch, editorialPatch);
    });

    it('should set canPublish to false when validation blocks', () => {
      const job = store.enqueue(makeInput());
      store.tryDequeue('anthropic');

      const output = makeOutput();
      const usage = makeUsage();

      store.complete(job.id, output, usage, undefined, {
        canPublish: false,
      });

      const completedJob = store.findById(job.id);
      assert.equal(completedJob?.canPublish, false);
    });

    it('should clear pipelineStage when job completes', () => {
      const job = store.enqueue(makeInput());
      store.tryDequeue('anthropic');
      store.setPipelineStage(job.id, 'validating');

      store.complete(job.id, makeOutput(), makeUsage());

      const completedJob = store.findById(job.id);
      assert.equal(completedJob?.status, 'completed');
      assert.equal(completedJob?.pipelineStage, null);
    });
  });

  describe('fail', () => {
    it('should set job status to failed with error info', () => {
      const job = store.enqueue(makeInput());
      store.tryDequeue('anthropic');

      store.fail(job.id, 'Test error message', 'ai.llm.timeout', true);

      const failedJob = store.findById(job.id);
      assert.equal(failedJob?.status, 'failed');
      assert.equal(failedJob?.error, 'Test error message');
      assert.equal(failedJob?.errorCode, 'ai.llm.timeout');
      assert.equal(failedJob?.retryable, true);
    });

    it('should be no-op for non-existent job', () => {
      assert.doesNotThrow(() => {
        store.fail('non-existent', 'error', 'ai.test', false);
      });
    });
  });

  describe('cancel', () => {
    it('should cancel queued job and remove from queue', () => {
      const job = store.enqueue(makeInput());

      store.cancel(job.id);

      const cancelledJob = store.findById(job.id);
      assert.equal(cancelledJob?.status, 'cancelled');

      const status = store.getQueueStatus('anthropic');
      assert.equal(status.queued, 0, 'Cancelled job should be removed from queue');
    });

    it('should cancel running job', () => {
      const job = store.enqueue(makeInput());
      store.tryDequeue('anthropic');

      store.cancel(job.id);

      const runningJob = store.findById(job.id);
      assert.equal(runningJob?.status, 'cancelled', 'Running job should be cancellable');
      assert.equal(runningJob?.pipelineStage, null, 'Cancelled running job should clear pipeline stage');
    });

    it('should release running slot and dequeue next queued job when cancelling a running job', () => {
      const job1 = store.enqueue(makeInput({ idempotencyKey: 'cancel-running-1' }));
      const job2 = store.enqueue(makeInput({ idempotencyKey: 'cancel-running-2' }));

      const running = store.tryDequeue('anthropic');
      assert.equal(running?.id, job1.id);

      store.cancel(job1.id);

      const cancelledJob = store.findById(job1.id);
      assert.equal(cancelledJob?.status, 'cancelled');

      const dequeuedNext = store.findById(job2.id);
      assert.equal(dequeuedNext?.status, 'running', 'Next queued job should be dequeued after cancellation releases slot');

      const status = store.getQueueStatus('anthropic');
      assert.equal(status.running, 1, 'Running count should remain at 1 after replacing cancelled running job');
      assert.equal(status.queued, 0, 'Queue should be drained after auto-dequeue');
    });

    it('should be no-op for completed job', () => {
      const job = store.enqueue(makeInput());
      store.tryDequeue('anthropic');
      store.complete(job.id, makeOutput(), makeUsage());

      store.cancel(job.id);

      const completedJob = store.findById(job.id);
      assert.equal(completedJob?.status, 'completed', 'Completed job should not be cancelled');
    });

    it('complete/fail should not override cancelled status', () => {
      const job = store.enqueue(makeInput());
      store.tryDequeue('anthropic');
      store.cancel(job.id);

      store.complete(job.id, makeOutput(), makeUsage());
      let current = store.findById(job.id);
      assert.equal(current?.status, 'cancelled');
      assert.ok(current?.events.some((evt) => evt.event === 'job.complete_attempted_after_cancel'));

      store.fail(job.id, 'late failure', 'ai.test', false);
      current = store.findById(job.id);
      assert.equal(current?.status, 'cancelled');
      assert.ok(current?.events.some((evt) => evt.event === 'job.fail_attempted_after_cancel'));
    });

    it('should be no-op for non-existent job', () => {
      assert.doesNotThrow(() => {
        store.cancel('non-existent-job');
      });
    });
  });

  describe('findById and findByIdempotencyKey', () => {
    it('should find job by ID', () => {
      const job = store.enqueue(makeInput());
      const found = store.findById(job.id);

      assert.equal(found?.id, job.id);
    });

    it('should return undefined for non-existent job', () => {
      const found = store.findById('non-existent');
      assert.equal(found, undefined);
    });

    it('should find job by idempotency key', () => {
      const input = makeInput({ idempotencyKey: 'lookup-key' });
      const job = store.enqueue(input);

      const found = store.findByIdempotencyKey('lookup-key');
      assert.equal(found?.id, job.id);
    });

    it('should return undefined for non-existent key', () => {
      const found = store.findByIdempotencyKey('non-existent-key');
      assert.equal(found, undefined);
    });
  });

  describe('getQueueStatus', () => {
    it('should return correct queued and running counts', () => {
      store.enqueue(makeInput({ componentId: '68:1' }));
      store.enqueue(makeInput({ componentId: '68:2' }));
      store.enqueue(makeInput({ componentId: '68:3' }));

      store.tryDequeue('anthropic');
      store.tryDequeue('anthropic');

      const status = store.getQueueStatus('anthropic');
      assert.equal(status.queued, 1, 'One job should be queued');
      assert.equal(status.running, 2, 'Two jobs should be running');
    });
  });

  describe('cleanup (TTL)', () => {
    it('should remove job with expired TTL (24h)', () => {
      const job = store.enqueue(makeInput());

      // Set updatedAt to 25 hours ago
      (job as any).updatedAt = Date.now() - (25 * 60 * 60 * 1000);

      // Invoke private cleanup method
      (store as any).cleanup();

      const found = store.findById(job.id);
      assert.equal(found, undefined, 'Expired job should be removed');
    });

    it('should keep job with recent updatedAt', () => {
      const job = store.enqueue(makeInput());

      // updatedAt is already set to now by enqueue

      // Invoke private cleanup method
      (store as any).cleanup();

      const found = store.findById(job.id);
      assert.ok(found, 'Recent job should not be cleaned up');
    });

    it('should clean up idempotencyIndex for expired job', () => {
      const input = makeInput({ idempotencyKey: 'cleanup-key' });
      const job = store.enqueue(input);

      // Set updatedAt to 25 hours ago
      (job as any).updatedAt = Date.now() - (25 * 60 * 60 * 1000);

      // Invoke private cleanup method
      (store as any).cleanup();

      const found = store.findByIdempotencyKey('cleanup-key');
      assert.equal(found, undefined, 'Idempotency index should be cleaned up');
    });
  });

  describe('startCleanup and stopCleanup', () => {
    it('should not throw when calling stopCleanup without startCleanup', () => {
      assert.doesNotThrow(() => {
        store.stopCleanup();
      });
    });

    it('should be idempotent (multiple startCleanup calls)', () => {
      // First call
      store.startCleanup();
      const timer1 = (store as any).cleanupTimer;

      // Second call (should not create new timer)
      store.startCleanup();
      const timer2 = (store as any).cleanupTimer;

      assert.equal(timer1, timer2, 'Multiple startCleanup calls should not create multiple timers');

      store.stopCleanup();
    });
  });
});
