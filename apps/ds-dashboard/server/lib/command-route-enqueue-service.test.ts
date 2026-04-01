/**
 * Command Route Enqueue Service Tests
 *
 * Tests for queue argument builders.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildCaptureFigmaScreenshotQueueArgs,
  buildHealthSnapshotQueueArgs,
  buildRefreshScriptQueueArgs,
  buildRunScriptQueueConfig,
  parseScriptNameFromRoute,
} from './command-route-enqueue-service.js';

function createSysCtx() {
  return {
    repoRoot: '/repo',
    systemId: 'core',
    healthSnapshotScriptPath: 'tooling/scripts/ds-health-snapshot.mjs',
    captureFromFigmaUrlScriptPath: 'tooling/scripts/ds-capture-from-figma-url.mjs',
  };
}

describe('command-route-enqueue-service', () => {
  describe('parseScriptNameFromRoute()', () => {
    it('validates empties', () => {
      const ok = parseScriptNameFromRoute('ds:pipeline', 'req_1');
      assert.equal(ok.ok, true);
      assert.equal(ok.scriptName, 'ds:pipeline');

      const invalid = parseScriptNameFromRoute('   ', 'req_1');
      assert.equal(invalid.ok, false);
      assert.equal(invalid.statusCode, 400);
      assert.equal((invalid as any).errorArgs.code, 'validation.missing_script_name');
    });
  });

  describe('buildRefreshScriptQueueArgs()', () => {
    it('preserves routing context', () => {
      const queueArgs = buildRefreshScriptQueueArgs({
        sysCtx: createSysCtx(),
        requestId: 'req_1',
        script: 'ds:registry:refresh',
      });
      assert.equal(queueArgs.repoRoot, '/repo');
      assert.equal(queueArgs.systemId, 'core');
      assert.equal(queueArgs.script, 'ds:registry:refresh');
    });
  });

  describe('buildRunScriptQueueConfig()', () => {
    it('returns queue args and run command', () => {
      const config = buildRunScriptQueueConfig({
        scriptName: 'ds:pipeline',
        body: { all: true },
        sysCtx: createSysCtx(),
        requestId: 'req_1',
        buildRunScriptCommandArgsFn: () => ({ args: ['run', 'ds:pipeline', '--', '--system', 'core'] }),
        sha256TextFn: (value: string) => `hash:${value.length}`,
      });

      assert.equal(config.commandLabel, 'npm run ds:pipeline -- --system core');
      assert.equal(config.queueArgs.operationName, 'run:ds:pipeline');
      assert.equal(config.runCommand.command, 'npm');
      assert.deepEqual(config.runCommand.commandArgs, ['run', 'ds:pipeline', '--', '--system', 'core']);
      assert.match(config.queueArgs.inputHash, /^hash:/);
    });
  });

  describe('build node queue args for health/capture', () => {
    const sysCtx = createSysCtx();
    const requestId = 'req_1';
    const parsed = {
      commandLabel: 'node tooling/scripts/ds-health-snapshot.mjs --before-ref HEAD~1',
      scriptArgs: ['--before-ref', 'HEAD~1'],
      commandDisplayArgs: ['--url', 'https://figma.com/file/abc'],
      commandArgs: ['--url', 'https://figma.com/file/abc'],
      commandEnv: { FIGMA_TOKEN: 'secret' },
    };

    it('buildHealthSnapshotQueueArgs', () => {
      const health = buildHealthSnapshotQueueArgs({ sysCtx, requestId, parsed });
      assert.equal(health.scriptPath, sysCtx.healthSnapshotScriptPath);
    });

    it('buildCaptureFigmaScreenshotQueueArgs', () => {
      const capture = buildCaptureFigmaScreenshotQueueArgs({ sysCtx, requestId, parsed });
      assert.equal(capture.allowNonZeroJson, true);
      assert.match(capture.commandLabel, /ds-capture-from-figma-url\.mjs/);
      assert.deepEqual(capture.commandEnv, { FIGMA_TOKEN: 'secret' });
    });
  });
});
