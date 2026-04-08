/**
 * API Response Service Tests
 *
 * Tests for API response utilities.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildApiErrorPayload,
  createApiRequestId,
  createFailJson,
  createHealthPayloadBuilder,
} from './api-response-service.js';

describe('api-response-service', () => {
  describe('ID helpers', () => {
    it('preserves request id prefix', () => {
      assert.match(createApiRequestId(), /^req_/);
    });
  });

  describe('buildApiErrorPayload()', () => {
    it('sets defaults and context', () => {
      const payload = buildApiErrorPayload({
        userMessage: 'Bad request',
        code: 'request.bad',
        recoverable: true,
        context: { path: '/api/test' },
        requestId: 'req_123',
      });

      assert.deepEqual(payload, {
        ok: false,
        message: 'Bad request',
        requestId: 'req_123',
        error: {
          code: 'request.bad',
          userMessage: 'Bad request',
          recoverable: true,
          context: { path: '/api/test' },
        },
      });
    });
  });

  describe('createFailJson()', () => {
    it('emits payload and logs unless suppressed', () => {
      const logEvents: Array<{ level: string; payload: Record<string, unknown> }> = [];
      const failJson = createFailJson({
        createRequestId: () => 'req_fixed',
        writeStructuredLogFn: (level, payload) => {
          logEvents.push({ level, payload });
        },
      });

      const ctx = {
        req: { path: '/api/demo', method: 'POST' },
        json(payload: unknown, status: number) {
          return { payload, status };
        },
      };

      const result = failJson(ctx as any, 400, {
        code: 'request.invalid',
        userMessage: 'Invalid payload',
        recoverable: true,
      });

      assert.equal((result as any).status, 400);
      assert.equal(((result as any).payload as any).requestId, 'req_fixed');
      assert.equal(logEvents.length, 1);
      assert.equal(logEvents[0].level, 'warn');
      assert.equal(logEvents[0].payload.path, '/api/demo');
      assert.equal(logEvents[0].payload.method, 'POST');
    });
  });

  describe('createHealthPayloadBuilder()', () => {
    it('uses injected dependencies', () => {
      const buildHealthPayload = createHealthPayloadBuilder({
        queueMetrics: () => ({ active: 1, pending: 2 }),
        nowIsoFn: () => '2026-01-01T00:00:00.000Z',
        processUptime: () => 42,
      });

      assert.deepEqual(buildHealthPayload(), {
        status: 'ok',
        service: 'ds-dashboard-api',
        now: '2026-01-01T00:00:00.000Z',
        uptime: 42,
        queue: { active: 1, pending: 2 },
      });
    });
  });
});
