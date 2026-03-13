import assert from 'node:assert/strict';
import test from 'node:test';

import { ShadowModeExecutor } from './shadow-parity.ts';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test('shadow-parity: respects concurrency limit per key', async () => {
  let legacyRuns = 0;
  const executor = new ShadowModeExecutor({ maxConcurrency: 1, legacyTimeoutMs: 100 });

  executor.runShadow(
    'variables',
    'FILE_1',
    async () => ({ ok: true }),
    async () => {
      legacyRuns += 1;
      await sleep(30);
      return { ok: true };
    }
  );

  executor.runShadow(
    'variables',
    'FILE_1',
    async () => ({ ok: true }),
    async () => {
      legacyRuns += 1;
      return { ok: true };
    }
  );

  await sleep(80);
  assert.equal(legacyRuns, 1);
});

test('shadow-parity: timeout in legacy does not throw to caller', async () => {
  const executor = new ShadowModeExecutor({ legacyTimeoutMs: 10 });

  executor.runShadow(
    'kit',
    'FILE_2',
    async () => ({ ok: true }),
    async () => {
      await sleep(50);
      return { ok: true };
    }
  );

  await sleep(40);
  const debug = executor.getDebugInfo();
  assert.equal(debug.runningOperations.length, 0);
});
