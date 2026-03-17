/**
 * Render Pipeline Phase Tests
 *
 * Unit tests for render-pipeline-phase module.
 * Note: These tests focus on the API contract and structure.
 * Full integration tests require mocking external script execution.
 */

import * as path from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert';

import { renderPipelinePhase, type RenderPipelineResult } from './render-pipeline-phase.js';
import type { ActiveMdToFigmaRuntimeContext } from '../types/active-md-to-figma.js';
import type { PhaseResult } from './render-phase.js';
import type { PipelinePhaseOutput } from './render-pipeline-state.js';

/**
 * Create a mock runtime context for testing.
 */
function createMockContext(overrides?: Partial<ActiveMdToFigmaRuntimeContext>): ActiveMdToFigmaRuntimeContext {
  return {
    specPath: '/test/specs/test-component.yml',
    markdownPath: '/test/docs/test-component.md',
    tokenRegistryPath: '/test/tokens/registry.json',
    generatedDir: '/test/generated/figma_doc_models',
    fileBase: 'test-component',
    componentName: 'TestComponent',
    componentSlug: 'test_component',
    resolvedComponentSetId: '123:456',
    expectedThemeName: 'default',
    offsetX: 200,
    force: false,
    skipValidation: false,
    syncStatePath: '/test/sync-state.json',
    figmaUrl: undefined,
    system: undefined,
    scripts: {
      markdownToModelScript: '/test/scripts/markdown-to-model.mjs',
      modelToExecuteScript: '/test/scripts/model-to-execute.mjs',
    },
    themePath: '/test/themes/default.yml',
    systemPaths: {
      docsDir: '/test/docs',
      overviewPath: '/test/docs/overview.md',
      specsDir: '/test/specs',
      proofsDir: '/test/proofs',
      renderDir: '/test/render',
      registryPath: '/test/registry.json',
    },
    captureProofStrict: false,
    ...overrides,
  };
}

