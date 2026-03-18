/**
 * Create Server Runtime Services
 *
 * Creates and wires runtime services for the server.
 * Migrated from apps/ds-dashboard/server/lib/create-server-runtime-services.mjs
 */

// @ts-ignore
import { createCommandExecutionService } from '../services/command-execution-service.mjs';
// @ts-ignore
import { computeNamingDebtReport, validateGitRef } from '../services/analysis-artifacts-service.mjs';
// @ts-ignore
import { createOperationHistoryService } from '../services/operation-history-service.mjs';
// @ts-ignore
import { createQueueEngineService } from '../services/queue-engine-service.mjs';
// @ts-ignore
import { createQueueJobFactoryService } from '../services/queue-job-factory-service.mjs';
import { createSnippetBuilder, type SnippetResult } from './request-file-helpers.ts';
// @ts-ignore
import { runSpawnWithCapture } from './spawn-runner.mjs';
import { toQueueSummaryFromPayload } from './queue-utils.ts';
import {
  createDevRuntimeChecker,
  createSha256TextHasher,
  createSystemContextResolver,
  type Env,
  type DesignSystemRepository,
} from './create-server-runtime-utils.ts';

type UnknownRecord = Record<string, unknown>;

interface BaseOperationHistoryService {
  appendOperationEventSafe: (...args: unknown[]) => void;
  toFiniteTimestamp: (...args: unknown[]) => number;
  readOperationHistory: (...args: unknown[]) => unknown;
  findOperationEventById: (...args: unknown[]) => unknown;
  buildOperationRegressionsReport: (...args: unknown[]) => unknown;
}

interface BaseQueueEngine {
  queueJobs: Map<string, unknown>;
  queueMetrics: () => Record<string, number>;
  cancelQueueJob: (...args: unknown[]) => { ok: boolean };
  enqueueQueueJob: (...args: unknown[]) => { id: string };
}

interface BaseCommandExecutionService {
  runQueuedSpawnCommand: (...args: unknown[]) => Promise<{ ok: boolean }>;
}

interface BaseQueueJobFactory {
  queueNpmScript: (...args: unknown[]) => { id: string };
  queueNodeJsonCommand: (...args: unknown[]) => { id: string };
  enqueueRefreshNamingDebtJob: (...args: unknown[]) => { id: string };
  enqueueReplayJobFromOperation: (...args: unknown[]) => { id: string };
}

