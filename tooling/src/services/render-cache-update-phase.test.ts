/**
 * Render Cache Update Phase Tests
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert';

import { renderCacheUpdatePhase } from './render-cache-update-phase.js';
import type { ActiveMdToFigmaRuntimeContext } from '../types/active-md-to-figma.js';
import type { AuditRenderState, PipelineRenderState } from './render-pipeline-state.js';

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'render-cache-test-'));
}

function removeDir(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function createMockContext(tempDir: string): ActiveMdToFigmaRuntimeContext {
  return {
    specPath: path.join(tempDir, 'spec.yml'),
    markdownPath: path.join(tempDir, 'doc.md'),
    tokenRegistryPath: path.join(tempDir, 'tokens.json'),
    generatedDir: path.join(tempDir, 'generated'),
    fileBase: 'test',
    componentName: 'Test',
    componentSlug: 'test',
    resolvedComponentSetId: '1:2',
    expectedThemeName: 'default',
    offsetX: 200,
    force: false,
    skipValidation: false,
    syncStatePath: path.join(tempDir, 'sync.json'),
    figmaUrl: undefined,
    system: undefined,
    scripts: {
      markdownToModelScript: path.join(tempDir, 'scripts/model.mjs'),
      modelToExecuteScript: path.join(tempDir, 'scripts/execute.mjs'),
    },
    themePath: path.join(tempDir, 'theme.yml'),
    systemPaths: {
      docsDir: path.join(tempDir, 'docs'),
      overviewPath: path.join(tempDir, 'docs/overview.md'),
      specsDir: path.join(tempDir, 'specs'),
      proofsDir: path.join(tempDir, 'proofs'),
      renderDir: path.join(tempDir, 'render'),
      registryPath: path.join(tempDir, 'registry.json'),
    },
    captureProofStrict: false,
  };
}

function createPipelineState(overrides?: { skipped?: boolean }): PipelineRenderState {
  return {
    stage: 'pipeline',
    pipeline: {
      ok: true,
      paths: {
        docModelPath: '/test/generated/test.doc-model.json',
        executePath: '/test/generated/test.figma-execute.js',
        payloadPath: '/test/generated/test.render-payload.json',
      },
      skipped: overrides?.skipped ?? false,
      skipReason: overrides?.skipped ? 'fingerprint_match' : undefined,
    },
  };
}

function createAuditState(): AuditRenderState {
  return {
    stage: 'audit',
    pipeline: createPipelineState().pipeline,
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
        bodyRowCount: 5,
        reasons: [],
      },
      outputPath: '/test/generated/test.render-audit-output.txt',
      rawOutput: '{}',
    },
  };
}

describe('render-cache-update-phase', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    removeDir(tempDir);
  });

  it('exports a named phase object', () => {
    assert.strictEqual(renderCacheUpdatePhase.name, 'render-cache-update-phase');
    assert.strictEqual(typeof renderCacheUpdatePhase.execute, 'function');
  });

  it('skips with continue when pipeline was skipped', async () => {
    const result = await renderCacheUpdatePhase.execute(createMockContext(tempDir), createPipelineState({ skipped: true }));
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.skipped, true);
    assert.strictEqual(result.skipBehavior, 'continue');
  });

  it('returns error when pipeline is missing', async () => {
    const result = await renderCacheUpdatePhase.execute(createMockContext(tempDir), { stage: 'initial' });
    assert.strictEqual(result.ok, false);
    assert.match(result.error || '', /requires pipeline/i);
  });

  it('returns success when audit state is present', async () => {
    const result = await renderCacheUpdatePhase.execute(createMockContext(tempDir), createAuditState());
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.skipped, undefined);
  });
});
