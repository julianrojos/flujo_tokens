/**
 * Spawn Runner Tests
 *
 * Tests for spawn process runner with output capture.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { runSpawnWithCapture } from './spawn-runner.js';

describe('spawn-runner', () => {
  describe('runSpawnWithCapture()', () => {
    it('captures parsed JSON stdout', async () => {
      const result = await runSpawnWithCapture({
        command: 'node',
        commandArgs: ['-e', 'process.stdout.write(JSON.stringify({ ok: true, value: 7 }))'],
        parseJsonStdout: true,
        maxOutputBytes: 1024,
      });

      assert.equal(result.spawnError, null);
      assert.equal(result.exitCode, 0);
      assert.equal(result.jsonParseError, null);
      assert.deepEqual(result.parsedJson, { ok: true, value: 7 });
    });

    it('reports JSON parse errors', async () => {
      const result = await runSpawnWithCapture({
        command: 'node',
        commandArgs: ['-e', "process.stdout.write('{invalid')"],
        parseJsonStdout: true,
        maxOutputBytes: 1024,
      });

      assert.equal(result.spawnError, null);
      assert.equal(result.exitCode, 0);
      assert.equal(typeof result.jsonParseError, 'string');
      assert.equal(result.parsedJson, null);
    });

    it('captures stderr and non-zero exits', async () => {
      const result = await runSpawnWithCapture({
        command: 'node',
        commandArgs: ['-e', "process.stderr.write('boom'); process.exit(3);"],
        maxOutputBytes: 1024,
      });

      assert.equal(result.spawnError, null);
      assert.equal(result.exitCode, 3);
      assert.match(result.stderr, /boom/);
    });

    it('captures stdout when maxOutputBytes is not provided', async () => {
      const result = await runSpawnWithCapture({
        command: 'node',
        commandArgs: ['-e', "process.stdout.write('hello-world')"],
      });

      assert.equal(result.spawnError, null);
      assert.equal(result.exitCode, 0);
      assert.equal(result.stdout, 'hello-world');
    });
  });
});
