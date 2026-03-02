/**
 * Active Markdown to Figma Runtime Tests
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert';

import { buildActiveMdToFigmaRuntime } from './active-md-to-figma-runtime.js';
import type { ActiveMdToFigmaPreparationResult } from './active-md-to-figma-preparation.js';

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-test-'));
}

function removeDir(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

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
    themePath: path.join(tempDir, 'theme.yml'),
    expectedThemeName: 'test-theme',
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
    themePath = path.join(tempDir, 'theme.yml');
    fs.writeFileSync(themePath, 'name: test-theme\n');
  });

  afterEach(() => {
    removeDir(tempDir);
  });

  it('uses preflight agent and figmaUrl in context', () => {
    const preparation = createMockPreparation(tempDir);
    preparation.agent = 'claude';
    preparation.figmaUrl = 'https://figma.com/file/test123';

    const runtime = buildActiveMdToFigmaRuntime(preparation, themePath);
    assert.strictEqual(runtime.context.figmaUrl, 'https://figma.com/file/test123');
    assert.strictEqual(runtime.phases.length, 5);
  });

  it('builds context with scripts and system paths', () => {
    const runtime = buildActiveMdToFigmaRuntime(createMockPreparation(tempDir), themePath);
    assert.strictEqual(runtime.context.fileBase, 'test');
    assert.ok(runtime.context.scripts.markdownToModelScript.includes('markdown_to_doc_model.mjs'));
    assert.strictEqual(runtime.context.systemPaths.docsDir, path.join(tempDir, 'docs'));
  });

  it('preserves offsetX and captureProofStrict from preparation', () => {
    const preparation = createMockPreparation(tempDir);
    preparation.offsetX = 500;
    preparation.captureProofStrict = true;

    const runtime = buildActiveMdToFigmaRuntime(preparation, themePath);
    assert.strictEqual(runtime.context.offsetX, 500);
    assert.strictEqual(runtime.context.captureProofStrict, true);
  });
});
