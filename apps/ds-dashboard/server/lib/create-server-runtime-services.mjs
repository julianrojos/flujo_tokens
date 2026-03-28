import { computeNamingDebtReportFromData } from "../services/analysis-artifacts-service.mjs";
import { createCommandExecutionService } from "../services/command-execution-service.mjs";
import { createDevRuntimeChecker, createSha256TextHasher, createSystemContextResolver } from "./create-server-runtime-utils.mjs";
import { createOperationHistoryService } from "../services/operation-history-service.mjs";
import { createQueueEngineService } from "../services/queue-engine-service.mjs";
import { createQueueJobFactoryService } from "../services/queue-job-factory-service.mjs";
import { createSnippetBuilder } from "./request-file-helpers.ts";
import { runSpawnWithCapture } from "./spawn-runner.mjs";
import { toQueueSummaryFromPayload } from "./queue-utils.ts";

export function createServerRuntimeServices(config) {
  const {
    repoRoot,
    env,
    designSystemRepository,
    maxOutputBytes,
    maxSnippetLines,
    jobQueueConcurrency,
    jobTimeoutMs,
    jobRetentionMs,
    maxRetainedEvents,
    maxRetainedJobs,
    opsLogMaxFileBytes,
    opsLogRetentionDays,
    opsHistoryMaxLimit,
    opsLogFileRegex,
    replayableNpmScripts,
    supportedReplayOperations,
    tokenRepo,
    normalizeSystemId,
    writeStructuredLog,
    nowIso,
    createOperationEventId,
    createOperationHistoryServiceFn = createOperationHistoryService,
    createQueueEngineServiceFn = createQueueEngineService,
    createCommandExecutionServiceFn = createCommandExecutionService,
    createQueueJobFactoryServiceFn = createQueueJobFactoryService,
    runSpawnWithCaptureFn = runSpawnWithCapture,
    toQueueSummaryFromPayloadFn = toQueueSummaryFromPayload,
    createSnippetBuilderFn = createSnippetBuilder,
    computeNamingDebtReportFromDataFn = computeNamingDebtReportFromData,
    createDevRuntimeCheckerFn = createDevRuntimeChecker,
    createSha256TextHasherFn = createSha256TextHasher,
    createSystemContextResolverFn = createSystemContextResolver,
  } = config;

  const operationHistoryService = createOperationHistoryServiceFn({
    repoRoot,
    designSystemRepository,
    normalizeSystemId,
    writeStructuredLog,
    nowIso,
    createOperationEventId,
    opsLogMaxFileBytes,
    opsLogRetentionDays,
    opsHistoryMaxLimit,
    opsLogFileRegex,
  });

  const {
    appendOperationEventSafe,
    toFiniteTimestamp,
    readOperationHistory,
    findOperationEventById,
    buildOperationRegressionsReport,
  } = operationHistoryService;

  const queueEngine = createQueueEngineServiceFn({
    jobQueueConcurrency,
    jobTimeoutMs,
    jobRetentionMs,
    maxRetainedEvents,
    maxRetainedJobs,
    nowIso,
    onOperationEvent: appendOperationEventSafe,
  });

  const { queueJobs, queueMetrics, enqueueQueueJob, cancelQueueJob } = queueEngine;

  const commandExecutionService = createCommandExecutionServiceFn({
    runSpawnWithCapture: runSpawnWithCaptureFn,
    maxOutputBytes,
    summarizePayloadFailure: toQueueSummaryFromPayloadFn,
  });

  const { runQueuedSpawnCommand } = commandExecutionService;
  const buildSnippet = createSnippetBuilderFn(maxSnippetLines);

  const isDevRuntime = createDevRuntimeCheckerFn(env);
  const sha256Text = createSha256TextHasherFn();
  const getSystemContext = createSystemContextResolverFn(designSystemRepository);

  const queueJobFactory = createQueueJobFactoryServiceFn({
    getSystemContext,
    enqueueQueueJob,
    runQueuedSpawnCommand,
    sha256Text,
    computeNamingDebtReportFromData: computeNamingDebtReportFromDataFn,
    tokenRepo,
    replayableNpmScripts,
    supportedReplayOperations,
  });

  const {
    queueNpmScript,
    queueNodeJsonCommand,
    enqueueRefreshNamingDebtJob,
    enqueueReplayJobFromOperation,
  } = queueJobFactory;

  return {
    toFiniteTimestamp,
    readOperationHistory,
    findOperationEventById,
    buildOperationRegressionsReport,
    queueJobs,
    queueMetrics,
    enqueueQueueJob,
    cancelQueueJob,
    runQueuedSpawnCommand,
    buildSnippet,
    isDevRuntime,
    sha256Text,
    getSystemContext,
    queueNpmScript,
    queueNodeJsonCommand,
    enqueueRefreshNamingDebtJob,
    enqueueReplayJobFromOperation,
  };
}
