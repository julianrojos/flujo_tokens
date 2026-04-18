/**
 * Command Execution Service Tests
 *
 * Tests for command execution with output capture.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createCommandExecutionService } from './command-execution-service.js';

function createService(overrides: Record<string, unknown> = {}) {
  return createCommandExecutionService({
    runSpawnWithCapture: async () => ({
      spawnError: null,
      exitCode: 0,
      stdout: '',
      stderr: '',
      jsonParseError: null,
      parsedJson: null,
    }),
    maxOutputBytes: 1024,
    summarizePayloadFailure: (payload: Record<string, unknown> | null, code: number) =>
      String(payload?.message || payload?.error || `code:${code}`),
    ...overrides,
  });
}

describe('command-execution-service', () => {
  describe('runQueuedSpawnCommand()', () => {
    it('spawn errors return failed payload', async () => {
      const service = createService({
        runSpawnWithCapture: async () => ({
          spawnError: 'ENOENT',
          exitCode: null,
          stdout: '',
          stderr: '',
          jsonParseError: null,
          parsedJson: null,
        }),
      });

      const result = await service.runQueuedSpawnCommand({
        cwd: '/repo',
        command: 'node',
        commandArgs: ['-v'],
        emitChunk() {},
        commandLabel: 'node -v',
      });

      assert.equal(result.ok, false);
      assert.equal(result.code, 1);
      assert.match(result.summary, /ENOENT/);
    });

    it('plain command success returns output', async () => {
      const service = createService({
        runSpawnWithCapture: async () => ({
          spawnError: null,
          exitCode: 0,
          stdout: 'done',
          stderr: '',
          jsonParseError: null,
          parsedJson: null,
        }),
      });

      const result = await service.runQueuedSpawnCommand({
        cwd: '/repo',
        command: 'npm',
        commandArgs: ['run', 'x'],
        emitChunk() {},
        commandLabel: 'npm run x',
      });

      assert.equal(result.ok, true);
      assert.equal(result.code, 0);
      assert.equal((result.payload as any).output, 'done');
    });

    it('parseJson success respects payload.ok', async () => {
      const service = createService({
        runSpawnWithCapture: async () => ({
          spawnError: null,
          exitCode: 0,
          stdout: '{"ok":false,"message":"bad"}',
          stderr: '',
          jsonParseError: null,
          parsedJson: { ok: false, message: 'bad' },
        }),
      });

      const result = await service.runQueuedSpawnCommand({
        cwd: '/repo',
        command: 'node',
        commandArgs: ['script.mjs'],
        parseJsonStdout: true,
        emitChunk() {},
        commandLabel: 'node script.mjs',
      });

      assert.equal(result.ok, false);
      assert.equal(result.code, 1);
      assert.equal(result.summary, 'bad');
    });

    it('parseJson parse errors are surfaced', async () => {
      const service = createService({
        runSpawnWithCapture: async () => ({
          spawnError: null,
          exitCode: 0,
          stdout: '{invalid',
          stderr: '',
          jsonParseError: 'Unexpected token',
          parsedJson: null,
        }),
      });

      const result = await service.runQueuedSpawnCommand({
        cwd: '/repo',
        command: 'node',
        commandArgs: ['script.mjs'],
        parseJsonStdout: true,
        emitChunk() {},
        commandLabel: 'node script.mjs',
      });

      assert.equal(result.ok, false);
      assert.equal(result.code, 0);
      assert.match(result.summary, /invalid JSON/i);
    });

    it('allowNonZeroJson converts non-zero to structured failure', async () => {
      const service = createService({
        runSpawnWithCapture: async () => ({
          spawnError: null,
          exitCode: 2,
          stdout: '{"message":"failed nicely"}',
          stderr: 'stderr',
          jsonParseError: null,
          parsedJson: { message: 'failed nicely' },
        }),
      });

      const result = await service.runQueuedSpawnCommand({
        cwd: '/repo',
        command: 'node',
        commandArgs: ['script.mjs'],
        parseJsonStdout: true,
        allowNonZeroJson: true,
        emitChunk() {},
        commandLabel: 'node script.mjs',
      });

      assert.equal(result.ok, false);
      assert.equal(result.code, 2);
      assert.equal(result.summary, 'failed nicely');
      assert.equal((result.payload as any).exit_code, 2);
    });

    it('classifies missing npm script as typed payload error', async () => {
      const service = createService({
        runSpawnWithCapture: async () => ({
          spawnError: null,
          exitCode: 1,
          stdout: '',
          stderr: 'npm ERR! Missing script: "ds:missing-script"',
          jsonParseError: null,
          parsedJson: null,
        }),
      });

      const result = await service.runQueuedSpawnCommand({
        cwd: '/repo',
        command: 'npm',
        commandArgs: ['run', 'ds:missing-script'],
        emitChunk() {},
        commandLabel: 'npm run ds:missing-script',
      });

      assert.equal(result.ok, false);
      assert.equal(result.code, 1);
      assert.equal((result.payload as any).error_code, 'script.missing_npm_script');
      assert.match(String(result.summary || ''), /Missing npm script/i);
    });
  });
});
