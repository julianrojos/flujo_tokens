/**
 * Figma Token Sync Tests
 *
 * Tests for token sync utilities.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildTokenNodeFromFigmaVariable,
  mergeTokenTrees,
  syncFigmaTokensToInput,
} from './figma-token-sync.js';
import type { FigmaVariablesResponse } from '../utils/figma.js';

function createVariablesPayload(): FigmaVariablesResponse {
  return {
    meta: {
      variableCollections: {
        'VariableCollectionId:1': {
          id: 'VariableCollectionId:1',
          name: 'Primitives',
          modes: [{ modeId: '1:0', name: 'Mode 1' }],
        },
      },
      variables: {
        'VariableID:1': {
          id: 'VariableID:1',
          name: 'color/brand/primary',
          variableCollectionId: 'VariableCollectionId:1',
          resolvedType: 'COLOR',
          valuesByMode: {
            '1:0': { r: 0.1, g: 0.2, b: 0.3, a: 1 },
          },
        },
      },
    },
  };
}

describe('figma-token-sync', () => {
  describe('buildTokenNodeFromFigmaVariable()', () => {
    it('FLOAT variables are emitted as dimension tokens', () => {
      const variableRecord = { id: 'VariableID:1:2', resolvedType: 'FLOAT' };
      const token = buildTokenNodeFromFigmaVariable(variableRecord, 8);

      assert.deepStrictEqual(token, {
        $id: 'VariableID:1:2',
        $value: 8,
        $type: 'dimension',
      });
    });
  });

  describe('mergeTokenTrees()', () => {
    it('replaces on token/group shape collision', () => {
      const existing = {
        color: {
          brand: {
            $value: '#ffffff',
            $type: 'color',
          },
        },
      };
      const incoming = {
        color: {
          brand: {
            100: { $value: '#f5f5f5', $type: 'color' },
          },
        },
      };

      const merged = mergeTokenTrees(existing, incoming);
      assert.deepStrictEqual(merged, incoming);
    });

    it('deep-merges regular object branches', () => {
      const existing = {
        color: {
          brand: {
            100: { $value: '#f5f5f5', $type: 'color' },
          },
        },
      };
      const incoming = {
        color: {
          brand: {
            200: { $value: '#e0e0e0', $type: 'color' },
          },
        },
      };

      const merged = mergeTokenTrees(existing, incoming);
      assert.deepStrictEqual(merged, {
        color: {
          brand: {
            100: { $value: '#f5f5f5', $type: 'color' },
            200: { $value: '#e0e0e0', $type: 'color' },
          },
        },
      });
    });
  });

  describe('syncFigmaTokensToInput()', () => {
    it('skips when input JSON exists and force=false', async () => {
      const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'figma-token-sync-'));
      const inputDir = path.join(tempRoot, 'input', 'demo');
      fs.mkdirSync(inputDir, { recursive: true });
      fs.writeFileSync(path.join(inputDir, 'existing.json'), '{\n  "$description": "existing"\n}\n');

      const result = await syncFigmaTokensToInput({
        repoRoot: tempRoot,
        system: {
          inputDir: 'input/demo',
          outputDir: 'output/demo',
          docsDir: 'docs/demo',
        },
        fileKey: 'dummy',
        figmaToken: 'dummy',
        force: false,
        merge: false,
        dryRun: false,
      });

      assert.deepStrictEqual(result, {
        attempted: false,
        reason: 'input-json-exists',
        hint: 'Use --force true to re-sync.',
      });
    });

    it('supports source=mcp without requiring a REST token', async () => {
      const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'figma-token-sync-mcp-'));
      const mcpPayload = createVariablesPayload();
      let mcpCalls = 0;
      let restCalls = 0;

      try {
        const result = await syncFigmaTokensToInput({
          repoRoot: tempRoot,
          system: {
            inputDir: 'input/demo',
            outputDir: 'output/demo',
            docsDir: 'docs/demo',
          },
          fileKey: 'dummy',
          source: 'mcp',
          force: false,
          merge: false,
          dryRun: false,
          fetchMcpVariablesFn: async () => {
            mcpCalls += 1;
            return mcpPayload;
          },
          fetchRestVariablesFn: async () => {
            restCalls += 1;
            return mcpPayload;
          },
        });

        assert.equal(result.reason, undefined);
        assert.equal(result.files_written, 1);
        assert.equal(result.tokens_written, 1);
        assert.equal(result.source_used, 'mcp');
        assert.deepEqual(result.source_attempts, ['mcp']);
        assert.equal(mcpCalls, 1);
        assert.equal(restCalls, 0);
      } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true });
      }
    });

    it('falls back to REST in source=auto when MCP fails and token is available', async () => {
      const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'figma-token-sync-auto-'));
      const restPayload = createVariablesPayload();
      let mcpCalls = 0;
      let restCalls = 0;

      try {
        const result = await syncFigmaTokensToInput({
          repoRoot: tempRoot,
          system: {
            inputDir: 'input/demo',
            outputDir: 'output/demo',
            docsDir: 'docs/demo',
          },
          fileKey: 'dummy',
          figmaToken: 'secret',
          source: 'auto',
          force: false,
          merge: false,
          dryRun: false,
          fetchMcpVariablesFn: async () => {
            mcpCalls += 1;
            throw new Error('mcp unavailable');
          },
          fetchRestVariablesFn: async () => {
            restCalls += 1;
            return restPayload;
          },
        });

        assert.equal(result.reason, undefined);
        assert.equal(result.files_written, 1);
        assert.equal(result.source_used, 'rest');
        assert.deepEqual(result.source_attempts, ['mcp', 'rest']);
        assert.equal(mcpCalls, 1);
        assert.equal(restCalls, 1);
      } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true });
      }
    });

    it('keeps MCP in source=auto when MCP succeeds', async () => {
      const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'figma-token-sync-auto-rest-fail-'));
      const mcpPayload = createVariablesPayload();
      let mcpCalls = 0;
      let restCalls = 0;

      try {
        const result = await syncFigmaTokensToInput({
          repoRoot: tempRoot,
          system: {
            inputDir: 'input/demo',
            outputDir: 'output/demo',
            docsDir: 'docs/demo',
          },
          fileKey: 'dummy',
          figmaToken: 'secret',
          source: 'auto',
          force: false,
          merge: false,
          dryRun: false,
          fetchMcpVariablesFn: async () => {
            mcpCalls += 1;
            return mcpPayload;
          },
          fetchRestVariablesFn: async () => {
            restCalls += 1;
            throw new Error('rest unavailable');
          },
        });

        assert.equal(result.reason, undefined);
        assert.equal(result.files_written, 1);
        assert.equal(result.source_used, 'mcp');
        assert.deepEqual(result.source_attempts, ['mcp']);
        assert.equal(mcpCalls, 1);
        assert.equal(restCalls, 0);
      } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true });
      }
    });

    it('supports source=rest without invoking MCP', async () => {
      const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'figma-token-sync-rest-'));
      const restPayload = createVariablesPayload();
      let mcpCalls = 0;
      let restCalls = 0;

      try {
        const result = await syncFigmaTokensToInput({
          repoRoot: tempRoot,
          system: {
            inputDir: 'input/demo',
            outputDir: 'output/demo',
            docsDir: 'docs/demo',
          },
          fileKey: 'dummy',
          figmaToken: 'secret',
          source: 'rest',
          force: false,
          merge: false,
          dryRun: false,
          fetchMcpVariablesFn: async () => {
            mcpCalls += 1;
            return restPayload;
          },
          fetchRestVariablesFn: async () => {
            restCalls += 1;
            return restPayload;
          },
        });

        assert.equal(result.reason, undefined);
        assert.equal(result.files_written, 1);
        assert.equal(result.source_used, 'rest');
        assert.deepEqual(result.source_attempts, ['rest']);
        assert.equal(mcpCalls, 0, 'MCP should not be invoked when source=rest');
        assert.equal(restCalls, 1);
      } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true });
      }
    });

    it('returns typed failure when source=auto with both MCP and REST failing', async () => {
      const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'figma-token-sync-both-fail-'));

      try {
        const result = await syncFigmaTokensToInput({
          repoRoot: tempRoot,
          system: {
            inputDir: 'input/demo',
            outputDir: 'output/demo',
            docsDir: 'docs/demo',
          },
          fileKey: 'dummy',
          figmaToken: 'secret',
          source: 'auto',
          force: false,
          merge: false,
          dryRun: false,
          fetchMcpVariablesFn: async () => {
            throw new Error('mcp unavailable');
          },
          fetchRestVariablesFn: async () => {
            throw new Error('rest unavailable');
          },
        });

        assert.equal(result.attempted, true);
        assert.equal(result.reason, 'fetch-failed');
        assert.ok(result.error?.includes('MCP fetch failed'));
        assert.ok(result.error?.includes('REST fetch failed'));
        // Note: source_used is undefined when both fail
        assert.equal(result.source_used, undefined);
        assert.deepEqual(result.source_attempts, ['mcp', 'rest']);
      } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true });
      }
    });

    it('returns typed failure for invalid source value', async () => {
      const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'figma-token-sync-invalid-'));

      try {
        const result = await syncFigmaTokensToInput({
          repoRoot: tempRoot,
          system: {
            inputDir: 'input/demo',
            outputDir: 'output/demo',
            docsDir: 'docs/demo',
          },
          fileKey: 'dummy',
          source: 'invalid-source' as any,
        });

        assert.equal(result.attempted, false);
        assert.equal(result.reason, 'invalid-source');
        assert.ok(result.error?.includes('Invalid variable source'));
      } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true });
      }
    });
  });
});
