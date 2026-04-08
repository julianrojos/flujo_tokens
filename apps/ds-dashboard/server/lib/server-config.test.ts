/**
 * Server Config Tests
 *
 * Tests for server configuration.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createServerConfig } from './server-config.js';

describe('server-config', () => {
  describe('defaults', () => {
    it('are stable', () => {
      const cfg = createServerConfig({});
      assert.equal(cfg.PORT, 8787);
      assert.equal(cfg.HOST, '127.0.0.1');
      assert.equal(cfg.MAX_OUTPUT_BYTES, 2 * 1024 * 1024);
      assert.equal(cfg.MAX_FILE_BYTES, 450_000);
      assert.equal(cfg.MAX_SNIPPET_LINES, 15);
      assert.equal(cfg.JOB_QUEUE_CONCURRENCY, 1);
      assert.equal(cfg.JOB_TIMEOUT_MS, 600000);
      assert.equal(cfg.JOB_RETENTION_MS, 30 * 60 * 1000);
      assert.equal(cfg.MAX_RETAINED_EVENTS, 2_000);
      assert.equal(cfg.MAX_RETAINED_JOBS, 200);
    });
  });

  describe('env overrides', () => {
    it('positive int values', () => {
      const cfg = createServerConfig({
        DS_DASHBOARD_API_PORT: '9999',
        DS_DASHBOARD_API_HOST: '0.0.0.0',
        DS_DASHBOARD_JOB_TIMEOUT_MS: '120000',
      });
      assert.equal(cfg.PORT, 9999);
      assert.equal(cfg.HOST, '0.0.0.0');
      assert.equal(cfg.JOB_TIMEOUT_MS, 120000);
    });

    it('invalid env values fall back to defaults', () => {
      const cfg = createServerConfig({
        DS_DASHBOARD_API_PORT: 'abc',
        DS_DASHBOARD_API_HOST: '',
        DS_DASHBOARD_JOB_TIMEOUT_MS: '-5',
      });
      assert.equal(cfg.PORT, 8787);
      assert.equal(cfg.HOST, '127.0.0.1');
      assert.equal(cfg.JOB_TIMEOUT_MS, 600000);
    });
  });
});
