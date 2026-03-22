/**
 * Tests for isMain utility
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

import { isMain } from './is-main.js';

describe('isMain', () => {
  it('returns false when metaUrl is empty', () => {
    assert.strictEqual(isMain(''), false);
  });

  it('returns false when process.argv[1] is undefined', () => {
    const originalArgv = process.argv[1];
    process.argv[1] = undefined as any;
    try {
      assert.strictEqual(isMain('file:///test.ts'), false);
    } finally {
      process.argv[1] = originalArgv;
    }
  });

  it('returns true when metaUrl matches resolved argv[1]', () => {
    const testPath = resolve('/test/path.ts');
    const testUrl = `file://${testPath}`;
    const originalArgv = process.argv[1];
    process.argv[1] = testPath;
    try {
      assert.strictEqual(isMain(testUrl), true);
    } finally {
      process.argv[1] = originalArgv;
    }
  });

  it('returns false when metaUrl does not match argv[1]', () => {
    const originalArgv = process.argv[1];
    process.argv[1] = resolve('/different/path.ts');
    try {
      assert.strictEqual(isMain('file:///test/path.ts'), false);
    } finally {
      process.argv[1] = originalArgv;
    }
  });

  it('handles relative paths correctly', () => {
    const originalArgv = process.argv[1];
    const testPath = resolve('./relative/path.ts');
    process.argv[1] = testPath;
    try {
      const testUrl = `file://${testPath}`;
      assert.strictEqual(isMain(testUrl), true);
    } finally {
      process.argv[1] = originalArgv;
    }
  });

  it('returns false on invalid URL', () => {
    const originalArgv = process.argv[1];
    process.argv[1] = resolve('/test/path.ts');
    try {
      assert.strictEqual(isMain('not-a-valid-url'), false);
    } finally {
      process.argv[1] = originalArgv;
    }
  });
});
