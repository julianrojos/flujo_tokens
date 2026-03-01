import fsSync from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createDesignSystemRepository,
  ensureRelativeDir,
  normalizeCollectionList,
  normalizeFigmaApiTokenRef,
  normalizeSystemId,
  resolveSafeSystemPathsForDeletion,
  summarizeDesignSystemsConfig,
} from "./system-repository.ts";
import {
  computeNamingDebtReport,
  validateGitRef,
} from "./lib/analysis-artifacts-service.mjs";
import {
  isQueueJobFinalStatus,
  listQueueJobEvents,
  queueJobAcceptedPayload,
  queueJobSnapshot,
  toQueueTerminalEvent,
} from "./lib/queue-utils.ts";
import { buildCreateServerAppRouteDeps } from "./lib/create-server-app-route-deps.mjs";
import { createServerHttpApp } from "./lib/create-server-http-app.mjs";
import { createServerRuntimeServices } from "./lib/create-server-runtime-services.mjs";
import {
  buildApiErrorPayload,
  createApiRequestId,
  createOperationEventId,
  nowIso,
  writeStructuredLog,
} from "./lib/api-response-service.ts";
import { createServerConfig } from "./lib/server-config.ts";
import {
  findLineForQuery,
  guessContentType,
  readJsonBody,
  readTextFileLimited,
  resolveRepoFilePath,
  toBooleanString,
  toNumberString,
} from "./lib/request-file-helpers.ts";

function defaultRepoRoot() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  return path.resolve(__dirname, "../../..");
}

export function createServerApp({
  env = process.env,
  repoRoot = defaultRepoRoot(),
  watch = true,
} = {}) {
  const designSystemRepository = createDesignSystemRepository({ repoRoot, watch });
  let designSystemRepositoryDisposed = false;

  function disposeDesignSystemRepository() {
    if (designSystemRepositoryDisposed) return;
    designSystemRepositoryDisposed = true;
    designSystemRepository.dispose();
  }

  const {
    PORT,
    MAX_OUTPUT_BYTES,
    MAX_FILE_BYTES,
    MAX_SNIPPET_LINES,
    JOB_QUEUE_CONCURRENCY,
    JOB_TIMEOUT_MS,
    JOB_RETENTION_MS,
    MAX_RETAINED_EVENTS,
    MAX_RETAINED_JOBS,
    OPS_LOG_MAX_FILE_BYTES,
    OPS_LOG_RETENTION_DAYS,
    OPS_HISTORY_DEFAULT_LIMIT,
    OPS_HISTORY_MAX_LIMIT,
    OPS_REGRESSION_DEFAULT_LIMIT,
    OPS_REGRESSION_MAX_LIMIT,
    OPS_REGRESSION_DEFAULT_MIN_SAMPLES,
    OPS_LOG_FILE_RE,
    REPLAYABLE_NPM_SCRIPTS,
    SUPPORTED_REPLAY_OPERATIONS,
  } = createServerConfig(env);

  const {
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
  } = createServerRuntimeServices({
    repoRoot,
    env,
    designSystemRepository,
    maxOutputBytes: MAX_OUTPUT_BYTES,
    maxSnippetLines: MAX_SNIPPET_LINES,
    jobQueueConcurrency: JOB_QUEUE_CONCURRENCY,
    jobTimeoutMs: JOB_TIMEOUT_MS,
    jobRetentionMs: JOB_RETENTION_MS,
    maxRetainedEvents: MAX_RETAINED_EVENTS,
    maxRetainedJobs: MAX_RETAINED_JOBS,
    opsLogMaxFileBytes: OPS_LOG_MAX_FILE_BYTES,
    opsLogRetentionDays: OPS_LOG_RETENTION_DAYS,
    opsHistoryMaxLimit: OPS_HISTORY_MAX_LIMIT,
    opsLogFileRegex: OPS_LOG_FILE_RE,
    replayableNpmScripts: REPLAYABLE_NPM_SCRIPTS,
    supportedReplayOperations: SUPPORTED_REPLAY_OPERATIONS,
    normalizeSystemId,
    writeStructuredLog,
    nowIso,
    createOperationEventId,
    computeNamingDebtReportFn: computeNamingDebtReport,
  });

  const { app } = createServerHttpApp({
    queueMetrics,
    nowIso,
    createApiRequestId,
    buildApiErrorPayload,
    writeStructuredLog,
    routeDeps: buildCreateServerAppRouteDeps({
      readJsonBody,
      designSystemRepository,
      normalizeSystemId,
      ensureRelativeDir,
      normalizeFigmaApiTokenRef,
      normalizeCollectionList,
      summarizeDesignSystemsConfig,
      resolveSafeSystemPathsForDeletion,
      repoRoot,
      fsSync,
      toFiniteTimestamp,
      OPS_HISTORY_MAX_LIMIT,
      OPS_HISTORY_DEFAULT_LIMIT,
      OPS_REGRESSION_MAX_LIMIT,
      OPS_REGRESSION_DEFAULT_LIMIT,
      OPS_REGRESSION_DEFAULT_MIN_SAMPLES,
      readOperationHistory,
      buildOperationRegressionsReport,
      createApiRequestId,
      findOperationEventById,
      enqueueReplayJobFromOperation,
      queueJobAcceptedPayload,
      getSystemContext,
      isDevRuntime,
      resolveRepoFilePath,
      sha256Text,
      readTextFileLimited,
      findLineForQuery,
      buildSnippet,
      guessContentType,
      MAX_FILE_BYTES,
      queueJobs,
      listQueueJobEvents,
      queueJobSnapshot,
      isQueueJobFinalStatus,
      cancelQueueJob,
      toQueueTerminalEvent,
      buildApiErrorPayload,
      MAX_RETAINED_EVENTS,
      enqueueQueueJob,
      runQueuedSpawnCommand,
      queueNpmScript,
      enqueueRefreshNamingDebtJob,
      queueNodeJsonCommand,
      toBooleanString,
      toNumberString,
      validateGitRef,
    }),
  });

  return {
    app,
    port: PORT,
    repoRoot,
    disposeDesignSystemRepository,
  };
}
