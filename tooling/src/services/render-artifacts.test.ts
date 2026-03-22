/**
 * Render Artifacts Tests
 *
 * Unit tests for render-artifacts module.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';

import {
  buildRenderArtifactPaths,
  purgeRenderArtifacts,
  RenderArtifactManager,
  createRenderArtifactManager,
  type RenderArtifactPaths,
  type PurgeRenderArtifactsResult,
} from './render-artifacts.js';
import { TempArtifactManager } from './temp-artifacts.js';

/**
 * Create a temporary test directory.
 */
function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'render-artifacts-test-'));
}

/**
 * Remove directory recursively.
 */
function removeDir(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe('render-artifacts', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    removeDir(tempDir);
  });

  describe('buildRenderArtifactPaths', () => {
    it('should build correct artifact paths', () => {
      const generatedDir = '/test/generated';
      const fileBase = 'test-component';

      const paths = buildRenderArtifactPaths(generatedDir, fileBase);

      assert.strictEqual(
        paths.renderAgentOutputPath,
        path.resolve('/test/generated/test-component.render-agent-output.txt'),
      );
      assert.strictEqual(
        paths.renderAuditOutputPath,
        path.resolve('/test/generated/test-component.render-audit-output.txt'),
      );
    });

    it('should handle different file bases', () => {
      const generatedDir = '/test/generated';
      const fileBase = 'my-custom-component';

      const paths = buildRenderArtifactPaths(generatedDir, fileBase);

      assert.ok(paths.renderAgentOutputPath.includes('my-custom-component.render-agent-output.txt'));
      assert.ok(paths.renderAuditOutputPath.includes('my-custom-component.render-audit-output.txt'));
    });
  });

  describe('RenderArtifactPaths', () => {
    it('should have correct structure', () => {
      const paths: RenderArtifactPaths = {
        renderAgentOutputPath: '/test/path.render-agent-output.txt',
        renderAuditOutputPath: '/test/path.render-audit-output.txt',
      };

      assert.ok('renderAgentOutputPath' in paths);
      assert.ok('renderAuditOutputPath' in paths);
    });
  });

  describe('RenderArtifactManager', () => {
    it('should create manager with correct directory and file base', () => {
      const manager = new RenderArtifactManager(tempDir, 'test-component');

      const paths = manager.getArtifactPaths();
      assert.ok(paths.renderAgentOutputPath.includes('test-component.render-agent-output.txt'));
      assert.ok(paths.renderAuditOutputPath.includes('test-component.render-audit-output.txt'));
    });

    it('should purge stale artifacts', () => {
      // Create test artifacts
      const agentOutputPath = path.join(tempDir, 'test-component.render-agent-output.txt');
      const auditOutputPath = path.join(tempDir, 'test-component.render-audit-output.txt');
      const otherFile = path.join(tempDir, 'other-file.txt');

      fs.writeFileSync(agentOutputPath, 'agent output');
      fs.writeFileSync(auditOutputPath, 'audit output');
      fs.writeFileSync(otherFile, 'other content');

      const manager = new RenderArtifactManager(tempDir, 'test-component');
      const result = manager.purgeStale();

      assert.strictEqual(result.removed.length, 2);
      assert.strictEqual(fs.existsSync(agentOutputPath), false);
      assert.strictEqual(fs.existsSync(auditOutputPath), false);
      assert.strictEqual(fs.existsSync(otherFile), true);
    });

    it('should write render agent output', () => {
      const manager = new RenderArtifactManager(tempDir, 'test-component');
      const content = 'test agent output content';

      const outputPath = manager.writeRenderAgentOutput(content);

      assert.ok(outputPath.includes('test-component.render-agent-output.txt'));
      assert.strictEqual(fs.existsSync(outputPath), true);
      assert.strictEqual(fs.readFileSync(outputPath, 'utf8'), content);
    });

    it('should write render audit output', () => {
      const manager = new RenderArtifactManager(tempDir, 'test-component');
      const content = 'test audit output content';

      const outputPath = manager.writeRenderAuditOutput(content);

      assert.ok(outputPath.includes('test-component.render-audit-output.txt'));
      assert.strictEqual(fs.existsSync(outputPath), true);
      assert.strictEqual(fs.readFileSync(outputPath, 'utf8'), content);
    });

    it('should attach process hooks for cleanup', () => {
      const manager = new RenderArtifactManager(tempDir, 'test-component');
      
      // Should not throw
      assert.doesNotThrow(() => {
        manager.attachProcessHooks();
      });
    });
  });

  describe('createRenderArtifactManager', () => {
    it('should create manager and purge stale artifacts', () => {
      // Create test artifacts
      const agentOutputPath = path.join(tempDir, 'test-component.render-agent-output.txt');
      fs.writeFileSync(agentOutputPath, 'old content');

      const { manager, purgeResult } = createRenderArtifactManager(tempDir, 'test-component');

      assert.ok(manager instanceof RenderArtifactManager);
      assert.strictEqual(purgeResult.removed.length, 1);
      assert.ok(purgeResult.removedBasenames.includes('test-component.render-agent-output.txt'));
    });

    it('should return empty purge result when no stale artifacts', () => {
      const { purgeResult } = createRenderArtifactManager(tempDir, 'test-component');

      assert.strictEqual(purgeResult.removed.length, 0);
      assert.strictEqual(purgeResult.removedBasenames.length, 0);
    });
  });

  describe('purgeRenderArtifacts', () => {
    it('should remove matching artifacts', () => {
      const agentOutputPath = path.join(tempDir, 'test-component.render-agent-output.txt');
      const auditOutputPath = path.join(tempDir, 'test-component.render-audit-output.txt');
      const otherFile = path.join(tempDir, 'other-file.txt');

      fs.writeFileSync(agentOutputPath, 'agent output');
      fs.writeFileSync(auditOutputPath, 'audit output');
      fs.writeFileSync(otherFile, 'other content');

      const tempManager = new TempArtifactManager();
      const result = purgeRenderArtifacts(
        { generatedDir: tempDir, fileBase: 'test-component' },
        tempManager,
      );

      assert.strictEqual(result.removed.length, 2);
      assert.deepStrictEqual(result.removedBasenames, [
        'test-component.render-agent-output.txt',
        'test-component.render-audit-output.txt',
      ]);
      assert.strictEqual(fs.existsSync(otherFile), true);
    });

    it('should handle non-existent directory gracefully', () => {
      const tempManager = new TempArtifactManager();
      const result = purgeRenderArtifacts(
        { generatedDir: '/non-existent-dir', fileBase: 'test-component' },
        tempManager,
      );

      assert.strictEqual(result.removed.length, 0);
    });
  });

  describe('PurgeRenderArtifactsResult', () => {
    it('should have correct structure', () => {
      const result: PurgeRenderArtifactsResult = {
        removed: ['/path/to/file1.txt', '/path/to/file2.txt'],
        removedBasenames: ['file1.txt', 'file2.txt'],
      };

      assert.ok('removed' in result);
      assert.ok('removedBasenames' in result);
      assert(Array.isArray(result.removed));
      assert(Array.isArray(result.removedBasenames));
    });
  });

  describe('integration', () => {
    it('should handle full workflow: create, write, purge', () => {
      const { manager } = createRenderArtifactManager(tempDir, 'test-component');

      // Write artifacts
      manager.writeRenderAgentOutput('agent content');
      manager.writeRenderAuditOutput('audit content');

      const paths = manager.getArtifactPaths();
      assert.strictEqual(fs.existsSync(paths.renderAgentOutputPath), true);
      assert.strictEqual(fs.existsSync(paths.renderAuditOutputPath), true);

      // Purge artifacts
      const purgeResult = manager.purgeStale();
      assert.strictEqual(purgeResult.removed.length, 2);
      assert.strictEqual(fs.existsSync(paths.renderAgentOutputPath), false);
      assert.strictEqual(fs.existsSync(paths.renderAuditOutputPath), false);
    });

    it('should handle multiple file bases independently', () => {
      const manager1 = new RenderArtifactManager(tempDir, 'component-a');
      const manager2 = new RenderArtifactManager(tempDir, 'component-b');

      manager1.writeRenderAgentOutput('content A');
      manager2.writeRenderAgentOutput('content B');

      const purgeA = manager1.purgeStale();
      assert.strictEqual(purgeA.removed.length, 1);
      assert.ok(purgeA.removedBasenames[0].includes('component-a'));

      const purgeB = manager2.purgeStale();
      assert.strictEqual(purgeB.removed.length, 1);
      assert.ok(purgeB.removedBasenames[0].includes('component-b'));
    });
  });
});
