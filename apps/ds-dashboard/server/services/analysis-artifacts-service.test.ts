/**
 * Analysis Artifacts Service Tests
 *
 * Tests for analysis utilities.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  normalizeImpactWcagPairs,
  runNodeJsonCommandOnce,
  validateGitRef,
} from './analysis-artifacts-service.js';

describe('analysis-artifacts-service', () => {
  describe('validateGitRef()', () => {
    it('accepts safe refs and rejects invalid ones', () => {
      assert.equal(validateGitRef('HEAD~1'), 'HEAD~1');
      assert.equal(validateGitRef('feature/my-branch'), 'feature/my-branch');
      assert.equal(validateGitRef('invalid ref'), null);
      assert.equal(validateGitRef('refs:bad'), null);
    });
  });

  describe('normalizeImpactWcagPairs()', () => {
    it('sanitizes payload', () => {
      const pairs = normalizeImpactWcagPairs({
        pairs: [
          { foreground: 'a', background: 'b', level: 'aaa', textSize: 'large' },
          { foreground: 'x', background: 'y', level: 'AA', textSize: 'normal' },
          { foreground: '', background: 'y' },
        ],
      });

      assert.deepEqual(pairs, [
        { foreground: 'a', background: 'b', level: 'AAA', textSize: 'large' },
        { foreground: 'x', background: 'y', level: 'AA', textSize: 'normal' },
      ]);
    });
  });

  describe('runNodeJsonCommandOnce()', () => {
    it('returns parsed payload on success', async () => {
      const result = await runNodeJsonCommandOnce(
        {
          cwd: '/repo',
          command: 'node',
          commandArgs: ['script.mjs'],
          commandLabel: 'node script.mjs',
        },
        {
          runSpawnWithCaptureFn: async () => ({
            spawnError: '',
            exitCode: 0,
            stdout: '{"ok":true}',
            stderr: '',
            jsonParseError: '',
            parsedJson: { ok: true },
          }),
        }
      );

      assert.equal(result.ok, true);
      assert.equal(result.statusCode, 200);
      assert.deepEqual(result.payload, { ok: true });
    });

    it('surfaces spawn errors', async () => {
      const result = await runNodeJsonCommandOnce(
        {
          cwd: '/repo',
          command: 'node',
          commandArgs: ['script.mjs'],
          commandLabel: 'node script.mjs',
        },
        {
          runSpawnWithCaptureFn: async () => ({
            spawnError: 'ENOENT',
            exitCode: 1,
            stdout: '',
            stderr: '',
            jsonParseError: '',
            parsedJson: null,
          }),
        }
      );

      assert.equal(result.ok, false);
      assert.equal(result.statusCode, 500);
      assert.equal((result.payload as any).message, 'ENOENT');
    });

    it('surfaces non-zero exit codes with code field', async () => {
      const result = await runNodeJsonCommandOnce(
        {
          cwd: '/repo',
          command: 'node',
          commandArgs: ['script.mjs'],
          commandLabel: 'node script.mjs',
        },
        {
          runSpawnWithCaptureFn: async () => ({
            spawnError: null,
            exitCode: 3,
            stdout: '',
            stderr: 'error output',
            jsonParseError: null,
            parsedJson: null,
          }),
        }
      );

      assert.equal(result.ok, false);
      assert.equal(result.statusCode, 500);
      assert.equal((result.payload as any).code, 3);
      assert.equal((result.payload as any).stdout, '');
      assert.equal((result.payload as any).stderr, 'error output');
    });

    it('surfaces JSON parse errors with parse_error field', async () => {
      const result = await runNodeJsonCommandOnce(
        {
          cwd: '/repo',
          command: 'node',
          commandArgs: ['script.mjs'],
          commandLabel: 'node script.mjs',
        },
        {
          runSpawnWithCaptureFn: async () => ({
            spawnError: null,
            exitCode: 0,
            stdout: '{invalid json',
            stderr: '',
            jsonParseError: 'Unexpected token i in JSON',
            parsedJson: null,
          }),
        }
      );

      assert.equal(result.ok, false);
      assert.equal(result.statusCode, 500);
      assert.equal((result.payload as any).message, 'Command returned invalid JSON.');
      assert.equal((result.payload as any).parse_error, 'Unexpected token i in JSON');
    });
  });
});
