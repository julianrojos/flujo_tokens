import assert from "node:assert/strict";
import test from "node:test";

import { createServerRuntimeServices } from "./create-server-runtime-services.mjs";

test("create-server-runtime-services: wires factories and returns runtime contract", () => {
  const calls = {
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
    enqueueQueueJob: () => ({ id: "job_1" }),
    cancelQueueJob: () => ({ ok: true }),
  };
  const commandExecutionService = {
    runQueuedSpawnCommand: () => Promise.resolve({ ok: true }),
  };
  const queueJobFactoryService = {
    queueNpmScript: () => ({ id: "job_2" }),
    queueNodeJsonCommand: () => ({ id: "job_3" }),
    enqueueRefreshNamingDebtJob: () => ({ id: "job_4" }),
    enqueueReplayJobFromOperation: () => ({ id: "job_5" }),
  };

  const runtime = createServerRuntimeServices({
    repoRoot: "/repo",
    env: { NODE_ENV: "development" },
    designSystemRepository: { resolveDashboardSystemContext: () => ({ systemId: "core" }) },
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
    replayableNpmScripts: new Set(["ds:registry:refresh"]),
    supportedReplayOperations: new Set(["refresh:naming-debt"]),
    normalizeSystemId: (value) => String(value || ""),
    writeStructuredLog: () => {},
    nowIso: () => "2026-01-01T00:00:00.000Z",
    createOperationEventId: () => "op_1",
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
    toQueueSummaryFromPayloadFn: () => "summary",
    createSnippetBuilderFn: () => () => ({ startLine: 1 }),
    computeNamingDebtReportFn: async () => ({}),
    createDevRuntimeCheckerFn: () => () => true,
    createSha256TextHasherFn: () => () => "hash",
    createSystemContextResolverFn: () => () => ({ systemId: "core" }),
  });

  assert.equal(calls.operationHistory.repoRoot, "/repo");
  assert.equal(calls.operationHistory.opsLogMaxFileBytes, 500);
  assert.equal(calls.queueEngine.maxRetainedJobs, 400);
  assert.equal(typeof calls.queueEngine.onOperationEvent, "function");
  assert.equal(calls.commandExecution.maxOutputBytes, 1000);
  assert.equal(calls.queueJobFactory.replayableNpmScripts.has("ds:registry:refresh"), true);

  assert.equal(runtime.queueJobs, queueEngineService.queueJobs);
  assert.equal(runtime.queueMetrics, queueEngineService.queueMetrics);
  assert.equal(runtime.runQueuedSpawnCommand, commandExecutionService.runQueuedSpawnCommand);
  assert.equal(runtime.queueNpmScript, queueJobFactoryService.queueNpmScript);
  assert.equal(runtime.queueNodeJsonCommand, queueJobFactoryService.queueNodeJsonCommand);
  assert.equal(runtime.enqueueRefreshNamingDebtJob, queueJobFactoryService.enqueueRefreshNamingDebtJob);
  assert.equal(runtime.enqueueReplayJobFromOperation, queueJobFactoryService.enqueueReplayJobFromOperation);
  assert.equal(runtime.isDevRuntime(), true);
  assert.equal(runtime.sha256Text("anything"), "hash");
  assert.deepEqual(runtime.getSystemContext("core"), { systemId: "core" });
});
