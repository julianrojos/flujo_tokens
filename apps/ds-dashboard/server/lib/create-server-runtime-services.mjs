import { createCommandExecutionService } from "../services/command-execution-service.mjs";
import { createDevRuntimeChecker, createSha256TextHasher, createSystemContextResolver } from "./create-server-runtime-utils.mjs";
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
    tokenRepo,
    nowIso,
    createQueueEngineServiceFn = createQueueEngineService,
    createCommandExecutionServiceFn = createCommandExecutionService,
    createQueueJobFactoryServiceFn = createQueueJobFactoryService,
    runSpawnWithCaptureFn = runSpawnWithCapture,
    toQueueSummaryFromPayloadFn = toQueueSummaryFromPayload,
    createSnippetBuilderFn = createSnippetBuilder,
    createDevRuntimeCheckerFn = createDevRuntimeChecker,
    createSha256TextHasherFn = createSha256TextHasher,
    createSystemContextResolverFn = createSystemContextResolver,
  } = config;

  const queueEngine = createQueueEngineServiceFn({
    // Intentionally omit `onOperationEvent`: operations NDJSON history/replay was removed.
    // Queue processing remains active via in-memory events exposed by queue endpoints.
    jobQueueConcurrency,
    jobTimeoutMs,
    jobRetentionMs,
    maxRetainedEvents,
    maxRetainedJobs,
    nowIso,
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
    tokenRepo,
  });

  const {
    queueNpmScript,
    queueNodeJsonCommand,
  } = queueJobFactory;

  return {
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
  };
}
