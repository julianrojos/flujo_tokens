/**
 * Render Cache Update Phase Tests
 *
 * Unit tests for render-cache-update-phase module.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';

import { renderCacheUpdatePhase } from './render-cache-update-phase.js';
import type { ActiveMdToFigmaRuntimeContext } from '../types/active-md-to-figma.js';
import type { RenderPipelineState } from './render-pipeline-state.js';
import type { PhaseResult } from './render-phase.js';

/**
 * Create a temporary test directory.
 */
function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'render-cache-test-'));
}

/**
 * Remove directory recursively.
 */
function removeDir(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Create a mock runtime context for testing.
 */
function createMockContext(tempDir?: string): ActiveMdToFigmaRuntimeContext {
  const dir = tempDir || '/test';
  return {
    specPath: path.join(dir, 'spec.yml'),
    markdownPath: path.join(dir, 'doc.md'),
    tokenRegistryPath: path.join(dir, 'tokens.json'),
    generatedDir: path.join(dir, 'generated'),
    fileBase: 'test',
    componentName: 'Test',
    componentSlug: 'test',
    resolvedComponentSetId: '1:2',
    expectedThemeName: 'default',
    offsetX: 200,
    force: false,
    skipValidation: false,
    syncStatePath: path.join(dir, 'sync.json'),
    figmaUrl: undefined,
    system: undefined,
    scripts: {
      markdownToModelScript: path.join(dir, 'scripts/model.mjs'),
      modelToExecuteScript: path.join(dir, 'scripts/execute.mjs'),
    },
    themePath: path.join(dir, 'theme.yml'),
    systemPaths: {
      docsDir: path.join(dir, 'docs'),
      overviewPath: path.join(dir, 'docs/overview.md'),
      specsDir: path.join(dir, 'specs'),
      proofsDir: path.join(dir, 'proofs'),
      renderDir: path.join(dir, 'render'),
      registryPath: path.join(dir, 'registry.json'),
    },
    captureProofStrict: false,
  };
}

/**
 * Create mock pipeline result.
 */
function createMockPipelineResult(overrides?: { skipped?: boolean }): RenderPipelineState['pipeline'] {
  return {
    ok: true,
    paths: {
      docModelPath: '/test/generated/test.doc-model.json',
      executePath: '/test/generated/test.figma-execute.js',
      payloadPath: '/test/generated/test.render-payload.json',
    },
    skipped: overrides?.skipped ?? false,
    skipReason: overrides?.skipped ? 'fingerprint_match' : undefined,
  };
}

/**
 * Create mock render report.
 */
function createMockRenderReport(): RenderPipelineState['renderReport'] {
  return {
    ok: true,
    targetSectionId: '123:456',
    targetSectionName: 'Doc/Test',
    themeName: 'default',
    offsetXApplied: 200,
    unsupportedBlocks: [],
    unsupportedBlocksCount: 0,
    componentSetId: '1:2',
    componentSectionId: '789:012',
    renderedCount: {
      table: 1,
      card: 3,
      section: 1,
    },
  };
}

/**
 * Create mock audit result.
 */
function createMockAuditResult(): RenderPipelineState['auditResult'] {
  return {
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
    rawOutput: '{"ok": true}',
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

  describe('renderCacheUpdatePhase', () => {
    it('should return skip result with continue when pipeline was skipped', async () => {
      const context = createMockContext();
      const state: RenderPipelineState = {
        pipeline: createMockPipelineResult({ skipped: true }),
      };

      const result = await renderCacheUpdatePhase(context, state);

      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.skipped, true);
      assert.strictEqual(result.skipBehavior, 'continue');
      assert.ok(result.reason?.includes('Pipeline was skipped'));
    });

    it('should return error when pipeline is missing', async () => {
      const context = createMockContext();
      const state: RenderPipelineState = {};

      const result = await renderCacheUpdatePhase(context, state);

      assert.strictEqual(result.ok, false);
      assert.ok(result.error?.includes('requires pipeline'));
    });

    it('should return error when renderReport is missing', async () => {
      const context = createMockContext();
      const state: RenderPipelineState = {
        pipeline: createMockPipelineResult(),
      };

      const result = await renderCacheUpdatePhase(context, state);

      assert.strictEqual(result.ok, false);
      assert.ok(result.error?.includes('requires renderReport'));
    });

    it('should return error when auditResult is missing', async () => {
      const context = createMockContext();
      const state: RenderPipelineState = {
        pipeline: createMockPipelineResult(),
        renderReport: createMockRenderReport(),
      };

      const result = await renderCacheUpdatePhase(context, state);

      assert.strictEqual(result.ok, false);
      assert.ok(result.error?.includes('requires auditResult'));
    });

    it('should return success when all required state is present', async () => {
      const context = createMockContext(tempDir);
      const state: RenderPipelineState = {
        pipeline: createMockPipelineResult(),
        renderReport: createMockRenderReport(),
        auditResult: createMockAuditResult(),
      };

      const result = await renderCacheUpdatePhase(context, state);

      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.skipped, undefined);
      assert.strictEqual(result.output, undefined);
    });

    it('should handle pipeline with skipReason correctly', async () => {
      const context = createMockContext();
      const state: RenderPipelineState = {
        pipeline: createMockPipelineResult({ skipped: true }),
      };

      const result = await renderCacheUpdatePhase(context, state);

      assert.strictEqual(result.skipped, true);
      assert.strictEqual(result.skipBehavior, 'continue');
      assert.ok(result.reason);
    });
  });

  describe('PhaseResult contract', () => {
    it('should return PhaseResult with ok, skipped, skipBehavior, reason, error, output', async () => {
      const context = createMockContext();
      
      // Test skip result structure
      const skipState: RenderPipelineState = {
        pipeline: createMockPipelineResult({ skipped: true }),
      };
      const skipResult = await renderCacheUpdatePhase(context, skipState);
      
      assert.ok('ok' in skipResult);
      assert.ok('skipped' in skipResult);
      assert.ok('skipBehavior' in skipResult);
      assert.ok('reason' in skipResult);
      
      // Test error result structure
      const errorState: RenderPipelineState = {};
      const errorResult = await renderCacheUpdatePhase(context, errorState);
      
      assert.strictEqual(errorResult.ok, false);
      assert.ok('error' in errorResult);
    });
  });

  describe('metadata construction (internal)', () => {
    it('should use renderReport values for metadata', async () => {
      const context = createMockContext(tempDir);
      const renderReport = createMockRenderReport();
      const auditResult = createMockAuditResult();

      const state: RenderPipelineState = {
        pipeline: createMockPipelineResult(),
        renderReport,
        auditResult,
      };

      // The phase should use these values internally
      // We verify by checking it doesn't error when state is complete
      const result = await renderCacheUpdatePhase(context, state);

      assert.strictEqual(result.ok, true);
    });

    it('should use auditResult for structureAudit metadata', async () => {
      const context = createMockContext(tempDir);
      const auditResult = createMockAuditResult();

      const state: RenderPipelineState = {
        pipeline: createMockPipelineResult(),
        renderReport: createMockRenderReport(),
        auditResult,
      };

      const result = await renderCacheUpdatePhase(context, state);

      assert.strictEqual(result.ok, true);
    });
  });

  describe('skip behavior semantics', () => {
    it('should skip with continue (not exit) to allow documentation sync', async () => {
      const context = createMockContext();
      const state: RenderPipelineState = {
        pipeline: createMockPipelineResult({ skipped: true }),
      };

      const result = await renderCacheUpdatePhase(context, state);

      // Should continue to allow documentation sync to run
      assert.strictEqual(result.skipBehavior, 'continue');
      assert.notStrictEqual(result.skipBehavior, 'exit');
    });

    it('should not skip when pipeline executed successfully', async () => {
      const context = createMockContext(tempDir);
      const state: RenderPipelineState = {
        pipeline: createMockPipelineResult({ skipped: false }),
        renderReport: createMockRenderReport(),
        auditResult: createMockAuditResult(),
      };

      const result = await renderCacheUpdatePhase(context, state);

      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.skipped, undefined);
    });
  });
});
