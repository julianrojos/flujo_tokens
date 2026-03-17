/**
 * Create Server App
 *
 * Creates and configures the dashboard server application.
 */

import fsSync from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Hono } from 'hono';

import type { StructuredLogPayload } from './lib/api-response-service.js';
import type { BuildApiErrorPayloadOptions } from './lib/api-response-service.js';

import {
  createDesignSystemRepository,
  ensureRelativeDir,
  normalizeCollectionList,
  normalizeFigmaApiTokenRef,
  normalizeSystemId,
  resolveSafeSystemPathsForDeletion,
  summarizeDesignSystemsConfig,
} from './system-repository.ts';
import {
  computeNamingDebtReport,
  validateGitRef,
} from './services/analysis-artifacts-service.ts';
import {
  isQueueJobFinalStatus,
  listQueueJobEvents,
  queueJobAcceptedPayload,
  queueJobSnapshot,
  toQueueTerminalEvent,
} from './lib/queue-utils.ts';
import { buildCreateServerAppRouteDeps } from './lib/create-server-app-route-deps.ts';
import { createServerHttpApp } from './lib/create-server-http-app.ts';
import { createServerRuntimeServices } from './lib/create-server-runtime-services.ts';
import {
  buildApiErrorPayload,
  createApiRequestId,
  createOperationEventId,
  nowIso,
  writeStructuredLog,
} from './lib/api-response-service.ts';
import { createServerConfig } from './lib/server-config.ts';
import {
  findLineForQuery,
  guessContentType,
  readJsonBody,
  readTextFileLimited,
  resolveRepoFilePath,
  toBooleanString,
  toNumberString,
} from './lib/request-file-helpers.ts';
import {
  disposeFigmaMcpPingService,
} from './services/figma-mcp-ping-service.ts';
import { bootstrapDatabase } from './db/db-service.js';
import { AiJobsStoreWithPersistence } from './services/ai-jobs-store-with-persistence.js';
import { initializeAiJobsStore } from './services/ai-jobs-store.js';
import { TokenRepository } from './db/token-repository.js';

export interface CreateServerAppOptions {
  env?: NodeJS.ProcessEnv;
  repoRoot?: string;
  watch?: boolean;
}

export interface ServerApp {
  app: Hono;
  port: number;
  host: string;
  repoRoot: string;
  disposeDesignSystemRepository: () => void;
}

function defaultRepoRoot(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  return path.resolve(__dirname, '../../..');
}

function formatHostForHttpUrl(host: string): string {
  const normalized = String(host || '').trim();
  if (!normalized) return 'localhost';
  if (normalized.startsWith('[') && normalized.endsWith(']')) return normalized;
  return normalized.includes(':') ? `[${normalized}]` : normalized;
}

function ensureDashboardInternalToken(env: NodeJS.ProcessEnv = process.env): string {
  const fromEnvArg = String(env?.DS_DASHBOARD_INTERNAL_TOKEN || '').trim();
  if (fromEnvArg) {
    process.env.DS_DASHBOARD_INTERNAL_TOKEN = fromEnvArg;
    return fromEnvArg;
  }
  const existing = String(process.env.DS_DASHBOARD_INTERNAL_TOKEN || '').trim();
  if (existing) return existing;
  const generated = randomUUID();
  process.env.DS_DASHBOARD_INTERNAL_TOKEN = generated;
  return generated;
}

