/**
 * Active Markdown to Figma Preparation Tests
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import assert from 'node:assert';
import { afterEach, beforeEach, describe, it } from 'node:test';

import {
  executeActiveMdToFigmaPreparation,
  PreparationError,
} from './active-md-to-figma-preparation.js';

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'active-md-to-figma-prep-'));
}

function removeDir(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function writeFile(filePath: string, content: string): string {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
  return filePath;
}

describe('active-md-to-figma-preparation', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    delete process.env.ANTIGRAVITY_ACTIVE_FILE;
    delete process.env.ACTIVE_FILE;
    delete process.env.AG_ACTIVE_FILE;
    removeDir(tempDir);
  });

  it('throws if markdown path is missing', () => {
    assert.throws(
      () => executeActiveMdToFigmaPreparation({}),
      (error: unknown) =>
        error instanceof PreparationError &&
        error.code === 'MISSING_MARKDOWN_PATH',
    );
  });

  it('throws if markdown file does not exist', () => {
    assert.throws(
      () =>
        executeActiveMdToFigmaPreparation({
          markdown: path.join(tempDir, 'missing.md'),
        }),
      (error: unknown) =>
        error instanceof PreparationError &&
        error.code === 'MARKDOWN_NOT_FOUND',
    );
  });

  it('throws if spec file does not exist', () => {
    const markdownPath = writeFile(path.join(tempDir, 'component.md'), '# Test');

    assert.throws(
      () =>
        executeActiveMdToFigmaPreparation({
          markdown: markdownPath,
          'spec-file': path.join(tempDir, 'missing.yml'),
        }),
      (error: unknown) =>
        error instanceof PreparationError &&
        error.code === 'SPEC_NOT_FOUND',
    );
  });

  it('throws on component_set_node_id mismatch without force', () => {
    const markdownPath = writeFile(path.join(tempDir, 'component.md'), '# Test');
    const specPath = writeFile(
      path.join(tempDir, 'component.yml'),
      [
        'status: ready',
        'figma:',
        '  component_set_node_id: "1:2"',
      ].join('\n'),
    );

    assert.throws(
      () =>
        executeActiveMdToFigmaPreparation({
          markdown: markdownPath,
          'spec-file': specPath,
          'component-set-id': '3:4',
        }),
      (error: unknown) =>
        error instanceof PreparationError &&
        error.code === 'TRACEABILITY_MISMATCH',
    );
  });

  it('throws for ready spec without component_set_node_id and includes spec path', () => {
    const markdownPath = writeFile(path.join(tempDir, 'component.md'), '# Test');
    const specPath = writeFile(path.join(tempDir, 'component.yml'), 'status: ready\n');

    assert.throws(
      () =>
        executeActiveMdToFigmaPreparation({
          markdown: markdownPath,
          'spec-file': specPath,
        }),
      (error: unknown) =>
        error instanceof PreparationError &&
        error.code === 'MISSING_READY_SPEC_NODE_ID' &&
        error.message.includes(specPath),
    );
  });

  it('preserves figmaUrl, agent, flags and resolved config on success', () => {
    const markdownPath = writeFile(path.join(tempDir, 'my-component.md'), '# Test');
    const specPath = writeFile(path.join(tempDir, 'my_component.yml'), 'status: draft\n');
    const generatedDir = path.join(tempDir, 'generated-output');

    const result = executeActiveMdToFigmaPreparation({
      markdown: markdownPath,
      'spec-file': specPath,
      'skip-validation': 'true',
      force: 'true',
      'capture-proof-strict': 'true',
      'generated-dir': generatedDir,
      'offset-x': '500',
      url: 'https://figma.com/file/test?node-id=1-2',
      agent: 'claude',
      'component-name': 'CustomName',
    });

    assert.equal(result.markdownPath, path.resolve(markdownPath));
    assert.equal(result.specPath, path.resolve(specPath));
    assert.equal(result.generatedDir, generatedDir);
    assert.equal(result.offsetX, 500);
    assert.equal(result.figmaUrl, 'https://figma.com/file/test?node-id=1-2');
    assert.equal(result.agent, 'claude');
    assert.equal(result.force, true);
    assert.equal(result.skipValidation, true);
    assert.equal(result.captureProofStrict, true);
    assert.equal(result.componentName, 'CustomName');
    assert.equal(result.fileBase, 'my-component');
    assert.equal(result.componentSlug, 'custom_name');
    assert.equal(result.specStatus, 'draft');
    assert.equal(result.resolvedComponentSetId, '');
  });

  it('uses ANTIGRAVITY_ACTIVE_FILE when markdown arg is omitted', () => {
    const markdownPath = writeFile(path.join(tempDir, 'env-doc.md'), '# Test');
    const specPath = writeFile(path.join(tempDir, 'env_doc.yml'), 'status: draft\n');
    process.env.ANTIGRAVITY_ACTIVE_FILE = markdownPath;

    const result = executeActiveMdToFigmaPreparation({
      'spec-file': specPath,
      'skip-validation': 'true',
      force: 'true',
    });

    assert.equal(result.markdownPath, path.resolve(markdownPath));
    assert.equal(result.specPath, path.resolve(specPath));
  });
});
