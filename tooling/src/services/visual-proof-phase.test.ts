/**
 * Visual Proof Phase Tests
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import { visualProofPhase } from './visual-proof-phase.js';
import type { ActiveMdToFigmaRuntimeContext } from '../types/active-md-to-figma.js';
import type { AuditRenderState } from './render-pipeline-state.js';

function createMockContext(overrides: Partial<ActiveMdToFigmaRuntimeContext> = {}): ActiveMdToFigmaRuntimeContext {
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

function createAuditState(): AuditRenderState {
  return {
    stage: 'audit',
    pipeline: {
      ok: true,
      paths: {
        docModelPath: '/a',
        executePath: '/b',
        payloadPath: '/c',
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
    auditResult: {
      ok: true,
      auditReport: {
        ok: true,
        pass: true,
        targetSectionId: '123:456',
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

describe('visual-proof-phase', () => {
  it('exports a named phase object', () => {
    assert.strictEqual(visualProofPhase.name, 'visual-proof-phase');
    assert.strictEqual(typeof visualProofPhase.execute, 'function');
  });

  it('fails if audit state is missing', async () => {
    const result = await visualProofPhase.execute(createMockContext(), { stage: 'initial' });
    assert.strictEqual(result.ok, false);
    assert.match(result.error || '', /requires auditResult/i);
  });

  it('skips with continue when component set id is unavailable', async () => {
    const result = await visualProofPhase.execute(
      createMockContext({ resolvedComponentSetId: '' }),
      createAuditState(),
    );

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.skipped, true);
    assert.strictEqual(result.skipBehavior, 'continue');
    assert.strictEqual(result.output?.stage, 'complete');
  });

  it('throws in strict mode when component set id is unavailable', async () => {
    await assert.rejects(
      async () =>
        visualProofPhase.execute(
          createMockContext({ resolvedComponentSetId: '', captureProofStrict: true }),
          createAuditState(),
        ),
      /Visual proof capture skipped|component_set_node_id/i,
    );
  });
});
