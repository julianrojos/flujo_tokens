import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { runDoctor } from './doctor-runner.js';

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

describe('doctor-runner', () => {
  it('returns a help result without exiting the process', async () => {
    const originalExit = process.exit;
    let exitCalled = false;

    process.exit = ((() => {
      exitCalled = true;
      throw new Error('process.exit should not be called from runDoctor');
    }) as unknown) as typeof process.exit;

    try {
      const { result, output } = await captureStdout(() => runDoctor(['--help']));

      assert.deepStrictEqual(result, { ok: true, reason: 'help' });
      assert.match(output, /Usage: ds:doctor \[options\]/);
      assert.strictEqual(exitCalled, false);
    } finally {
      process.exit = originalExit;
    }
  });

  it('fails fast when --system is provided without a valid value', async () => {
    await assert.rejects(
      () => runDoctor(['--system=']),
      /Design system context is required\./,
    );
  });
});
