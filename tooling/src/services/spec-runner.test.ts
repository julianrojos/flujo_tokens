/**
 * Spec Runner Tests
 *
 * Tests for runSpecWithGuards function.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { runSpecWithGuards } from './spec-runner.js';

describe('spec-runner', () => {
  describe('runSpecWithGuards()', () => {
    it('success path calls scoped write policy and returns result', () => {
      const calls = {
        captureFile: 0,
        parseExisting: 0,
        captureScope: 0,
        assertScope: 0,
        restore: 0,
      };

      const result = runSpecWithGuards({
        outputPath: '/tmp/alert.yml',
        resolvedSpecRoot: '/tmp/specs',
        docsPath: '/tmp/docs',
        registryIndexPath: '/tmp/docs/_generated/component-registry.json',
        allowedWritePaths: ['/tmp/alert.yml'],
        run: ({ existingSpec }) => {
          assert.deepEqual(existingSpec, { name: 'Alert' });
          return { ok: true };
        },
        captureFileSnapshotFn: () => {
          calls.captureFile += 1;
          return { exists: true, content: 'name: Alert' };
        },
        parseExistingSpecFromSnapshotFn: () => {
          calls.parseExisting += 1;
          return { name: 'Alert' };
        },
        captureScopedWriteSnapshotFn: () => {
          calls.captureScope += 1;
          return { entries: [] };
        },
        assertScopedWritePolicyFn: () => {
          calls.assertScope += 1;
        },
      });

      assert.deepEqual(result, { ok: true });
      assert.equal(calls.captureFile, 1);
      assert.equal(calls.parseExisting, 1);
      assert.equal(calls.captureScope, 1);
      assert.equal(calls.assertScope, 1);
      assert.equal(calls.restore, 0);
    });

    it('failure path restores snapshot and appends scope error', () => {
      assert.throws(
        () =>
          runSpecWithGuards({
            outputPath: '/tmp/alert.yml',
            resolvedSpecRoot: '/tmp/specs',
            docsPath: '/tmp/docs',
            registryIndexPath: '/tmp/docs/_generated/component-registry.json',
            allowedWritePaths: ['/tmp/alert.yml'],
            run: () => {
              throw new Error('run failed');
            },
            captureFileSnapshotFn: () => ({ exists: true, content: 'x' }),
            parseExistingSpecFromSnapshotFn: () => ({}),
            captureScopedWriteSnapshotFn: () => ({ entries: [] }),
            assertScopedWritePolicyFn: () => {
              throw new Error('scope failed');
            },
          }),
        /run failed\nscope failed/,
      );
    });
  });
});
