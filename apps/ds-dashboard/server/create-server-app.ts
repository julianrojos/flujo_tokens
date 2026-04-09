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

import { DesignSystemRepository } from './db/design-system-repository.js';
import { ComponentRepository } from './db/component-repository.js';
import { HealthRepository } from './db/health-repository.js';
import {
  normalizeSystemId,
  normalizeCollectionList,
  normalizeFigmaApiTokenRef,
  ensureRelativeDir,
  resolveSafeSystemPathsForDeletion,
  summarizeDesignSystemsConfig,
} from './lib/system-utils.ts';
import {
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
import { PendingOperationsRepository } from './db/pending-operations-repository.js';
import { reconcileDeleteDesignSystemOps } from './lib/pending-operations-service.js';
import { AiJobsStoreWithPersistence } from './services/ai-jobs-store-with-persistence.js';
import { initializeAiJobsStore } from './services/ai-jobs-store.js';
import { TokenRepository } from './db/token-repository.js';

export interface CreateServerAppOptions {
  env?: NodeJS.ProcessEnv;
  repoRoot?: string;
}

export interface ServerApp {
  app: Hono;
  port: number;
  host: string;
  repoRoot: string;
  disposeDesignSystemRepository: () => void;
}

function resolveDashboardDbPath(repoRoot: string, env: NodeJS.ProcessEnv): string {
  const fromEnv = String(env.DS_DASHBOARD_DB_PATH || '').trim();
  if (fromEnv) {
    if (!path.isAbsolute(fromEnv)) {
      throw new Error('DS_DASHBOARD_DB_PATH must be an absolute path.');
    }
    const resolved = path.resolve(fromEnv);
    const parentDir = path.dirname(resolved);
    if (!fsSync.existsSync(parentDir)) {
      throw new Error(`DS_DASHBOARD_DB_PATH parent directory does not exist: ${parentDir}`);
    }
    fsSync.accessSync(parentDir, fsSync.constants.R_OK | fsSync.constants.W_OK);
    return resolved;
  }
  return path.join(repoRoot, 'apps/ds-dashboard/server/db/ds-dashboard.db');
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
  } = options;

  // Initialize SQLite database
  let dbPath = '';
  let db: import('better-sqlite3').Database | undefined;
  let aiJobsStore!: AiJobsStoreWithPersistence;
  let tokenRepo!: TokenRepository;
  let componentRepo!: ComponentRepository;
  let healthRepo!: HealthRepository;
  let resumeTimer: NodeJS.Timeout | undefined;
  let designSystemRepositoryDisposed = false;
  let designSystemRepository: DesignSystemRepository | null = null;

  try {
    dbPath = resolveDashboardDbPath(repoRoot, env);
    db = bootstrapDatabase({ dbPath });
    designSystemRepository = new DesignSystemRepository(db, { repoRoot });
    componentRepo = new ComponentRepository(db);
    healthRepo = new HealthRepository(db);
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

  // Reconcile incomplete delete operations from previous server runs
  try {
    const pendingOpsRepo = new PendingOperationsRepository(db);
    const reconcileResult = reconcileDeleteDesignSystemOps({
      db,
      pendingOpsRepo,
      designSystemRepository,
    });
    if (reconcileResult.errors.length > 0) {
      console.error('[Server] Pending operation reconciliation errors:', reconcileResult.errors);
    }
    if (reconcileResult.completed.length > 0 || reconcileResult.abandoned.length > 0) {
      console.warn('[Server] Reconciled incomplete delete operations:', reconcileResult);
    }
  } catch (error) {
    console.error('[Server] Failed to reconcile pending operations:', error instanceof Error ? error.message : String(error));
    throw error;
  }

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

    if (designSystemRepository) {
      designSystemRepository.dispose();
    }
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
  } = createServerConfig(env);

  const {
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
    nowIso,
    tokenRepo,
  });

  // Adapt helper signatures to createServerHttpApp contracts.
  const buildApiErrorPayloadAdapter = (...args: unknown[]): Record<string, unknown> => {
    return buildApiErrorPayload(args[0] as BuildApiErrorPayloadOptions, createApiRequestId);
  };

  const writeStructuredLogAdapter = (level: string, payload: Record<string, unknown>): void => {
    writeStructuredLog(level, { ...payload, level } as StructuredLogPayload);
  };

  const { app } = createServerHttpApp({
    queueMetrics,
    nowIso,
    createApiRequestId,
    buildApiErrorPayload: buildApiErrorPayloadAdapter,
    writeStructuredLog: writeStructuredLogAdapter,
    routeDeps: buildCreateServerAppRouteDeps({
      createApiRequestId,
      queueJobAcceptedPayload,
      readJsonBody: readJsonBody as (c: unknown) => Promise<Record<string, unknown>>,
      designSystemRepository,
      componentRepo,
      tokenRepo,
      healthRepo,
      normalizeSystemId: normalizeSystemId as (...args: unknown[]) => string,
      ensureRelativeDir: ensureRelativeDir as unknown as (...args: unknown[]) => string,
      normalizeFigmaApiTokenRef: normalizeFigmaApiTokenRef as (...args: unknown[]) => string,
      normalizeCollectionList: normalizeCollectionList as unknown as (...args: unknown[]) => string,
      summarizeDesignSystemsConfig: summarizeDesignSystemsConfig as (...args: unknown[]) => unknown,
      resolveSafeSystemPathsForDeletion: resolveSafeSystemPathsForDeletion as (...args: unknown[]) => unknown,
      repoRoot,
      fsSync,
      getSystemContext,
      isDevRuntime,
      resolveRepoFilePath,
      sha256Text,
      readTextFileLimited: readTextFileLimited as (...args: unknown[]) => Promise<{ content: string; truncated: boolean; }>,
      findLineForQuery: findLineForQuery as unknown as (...args: unknown[]) => number | null,
      buildSnippet: buildSnippet as unknown as (...args: unknown[]) => { targetLine: number; startLine: number; endLine: number; snippet: string; },
      guessContentType,
      MAX_FILE_BYTES,
      queueJobs,
      listQueueJobEvents: listQueueJobEvents as (...args: unknown[]) => { seq: number; }[],
      queueJobSnapshot: queueJobSnapshot as (...args: unknown[]) => unknown,
      isQueueJobFinalStatus,
      cancelQueueJob,
      toQueueTerminalEvent: toQueueTerminalEvent as (...args: unknown[]) => unknown,
      buildApiErrorPayload: buildApiErrorPayload as (...args: unknown[]) => Record<string, unknown>,
      MAX_RETAINED_EVENTS,
      enqueueQueueJob,
      runQueuedSpawnCommand,
      queueNpmScript,
      queueNodeJsonCommand,
      toBooleanString,
      toNumberString,
      validateGitRef,
      tokenRepo: db ? tokenRepo : undefined,
      db,
    }),
  });

  // Advertise the server's internal URL to child processes spawned from this
  // server (e.g., the tokens-from-figma sync subprocess).  When this variable
  // is present, subprocesses can proxy their MCP variable fetches through the
  // server's /api/figma-mcp-variables endpoint, which uses the shared MCP
  // client that the DS Graph is already connected to — avoiding
  // the port-mismatch problem that occurs when subprocesses spawn their own
  // fresh DS Graph instances.
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
