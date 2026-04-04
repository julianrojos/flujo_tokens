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
    // Interfaces mock tipadas para mejor type safety
    interface MockOperationHistoryServiceParams {
      getSystemContext: () => any;
      opsLogRetentionDays: number;
      opsHistoryMaxLimit: number;
      opsLogFileRegex: RegExp;
      normalizeSystemId: (value: string) => string;
      writeStructuredLog: (level: string, payload: any) => void;
      nowIso: () => string;
      createOperationEventId: () => string;
    }

    interface MockQueueEngineParams {
      getSystemContext: () => any;
      enqueueQueueJob: (...args: any[]) => any;
      runQueuedSpawnCommand: (...args: any[]) => any;
      sha256Text: (...args: any[]) => any;
      nowIso: () => string;
      createOperationEventId: () => string;
    }

    interface MockCommandExecutionServiceParams {
      getSystemContext: () => any;
      runQueuedSpawnCommand: (...args: any[]) => any;
      writeStructuredLog: (level: string, payload: any) => void;
      nowIso: () => string;
      createOperationEventId: () => string;
    }

    interface MockQueueJobFactoryServiceParams {
      getSystemContext: () => any;
      replayableNpmScripts: Set<string>;
      supportedReplayOperations: Set<string>;
      sha256Text: (...args: any[]) => any;
      nowIso: () => string;
      createOperationEventId: () => string;
    }

    it('wires factories and returns runtime contract', () => {
      const calls: Record<string, unknown> = {
        operationHistory: null,
        queueEngine: null,
        commandExecution: null,
        queueJobFactory: null,
      };

      const operationHistoryService = {
        appendOperationEventSafe: () => { },
        toFiniteTimestamp: () => 0,
        readOperationHistory: () => ({ events: [], scannedRows: 0, scannedFiles: 0 }),
        findOperationEventById: () => ({ event: null, scannedRows: 0, scannedFiles: 0 }),
        buildOperationRegressionsReport: () => ({ items: [], generatedAt: new Date().toISOString(), regressions: [], summary: { totalOperations: 0, healthyOperations: 0, unhealthyOperations: 0, systems: [] } }),
      };
      const queueEngineService = {
        queueJobs: new Map(),
        queueMetrics: () => ({ active: 0, pending: 0, total: 0 }),
        // Mock completo de QueueJob interface (R-007)
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
        enqueueReplayJobFromOperation: () => ({ id: 'job_4' }),
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
        supportedReplayOperations: new Set(['script:ds-health-snapshot.mjs']),
        normalizeSystemId: (value: string) => String(value || ''),
        writeStructuredLog: () => { },
        nowIso: () => '2026-01-01T00:00:00.000Z',
        createOperationEventId: () => 'op_1',
        // Tipos explícitos para parámetros de factory functions (R-008)
        createOperationHistoryServiceFn: (args: MockOperationHistoryServiceParams) => {
          calls.operationHistory = args;
          return operationHistoryService as any;
        },
        createQueueEngineServiceFn: (args: MockQueueEngineParams) => {
          calls.queueEngine = args;
          return queueEngineService as any;
        },
        createCommandExecutionServiceFn: (args: MockCommandExecutionServiceParams) => {
          calls.commandExecution = args;
          return commandExecutionService as any;
        },
        createQueueJobFactoryServiceFn: (args: MockQueueJobFactoryServiceParams) => {
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
      assert.equal(runtime.enqueueReplayJobFromOperation, queueJobFactoryService.enqueueReplayJobFromOperation);
      assert.equal(runtime.isDevRuntime(), true);
      assert.equal(runtime.sha256Text('anything'), 'hash');
      assert.deepEqual(runtime.getSystemContext('core'), { systemId: 'core', header: 'core' });
    });
  });
});
