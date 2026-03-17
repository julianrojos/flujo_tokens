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
      assert.equal(cfg.JOB_TIMEOUT_MS, 600000);
      assert.equal(cfg.OPS_LOG_MAX_FILE_BYTES, 1_048_576);
      assert.equal(cfg.OPS_LOG_RETENTION_DAYS, 30);
      assert.equal(cfg.OPS_HISTORY_MAX_LIMIT, 500);
      assert.equal(cfg.OPS_REGRESSION_MAX_LIMIT, 500);
      assert.equal(cfg.REPLAYABLE_NPM_SCRIPTS.has('ds:token-graph'), true);
      assert.equal(cfg.SUPPORTED_REPLAY_OPERATIONS.has('script:ds:token-graph'), true);
    });
  });

  describe('env overrides', () => {
    it('positive int values', () => {
      const cfg = createServerConfig({
        DS_DASHBOARD_API_PORT: '9999',
        DS_DASHBOARD_API_HOST: '0.0.0.0',
        DS_DASHBOARD_JOB_TIMEOUT_MS: '120000',
        DS_DASHBOARD_OPS_LOG_MAX_FILE_BYTES: '2048',
        DS_DASHBOARD_OPS_LOG_RETENTION_DAYS: '7',
      });
      assert.equal(cfg.PORT, 9999);
      assert.equal(cfg.HOST, '0.0.0.0');
      assert.equal(cfg.JOB_TIMEOUT_MS, 120000);
      assert.equal(cfg.OPS_LOG_MAX_FILE_BYTES, 2048);
      assert.equal(cfg.OPS_LOG_RETENTION_DAYS, 7);
    });

    it('invalid env values fall back to defaults', () => {
      const cfg = createServerConfig({
        DS_DASHBOARD_API_PORT: 'abc',
        DS_DASHBOARD_API_HOST: '',
        DS_DASHBOARD_JOB_TIMEOUT_MS: '-5',
        DS_DASHBOARD_OPS_LOG_MAX_FILE_BYTES: '0',
        DS_DASHBOARD_OPS_LOG_RETENTION_DAYS: '',
      });
      assert.equal(cfg.PORT, 8787);
      assert.equal(cfg.HOST, '127.0.0.1');
      assert.equal(cfg.JOB_TIMEOUT_MS, 600000);
      assert.equal(cfg.OPS_LOG_MAX_FILE_BYTES, 1_048_576);
      assert.equal(cfg.OPS_LOG_RETENTION_DAYS, 30);
    });
  });
});
