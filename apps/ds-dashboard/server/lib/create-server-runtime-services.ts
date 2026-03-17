/**
 * Create Server Runtime Services
 *
 * Creates and wires runtime services for the server.
 * Migrated from apps/ds-dashboard/server/lib/create-server-runtime-services.mjs
 */

import { computeNamingDebtReport } from '../services/analysis-artifacts-service.mjs';
import { createCommandExecutionService } from '../services/command-execution-service.mjs';
import { createOperationHistoryService } from '../services/operation-history-service.mjs';
import { createQueueEngineService } from '../services/queue-engine-service.mjs';
import { createQueueJobFactoryService } from '../services/queue-job-factory-service.mjs';
import { createSnippetBuilder, type SnippetResult } from './request-file-helpers.ts';
import { runSpawnWithCapture } from './spawn-runner.mjs';
import { toQueueSummaryFromPayload } from './queue-utils.ts';

// @ts-ignore - Missing declaration files
import { computeNamingDebtReport as computeNamingDebtReportAny } from '../services/analysis-artifacts-service.mjs';
// @ts-ignore - Missing declaration files
import { createCommandExecutionService as createCommandExecutionServiceAny } from '../services/command-execution-service.mjs';
// @ts-ignore - Missing declaration files
import { createOperationHistoryService as createOperationHistoryServiceAny } from '../services/operation-history-service.mjs';
// @ts-ignore - Missing declaration files
import { createQueueEngineService as createQueueEngineServiceAny } from '../services/queue-engine-service.mjs';
// @ts-ignore - Missing declaration files
import { createQueueJobFactoryService as createQueueJobFactoryServiceAny } from '../services/queue-job-factory-service.mjs';
// @ts-ignore - Missing declaration files
import { runSpawnWithCapture as runSpawnWithCaptureAny } from './spawn-runner.mjs';
import {
  createDevRuntimeChecker,
  createSha256TextHasher,
  createSystemContextResolver,
  type Env,
  type DesignSystemRepository,
} from './create-server-runtime-utils.ts';

export interface CreateServerRuntimeServicesConfig {
  repoRoot: string;
  env: Env;
  designSystemRepository: DesignSystemRepository;
  maxOutputBytes: number;
  maxSnippetLines: number;
  jobQueueConcurrency: number;
  jobTimeoutMs: number;
  jobRetentionMs: number;
  maxRetainedEvents: number;
  maxRetainedJobs: number;
  opsLogMaxFileBytes: number;
  opsLogRetentionDays: number;
  opsHistoryMaxLimit: number;
  opsLogFileRegex: RegExp;
  replayableNpmScripts: Set<string>;
  supportedReplayOperations: Set<string>;
  normalizeSystemId: (value: string) => string;
  writeStructuredLog: (level: string, payload: Record<string, unknown>) => void;
  nowIso: () => string;
  createOperationEventId: () => string;
  createOperationHistoryServiceFn?: typeof createOperationHistoryService;
  createQueueEngineServiceFn?: typeof createQueueEngineService;
  createCommandExecutionServiceFn?: typeof createCommandExecutionService;
  createQueueJobFactoryServiceFn?: typeof createQueueJobFactoryService;
  runSpawnWithCaptureFn?: typeof runSpawnWithCapture;
  toQueueSummaryFromPayloadFn?: typeof toQueueSummaryFromPayload;
  createSnippetBuilderFn?: typeof createSnippetBuilder;
  computeNamingDebtReportFn?: typeof computeNamingDebtReport;
  createDevRuntimeCheckerFn?: typeof createDevRuntimeChecker;
  createSha256TextHasherFn?: typeof createSha256TextHasher;
  createSystemContextResolverFn?: typeof createSystemContextResolver;
}

export interface CreateServerRuntimeServices {
  toFiniteTimestamp: (...args: unknown[]) => number;
  readOperationHistory: (...args: unknown[]) => unknown;
  findOperationEventById: (...args: unknown[]) => unknown;
  buildOperationRegressionsReport: (...args: unknown[]) => unknown;
  queueJobs: Map<string, unknown>;
  queueMetrics: () => Record<string, number>;
  enqueueQueueJob: (...args: unknown[]) => { id: string };
  cancelQueueJob: (...args: unknown[]) => { ok: boolean };
  runQueuedSpawnCommand: (...args: unknown[]) => Promise<{ ok: boolean }>;
  buildSnippet: (content: string, line: number, before: number, after: number) => SnippetResult;
  isDevRuntime: () => boolean;
  sha256Text: (value: string) => string;
  getSystemContext: (systemHeader: string) => { systemId: string; header: string };
  queueNpmScript: (...args: unknown[]) => { id: string };
  queueNodeJsonCommand: (...args: unknown[]) => { id: string };
  enqueueRefreshNamingDebtJob: (...args: unknown[]) => { id: string };
  enqueueReplayJobFromOperation: (...args: unknown[]) => { id: string };
}

/**
 * Create and wire runtime services.
 */
export function createServerRuntimeServices(config: CreateServerRuntimeServicesConfig): CreateServerRuntimeServices {
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
    computeNamingDebtReportFn = computeNamingDebtReport,
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
    computeNamingDebtReport: computeNamingDebtReportFn,
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
