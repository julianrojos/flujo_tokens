/**
 * Create Server Runtime Services Tests
 *
 * Tests for runtime services factory.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createServerRuntimeServices } from './create-server-runtime-services.js';

describe('create-server-runtime-services', () => {
  describe('createServerRuntimeServices()', () => {
    it('wires factories and returns runtime contract', () => {
      const calls: Record<string, unknown> = {
        queueEngine: null,
        commandExecution: null,
        queueJobFactory: null,
      };

      const queueEngineService = {
        queueJobs: new Map(),
        queueMetrics: () => ({ active: 0, pending: 0, total: 0 }),
        enqueueQueueJob: () => ({
          id: 'job_1',
          label: 'test',
          systemId: 'core',
          operationName: 'test',
          requestId: 'req_1',
          sourceEventId: null,
          inputHash: 'hash',
          status: 'queued' as const,
          createdAt: Date.now(),
          startedAt: undefined,
          finishedAt: undefined,
          execute: () => Promise.resolve({ ok: true as const })
        }),
        cancelQueueJob: () => ({ ok: true }),
        cleanupQueueJobs: () => { },
      };
      const commandExecutionService = {
        runQueuedSpawnCommand: () => Promise.resolve({ ok: true, code: 0, summary: 'test', payload: {} }),
      };
      const queueJobFactoryService = {
        queueNpmScript: () => ({ id: 'job_2' }),
        queueNodeJsonCommand: () => ({ id: 'job_3' }),
      };

      const runtime = createServerRuntimeServices({
        repoRoot: '/repo',
        env: { NODE_ENV: 'development' },
        designSystemRepository: { resolveDashboardSystemContext: () => ({ systemId: 'core', header: 'core' }) },
        maxOutputBytes: 1000,
        maxSnippetLines: 15,
        jobQueueConcurrency: 1,
        jobTimeoutMs: 100,
        jobRetentionMs: 200,
        maxRetainedEvents: 300,
        maxRetainedJobs: 400,
        nowIso: () => '2026-01-01T00:00:00.000Z',
        createQueueEngineServiceFn: (args: Record<string, unknown>) => {
          calls.queueEngine = args;
          return queueEngineService as any;
        },
        createCommandExecutionServiceFn: (args: Record<string, unknown>) => {
          calls.commandExecution = args;
          return commandExecutionService as any;
        },
        createQueueJobFactoryServiceFn: (args: Record<string, unknown>) => {
          calls.queueJobFactory = args;
          return queueJobFactoryService as any;
        },
        runSpawnWithCaptureFn: () => Promise.resolve({ ok: true, exitCode: 0, stdout: '', stderr: '', parsedJson: null, summary: 'test', jsonParseError: null, spawnError: null }),
        toQueueSummaryFromPayloadFn: () => 'summary',
        createSnippetBuilderFn: () => () => ({ targetLine: 1, startLine: 1, endLine: 1, snippet: '' }),
        createDevRuntimeCheckerFn: () => () => true,
        createSha256TextHasherFn: () => () => 'hash',
        createSystemContextResolverFn: () => () => ({ systemId: 'core', header: 'core' }),
      });

      assert.equal((calls.queueEngine as any).maxRetainedJobs, 400);
      assert.equal((calls.commandExecution as any).maxOutputBytes, 1000);

      assert.equal(runtime.queueJobs, queueEngineService.queueJobs);
      assert.equal(runtime.queueMetrics, queueEngineService.queueMetrics);
      assert.equal(runtime.runQueuedSpawnCommand, commandExecutionService.runQueuedSpawnCommand);
      assert.equal(runtime.queueNpmScript, queueJobFactoryService.queueNpmScript);
      assert.equal(runtime.queueNodeJsonCommand, queueJobFactoryService.queueNodeJsonCommand);
      assert.equal(runtime.isDevRuntime(), true);
      assert.equal(runtime.sha256Text('anything'), 'hash');
      assert.deepEqual(runtime.getSystemContext('core'), { systemId: 'core', header: 'core' });
    });
  });
});