export function createServerApp(options: CreateServerAppOptions = {}): ServerApp {
  const {
    env = process.env,
    repoRoot = defaultRepoRoot(),
    watch = true,
  } = options;

  // Initialize SQLite database
  const dbPath = path.join(repoRoot, 'apps/ds-dashboard/server/db/ds-dashboard.db');
  let db: import('better-sqlite3').Database | undefined;
  let aiJobsStore!: AiJobsStoreWithPersistence;
  let tokenRepo!: TokenRepository;
  let resumeTimer: NodeJS.Timeout | undefined;
  let designSystemRepositoryDisposed = false;

  try {
    db = bootstrapDatabase({ dbPath });
    aiJobsStore = new AiJobsStoreWithPersistence({ db });
    tokenRepo = new TokenRepository(db);

    // Wire the persistent store to the singleton so routes use it
    initializeAiJobsStore(aiJobsStore);

    // Load existing jobs from DB into memory (without auto-resume)
    aiJobsStore.loadJobsFromDb(100, { autoResume: false });

    // Resume execution of recovered queued jobs after routes are set up
    // This ensures job handlers are registered before dequeue
    resumeTimer = setTimeout(() => {
        if (!designSystemRepositoryDisposed) {
            aiJobsStore.resumeRecoveredQueue();
        }
    }, 0);

    // Try to rebuild token cache from JSON files only if DB is empty (cold start)
    const generatedDir = path.join(repoRoot, 'docs/_generated');
    const jsonPaths = {
      tokenRegistry: path.join(generatedDir, 'token-registry.json'),
      tokenUsageIndex: path.join(generatedDir, 'token-usage-index.json'),
      figmaAliasGraph: path.join(generatedDir, 'figma-alias-graph.json'),
    };

    // Check if DB already has data before rebuilding
    const existingMetadata = tokenRepo.getLastRebuildMetadata();
    if (existingMetadata) {
      console.log(`[Server] Token cache already populated (last rebuild: ${new Date(existingMetadata.timestamp!).toISOString()})`);
    } else {
      console.log('[Server] Token cache empty, rebuilding from JSON files...');
      const rebuildResult = tokenRepo.rebuildFromJsonFiles(jsonPaths);
      if (rebuildResult.warnings.length > 0) {
        console.log('[Server] Token cache rebuild warnings:', rebuildResult.warnings);
      }
      if (rebuildResult.tokensLoaded > 0) {
        console.log(`[Server] Token cache rebuilt: ${rebuildResult.tokensLoaded} tokens loaded`);
      }
    }
  } catch (error) {
    console.error('[Server] Failed to initialize SQLite database:', error instanceof Error ? error.message : String(error));

    // Stop in-memory cleanup timer if store was initialized before failure.
    if (aiJobsStore) {
      aiJobsStore.stopCleanup();
    }

    // Close DB if it was partially initialized before re-throwing
    if (db) {
      try {
        db.close();
        console.log('[Server] Database connection closed due to initialization failure');
      } catch (closeError) {
        console.warn('[Server] Error closing database during cleanup:', closeError instanceof Error ? closeError.message : String(closeError));
      }
    }

    throw error;
  }

  const designSystemRepository = createDesignSystemRepository({ repoRoot, watch });

  function disposeDesignSystemRepository(): void {
    if (designSystemRepositoryDisposed) return;
    designSystemRepositoryDisposed = true;

    // Clear the resume timer to prevent async execution after DB close
    if (resumeTimer) {
        clearTimeout(resumeTimer);
        resumeTimer = undefined;
    }

    // Stop jobs cleanup interval explicitly during server shutdown.
    if (aiJobsStore) {
      aiJobsStore.stopCleanup();
    }

    designSystemRepository.dispose();
    disposeFigmaMcpPingService();
    // Close database connection
    try {
      if (db) {
        db.close();
        console.log('[Server] Database connection closed');
      }
    } catch (error) {
      console.warn('[Server] Error closing database:', error instanceof Error ? error.message : String(error));
    }
  }

  const {
    PORT,
    HOST,
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

  // Type adapters for createServerHttpApp compatibility
  const buildApiErrorPayloadAdapter = (...args: unknown[]): Record<string, unknown> => {
    return buildApiErrorPayload(args[0] as BuildApiErrorPayloadOptions, createApiRequestId);
  };

  const writeStructuredLogAdapter = (level: string, payload: Record<string, unknown>): void => {
    writeStructuredLog(level, payload as StructuredLogPayload);
  };

  const { app } = createServerHttpApp({
    queueMetrics,
    nowIso,
    createApiRequestId,
    buildApiErrorPayload: buildApiErrorPayloadAdapter,
    writeStructuredLog: writeStructuredLogAdapter,
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
      tokenRepo,
    }),
  });

  // Advertise the server's internal URL to child processes spawned from this
  // server (e.g., the tokens-from-figma sync subprocess).  When this variable
  // is present, subprocesses can proxy their MCP variable fetches through the
  // server's /api/figma-mcp-variables endpoint, which uses the shared MCP
  // client that the MCP Management is already connected to — avoiding
  // the port-mismatch problem that occurs when subprocesses spawn their own
  // fresh MCP Management instances.
  const internalHostRaw = HOST === '0.0.0.0' || HOST === '::' ? 'localhost' : HOST;
  const internalHost = formatHostForHttpUrl(internalHostRaw);
  process.env.DS_DASHBOARD_INTERNAL_URL = `http://${internalHost}:${PORT}`;
  ensureDashboardInternalToken(env);

  return {
    app,
    port: PORT,
    host: HOST,
    repoRoot,
    disposeDesignSystemRepository,
  };
}
