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
        operationHistory: null,
        queueEngine: null,
        commandExecution: null,
        queueJobFactory: null,
      };

      const operationHistoryService = {
        appendOperationEventSafe: () => {},
        toFiniteTimestamp: () => 0,
        readOperationHistory: () => [],
        findOperationEventById: () => null,
        buildOperationRegressionsReport: () => ({ items: [] }),
      };
      const queueEngineService = {
        queueJobs: new Map(),
        queueMetrics: () => ({ active: 0 }),
        enqueueQueueJob: () => ({ id: 'job_1' }),
        cancelQueueJob: () => ({ ok: true }),
      };
      const commandExecutionService = {
        runQueuedSpawnCommand: () => Promise.resolve({ ok: true }),
      };
      const queueJobFactoryService = {
        queueNpmScript: () => ({ id: 'job_2' }),
        queueNodeJsonCommand: () => ({ id: 'job_3' }),
        enqueueRefreshNamingDebtJob: () => ({ id: 'job_4' }),
        enqueueReplayJobFromOperation: () => ({ id: 'job_5' }),
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
        opsLogMaxFileBytes: 500,
        opsLogRetentionDays: 30,
        opsHistoryMaxLimit: 500,
        opsLogFileRegex: /ops/,
        replayableNpmScripts: new Set(['ds:registry:refresh']),
        supportedReplayOperations: new Set(['refresh:naming-debt']),
        normalizeSystemId: (value: string) => String(value || ''),
        writeStructuredLog: () => {},
        nowIso: () => '2026-01-01T00:00:00.000Z',
        createOperationEventId: () => 'op_1',
        createOperationHistoryServiceFn(args) {
          calls.operationHistory = args;
          return operationHistoryService;
        },
        createQueueEngineServiceFn(args) {
          calls.queueEngine = args;
          return queueEngineService;
        },
        createCommandExecutionServiceFn(args) {
          calls.commandExecution = args;
          return commandExecutionService;
        },
        createQueueJobFactoryServiceFn(args) {
          calls.queueJobFactory = args;
          return queueJobFactoryService;
        },
        runSpawnWithCaptureFn: () => Promise.resolve({ ok: true }),
        toQueueSummaryFromPayloadFn: () => 'summary',
        createSnippetBuilderFn: () => () => ({ targetLine: 1, startLine: 1, endLine: 1, snippet: '' }),
        computeNamingDebtReportFn: async () => ({}),
        createDevRuntimeCheckerFn: () => () => true,
        createSha256TextHasherFn: () => () => 'hash',
        createSystemContextResolverFn: () => () => ({ systemId: 'core', header: 'core' }),
      });

      assert.equal((calls.operationHistory as any).repoRoot, '/repo');
      assert.equal((calls.operationHistory as any).opsLogMaxFileBytes, 500);
      assert.equal((calls.queueEngine as any).maxRetainedJobs, 400);
      assert.equal(typeof (calls.queueEngine as any).onOperationEvent, 'function');
      assert.equal((calls.commandExecution as any).maxOutputBytes, 1000);
      assert.equal((calls.queueJobFactory as any).replayableNpmScripts.has('ds:registry:refresh'), true);

      assert.equal(runtime.queueJobs, queueEngineService.queueJobs);
      assert.equal(runtime.queueMetrics, queueEngineService.queueMetrics);
      assert.equal(runtime.runQueuedSpawnCommand, commandExecutionService.runQueuedSpawnCommand);
      assert.equal(runtime.queueNpmScript, queueJobFactoryService.queueNpmScript);
      assert.equal(runtime.queueNodeJsonCommand, queueJobFactoryService.queueNodeJsonCommand);
      assert.equal(runtime.enqueueRefreshNamingDebtJob, queueJobFactoryService.enqueueRefreshNamingDebtJob);
      assert.equal(runtime.enqueueReplayJobFromOperation, queueJobFactoryService.enqueueReplayJobFromOperation);
      assert.equal(runtime.isDevRuntime(), true);
      assert.equal(runtime.sha256Text('anything'), 'hash');
      assert.deepEqual(runtime.getSystemContext('core'), { systemId: 'core', header: 'core' });
    });
  });
});
