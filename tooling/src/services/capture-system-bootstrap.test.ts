import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import {
  bootstrapInputJsonFromFigmaVariables,
  runTokensCompileIfNeeded,
} from './capture-system-bootstrap.js';
import type { SyncFigmaTokensToInputOptions } from './figma-token-sync.js';

describe('capture-system-bootstrap', () => {
  it('bootstraps input JSON even when compileVariablesOnCapture is false', async () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'capture-bootstrap-'));
    try {
      const calls: SyncFigmaTokensToInputOptions[] = [];
      const result = await bootstrapInputJsonFromFigmaVariables({
        repoRoot,
        fileKey: 'FILE123',
        figmaToken: 'token',
        system: {
          id: 'demo',
          inputDir: 'input/demo',
          docsDir: 'docs/demo',
          compileVariablesOnCapture: false,
        },
        syncFigmaTokensToInputFn: async (args) => {
          calls.push(args);
          return {
            attempted: true,
            reason: 'bootstrapped',
            files_written: 2,
            tokens_written: 42,
            files: ['input/demo/primitives.json', 'input/demo/semantic.json'],
          };
        },
      });

      assert.equal(calls.length, 1);
      assert.equal(result.attempted, true);
      assert.equal(result.created, true);
      assert.equal(result.reason, 'bootstrapped');
      assert.equal(result.files_written, 2);
      assert.equal(result.tokens_written, 42);
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it('keeps compile gate controlled by compileVariablesOnCapture', () => {
    const result = runTokensCompileIfNeeded({
      repoRoot: '/tmp',
      system: {
        id: 'demo',
        inputDir: 'input/demo',
        docsDir: 'docs/demo',
        compileVariablesOnCapture: false,
      },
    });

    assert.deepEqual(result, {
      attempted: false,
      compiled: false,
      reason: 'disabled-by-config',
    });
  });
});
