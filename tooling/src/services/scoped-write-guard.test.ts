import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, it } from 'node:test';

import { assertScopedWritePolicy, captureScopedWriteSnapshot } from './scoped-write-guard.js';

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-write-guard-'));
}

describe('scoped-write-guard', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs) {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
    tempDirs.length = 0;
  });

  it('allows slug-scoped variant writes via allowedPathPrefixes', () => {
    const root = createTempDir();
    tempDirs.push(root);
    const variantsDir = path.join(root, 'images', 'variants');
    fs.mkdirSync(variantsDir, { recursive: true });

    const snapshot = captureScopedWriteSnapshot({
      directories: [path.join(root, 'images')],
      extensions: ['.png'],
    });

    const allowedPrefix = `${path.join(variantsDir, 'button__')}*`;
    const allowedFile = path.join(variantsDir, 'button__default.png');
    fs.writeFileSync(allowedFile, 'png-bytes', 'utf8');

    assert.doesNotThrow(() =>
      assertScopedWritePolicy({
        snapshot,
        allowedPathPrefixes: [allowedPrefix],
      }),
    );
  });

  it('blocks writes outside allowedPathPrefixes', () => {
    const root = createTempDir();
    tempDirs.push(root);
    const variantsDir = path.join(root, 'images', 'variants');
    fs.mkdirSync(variantsDir, { recursive: true });

    const snapshot = captureScopedWriteSnapshot({
      directories: [path.join(root, 'images')],
      extensions: ['.png'],
    });

    const allowedPrefix = `${path.join(variantsDir, 'button__')}*`;
    const disallowedFile = path.join(variantsDir, 'badge__default.png');
    fs.writeFileSync(disallowedFile, 'png-bytes', 'utf8');

    assert.throws(
      () =>
        assertScopedWritePolicy({
          snapshot,
          allowedPathPrefixes: [allowedPrefix],
          label: 'unit-test',
        }),
      /Unexpected file mutations detected during unit-test/,
    );
  });

  it('tracks only matching fileNamePrefixes when requested', () => {
    const root = createTempDir();
    tempDirs.push(root);
    const imageDir = path.join(root, 'images');
    fs.mkdirSync(imageDir, { recursive: true });
    fs.writeFileSync(path.join(imageDir, 'button.png'), 'old', 'utf8');
    fs.writeFileSync(path.join(imageDir, 'badge.png'), 'old', 'utf8');

    const snapshot = captureScopedWriteSnapshot({
      directories: [imageDir],
      extensions: ['.png'],
      fileNamePrefixes: ['button'],
    });

    fs.writeFileSync(path.join(imageDir, 'badge.png'), 'new', 'utf8');

    assert.doesNotThrow(() =>
      assertScopedWritePolicy({
        snapshot,
        allowedPaths: [],
      }),
    );
  });

  it('enforces path-boundary semantics for non-literal prefixes', () => {
    const root = createTempDir();
    tempDirs.push(root);
    const visualProofDir = path.join(root, 'visual-proofs');
    fs.mkdirSync(visualProofDir, { recursive: true });

    const snapshot = captureScopedWriteSnapshot({
      directories: [visualProofDir],
      extensions: ['.png'],
    });

    const allowedPathPrefix = path.join(visualProofDir, 'button');
    const siblingPath = path.join(visualProofDir, 'button_attack.png');
    fs.writeFileSync(siblingPath, 'png-bytes', 'utf8');

    assert.throws(
      () =>
        assertScopedWritePolicy({
          snapshot,
          allowedPathPrefixes: [allowedPathPrefix],
          label: 'path-boundary-test',
        }),
      /Unexpected file mutations detected during path-boundary-test/,
    );
  });

  it('limits traversal depth when maxDepth is set', () => {
    const root = createTempDir();
    tempDirs.push(root);
    const variantsDir = path.join(root, 'images', 'variants');
    const nestedDir = path.join(variantsDir, 'nested');
    fs.mkdirSync(nestedDir, { recursive: true });
    const topLevelFile = path.join(variantsDir, 'button__default.png');
    const nestedFile = path.join(nestedDir, 'button__nested.png');
    fs.writeFileSync(topLevelFile, 'top', 'utf8');
    fs.writeFileSync(nestedFile, 'nested', 'utf8');

    const snapshot = captureScopedWriteSnapshot({
      directories: [variantsDir],
      extensions: ['.png'],
      fileNamePrefixes: ['button__'],
      maxDepth: 0,
    });

    const tracked = [...snapshot.entries.keys()];
    assert.equal(tracked.includes(path.resolve(topLevelFile)), true);
    assert.equal(tracked.includes(path.resolve(nestedFile)), false);
  });

  it('fails fast for invalid literal prefix marker without base path', () => {
    const root = createTempDir();
    tempDirs.push(root);
    const imageDir = path.join(root, 'images');
    fs.mkdirSync(imageDir, { recursive: true });
    const target = path.join(imageDir, 'button.png');
    const snapshot = captureScopedWriteSnapshot({
      directories: [imageDir],
      extensions: ['.png'],
    });
    fs.writeFileSync(target, 'updated', 'utf8');

    assert.throws(
      () =>
        assertScopedWritePolicy({
          snapshot,
          allowedPathPrefixes: ['*'],
          label: 'invalid-prefix-test',
        }),
      /Invalid allowedPathPrefix/,
    );
  });
});
