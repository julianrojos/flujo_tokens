import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { runPipeline } from './pipeline-runner.js';

function captureStdout<T>(run: () => Promise<T>): Promise<{ result: T; output: string }> {
  const originalWrite = process.stdout.write;
  let output = '';

  process.stdout.write = ((chunk: string | Uint8Array) => {
    output += chunk.toString();
    return true;
  }) as typeof process.stdout.write;

  return run()
    .then((result) => ({ result, output }))
    .finally(() => {
      process.stdout.write = originalWrite;
    });
}

describe('pipeline-runner', () => {
  it('returns a help result without exiting the process', async () => {
    const originalExit = process.exit;
    let exitCalled = false;

    process.exit = ((() => {
      exitCalled = true;
      throw new Error('process.exit should not be called from runPipeline');
    }) as unknown) as typeof process.exit;

    try {
      const { result, output } = await captureStdout(() => runPipeline(['--help']));

      assert.deepStrictEqual(result, { ok: true, reason: 'help' });
      assert.match(output, /Usage: ds:pipeline \[options\]/);
      assert.strictEqual(exitCalled, false);
    } finally {
      process.exit = originalExit;
    }
  });
});
