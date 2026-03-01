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
  });
});
