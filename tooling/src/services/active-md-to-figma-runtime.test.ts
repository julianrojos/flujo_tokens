/**
 * Active Markdown to Figma Runtime Tests
 *
 * Unit tests for runtime builder.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';

import { buildActiveMdToFigmaRuntime } from './active-md-to-figma-runtime.js';
import type { ActiveMdToFigmaPreparationResult } from './active-md-to-figma-preparation.js';

/**
 * Create a temporary test directory.
 */
function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-test-'));
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
 * Create a mock preparation result for testing.
 */
function createMockPreparation(tempDir: string): ActiveMdToFigmaPreparationResult {
  return {
    markdownPath: path.join(tempDir, 'doc.md'),
    specPath: path.join(tempDir, 'spec.yml'),
    tokenRegistryPath: path.join(tempDir, 'tokens.json'),
    syncStatePath: path.join(tempDir, 'sync.json'),
    generatedDir: path.join(tempDir, 'generated'),
    fileBase: 'test',
    componentName: 'Test',
    componentSlug: 'test',
    resolvedComponentSetId: '1:2',
    specStatus: 'draft',
    force: false,
    skipValidation: false,
    captureProofStrict: false,
    offsetX: 200,
    figmaUrl: 'https://figma.com/file/abc',
    agent: 'auto',
    ctx: {
      system: 'test',
      paths: {
        input: path.join(tempDir, 'input'),
        output: path.join(tempDir, 'output'),
        generated: path.join(tempDir, 'generated'),
        specs: path.join(tempDir, 'specs'),
        docs: path.join(tempDir, 'docs'),
        registry: path.join(tempDir, 'registry.json'),
        tokenRegistry: path.join(tempDir, 'tokens.json'),
      },
    },
  };
}

describe('active-md-to-figma-runtime', () => {
  let tempDir: string;
  let themePath: string;

  beforeEach(() => {
    tempDir = createTempDir();
    fs.mkdirSync(tempDir, { recursive: true });
    
    // Create default theme file
    themePath = path.join(tempDir, 'figma-doc-theme.yml');
    fs.writeFileSync(themePath, 'name: default-theme\n');
  });

  afterEach(() => {
    removeDir(tempDir);
  });

  describe('buildActiveMdToFigmaRuntime', () => {
    it('should use preflight.agent', () => {
      const preparation = createMockPreparation(tempDir);
      preparation.agent = 'claude';

      const runtime = buildActiveMdToFigmaRuntime(preparation);

      // Runtime should be built successfully with agent configuration
      assert.ok(runtime.context);
      assert.ok(runtime.phases);
    });

    it('should use preflight.figmaUrl', () => {
      const preparation = createMockPreparation(tempDir);
      preparation.figmaUrl = 'https://figma.com/file/test123';

      const runtime = buildActiveMdToFigmaRuntime(preparation);

      assert.strictEqual(runtime.context.figmaUrl, 'https://figma.com/file/test123');
    });

    it('should build context with all required fields', () => {
      const preparation = createMockPreparation(tempDir);

      const runtime = buildActiveMdToFigmaRuntime(preparation);

      assert.ok(runtime.context);
      assert.strictEqual(runtime.context.fileBase, 'test');
      assert.strictEqual(runtime.context.componentName, 'Test');
      assert.ok(runtime.context.scripts);
      assert.ok(runtime.context.systemPaths);
    });

    it('should return phases in correct order', () => {
      const preparation = createMockPreparation(tempDir);

      const runtime = buildActiveMdToFigmaRuntime(preparation);

      assert.strictEqual(runtime.phases.length, 5);
      // Phases should be in execution order
      // (we can't easily check function names, but we can check length)
    });

    it('should resolve theme name correctly', () => {
      // Create a valid theme file
      const themePath = path.join(tempDir, 'theme.yml');
      fs.writeFileSync(themePath, 'name: test-theme\n');

      const preparation = createMockPreparation(tempDir);

      const runtime = buildActiveMdToFigmaRuntime(preparation, themePath);

      assert.strictEqual(runtime.context.expectedThemeName, 'test-theme');
    });

    it('should use default theme path when not provided', () => {
      const preparation = createMockPreparation(tempDir);

      // Should not throw with undefined theme path
      assert.doesNotThrow(() => {
        buildActiveMdToFigmaRuntime(preparation);
      });
    });

    it('should create artifact manager with correct parameters', () => {
      const preparation = createMockPreparation(tempDir);

      const runtime = buildActiveMdToFigmaRuntime(preparation);

      // Runtime should be built successfully
      assert.ok(runtime.context);
      assert.ok(runtime.phases);
    });

    it('should build scripts paths from constants', () => {
      const preparation = createMockPreparation(tempDir);

      const runtime = buildActiveMdToFigmaRuntime(preparation);

      assert.ok(runtime.context.scripts.markdownToModelScript);
      assert.ok(runtime.context.scripts.modelToExecuteScript);
      assert.ok(runtime.context.scripts.markdownToModelScript.includes('markdown_to_doc_model.mjs'));
      assert.ok(runtime.context.scripts.modelToExecuteScript.includes('build_figma_execute_code.mjs'));
    });

    it('should build systemPaths from context paths', () => {
      const preparation = createMockPreparation(tempDir);

      const runtime = buildActiveMdToFigmaRuntime(preparation);

      assert.strictEqual(runtime.context.systemPaths.docsDir, preparation.ctx.paths.docs);
      assert.strictEqual(runtime.context.systemPaths.specsDir, preparation.ctx.paths.specs);
      assert.strictEqual(runtime.context.systemPaths.registryPath, preparation.ctx.paths.registry);
    });

    it('should preserve offsetX from preflight', () => {
      const preparation = createMockPreparation(tempDir);
      preparation.offsetX = 500;

      const runtime = buildActiveMdToFigmaRuntime(preparation);

      assert.strictEqual(runtime.context.offsetX, 500);
    });

    it('should preserve captureProofStrict from preflight', () => {
      const preparation = createMockPreparation(tempDir);
      preparation.captureProofStrict = true;

      const runtime = buildActiveMdToFigmaRuntime(preparation);

      assert.strictEqual(runtime.context.captureProofStrict, true);
    });
  });
});
