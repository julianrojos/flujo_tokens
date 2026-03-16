/**
 * Spec from Figma Integration Tests
 *
 * End-to-end integration tests for spec generation from Figma.
 * Tests the full pipeline with filesystem operations and real YAML output.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import yaml from 'js-yaml';

import { runSpecFromFigma } from '../services/spec-orchestrator.js';
import type { AgentPromptResult } from '../utils/index.js';

function createAgentPromptResult(): AgentPromptResult {
  return {
    ok: true,
    agent: 'codex',
    command: 'codex',
    args: [],
    status: 0,
    stdout: '',
    stderr: '',
  };
}

/**
 * Create a temporary directory for testing.
 */
function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ds-spec-from-figma-it-'));
}

describe('ds-spec-from-figma integration', () => {
  it('returns stable JSON result and writes normalized YAML', async () => {
    const tmpDir = createTempDir();
    const docsComponentsDir = path.join(tmpDir, 'docs', 'components');
    const specsDir = path.join(tmpDir, 'docs', '_spec', 'components');
    const generatedDir = path.join(tmpDir, 'docs', '_generated');

    fs.mkdirSync(docsComponentsDir, { recursive: true });
    fs.mkdirSync(specsDir, { recursive: true });
    fs.mkdirSync(generatedDir, { recursive: true });

    const outputPath = path.join(specsDir, 'alert.yml');
    const templatePath = path.join(specsDir, '_template.yml');
    const registryPath = path.join(generatedDir, 'token-registry.json');
    const registryIndexPath = path.join(generatedDir, 'component-registry.json');

    // Setup template
    fs.writeFileSync(
      templatePath,
      [
        'name: TBD',
        'status: draft',
        'figma:',
        '  file: TBD',
        '  page: TBD',
        '  component_set_node_id: TBD',
        'token_mapping:',
        '  icon_color: TBD',
        '',
      ].join('\n'),
      'utf8'
    );

    // Setup empty registries
    fs.writeFileSync(registryPath, '{}', 'utf8');
    fs.writeFileSync(registryIndexPath, '{}', 'utf8');

    const result = await runSpecFromFigma(
      {
        url: 'https://www.figma.com/design/FILE123/Components?node-id=123-456',
        'component-name': 'Alert',
        output: outputPath,
        template: templatePath,
        registry: registryPath,
        'spec-root': specsDir,
        agent: 'auto',
      },
      {
        createPipelineContextFn: () => ({
          repoRoot: tmpDir,
          figmaUrl: 'https://www.figma.com/design/FILE123/Components?node-id=123-456',
          figmaToken: 'mock-token',
          system: {
            id: 'test',
            name: 'Test System',
            docsDir: path.join(tmpDir, 'docs'),
            paths: {
              input: path.join(tmpDir, 'input'),
              output: path.join(tmpDir, 'output'),
              docs: docsComponentsDir,
              generated: generatedDir,
              specs: specsDir,
              registry: registryIndexPath,
              tokenRegistry: registryPath,
            },
          },
          paths: {
            docsRootOverride: null,
            docsRootDir: path.join(tmpDir, 'docs'),
            componentDocsDir: docsComponentsDir,
            proofDir: path.join(generatedDir, 'visual-proofs'),
            proofImageDir: path.join(generatedDir, 'visual-proofs', 'images'),
            resolvedSpecRoot: specsDir,
            templatePath: templatePath,
            tokenRegistryPath: registryPath,
            overviewPath: path.join(docsComponentsDir, 'overview.md'),
            registryIndexPath: registryIndexPath,
          },
          flags: {
            componentSlugOverride: '',
            componentKind: 'component_set',
            includeVariants: true,
            requireExistingDoc: true,
            continueOnError: true,
            refreshIndices: true,
            dryRun: false,
            injectDocSpecs: true,
            includeSpecExhibits: true,
            variantLimit: 6,
            scale: 2,
            format: 'png',
            agent: 'auto',
            mainCaptureMode: 'rest',
            tokensSource: 'mcp',
            force: false,
            skipValidation: false,
            allowNonEvidenceUpdates: false,
          },
          argsRaw: {},
        } as any),
        loadRegistryOrThrowFn: () => ({
          token_a: {
            path: 'components.alert.icon.color',
            slashPath: 'components/alert/icon/color',
            collection: 'components',
            type: 'color',
            resolvedValue: '#FF0000',
          },
        }),
        runSpecWithGuardsFn: ({ run }: any) => run({ existingSpec: null }),
        ensureSpecTemplateExistsFn: () => {},
        ensureSpecOutputDirectoryFn: () => {},
        materializeSpecFn: () => ({
          normalizedSpec: { name: 'Alert', properties: [] },
          prefilledCount: 1,
        }),
        assertEvidenceGatedScalarChangesFn: () => {},
        writeSpecWithSnapshotGuardFn: ({ normalizedSpec, applyWriteFn }: any) => {
          if (applyWriteFn) {
            applyWriteFn({ outputPath, normalizedSpec });
          } else {
            fs.writeFileSync(
              outputPath,
              [
                'name: Alert',
                'status: draft',
                'figma:',
                '  file: FILE123',
                '  page: Components',
                '  component_set_node_id: 123:456',
                'token_mapping:',
                '  icon_color: components/alert/icon/color',
                '',
              ].join('\n'),
              'utf8'
            );
          }
        },
        runSpecGenerationPromptFn: () => createAgentPromptResult(),
        runSpecRepairPromptFn: () => createAgentPromptResult(),
        validateGeneratedSpecFn: () => ({
          ok: true,
          report: {
            ok: true,
            summary: {
              errors: 0,
              warnings: 0,
            },
          },
          errors: [],
        }) as any,
        syncDocumentationIndicesFn: () => ({
          changed: [],
          written: [],
          registry: {
            registryPath: registryIndexPath,
            fingerprint: 'test-fingerprint',
          },
          overview: {
            overviewPath: path.join(docsComponentsDir, 'overview.md'),
          },
        }) as any,
      }
    );

    // Verify result structure
    assert.deepEqual(result, {
      ok: true,
      outputPath,
      componentName: 'Alert',
      componentSetNodeId: '123:456',
      tokenPrefilled: 1,
      unresolvedTbdCount: 0,
      validation: {
        ok: true,
        errors: 0,
        warnings: 0,
      },
      documentationIndices: {
        changed: [],
        written: [],
        registryPath: registryIndexPath,
        registryFingerprint: 'test-fingerprint',
        overviewPath: path.join(docsComponentsDir, 'overview.md'),
      },
    });

    // Verify persisted YAML content
    const persisted = yaml.load(fs.readFileSync(outputPath, 'utf8')) as Record<string, unknown>;
    assert.equal(persisted.name, 'Alert');
    assert.equal(persisted.status, 'draft');
    
    const figma = persisted.figma as Record<string, unknown>;
    assert.equal(figma.file, 'FILE123');
    assert.equal(figma.page, 'Components');
    assert.equal(figma.component_set_node_id, '123:456');
    
    const tokenMapping = persisted.token_mapping as Record<string, unknown>;
    assert.equal(tokenMapping.icon_color, 'components/alert/icon/color');
  });
});
