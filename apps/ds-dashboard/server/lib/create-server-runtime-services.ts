/**
 * Create Server Runtime Services
 *
 * Creates and wires runtime services for the server.
 */

import { createCommandExecutionService } from '../services/command-execution-service.mjs';
import { createQueueEngineService } from '../services/queue-engine-service.mjs';
import { createQueueJobFactoryService } from '../services/queue-job-factory-service.mjs';
import { createSnippetBuilder, type SnippetResult } from './request-file-helpers.ts';
import { runSpawnWithCapture } from './spawn-runner.mjs';
import { toQueueSummaryFromPayload } from './queue-utils.ts';
import {
  createDevRuntimeChecker,
  createSha256TextHasher,
  createSystemContextResolver,
  type Env,
  type DesignSystemRepository,
} from './create-server-runtime-utils.ts';

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
}

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
  tokenRepo?: import('../db/token-repository.js').TokenRepository;
  nowIso: () => string;
  createDevRuntimeCheckerFn?: (...args: any[]) => unknown;
  createSha256TextHasherFn?: (...args: any[]) => unknown;
  createSystemContextResolverFn?: (...args: any[]) => unknown;
  createQueueEngineServiceFn?: (...args: any[]) => unknown;
  createCommandExecutionServiceFn?: (...args: any[]) => unknown;
  createQueueJobFactoryServiceFn?: (...args: any[]) => unknown;
  runSpawnWithCaptureFn?: (...args: any[]) => unknown;
  toQueueSummaryFromPayloadFn?: (...args: any[]) => unknown;
  createSnippetBuilderFn?: (...args: any[]) => unknown;
}

export interface CreateServerRuntimeServices {
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
    tokenRepo,
    nowIso,
    createDevRuntimeCheckerFn = createDevRuntimeChecker,
    createSha256TextHasherFn = createSha256TextHasher,
    createSystemContextResolverFn = createSystemContextResolver,
    createQueueEngineServiceFn = createQueueEngineService,
    createCommandExecutionServiceFn = createCommandExecutionService,
    createQueueJobFactoryServiceFn = createQueueJobFactoryService,
    runSpawnWithCaptureFn = runSpawnWithCapture,
    toQueueSummaryFromPayloadFn = toQueueSummaryFromPayload,
    createSnippetBuilderFn = createSnippetBuilder,
  } = config;

  const queueEngine = createQueueEngineServiceFn({
    jobQueueConcurrency,
    jobTimeoutMs,
    jobRetentionMs,
    maxRetainedEvents,
    maxRetainedJobs,
    nowIso,
  });

  const { queueJobs, queueMetrics, enqueueQueueJob, cancelQueueJob } = queueEngine as BaseQueueEngine;

  const commandExecutionService = createCommandExecutionServiceFn({
    runSpawnWithCapture: runSpawnWithCaptureFn,
    maxOutputBytes,
    summarizePayloadFailure: toQueueSummaryFromPayloadFn,
  });

  const { runQueuedSpawnCommand } = commandExecutionService as BaseCommandExecutionService;
  const buildSnippet = createSnippetBuilderFn(maxSnippetLines) as CreateServerRuntimeServices['buildSnippet'];

  const isDevRuntime = createDevRuntimeCheckerFn(env) as CreateServerRuntimeServices['isDevRuntime'];
  const sha256Text = createSha256TextHasherFn() as CreateServerRuntimeServices['sha256Text'];
  const getSystemContext = createSystemContextResolverFn(
    designSystemRepository,
  ) as CreateServerRuntimeServices['getSystemContext'];

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
  } = queueJobFactory as BaseQueueJobFactory;

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
