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
  buildFilesMapFromVariables,
  mergeTokenTrees,
  sanitizeCollectionFileStem,
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
      const inputDir = path.join(tempRoot, 'design-systems', 'demo', 'input');
      fs.mkdirSync(inputDir, { recursive: true });
      fs.writeFileSync(path.join(inputDir, 'existing.json'), '{\n  "$description": "existing"\n}\n');

      const result = await syncFigmaTokensToInput({
        repoRoot: tempRoot,
        system: {
          inputDir: 'design-systems/demo/input',
          outputDir: 'design-systems/demo/output',
          docsDir: 'design-systems/demo/docs',
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
            inputDir: 'design-systems/demo/input',
            outputDir: 'design-systems/demo/output',
            docsDir: 'design-systems/demo/docs',
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
            inputDir: 'design-systems/demo/input',
            outputDir: 'design-systems/demo/output',
            docsDir: 'design-systems/demo/docs',
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
            inputDir: 'design-systems/demo/input',
            outputDir: 'design-systems/demo/output',
            docsDir: 'design-systems/demo/docs',
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

    it('normalizes diacritics for collection names and token path segments when writing files', async () => {
      const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'figma-token-sync-diacritics-'));
      const payloadWithDiacritics: FigmaVariablesResponse = {
        meta: {
          variableCollections: {
            'VariableCollectionId:9': {
              id: 'VariableCollectionId:9',
              name: 'Tipografía Base',
              modes: [{ modeId: '9:0', name: 'Modo Único' }],
            },
          },
          variables: {
            'VariableID:9': {
              id: 'VariableID:9',
              name: 'colór/acción/primário',
              variableCollectionId: 'VariableCollectionId:9',
              resolvedType: 'COLOR',
              valuesByMode: {
                '9:0': { r: 1, g: 0, b: 0, a: 1 },
              },
            },
          },
        },
      };

      try {
        const result = await syncFigmaTokensToInput({
          repoRoot: tempRoot,
          system: {
            inputDir: 'design-systems/demo/input',
            outputDir: 'design-systems/demo/output',
            docsDir: 'design-systems/demo/docs',
          },
          fileKey: 'dummy',
          source: 'mcp',
          fetchMcpVariablesFn: async () => payloadWithDiacritics,
        });

        assert.equal(result.reason, undefined);
        const outputPath = path.join(tempRoot, 'design-systems', 'demo', 'input', 'tipografia-base.json');
        assert.equal(fs.existsSync(outputPath), true);

        const written = JSON.parse(fs.readFileSync(outputPath, 'utf8')) as Record<string, unknown>;
        const colorBranch = written.color as Record<string, unknown>;
        assert.ok(colorBranch, 'Expected "color" branch to exist');
        const accionBranch = colorBranch.accion as Record<string, unknown>;
        assert.ok(accionBranch, 'Expected "accion" branch to exist');
        const primaryNode = accionBranch.primario as { $value?: string; $type?: string };
        assert.equal(primaryNode.$type, 'color');
        assert.equal(primaryNode.$value, '#FF0000');
      } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true });
      }
    });

    it('handles NFD decomposed diacritics correctly', async () => {
      const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'figma-token-sync-nfd-'));
      // Create payload with NFD decomposed characters (base + combining mark)
      const payloadWithNFD: FigmaVariablesResponse = {
        meta: {
          variableCollections: {
            'VariableCollectionId:9': {
              id: 'VariableCollectionId:9',
              name: 'Cafe\u0301 Base', // "Café" decomposed: "Cafe" + COMBINING ACUTE ACCENT
              modes: [{ modeId: '9:0', name: 'Modo U\u0301nico' }], // "Único" decomposed: "U" + COMBINING ACUTE ACCENT
            },
          },
          variables: {
            'VariableId:1': {
              id: 'VariableId:1',
              variableCollectionId: 'VariableCollectionId:9',
              name: 'Color/Taman\u0303o/Grande', // "Tamaño" decomposed: "Taman" + COMBINING TILDE
              resolvedType: 'COLOR',
              valuesByMode: { '9:0': { r: 0, g: 1, b: 0, a: 1 } }, // Green color object
            },
          },
        },
      };

      try {
        const result = await syncFigmaTokensToInput({
          repoRoot: tempRoot,
          system: {
            inputDir: 'design-systems/demo/input',
            outputDir: 'design-systems/demo/output',
            docsDir: 'design-systems/demo/docs',
          },
          fileKey: 'dummy',
          source: 'mcp',
          fetchMcpVariablesFn: async () => payloadWithNFD,
        });

        assert.equal(result.reason, undefined);
        const outputPath = path.join(tempRoot, 'design-systems', 'demo', 'input', 'cafe-base.json');
        assert.equal(fs.existsSync(outputPath), true);

        const written = JSON.parse(fs.readFileSync(outputPath, 'utf8')) as Record<string, unknown>;
        const colorBranch = written.Color as Record<string, unknown>;
        assert.ok(colorBranch, 'Expected "Color" branch to exist');
        const tamanoBranch = colorBranch.Tamano as Record<string, unknown>;
        assert.ok(tamanoBranch, 'Expected "Tamano" branch to exist');
        const grandeNode = tamanoBranch.Grande as { $value?: string; $type?: string };
        assert.equal(grandeNode.$type, 'color');
        assert.equal(grandeNode.$value, '#00FF00');
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
            inputDir: 'design-systems/demo/input',
            outputDir: 'design-systems/demo/output',
            docsDir: 'design-systems/demo/docs',
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
            inputDir: 'design-systems/demo/input',
            outputDir: 'design-systems/demo/output',
            docsDir: 'design-systems/demo/docs',
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
            inputDir: 'design-systems/demo/input',
            outputDir: 'design-systems/demo/output',
            docsDir: 'design-systems/demo/docs',
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

  describe('buildFilesMapFromVariables() with VARIABLE_ALIAS', () => {
    it('buildFilesMapFromVariables handles variables with VARIABLE_ALIAS correctly', () => {
      // Create payload with alias references
      const payloadWithAliases: FigmaVariablesResponse = {
        meta: {
          variableCollections: {
            'VariableCollectionId:1': {
              id: 'VariableCollectionId:1',
              name: 'Colors',
              modes: [{ modeId: '1:0', name: 'Light' }],
            },
          },
          variables: {
            // Base color variable
            'VariableID:base': {
              id: 'VariableID:base',
              name: 'color/primary',
              variableCollectionId: 'VariableCollectionId:1',
              resolvedType: 'COLOR',
              valuesByMode: {
                '1:0': { r: 1, g: 0, b: 0, a: 1 },
              },
            },
            // Alias variable that references the base
            'VariableID:alias': {
              id: 'VariableID:alias',
              name: 'color/brand',
              variableCollectionId: 'VariableCollectionId:1',
              resolvedType: 'COLOR',
              valuesByMode: {
                '1:0': {
                  type: 'VARIABLE_ALIAS',
                  id: 'VariableID:base',
                },
              },
            },
          },
        },
      };

      const result = buildFilesMapFromVariables(payloadWithAliases.meta);

      assert.equal(result.tokenCount, 2);
      assert.ok(result.filesMap.has('colors'));

      const colorsData = result.filesMap.get('colors')?.data;
      assert.ok(colorsData);

      // Check that base color exists
      const colorPrimary = (colorsData as Record<string, unknown>).color as Record<string, unknown>;
      assert.ok(colorPrimary);
      const primary = colorPrimary.primary as { $value?: string; $type?: string };
      assert.equal(primary.$type, 'color');
      assert.equal(primary.$value, '#FF0000');

      // Check that alias exists with VARIABLE_ALIAS structure
      const brand = colorPrimary.brand as { $value?: Record<string, unknown>; $type?: string };
      assert.ok(brand);
      assert.equal(brand.$type, 'color');
      assert.ok(brand.$value);
      assert.equal((brand.$value as Record<string, unknown>).type, 'VARIABLE_ALIAS');
      assert.equal((brand.$value as Record<string, unknown>).id, 'VariableID:base');
    });

    it('handles multiple aliases in the same collection', () => {
      const payloadWithMultipleAliases: FigmaVariablesResponse = {
        meta: {
          variableCollections: {
            'VariableCollectionId:1': {
              id: 'VariableCollectionId:1',
              name: 'Spacing',
              modes: [{ modeId: '1:0', name: 'Default' }],
            },
          },
          variables: {
            'VariableID:base1': {
              id: 'VariableID:base1',
              name: 'spacing/small',
              variableCollectionId: 'VariableCollectionId:1',
              resolvedType: 'FLOAT',
              valuesByMode: { '1:0': 8 },
            },
            'VariableID:base2': {
              id: 'VariableID:base2',
              name: 'spacing/medium',
              variableCollectionId: 'VariableCollectionId:1',
              resolvedType: 'FLOAT',
              valuesByMode: { '1:0': 16 },
            },
            'VariableID:alias1': {
              id: 'VariableID:alias1',
              name: 'spacing/gutter',
              variableCollectionId: 'VariableCollectionId:1',
              resolvedType: 'FLOAT',
              valuesByMode: {
                '1:0': { type: 'VARIABLE_ALIAS', id: 'VariableID:base1' },
              },
            },
            'VariableID:alias2': {
              id: 'VariableID:alias2',
              name: 'spacing/gap',
              variableCollectionId: 'VariableCollectionId:1',
              resolvedType: 'FLOAT',
              valuesByMode: {
                '1:0': { type: 'VARIABLE_ALIAS', id: 'VariableID:base2' },
              },
            },
          },
        },
      };

      const result = buildFilesMapFromVariables(payloadWithMultipleAliases.meta);

      assert.equal(result.tokenCount, 4);
      const spacingData = result.filesMap.get('spacing')?.data;
      assert.ok(spacingData);

      // Check aliases exist
      const spacing = spacingData as Record<string, unknown>;
      const gutter = (spacing.spacing as Record<string, unknown>).gutter as { $value?: Record<string, unknown> };
      const gap = (spacing.spacing as Record<string, unknown>).gap as { $value?: Record<string, unknown> };

      assert.equal((gutter.$value as Record<string, unknown>).type, 'VARIABLE_ALIAS');
      assert.equal((gutter.$value as Record<string, unknown>).id, 'VariableID:base1');
      assert.equal((gap.$value as Record<string, unknown>).type, 'VARIABLE_ALIAS');
      assert.equal((gap.$value as Record<string, unknown>).id, 'VariableID:base2');
    });

    it('handles alias pointing to non-existent variable gracefully', () => {
      const payloadWithBrokenAlias: FigmaVariablesResponse = {
        meta: {
          variableCollections: {
            'VariableCollectionId:1': {
              id: 'VariableCollectionId:1',
              name: 'Colors',
              modes: [{ modeId: '1:0', name: 'Light' }],
            },
          },
          variables: {
            'VariableID:alias': {
              id: 'VariableID:alias',
              name: 'color/brand',
              variableCollectionId: 'VariableCollectionId:1',
              resolvedType: 'COLOR',
              valuesByMode: {
                '1:0': {
                  type: 'VARIABLE_ALIAS',
                  id: 'VariableID:nonexistent', // This ID doesn't exist
                },
              },
            },
          },
        },
      };

      const result = buildFilesMapFromVariables(payloadWithBrokenAlias.meta);

      // Should still process the alias, but toPath will be undefined
      // The alias graph extraction will skip this entry
      assert.equal(result.tokenCount, 1);
    });
  });

  describe('sanitizeCollectionFileStem', () => {
    it('normalizes diacritics in collection names', () => {
      // Spanish accents
      assert.equal(sanitizeCollectionFileStem('Tipografía'), 'tipografia');
      assert.equal(sanitizeCollectionFileStem('Acción'), 'accion');
      assert.equal(sanitizeCollectionFileStem('España'), 'espana');

      // French accents
      assert.equal(sanitizeCollectionFileStem('Café'), 'cafe');
      assert.equal(sanitizeCollectionFileStem('Société'), 'societe');

      // German umlauts
      assert.equal(sanitizeCollectionFileStem('für'), 'fur');
      // Note: ß (sharp s) is not a diacritic - it normalizes to empty string after removing combining marks
      assert.equal(sanitizeCollectionFileStem('Größe'), 'gro-e');

      // Multiple diacritics in one word
      assert.equal(sanitizeCollectionFileStem('Niño'), 'nino');

      // Preserves alphanumeric characters
      assert.equal(sanitizeCollectionFileStem('Colors2024'), 'colors2024');
      assert.equal(sanitizeCollectionFileStem('Token-Base'), 'token-base');

      // Handles empty/edge cases
      assert.equal(sanitizeCollectionFileStem(''), 'imported');
      assert.equal(sanitizeCollectionFileStem('   '), 'imported');
    });
  });
});
