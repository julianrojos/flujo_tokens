/**
 * Error Middleware Tests
 *
 * Tests for unhandled error middleware.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Hono } from 'hono';

import { registerUnhandledErrorMiddleware } from './error-middleware.js';

describe('error-middleware', () => {
  describe('registerUnhandledErrorMiddleware()', () => {
    it('maps thrown errors to failJson and logs context', async () => {
      const logged: Array<{ level: string; payload: Record<string, unknown> }> = [];
      const app = new Hono();

      registerUnhandledErrorMiddleware(app, {
        createApiRequestId: () => 'req_fixed',
        writeStructuredLog: (level, payload) => {
          logged.push({ level, payload });
        },
        failJson: (c, statusCode, args) => {
          return (c as any).json(
            {
              ok: false,
              statusCode,
              code: (args as any).code,
              requestId: (args as any).requestId,
            },
            statusCode
          );
        },
      });

      app.get('/boom', () => {
        throw new Error('boom');
      });

      const res = await app.request('/boom');
      assert.equal(res.status, 500);
      const payload = await res.json();
      assert.equal((payload as any).ok, false);
      assert.equal((payload as any).code, 'internal.unexpected_error');
      assert.equal((payload as any).requestId, 'req_fixed');

      assert.equal(logged.length, 1);
      assert.equal(logged[0].level, 'error');
      assert.equal(logged[0].payload.path, '/boom');
    });
  });
});
