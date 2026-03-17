/**
 * Spec Writer Tests
 *
 * Tests for writeSpecWithSnapshotGuard function.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { writeSpecWithSnapshotGuard } from './spec-writer.js';

describe('spec-writer', () => {
  describe('writeSpecWithSnapshotGuard()', () => {
    it('restores on error', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-writer-'));
      const filePath = path.join(dir, 'test.yml');

      fs.writeFileSync(filePath, 'original: true', 'utf8');

      assert.throws(() => {
        writeSpecWithSnapshotGuard({
          outputPath: filePath,
          normalizedSpec: { new: true },
          applyWriteFn: ({ outputPath }) => {
            fs.writeFileSync(outputPath, 'overwritten: true', 'utf8');
            throw new Error('Simulated failure during write/format');
          },
        });
      }, /Simulated failure/);

      const recoveredContent = fs.readFileSync(filePath, 'utf8');
      assert.equal(recoveredContent, 'original: true');
    });
  });
});
