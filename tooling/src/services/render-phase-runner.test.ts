/**
 * Render Phase Runner Tests
 *
 * Unit tests for runRenderPhases orchestrator.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import { runRenderPhases, phaseSuccess, phaseSkip, phaseFailure } from './render-phase-runner.js';
import type { ActiveMdToFigmaRuntimeContext } from '../types/active-md-to-figma.js';
import type { RenderPipelineState } from './render-pipeline-state.js';

/**
 * Create a mock runtime context for testing.
 */
function createMockContext(): ActiveMdToFigmaRuntimeContext {
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
  };
}

describe('render-phase-runner', () => {
  describe('runRenderPhases', () => {
    it('should execute phases in sequence and merge outputs', async () => {
      const context = createMockContext();
      const phases = [
        async (_ctx: ActiveMdToFigmaRuntimeContext, _state: RenderPipelineState) =>
          phaseSuccess({ pipeline: { ok: true, paths: { docModelPath: '/a', executePath: '/b', payloadPath: '/c' }, skipped: false } }),
        async (_ctx: ActiveMdToFigmaRuntimeContext, _state: RenderPipelineState) =>
          phaseSuccess({ renderReport: { ok: true } as any }),
        async (_ctx: ActiveMdToFigmaRuntimeContext, _state: RenderPipelineState) =>
          phaseSuccess({ auditResult: { ok: true } as any }),
      ];

      const state = await runRenderPhases(context, phases);

      assert.ok(state.pipeline);
      assert.ok(state.renderReport);
      assert.ok(state.auditResult);
    });

    it('should throw error when phase returns ok: false', async () => {
      const context = createMockContext();
      const phases = [
        async (_ctx: ActiveMdToFigmaRuntimeContext, _state: RenderPipelineState) =>
          phaseSuccess({ pipeline: { ok: true, paths: { docModelPath: '/a', executePath: '/b', payloadPath: '/c' }, skipped: false } }),
        async (_ctx: ActiveMdToFigmaRuntimeContext, _state: RenderPipelineState) =>
          phaseFailure('Test error'),
      ];

      await assert.rejects(
        async () => runRenderPhases(context, phases),
        /Test error/,
      );
    });

    it('should stop execution when skipBehavior is exit', async () => {
      const context = createMockContext();
      const phases = [
        async (_ctx: ActiveMdToFigmaRuntimeContext, _state: RenderPipelineState) =>
          phaseSuccess({ pipeline: { ok: true, paths: { docModelPath: '/a', executePath: '/b', payloadPath: '/c' }, skipped: false } }),
        async (_ctx: ActiveMdToFigmaRuntimeContext, _state: RenderPipelineState) =>
          phaseSkip('Cache hit', 'exit'),
        async (_ctx: ActiveMdToFigmaRuntimeContext, _state: RenderPipelineState) =>
          phaseSuccess({ renderReport: { ok: true } as any }),
      ];

      const state = await runRenderPhases(context, phases);

      // Should have pipeline from first phase
      assert.ok(state.pipeline);
      // Should NOT have renderReport from third phase (not executed)
      assert.strictEqual(state.renderReport, undefined);
    });

    it('should continue execution when skipBehavior is continue', async () => {
      const context = createMockContext();
      const phases = [
        async (_ctx: ActiveMdToFigmaRuntimeContext, _state: RenderPipelineState) =>
          phaseSuccess({ pipeline: { ok: true, paths: { docModelPath: '/a', executePath: '/b', payloadPath: '/c' }, skipped: false } }),
        async (_ctx: ActiveMdToFigmaRuntimeContext, _state: RenderPipelineState) =>
          phaseSkip('Optional feature unavailable', 'continue'),
        async (_ctx: ActiveMdToFigmaRuntimeContext, _state: RenderPipelineState) =>
          phaseSuccess({ renderReport: { ok: true } as any }),
      ];

      const state = await runRenderPhases(context, phases);

      // Should have pipeline from first phase
      assert.ok(state.pipeline);
      // Should have renderReport from third phase (executed despite skip)
      assert.ok(state.renderReport);
    });

    it('should merge outputs from multiple phases', async () => {
      const context = createMockContext();
      const phases = [
        async (_ctx: ActiveMdToFigmaRuntimeContext, _state: RenderPipelineState) =>
          phaseSuccess({ pipeline: { ok: true, paths: { docModelPath: '/a', executePath: '/b', payloadPath: '/c' }, skipped: false } }),
        async (_ctx: ActiveMdToFigmaRuntimeContext, _state: RenderPipelineState) =>
          phaseSuccess({ renderExpectations: { expectedCardCount: 5 } as any }),
        async (_ctx: ActiveMdToFigmaRuntimeContext, _state: RenderPipelineState) =>
          phaseSuccess({ renderReport: { ok: true, targetSectionId: '123' } as any }),
      ];

      const state = await runRenderPhases(context, phases);

      assert.ok(state.pipeline);
      assert.ok(state.renderExpectations);
      assert.ok(state.renderReport);
      assert.strictEqual(state.renderExpectations?.expectedCardCount, 5);
    });

    it('should handle empty phases array', async () => {
      const context = createMockContext();
      const state = await runRenderPhases(context, []);

      assert.deepStrictEqual(state, {});
    });

    it('should accumulate state across phases', async () => {
      const context = createMockContext();
      const phases = [
        async (_ctx: ActiveMdToFigmaRuntimeContext, state: RenderPipelineState) =>
          phaseSuccess({ pipeline: { ok: true, paths: { docModelPath: '/a', executePath: '/b', payloadPath: '/c' }, skipped: false } }),
        async (_ctx: ActiveMdToFigmaRuntimeContext, state: RenderPipelineState) => {
          // Second phase can read state from first
          assert.ok(state.pipeline);
          return phaseSuccess({ renderReport: { ok: true } as any });
        },
        async (_ctx: ActiveMdToFigmaRuntimeContext, state: RenderPipelineState) => {
          // Third phase can read state from first and second
          assert.ok(state.pipeline);
          assert.ok(state.renderReport);
          return phaseSuccess({ auditResult: { ok: true } as any });
        },
      ];

      const state = await runRenderPhases(context, phases);

      assert.ok(state.pipeline);
      assert.ok(state.renderReport);
      assert.ok(state.auditResult);
    });
  });

  describe('phaseSuccess', () => {
    it('should create success result with output', () => {
      const result = phaseSuccess({ pipeline: { ok: true, paths: { docModelPath: '/a', executePath: '/b', payloadPath: '/c' }, skipped: false } });

      assert.strictEqual(result.ok, true);
      assert.ok(result.output);
      assert.strictEqual(result.skipped, undefined);
    });

    it('should create success result without output', () => {
      const result = phaseSuccess();

      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.output, undefined);
    });
  });

  describe('phaseSkip', () => {
    it('should create skip result with exit behavior', () => {
      const result = phaseSkip('Cache hit', 'exit');

      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.skipped, true);
      assert.strictEqual(result.skipBehavior, 'exit');
      assert.strictEqual(result.reason, 'Cache hit');
    });

    it('should create skip result with continue behavior', () => {
      const result = phaseSkip('Optional unavailable', 'continue');

      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.skipped, true);
      assert.strictEqual(result.skipBehavior, 'continue');
      assert.strictEqual(result.reason, 'Optional unavailable');
    });

    it('should default to continue behavior', () => {
      const result = phaseSkip('Some reason');

      assert.strictEqual(result.skipBehavior, 'continue');
    });

    it('should include output if provided', () => {
      const output = { visualProofResult: { ok: true } as any };
      const result = phaseSkip('No component ID', 'continue', output);

      assert.strictEqual(result.output, output);
    });
  });

  describe('phaseFailure', () => {
    it('should create failure result with error', () => {
      const result = phaseFailure('Something went wrong');

      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.error, 'Something went wrong');
      assert.strictEqual(result.skipped, undefined);
      assert.strictEqual(result.output, undefined);
    });
  });
});
