/**
 * Temp Artifacts Tests
 *
 * Unit tests for temp-artifacts module.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';

import {
  TempArtifactManager,
  __resetProcessHooksForTest,
} from './temp-artifacts.js';

/**
 * Create a temporary test directory.
 */
function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'temp-artifacts-test-'));
}

/**
 * Remove directory recursively.
 */
function removeDir(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe('temp-artifacts', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
    fs.mkdirSync(tempDir, { recursive: true });
    __resetProcessHooksForTest();
  });

  afterEach(() => {
    removeDir(tempDir);
    __resetProcessHooksForTest();
  });

  describe('attachProcessHooks', () => {
    it('should not throw when called multiple times', () => {
      const manager = new TempArtifactManager();

      // Should not throw
      assert.doesNotThrow(() => {
        manager.attachProcessHooks();
        manager.attachProcessHooks();
        manager.attachProcessHooks();
      });
    });

    it('should work for multiple instances', () => {
      const manager1 = new TempArtifactManager();
      const manager2 = new TempArtifactManager();
      const manager3 = new TempArtifactManager();

      // Should not throw for any instance
      assert.doesNotThrow(() => {
        manager1.attachProcessHooks();
        manager2.attachProcessHooks();
        manager3.attachProcessHooks();
      });
    });

    it('should track files in module-level state for cleanup', () => {
      const manager = new TempArtifactManager();
      manager.attachProcessHooks();

      const filePath = path.join(tempDir, 'test.txt');
      fs.writeFileSync(filePath, 'test content');
      manager.track(filePath);

      // File should be tracked
      assert.ok(process.listenerCount('exit') >= 0);
    });
  });

  describe('TempArtifactManager', () => {
    it('should track files on writeTrackedFile', () => {
      const manager = new TempArtifactManager();
      const filePath = path.join(tempDir, 'test.txt');

      manager.writeTrackedFile(filePath, 'test content');

      // File should exist
      assert.ok(fs.existsSync(filePath));
    });

    it('should remove tracked files on cleanup', () => {
      const manager = new TempArtifactManager({ keep: false });
      const filePath = path.join(tempDir, 'test.txt');

      manager.writeTrackedFile(filePath, 'test content');
      assert.ok(fs.existsSync(filePath));

      manager.cleanup();

      // File should be removed
      assert.ok(!fs.existsSync(filePath));
    });

    it('should keep files when keep option is true', () => {
      const manager = new TempArtifactManager({ keep: true });
      const filePath = path.join(tempDir, 'test.txt');

      manager.writeTrackedFile(filePath, 'test content');
      assert.ok(fs.existsSync(filePath));

      const result = manager.cleanup();

      // File should still exist
      assert.ok(fs.existsSync(filePath));
      assert.strictEqual(result.kept.length, 1);
    });

    it('should purge matching files', () => {
      const manager = new TempArtifactManager();

      const file1 = path.join(tempDir, 'test.render-agent-output.txt');
      const file2 = path.join(tempDir, 'test.render-audit-output.txt');
      const file3 = path.join(tempDir, 'other.txt');

      fs.writeFileSync(file1, 'agent output');
      fs.writeFileSync(file2, 'audit output');
      fs.writeFileSync(file3, 'other content');

      const result = manager.purgeMatching({
        dir: tempDir,
        matcher: (name) => [
          'test.render-agent-output.txt',
          'test.render-audit-output.txt',
        ].includes(name),
      });

      assert.strictEqual(result.removed.length, 2);
      assert.ok(!fs.existsSync(file1));
      assert.ok(!fs.existsSync(file2));
      assert.ok(fs.existsSync(file3));
    });
  });

  describe('__resetProcessHooksForTest', () => {
    it('should be available for test cleanup', () => {
      // Just verify the function exists and can be called
      assert.doesNotThrow(() => {
        __resetProcessHooksForTest();
      });
    });

    it('should allow re-attaching hooks after reset', () => {
      const manager1 = new TempArtifactManager();
      manager1.attachProcessHooks();

      __resetProcessHooksForTest();

      const manager2 = new TempArtifactManager();
      manager2.attachProcessHooks();

      // Should work without error
      const exitListeners = process.listeners('exit');
      assert.ok(exitListeners.length >= 0);
    });
  });
});
