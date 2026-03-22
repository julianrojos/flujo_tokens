/**
 * Render Audit Phase Tests
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import { createRenderAuditPhase, renderAuditPhase } from './render-audit-phase.js';
import type { ActiveMdToFigmaRuntimeContext } from '../types/active-md-to-figma.js';
import type { AgentRenderState } from './render-pipeline-state.js';

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

function createAgentState(): AgentRenderState {
  return {
    stage: 'agent',
    pipeline: {
      ok: true,
      paths: {
        docModelPath: '/test/generated/test.doc-model.json',
        executePath: '/test/generated/test.figma-execute.js',
        payloadPath: '/test/generated/test.render-payload.json',
      },
      skipped: false,
    },
    renderExpectations: {
      expectedCardCount: 3,
      expectedTableCount: 1,
      expectedSectionName: 'Doc/Test',
    },
    renderReport: {
      ok: true,
      targetSectionId: '123:456',
      targetSectionName: 'Doc/Test',
      themeName: 'default',
      offsetXApplied: 200,
      unsupportedBlocks: [],
      unsupportedBlocksCount: 0,
      componentSetId: '1:2',
      componentSectionId: '789:012',
      renderedCount: { table: 1, card: 3, section: 1 },
    },
  };
}

describe('render-audit-phase', () => {
  it('exports a named phase object', () => {
    assert.strictEqual(renderAuditPhase.name, 'render-audit-phase');
    assert.strictEqual(typeof renderAuditPhase.execute, 'function');
  });

  it('fails if render agent state is missing', async () => {
    const result = await renderAuditPhase.execute(createMockContext(), { stage: 'initial' });
    assert.strictEqual(result.ok, false);
    assert.match(result.error || '', /requires renderReport and renderExpectations/i);
  });

  it('returns phase failure when audit execution cannot parse output', async () => {
    const phase = createRenderAuditPhase({
      executeAgentPrompt: () => ({
        stdout: 'not valid audit json',
        stderr: '',
        raw: {
          ok: true,
          agent: 'test',
          command: 'test-agent',
          args: [],
          status: 0,
          stdout: 'not valid audit json',
          stderr: '',
        },
      }),
    });

    const result = await phase.execute(createMockContext(), createAgentState());
    assert.strictEqual(result.ok, false);
    assert.match(result.error || '', /render structure audit failed|unable to parse/i);
  });
});