function assertRecord(value: unknown, label: string): asserts value is UnknownRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid ${label}: expected object`);
  }
}

function getMethod(value: unknown, label: string, methodName: string): (...args: unknown[]) => unknown {
  assertRecord(value, label);
  const method = value[methodName];
  if (typeof method !== 'function') {
    throw new Error(`Invalid ${label}: missing method ${methodName}()`);
  }
  return method as (...args: unknown[]) => unknown;
}

function getMap(value: unknown, label: string, propertyName: string): Map<string, unknown> {
  assertRecord(value, label);
  const candidate = value[propertyName];
  if (!(candidate instanceof Map)) {
    throw new Error(`Invalid ${label}: ${propertyName} must be a Map`);
  }
  return candidate as Map<string, unknown>;
}

function assertResultWithBooleanOk(value: unknown, label: string): { ok: boolean } {
  assertRecord(value, label);
  if (typeof value.ok !== 'boolean') {
    throw new Error(`Invalid ${label}: expected { ok: boolean }`);
  }
  return { ok: value.ok };
}

function assertResultWithId(value: unknown, label: string): { id: string } {
  assertRecord(value, label);
  if (typeof value.id !== 'string' || value.id.length === 0) {
    throw new Error(`Invalid ${label}: expected { id: string }`);
  }
  return { id: value.id };
}

function assertMetrics(value: unknown, label: string): Record<string, number> {
  assertRecord(value, label);
  const metrics: Record<string, number> = {};
  for (const [key, metricValue] of Object.entries(value)) {
    if (typeof metricValue !== 'number' || !Number.isFinite(metricValue)) {
      throw new Error(`Invalid ${label}: metric "${key}" must be a finite number`);
    }
    metrics[key] = metricValue;
  }
  return metrics;
}

const adaptOperationHistoryService = (service: unknown): BaseOperationHistoryService => {
  const appendOperationEventSafeRaw = getMethod(service, 'operationHistoryService', 'appendOperationEventSafe');
  const toFiniteTimestampRaw = getMethod(service, 'operationHistoryService', 'toFiniteTimestamp');
  const readOperationHistoryRaw = getMethod(service, 'operationHistoryService', 'readOperationHistory');
  const findOperationEventByIdRaw = getMethod(service, 'operationHistoryService', 'findOperationEventById');
  const buildOperationRegressionsReportRaw = getMethod(service, 'operationHistoryService', 'buildOperationRegressionsReport');

  return {
    appendOperationEventSafe: (...args) => {
      appendOperationEventSafeRaw(...args);
    },
    toFiniteTimestamp: (...args) => {
      const value = toFiniteTimestampRaw(...args);
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error('Invalid operationHistoryService.toFiniteTimestamp(): expected finite number');
      }
      return value;
    },
    readOperationHistory: (...args) => readOperationHistoryRaw(...args),
    findOperationEventById: (...args) => findOperationEventByIdRaw(...args),
    buildOperationRegressionsReport: (...args) => buildOperationRegressionsReportRaw(...args),
  };
};

const adaptQueueEngine = (engine: unknown): BaseQueueEngine => {
  const queueJobs = getMap(engine, 'queueEngine', 'queueJobs');
  const queueMetricsRaw = getMethod(engine, 'queueEngine', 'queueMetrics');
  const cancelQueueJobRaw = getMethod(engine, 'queueEngine', 'cancelQueueJob');
  const enqueueQueueJobRaw = getMethod(engine, 'queueEngine', 'enqueueQueueJob');

  return {
    queueJobs,
    queueMetrics: () => assertMetrics(queueMetricsRaw(), 'queueEngine.queueMetrics()'),
    cancelQueueJob: (...args) => assertResultWithBooleanOk(cancelQueueJobRaw(...args), 'queueEngine.cancelQueueJob()'),
    enqueueQueueJob: (...args) => assertResultWithId(enqueueQueueJobRaw(...args), 'queueEngine.enqueueQueueJob()'),
  };
};

const adaptCommandExecutionService = (service: unknown): BaseCommandExecutionService => {
  const runQueuedSpawnCommandRaw = getMethod(service, 'commandExecutionService', 'runQueuedSpawnCommand');

  return {
    runQueuedSpawnCommand: async (...args) => {
      const value = await Promise.resolve(runQueuedSpawnCommandRaw(...args));
      return assertResultWithBooleanOk(value, 'commandExecutionService.runQueuedSpawnCommand()');
    },
  };
};

const adaptQueueJobFactory = (factory: unknown): BaseQueueJobFactory => {
  const queueNpmScriptRaw = getMethod(factory, 'queueJobFactory', 'queueNpmScript');
  const queueNodeJsonCommandRaw = getMethod(factory, 'queueJobFactory', 'queueNodeJsonCommand');
  const enqueueRefreshNamingDebtJobRaw = getMethod(factory, 'queueJobFactory', 'enqueueRefreshNamingDebtJob');
  const enqueueReplayJobFromOperationRaw = getMethod(factory, 'queueJobFactory', 'enqueueReplayJobFromOperation');

  return {
    queueNpmScript: (...args) => assertResultWithId(queueNpmScriptRaw(...args), 'queueJobFactory.queueNpmScript()'),
    queueNodeJsonCommand: (...args) => assertResultWithId(queueNodeJsonCommandRaw(...args), 'queueJobFactory.queueNodeJsonCommand()'),
    enqueueRefreshNamingDebtJob: (...args) =>
      assertResultWithId(enqueueRefreshNamingDebtJobRaw(...args), 'queueJobFactory.enqueueRefreshNamingDebtJob()'),
    enqueueReplayJobFromOperation: (...args) =>
      assertResultWithId(enqueueReplayJobFromOperationRaw(...args), 'queueJobFactory.enqueueReplayJobFromOperation()'),
  };
};

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
  } = adaptOperationHistoryService(operationHistoryService);

  const queueEngine = createQueueEngineServiceFn({
    jobQueueConcurrency,
    jobTimeoutMs,
    jobRetentionMs,
    maxRetainedEvents,
    maxRetainedJobs,
    nowIso,
    onOperationEvent: appendOperationEventSafe,
  });

  const { queueJobs, queueMetrics, enqueueQueueJob, cancelQueueJob } = adaptQueueEngine(queueEngine);

  const commandExecutionService = createCommandExecutionServiceFn({
    runSpawnWithCapture: runSpawnWithCaptureFn,
    maxOutputBytes,
    summarizePayloadFailure: toQueueSummaryFromPayloadFn,
  });

  const { runQueuedSpawnCommand } = adaptCommandExecutionService(commandExecutionService);
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
  } = adaptQueueJobFactory(queueJobFactory);

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
