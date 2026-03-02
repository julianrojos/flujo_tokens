/**
 * Render Phase Runner Tests
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import { runRenderPhases, phaseFailure, phaseSkip, phaseSuccess } from './render-phase-runner.js';
import type { RenderPhase } from './render-phase.js';
import type {
  RenderPipelineState,
  PipelineRenderState,
  AgentRenderState,
  AuditRenderState,
} from './render-pipeline-state.js';
import type { ActiveMdToFigmaRuntimeContext } from '../types/active-md-to-figma.js';

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

function createPipelineState(): PipelineRenderState {
  return {
    stage: 'pipeline',
    pipeline: {
      ok: true,
      paths: {
        docModelPath: '/a',
        executePath: '/b',
        payloadPath: '/c',
      },
      skipped: false,
    },
  };
}

function createAgentState(): AgentRenderState {
  return {
    stage: 'agent',
    pipeline: createPipelineState().pipeline,
    renderExpectations: {
      expectedCardCount: 3,
      expectedTableCount: 1,
      expectedSectionName: 'Doc/Test',
    },
    renderReport: {
      ok: true,
      targetSectionId: '123',
      targetSectionName: 'Doc/Test',
      themeName: 'default',
      offsetXApplied: 200,
      unsupportedBlocks: [],
      unsupportedBlocksCount: 0,
      componentSetId: '1:2',
      componentSectionId: '9:9',
      renderedCount: { table: 1, card: 3, section: 1 },
    },
  };
}

function createAuditState(): AuditRenderState {
  return {
    stage: 'audit',
    ...createAgentState(),
    auditResult: {
      ok: true,
      auditReport: {
        ok: true,
        pass: true,
        targetSectionId: '123',
        targetSectionName: 'Doc/Test',
        hasDocCanvas: true,
        cardCount: 3,
        tableContainerCount: 1,
        headerRowCount: 1,
        bodyRowCount: 2,
        reasons: [],
      },
      outputPath: '/tmp/audit.txt',
      rawOutput: '{}',
    },
  };
}

describe('render-phase-runner', () => {
  describe('runRenderPhases', () => {
    it('executes phases in sequence and carries staged state forward', async () => {
      const phases: RenderPhase[] = [
        {
          name: 'pipeline',
          execute: async () => phaseSuccess(createPipelineState()),
        },
        {
          name: 'agent',
          execute: async (_ctx, state) => {
            assert.strictEqual(state.stage, 'pipeline');
            return phaseSuccess(createAgentState());
          },
        },
        {
          name: 'audit',
          execute: async (_ctx, state) => {
            assert.strictEqual(state.stage, 'agent');
            return phaseSuccess(createAuditState());
          },
        },
      ];

      const state = await runRenderPhases(createMockContext(), phases);
      assert.strictEqual(state.stage, 'audit');
      assert.ok(state.auditResult.ok);
    });

    it('throws a phase-named error when a phase returns ok=false', async () => {
      const phases: RenderPhase[] = [
        { name: 'pipeline', execute: async () => phaseSuccess(createPipelineState()) },
        { name: 'audit', execute: async () => phaseFailure('Test error') },
      ];

      await assert.rejects(
        async () => runRenderPhases(createMockContext(), phases),
        /\[audit\] Test error/,
      );
    });

    it('stops execution when skipBehavior is exit', async () => {
      const phases: RenderPhase[] = [
        { name: 'pipeline', execute: async () => phaseSuccess(createPipelineState()) },
        { name: 'cache', execute: async () => phaseSkip('Cache hit', 'exit') },
        {
          name: 'agent',
          execute: async () => {
            assert.fail('agent phase should not execute after exit skip');
          },
        },
      ];

      const state = await runRenderPhases(createMockContext(), phases);
      assert.strictEqual(state.stage, 'pipeline');
    });

    it('continues execution when skipBehavior is continue', async () => {
      const phases: RenderPhase[] = [
        { name: 'pipeline', execute: async () => phaseSuccess(createPipelineState()) },
        { name: 'proof', execute: async () => phaseSkip('Optional unavailable', 'continue') },
        { name: 'agent', execute: async () => phaseSuccess(createAgentState()) },
      ];

      const state = await runRenderPhases(createMockContext(), phases);
      assert.strictEqual(state.stage, 'agent');
      assert.ok(state.renderReport.ok);
    });

    it('returns initial state when phases array is empty', async () => {
      const state = await runRenderPhases(createMockContext(), []);
      assert.deepStrictEqual(state, { stage: 'initial' });
    });
  });
});
