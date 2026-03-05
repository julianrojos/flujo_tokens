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
  it('bootstraps input JSON even when empty token-registry seed exists', async () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'capture-bootstrap-seed-'));
    try {
      fs.mkdirSync(path.join(repoRoot, 'docs', 'demo', '_generated'), { recursive: true });
      fs.writeFileSync(
        path.join(repoRoot, 'docs', 'demo', '_generated', 'token-registry.json'),
        JSON.stringify({ entries: [], byPath: {}, bySlashPath: {} }, null, 2),
        'utf8',
      );

      const calls: SyncFigmaTokensToInputOptions[] = [];
      const result = await bootstrapInputJsonFromFigmaVariables({
        repoRoot,
        fileKey: 'FILE123',
        figmaToken: 'token',
        system: {
          id: 'demo',
          inputDir: 'input/demo',
          docsDir: 'docs/demo',
          compileVariablesOnCapture: true,
        },
        syncFigmaTokensToInputFn: async (args) => {
          calls.push(args);
          return {
            attempted: true,
            reason: 'bootstrapped',
            files_written: 1,
            tokens_written: 7,
            files: ['input/demo/primitives.json'],
          };
        },
      });

      assert.equal(calls.length, 1);
      assert.equal(result.attempted, true);
      assert.equal(result.created, true);
      assert.equal(result.reason, 'bootstrapped');
      assert.equal(result.files_written, 1);
      assert.equal(result.tokens_written, 7);
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });

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

  it('does not short-circuit compile only because token-registry exists', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'capture-bootstrap-compile-'));
    try {
      fs.mkdirSync(path.join(repoRoot, 'docs', 'demo', '_generated'), { recursive: true });
      fs.writeFileSync(
        path.join(repoRoot, 'docs', 'demo', '_generated', 'token-registry.json'),
        JSON.stringify({ entries: [], byPath: {}, bySlashPath: {} }, null, 2),
        'utf8',
      );

      const result = runTokensCompileIfNeeded({
        repoRoot,
        system: {
          id: 'demo',
          inputDir: 'input/demo',
          docsDir: 'docs/demo',
          outputDir: 'output/demo',
          compileVariablesOnCapture: true,
        },
      });

      assert.equal(result.reason, 'input-json-missing');
      assert.equal(result.compiled, false);
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
