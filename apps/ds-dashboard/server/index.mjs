import fsSync from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

import { Hono } from "hono";
import { serve } from "@hono/node-server";
import {
  createDesignSystemRepository,
  ensureRelativeDir,
  normalizeCollectionList,
  normalizeFigmaApiTokenRef,
  normalizeSystemId,
  resolveSafeSystemPathsForDeletion,
  summarizeDesignSystemsConfig,
} from "./system-repository.ts";
import { registerAllRoutes } from "./routes/register-all-routes.mjs";
import {
  computeNamingDebtReport,
  validateGitRef,
} from "./lib/analysis-artifacts-service.mjs";
import { runSpawnWithCapture } from "./lib/spawn-runner.mjs";
import {
  isQueueJobFinalStatus,
  listQueueJobEvents,
  queueJobAcceptedPayload,
  queueJobSnapshot,
  toQueueSummaryFromPayload,
  toQueueTerminalEvent,
} from "./lib/queue-utils.mjs";
import { createOperationHistoryService } from "./lib/operation-history-service.mjs";
import { createQueueEngineService } from "./lib/queue-engine-service.mjs";
import { createCommandExecutionService } from "./lib/command-execution-service.mjs";
import { createQueueJobFactoryService } from "./lib/queue-job-factory-service.mjs";
import {
  buildApiErrorPayload,
  createApiRequestId,
  createFailJson,
  createHealthPayloadBuilder,
  createOperationEventId,
  nowIso,
  writeStructuredLog,
} from "./lib/api-response-service.mjs";
import { createServerConfig } from "./lib/server-config.mjs";
import {
  createSnippetBuilder,
  findLineForQuery,
  guessContentType,
  readJsonBody,
  readTextFileLimited,
  resolveRepoFilePath,
  toBooleanString,
  toNumberString,
} from "./lib/request-file-helpers.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../..");
const designSystemRepository = createDesignSystemRepository({ repoRoot, watch: true });
let designSystemRepositoryDisposed = false;

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
} = createServerConfig(process.env);

function disposeDesignSystemRepository() {
  if (designSystemRepositoryDisposed) return;
  designSystemRepositoryDisposed = true;
  designSystemRepository.dispose();
}

function handleProcessShutdown(signal) {
  disposeDesignSystemRepository();
  // eslint-disable-next-line no-console
  console.log(`[ds-dashboard-api] received ${signal}, shutting down`);
  process.exit(0);
}

process.once("SIGINT", () => handleProcessShutdown("SIGINT"));
process.once("SIGTERM", () => handleProcessShutdown("SIGTERM"));

const operationHistoryService = createOperationHistoryService({
  repoRoot,
  designSystemRepository,
  normalizeSystemId,
  writeStructuredLog,
  nowIso,
  createOperationEventId,
  opsLogMaxFileBytes: OPS_LOG_MAX_FILE_BYTES,
  opsLogRetentionDays: OPS_LOG_RETENTION_DAYS,
  opsHistoryMaxLimit: OPS_HISTORY_MAX_LIMIT,
  opsLogFileRegex: OPS_LOG_FILE_RE,
});

const {
  appendOperationEventSafe,
  toFiniteTimestamp,
  readOperationHistory,
  findOperationEventById,
  buildOperationRegressionsReport,
} = operationHistoryService;

const queueEngine = createQueueEngineService({
  jobQueueConcurrency: JOB_QUEUE_CONCURRENCY,
  jobTimeoutMs: JOB_TIMEOUT_MS,
  jobRetentionMs: JOB_RETENTION_MS,
  maxRetainedEvents: MAX_RETAINED_EVENTS,
  maxRetainedJobs: MAX_RETAINED_JOBS,
  nowIso,
  onOperationEvent: appendOperationEventSafe,
});

const { queueJobs, queueMetrics, enqueueQueueJob, cancelQueueJob } = queueEngine;

const commandExecutionService = createCommandExecutionService({
  runSpawnWithCapture,
  maxOutputBytes: MAX_OUTPUT_BYTES,
  summarizePayloadFailure: toQueueSummaryFromPayload,
});

const { runQueuedSpawnCommand } = commandExecutionService;

const buildSnippet = createSnippetBuilder(MAX_SNIPPET_LINES);

function isDevRuntime() {
  return process.env.NODE_ENV === "development";
}

function sha256Text(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function getSystemContext(systemHeader) {
  return designSystemRepository.resolveDashboardSystemContext(systemHeader);
}

const queueJobFactory = createQueueJobFactoryService({
  getSystemContext,
  enqueueQueueJob,
  runQueuedSpawnCommand,
  sha256Text,
  computeNamingDebtReport,
  replayableNpmScripts: REPLAYABLE_NPM_SCRIPTS,
  supportedReplayOperations: SUPPORTED_REPLAY_OPERATIONS,
});

const {
  queueNpmScript,
  queueNodeJsonCommand,
  enqueueRefreshNamingDebtJob,
  enqueueReplayJobFromOperation,
} = queueJobFactory;

const app = new Hono();
const failJson = createFailJson({
  createRequestId: createApiRequestId,
  buildApiErrorPayloadFn: buildApiErrorPayload,
  writeStructuredLogFn: writeStructuredLog,
});

const buildHealthPayload = createHealthPayloadBuilder({
  queueMetrics,
  nowIsoFn: nowIso,
});

registerAllRoutes(app, {
  buildHealthPayload,
  failJson,
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
});

app.onError((error, c) => {
  const requestId = createApiRequestId();
  const message = error instanceof Error ? error.message : String(error);
  writeStructuredLog("error", {
    event: "api.unhandled_error",
    requestId,
    code: "internal.unexpected_error",
    path: c.req.path,
    method: c.req.method,
    error: {
      name: error instanceof Error ? error.name : "UnknownError",
      message,
      stack: error instanceof Error ? error.stack : undefined,
    },
  });
  return failJson(c, 500, {
    code: "internal.unexpected_error",
    userMessage: message || "Unexpected server error.",
    recoverable: true,
    requestId,
    context: {
      path: c.req.path,
      method: c.req.method,
    },
    suppressLog: true,
  });
});

serve(
  {
    fetch: app.fetch,
    port: PORT,
  },
  (info) => {
    // eslint-disable-next-line no-console
    console.log(`[ds-dashboard-api] listening on http://localhost:${info.port}`);
  },
);
