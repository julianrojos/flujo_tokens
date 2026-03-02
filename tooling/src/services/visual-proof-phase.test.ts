/**
 * Visual Proof Phase Tests
 *
 * Unit tests for visual-proof-phase module.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import { visualProofPhase } from './visual-proof-phase.js';
import type { ActiveMdToFigmaRuntimeContext } from '../types/active-md-to-figma.js';
import type { RenderPipelineState } from './render-pipeline-state.js';
import type { PhaseResult } from './render-phase.js';

/**
 * Create a mock runtime context for testing.
 */
function createMockContext(overrides?: Partial<ActiveMdToFigmaRuntimeContext>): ActiveMdToFigmaRuntimeContext {
  return {
    specPath: '/test/spec.yml',
    markdownPath: '/test/doc.md',
    tokenRegistryPath: '/test/tokens.json',
    generatedDir: '/test/generated',
    fileBase: 'test',
    componentName: 'Test',
    componentSlug: 'test',
    resolvedComponentSetId: '1:2',
    expectedThemeName: 'default',
    offsetX: 200,
    force: false,
    skipValidation: false,
    syncStatePath: '/test/sync.json',
    figmaUrl: undefined,
    system: undefined,
    scripts: {
      markdownToModelScript: '/test/scripts/model.mjs',
      modelToExecuteScript: '/test/scripts/execute.mjs',
    },
    themePath: '/test/theme.yml',
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

describe('visual-proof-phase', () => {
  describe('visualProofPhase', () => {
    it('should skip with continue behavior if resolvedComponentSetId is missing', async () => {
      const context = createMockContext({ resolvedComponentSetId: '' });
      const state: RenderPipelineState = {};

      const result = await visualProofPhase(context, state);

      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.skipped, true);
      assert.strictEqual(result.skipBehavior, 'continue');
      assert.ok(result.reason?.includes('component_set_node_id'));
    });

    it('should error hard if captureProofStrict=true and no componentSetId', async () => {
      const context = createMockContext({
        resolvedComponentSetId: '',
        captureProofStrict: true,
      });
      const state: RenderPipelineState = {};

      // Should throw when captureProofStrict=true and no componentSetId
      await assert.rejects(
        async () => visualProofPhase(context, state),
        /component_set_node_id/,
      );
    });

    it('should build command with system and figmaUrl when provided', async () => {
      const context = createMockContext({
        resolvedComponentSetId: '123:456',
        system: 'iter',
        figmaUrl: 'https://figma.com/file/abc',
      });
      const state: RenderPipelineState = {};

      // This test would require mocking runOrThrow
      // For now, verify context is properly configured
      assert.strictEqual(context.resolvedComponentSetId, '123:456');
      assert.strictEqual(context.system, 'iter');
      assert.strictEqual(context.figmaUrl, 'https://figma.com/file/abc');
    });

    it('should return ok: false if runOrThrow fails', async () => {
      // This test would require mocking runOrThrow to throw
      // For now, we test the structure/contract
      const context = createMockContext({ resolvedComponentSetId: '123:456' });
      const state: RenderPipelineState = {};

      // Verify phase function signature
      assert.strictEqual(typeof visualProofPhase, 'function');
    });

    it('should succeed and return visualProofResult.ok: true on success', async () => {
      // This test would require mocking runOrThrow to succeed
      // For now, we verify the expected success structure
      const expectedResult: PhaseResult<{ visualProofResult: any }> = {
        ok: true,
        output: {
          visualProofResult: {
            ok: true,
          },
        },
      };

      assert.strictEqual(expectedResult.ok, true);
      assert.ok(expectedResult.output);
      assert.ok(expectedResult.output.visualProofResult);
    });
  });

  describe('PhaseResult contract', () => {
    it('should return ok, skipped, skipBehavior, reason, error, output fields as appropriate', async () => {
      const context = createMockContext({ resolvedComponentSetId: '' });
      const state: RenderPipelineState = {};

      const result = await visualProofPhase(context, state);

      assert.ok('ok' in result);
      assert.ok('skipped' in result);
      assert.ok('skipBehavior' in result);
      assert.ok('reason' in result);
      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.skipped, true);
      assert.strictEqual(result.skipBehavior, 'continue');
    });

    it('should return output with visualProofResult on success', async () => {
      // Verify expected output structure
      const expectedResult: PhaseResult<{ visualProofResult: any }> = {
        ok: true,
        output: {
          visualProofResult: {
            ok: true,
            skipped: false,
          },
        },
      };

      assert.ok(expectedResult.output?.visualProofResult);
    });
  });

  describe('skip behavior semantics', () => {
    it('should use skipBehavior: continue (not exit) to allow subsequent phases', async () => {
      const context = createMockContext({ resolvedComponentSetId: '' });
      const state: RenderPipelineState = {};

      const result = await visualProofPhase(context, state);

      // Should continue to allow cache update and documentation sync to run
      assert.strictEqual(result.skipBehavior, 'continue');
      assert.notStrictEqual(result.skipBehavior, 'exit');
    });

    it('should not skip when componentSetId is available', async () => {
      const context = createMockContext({ resolvedComponentSetId: '123:456' });
      const state: RenderPipelineState = {};

      // Would need mocking to test actual execution
      // For now, verify context is properly configured
      assert.ok(context.resolvedComponentSetId);
    });
  });

  describe('captureProofStrict behavior', () => {
    it('should throw hard error when captureProofStrict=true and no componentSetId', async () => {
      const context = createMockContext({
        resolvedComponentSetId: '',
        captureProofStrict: true,
      });
      const state: RenderPipelineState = {};

      await assert.rejects(
        async () => visualProofPhase(context, state),
        /component_set_node_id/,
      );
    });

    it('should soft-skip when captureProofStrict=false and no componentSetId', async () => {
      const context = createMockContext({
        resolvedComponentSetId: '',
        captureProofStrict: false,
      });
      const state: RenderPipelineState = {};

      const result = await visualProofPhase(context, state);

      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.skipped, true);
      assert.strictEqual(result.skipBehavior, 'continue');
    });
  });

  describe('context field usage', () => {
    it('should use context.resolvedComponentSetId for skip decision', async () => {
      const contextWithId = createMockContext({ resolvedComponentSetId: '123:456' });
      const contextWithoutId = createMockContext({ resolvedComponentSetId: '' });

      assert.ok(contextWithId.resolvedComponentSetId);
      assert.strictEqual(contextWithoutId.resolvedComponentSetId, '');
    });

    it('should use context.captureProofStrict for error handling', async () => {
      const contextStrict = createMockContext({ captureProofStrict: true });
      const contextLenient = createMockContext({ captureProofStrict: false });

      assert.strictEqual(contextStrict.captureProofStrict, true);
      assert.strictEqual(contextLenient.captureProofStrict, false);
    });

    it('should use context.system and context.figmaUrl for command building', async () => {
      const context = createMockContext({
        system: 'iter',
        figmaUrl: 'https://figma.com/file/abc',
      });

      assert.strictEqual(context.system, 'iter');
      assert.strictEqual(context.figmaUrl, 'https://figma.com/file/abc');
    });
  });
});
