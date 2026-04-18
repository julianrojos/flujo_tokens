/**
 * Command Route Enqueue Service Tests
 *
 * Tests for queue argument builders.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildCaptureFigmaScreenshotQueueArgs,
  buildRefreshScriptQueueArgs,
  buildRunScriptQueueConfig,
  parseScriptNameFromRoute,
} from './command-route-enqueue-service.js';

function createSysCtx() {
  return {
    repoRoot: '/repo',
    systemId: 'core',
    captureFromFigmaUrlScriptPath: 'tooling/src/runners/capture-from-figma-url-runner.ts',
  };
}

describe('command-route-enqueue-service', () => {
  describe('parseScriptNameFromRoute()', () => {
    it('validates empties', () => {
      const ok = parseScriptNameFromRoute('ds:token-graph', 'req_1');
      assert.equal(ok.ok, true);
      assert.equal(ok.scriptName, 'ds:token-graph');

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
        script: 'ds:token-graph',
      });
      assert.equal(queueArgs.repoRoot, '/repo');
      assert.equal(queueArgs.systemId, 'core');
      assert.equal(queueArgs.script, 'ds:token-graph');
    });
  });

  describe('buildRunScriptQueueConfig()', () => {
    it('returns queue args and run command', () => {
      const config = buildRunScriptQueueConfig({
        scriptName: 'ds:token-graph',
        body: { all: true },
        sysCtx: createSysCtx(),
        requestId: 'req_1',
        buildRunScriptCommandArgsFn: () => ({ args: ['run', 'ds:token-graph', '--', '--system', 'core'] }),
        sha256TextFn: (value: string) => `hash:${value.length}`,
      });

      assert.equal(config.commandLabel, 'npm run ds:token-graph -- --system core');
      assert.equal(config.queueArgs.operationName, 'run:ds:token-graph');
      assert.equal(config.runCommand.command, 'npm');
      assert.deepEqual(config.runCommand.commandArgs, ['run', 'ds:token-graph', '--', '--system', 'core']);
      assert.match(config.queueArgs.inputHash, /^hash:/);
    });
  });

  describe('build node queue args for capture', () => {
    const sysCtx = createSysCtx();
    const requestId = 'req_1';
    const parsed = {
      commandLabel: 'node --import tsx tooling/src/runners/capture-from-figma-url-runner.ts --url https://figma.com/file/abc',
      scriptArgs: ['--url', 'https://figma.com/file/abc'],
      commandDisplayArgs: ['--url', 'https://figma.com/file/abc'],
      commandArgs: ['--url', 'https://figma.com/file/abc'],
      commandEnv: { FIGMA_TOKEN: 'secret' },
    };

    it('buildCaptureFigmaScreenshotQueueArgs', () => {
      const capture = buildCaptureFigmaScreenshotQueueArgs({ sysCtx, requestId, parsed });
      assert.equal(capture.allowNonZeroJson, true);
      assert.match(capture.commandLabel, /node --import tsx/);
      assert.deepEqual(capture.commandEnv, { FIGMA_TOKEN: 'secret' });
    });
  });
});