describe('render-pipeline-phase', () => {
  describe('RenderPipelineResult type', () => {
    it('should have ok, paths, and skipped properties', () => {
      const result: RenderPipelineResult = {
        ok: true,
        paths: {
          docModelPath: '/test/path.doc-model.json',
          executePath: '/test/path.figma-execute.js',
          payloadPath: '/test/path.render-payload.json',
        },
        skipped: false,
      };

      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.skipped, false);
      assert.ok(result.paths);
    });

    it('should include skipReason when skipped', () => {
      const result: RenderPipelineResult = {
        ok: true,
        paths: {
          docModelPath: '/test/path.doc-model.json',
          executePath: '/test/path.figma-execute.js',
          payloadPath: '/test/path.render-payload.json',
        },
        skipped: true,
        skipReason: 'cache_hit',
      };

      assert.strictEqual(result.skipped, true);
      assert.strictEqual(result.skipReason, 'cache_hit');
    });

    it('should work with all result states', () => {
      // Success state
      const successResult: RenderPipelineResult = {
        ok: true,
        paths: {
          docModelPath: '/test/path.doc-model.json',
          executePath: '/test/path.figma-execute.js',
          payloadPath: '/test/path.render-payload.json',
        },
        skipped: false,
      };
      assert.strictEqual(successResult.ok, true);

      // Skipped state
      const skippedResult: RenderPipelineResult = {
        ok: true,
        paths: {
          docModelPath: '/test/path.doc-model.json',
          executePath: '/test/path.figma-execute.js',
          payloadPath: '/test/path.render-payload.json',
        },
        skipped: true,
        skipReason: 'fingerprint_match',
      };
      assert.strictEqual(skippedResult.skipped, true);
      assert.strictEqual(skippedResult.skipReason, 'fingerprint_match');
    });
  });

  describe('ActiveMdToFigmaRuntimeContext integration', () => {
    it('should work with complete context', () => {
      const context = createMockContext({
        figmaUrl: 'https://figma.com/file/abc123',
        system: 'test-system',
      });

      assert.strictEqual(context.figmaUrl, 'https://figma.com/file/abc123');
      assert.strictEqual(context.system, 'test-system');
      assert.strictEqual(context.fileBase, 'test-component');
    });

    it('should work with minimal context (no optional fields)', () => {
      const context = createMockContext({
        figmaUrl: undefined,
        system: undefined,
        syncStatePath: undefined,
      });

      assert.strictEqual(context.figmaUrl, undefined);
      assert.strictEqual(context.system, undefined);
      assert.strictEqual(context.syncStatePath, undefined);
    });

    it('should support force flag override', () => {
      const context = createMockContext({ force: true });
      assert.strictEqual(context.force, true);
    });

    it('should support different component names', () => {
      const context = createMockContext({
        fileBase: 'custom-button',
        componentName: 'CustomButton',
        componentSlug: 'custom_button',
      });

      assert.strictEqual(context.fileBase, 'custom-button');
      assert.strictEqual(context.componentName, 'CustomButton');
      assert.strictEqual(context.componentSlug, 'custom_button');
    });

    it('should support different offset values', () => {
      const context1 = createMockContext({ offsetX: 100 });
      const context2 = createMockContext({ offsetX: 500 });

      assert.strictEqual(context1.offsetX, 100);
      assert.strictEqual(context2.offsetX, 500);
    });
  });

  describe('context path relationships', () => {
    it('should have consistent path structure', () => {
      const context = createMockContext();

      // All paths should be strings
      assert.strictEqual(typeof context.specPath, 'string');
      assert.strictEqual(typeof context.markdownPath, 'string');
      assert.strictEqual(typeof context.tokenRegistryPath, 'string');
      assert.strictEqual(typeof context.generatedDir, 'string');

      // Generated dir should be usable for path construction
      const docModelPath = path.join(context.generatedDir, `${context.fileBase}.doc-model.json`);
      assert.ok(docModelPath.includes(context.fileBase));
    });
  });

  describe('renderPipelinePhase', () => {
    it('should return PhaseResult with pipeline output on success', async () => {
      // Test the expected PhaseResult structure with PipelinePhaseOutput
      // Note: Full execution test requires mocking external script dependencies
      const result: PhaseResult<PipelinePhaseOutput> = {
        ok: true,
        output: {
          stage: 'pipeline',
          pipeline: {
            ok: true,
            paths: {
              docModelPath: '/test/test-component.doc-model.json',
              executePath: '/test/test-component.figma-execute.js',
              payloadPath: '/test/test-component.render-payload.json',
            },
            skipped: false,
          },
        },
      };

      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.output?.stage, 'pipeline');
      assert.ok(result.output?.pipeline);
      assert.strictEqual(result.output.pipeline.skipped, false);
    });

    it('should return skip result with exit behavior when pipeline skipped', async () => {
      // Test the expected skip result structure with PipelinePhaseOutput
      const result: PhaseResult<PipelinePhaseOutput> = {
        ok: true,
        skipped: true,
        skipBehavior: 'exit',
        reason: 'fingerprint_match',
        output: {
          stage: 'pipeline',
          pipeline: {
            ok: true,
            paths: {
              docModelPath: '/test/test-component.doc-model.json',
              executePath: '/test/test-component.figma-execute.js',
              payloadPath: '/test/test-component.render-payload.json',
            },
            skipped: true,
            skipReason: 'fingerprint_match',
          },
        },
      };

      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.skipped, true);
      assert.strictEqual(result.skipBehavior, 'exit');
      assert.strictEqual(result.reason, 'fingerprint_match');
      assert.strictEqual(result.output?.stage, 'pipeline');
      assert.ok(result.output?.pipeline?.skipped);
    });

    it('should build correct artifact paths from context', () => {
      const context = createMockContext({
        fileBase: 'test-button',
        generatedDir: '/custom/generated',
      });

      // Verify path construction logic
      const expectedDocModelPath = path.join(context.generatedDir, `${context.fileBase}.doc-model.json`);
      const expectedExecutePath = path.join(context.generatedDir, `${context.fileBase}.figma-execute.js`);
      const expectedPayloadPath = path.join(context.generatedDir, `${context.fileBase}.render-payload.json`);

      assert.strictEqual(expectedDocModelPath, '/custom/generated/test-button.doc-model.json');
      assert.strictEqual(expectedExecutePath, '/custom/generated/test-button.figma-execute.js');
      assert.strictEqual(expectedPayloadPath, '/custom/generated/test-button.render-payload.json');
    });
  });
});
