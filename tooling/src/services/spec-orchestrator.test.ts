/**
 * Spec Orchestrator Tests
 *
 * Tests for runSpecFromFigma function.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { runSpecFromFigma } from './spec-orchestrator.js';
import type { MaterializeSpecOptions } from './spec-write-adapter.js';

describe('spec-orchestrator', () => {
  describe('runSpecFromFigma()', () => {
    it('returns stable result with injected dependencies', async () => {
      let capturedMaterializeOptions: MaterializeSpecOptions | null = null;
      const result = await runSpecFromFigma(
        {
          url: 'https://www.figma.com/design/FILE123/Components?node-id=123-456',
          'component-name': 'Alert',
          output: '/tmp/alert.yml',
          template: '/tmp/_template.yml',
          registry: '/tmp/registry.json',
          'spec-root': '/tmp/specs',
          agent: 'auto',
          force: 'true',
        },
        {
          createPipelineContextFn: () => ({
            repoRoot: '/tmp',
            figmaUrl: 'https://www.figma.com/design/FILE123/Components?node-id=123-456',
            figmaToken: 'mock-token',
            system: {
              id: 'system',
              name: 'Test System',
              docsDir: '/tmp/docs',
              paths: {
                input: '/tmp/input',
                output: '/tmp/output',
                docs: '/tmp/docs',
                generated: '/tmp/docs/_generated',
                specs: '/tmp/specs',
                registry: '/tmp/docs/_generated/component-registry.json',
                tokenRegistry: '/tmp/docs/_generated/token-registry.json',
              },
            },
            paths: {
              docsRootOverride: null,
              docsRootDir: '/tmp/docs',
              componentDocsDir: '/tmp/docs/components',
              proofDir: '/tmp/docs/_generated/visual-proofs',
              proofImageDir: '/tmp/docs/_generated/visual-proofs/images',
              resolvedSpecRoot: '/tmp/specs',
              templatePath: '/tmp/_template.yml',
              tokenRegistryPath: '/tmp/docs/_generated/token-registry.json',
              overviewPath: '/tmp/docs/overview.md',
              registryIndexPath: '/tmp/docs/_generated/component-registry.json',
            },
            flags: {
              componentSlugOverride: '',
              componentKind: 'component_set',
              includeVariants: true,
              requireExistingDoc: true,
              continueOnError: true,
              refreshIndices: true,
              dryRun: true,
              injectDocSpecs: true,
              includeSpecExhibits: true,
              variantLimit: 6,
              scale: 2,
              format: 'png',
              agent: 'auto',
              mainCaptureMode: 'rest',
              force: true,
              skipValidation: false,
              allowNonEvidenceUpdates: false,
            },
            argsRaw: {},
          }),
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
          materializeSpecFn: (options: MaterializeSpecOptions) => {
            capturedMaterializeOptions = options;
            return {
              normalizedSpec: { name: 'Alert', properties: [] },
              prefilledCount: 0,
            };
          },
          assertEvidenceGatedScalarChangesFn: () => {},
          writeSpecWithSnapshotGuardFn: ({ normalizedSpec, applyWriteFn }: any) => {
            if (applyWriteFn) applyWriteFn({ outputPath: '/tmp/_out.yml', normalizedSpec });
          },
          runSpecGenerationPromptFn: async () => ({
            message: 'Here is your spec',
          }),
          runSpecRepairPromptFn: async () => ({
            message: 'Here is your repaired spec',
          }),
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
          }),
          syncDocumentationIndicesFn: () => ({
            changed: false,
            written: [],
            registry: {
              registryPath: '/tmp/docs/_generated/component-registry.json',
              fingerprint: 'abc',
            },
            overview: {
              overviewPath: '/tmp/docs/overview.md',
            },
          }),
        }
      );

      assert.equal(result.ok, true);
      assert.equal(result.componentName, 'Alert');
      assert.equal(result.componentSetNodeId, '123:456');
      assert.ok(Array.isArray(capturedMaterializeOptions?.evidenceBackedPrefixes));
      assert.equal(
        capturedMaterializeOptions.evidenceBackedPrefixes.includes('variants'),
        true,
      );
      assert.equal(
        capturedMaterializeOptions.evidenceBackedPrefixes.includes('layout'),
        true,
      );
    });
  });
});
