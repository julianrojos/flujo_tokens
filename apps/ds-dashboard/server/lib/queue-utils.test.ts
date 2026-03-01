/**
 * Queue Utils Tests
 *
 * Tests for queue utilities.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  isQueueJobFinalStatus,
  listQueueJobEvents,
  queueJobAcceptedPayload,
  queueJobSnapshot,
  toQueueSummaryFromPayload,
  toQueueTerminalEvent,
} from './queue-utils.js';

describe('queue-utils', () => {
  describe('isQueueJobFinalStatus()', () => {
    it('identifies final statuses', () => {
      assert.equal(isQueueJobFinalStatus('success'), true);
      assert.equal(isQueueJobFinalStatus('error'), true);
      assert.equal(isQueueJobFinalStatus('cancelled'), true);
      assert.equal(isQueueJobFinalStatus('running'), false);
    });
  });

  describe('queueJobSnapshot()', () => {
    it('keeps stable shape', () => {
      const job = {
        id: 'job_1',
        label: 'npm run test',
        operationName: 'run:test',
        status: 'running',
        createdAt: '2026-01-01T00:00:00.000Z',
        startedAt: '2026-01-01T00:00:01.000Z',
        finishedAt: undefined,
        systemId: 'core',
        requestId: 'req_1',
        sourceEventId: null,
        result: undefined,
      };
      const snapshot = queueJobSnapshot(job);
      assert.equal(snapshot.id, 'job_1');
      assert.equal(snapshot.operation, 'run:test');
      assert.equal(snapshot.systemId, 'core');
    });
  });

  describe('queueJobAcceptedPayload()', () => {
    it('includes status and stream urls', () => {
      const payload = queueJobAcceptedPayload({
        id: 'job_123',
        requestId: 'req_123',
        status: 'queued',
        label: 'npm',
        operationName: 'run:x',
        createdAt: '2026-01-01T00:00:00.000Z',
        startedAt: undefined,
        finishedAt: undefined,
        systemId: 'core',
        sourceEventId: null,
        result: undefined,
      });

      assert.equal(payload.ok, true);
      assert.equal(payload.accepted, true);
      assert.equal(payload.statusUrl, '/api/jobs/job_123');
      assert.equal(payload.streamUrl, '/api/jobs/job_123/stream');
    });
  });

  describe('listQueueJobEvents()', () => {
    it('applies since and limit', () => {
      const job = {
        events: [{ seq: 1 }, { seq: 2 }, { seq: 3 }, { seq: 4 }],
      } as any;
      assert.deepEqual(listQueueJobEvents(job, { since: 2 }), [{ seq: 3 }, { seq: 4 }]);
      assert.deepEqual(listQueueJobEvents(job, { limit: 2 }), [{ seq: 3 }, { seq: 4 }]);
    });
  });

  describe('toQueueSummaryFromPayload()', () => {
    it('prioritizes message fields', () => {
      assert.equal(toQueueSummaryFromPayload({ message: 'Primary' }, 1), 'Primary');
      assert.equal(toQueueSummaryFromPayload({ sync: { reason: 'Sync failed' } }, 1), 'Sync failed');
      assert.match(toQueueSummaryFromPayload({}, 7), /code 7/i);
    });
  });

  describe('toQueueTerminalEvent()', () => {
    it('normalizes missing result', () => {
      const success = toQueueTerminalEvent({
        status: 'success',
        result: { code: 0, summary: 'Done', payload: { ok: true } },
      });
      assert.deepEqual(success, {
        type: 'end',
        status: 'success',
        code: 0,
        summary: 'Done',
        payload: { ok: true },
      });

      const unknown = toQueueTerminalEvent({ status: 'running', result: null });
      assert.equal(unknown.status, 'error');
      assert.equal(unknown.code, 1);
    });
  });
});
