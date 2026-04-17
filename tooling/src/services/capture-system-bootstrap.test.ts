import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import {
  bootstrapInputJsonFromFigmaVariables,
  ensureCollectionsConfigured,
  getSystemRepository,
  runTokensCompileIfNeeded,
} from './capture-system-bootstrap.js';
import type { SyncFigmaTokensToInputOptions } from './figma-token-sync.js';

function uniqueSystemId(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

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
          inputDir: 'design-systems/demo/input',
          docsDir: 'design-systems/demo/docs',
          compileVariablesOnCapture: true,
        },
        syncFigmaTokensToInputFn: async (args) => {
          calls.push(args);
          return {
            attempted: true,
            reason: 'bootstrapped',
            files_written: 1,
            tokens_written: 7,
            tokens_total: 9,
            files: ['design-systems/demo/input/primitives.json'],
          };
        },
      });

      assert.equal(calls.length, 1);
      assert.equal(result.attempted, true);
      assert.equal(result.created, true);
      assert.equal(result.reason, 'bootstrapped');
      assert.equal(result.files_written, 1);
      assert.equal(result.tokens_written, 7);
      assert.equal(result.tokens_total, 9);
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
          inputDir: 'design-systems/demo/input',
          docsDir: 'design-systems/demo/docs',
          compileVariablesOnCapture: false,
        },
        syncFigmaTokensToInputFn: async (args) => {
          calls.push(args);
          return {
            attempted: true,
            reason: 'bootstrapped',
            files_written: 2,
            tokens_written: 42,
            files: ['design-systems/demo/input/primitives.json', 'design-systems/demo/input/semantic.json'],
          };
        },
      });

      assert.equal(calls.length, 1);
      assert.equal(result.attempted, true);
      assert.equal(result.created, true);
      assert.equal(result.reason, 'bootstrapped');
      assert.equal(result.files_written, 2);
      assert.equal(result.tokens_written, 42);
      assert.equal(result.tokens_total, 42);
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
          inputDir: 'design-systems/demo/input',
          docsDir: 'design-systems/demo/docs',
          outputDir: 'design-systems/demo/output',
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
        inputDir: 'design-systems/demo/input',
        docsDir: 'design-systems/demo/docs',
        compileVariablesOnCapture: false,
      },
    });

    assert.deepEqual(result, {
      attempted: false,
      compiled: false,
      reason: 'disabled-by-config',
    });
  });

  it('does not inject fallback collections when input directory has no JSON files', async () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'capture-bootstrap-collections-empty-'));
    try {
      const systemId = uniqueSystemId('demo-empty');
      fs.mkdirSync(path.join(repoRoot, 'design-systems', systemId, 'input'), { recursive: true });
      const repository = getSystemRepository(repoRoot);
      await repository.create({
        id: systemId,
        name: 'Demo',
        collections: [],
      });
      await repository.setDefaultSystemId(systemId);

      await ensureCollectionsConfigured({
        repoRoot,
        systemId,
      });

      const system = await repository.getById(systemId);
      assert.deepEqual(system?.collections ?? [], []);
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it('infers collections from input JSON filenames when available', async () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'capture-bootstrap-collections-infer-'));
    try {
      const systemId = uniqueSystemId('demo-infer');
      fs.mkdirSync(path.join(repoRoot, 'design-systems', systemId, 'input'), { recursive: true });
      fs.writeFileSync(path.join(repoRoot, 'design-systems', systemId, 'input', 'primitives.json'), '{}', 'utf8');
      fs.writeFileSync(path.join(repoRoot, 'design-systems', systemId, 'input', 'theme-semantic.json'), '{}', 'utf8');
      const repository = getSystemRepository(repoRoot);
      await repository.create({
        id: systemId,
        name: 'Demo',
        collections: [],
      });
      await repository.setDefaultSystemId(systemId);

      await ensureCollectionsConfigured({
        repoRoot,
        systemId,
      });

      const system = await repository.getById(systemId);
      const collections = [...(system?.collections ?? [])].sort((a, b) =>
        a.localeCompare(b),
      );
      assert.deepEqual(collections, ['Primitives', 'Theme Semantic']);
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });
});
