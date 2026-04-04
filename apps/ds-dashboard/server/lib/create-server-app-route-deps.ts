/**
 * Create Server App Route Dependencies
 *
 * Builds app route dependencies from config.
 * Migrated from apps/ds-dashboard/server/lib/create-server-app-route-deps.mjs
 */

export interface CreateServerAppRouteDepsConfig {
  readJsonBody: (c: unknown) => Promise<Record<string, unknown>>;
  designSystemRepository: import('../db/design-system-repository.js').DesignSystemRepository;
  normalizeSystemId: (value: string) => string;
  ensureRelativeDir: (...args: unknown[]) => string;
  normalizeFigmaApiTokenRef: (...args: unknown[]) => unknown;
  normalizeCollectionList: (...args: unknown[]) => unknown;
  summarizeDesignSystemsConfig: (...args: unknown[]) => unknown;
  resolveSafeSystemPathsForDeletion: (...args: unknown[]) => unknown;
  repoRoot: string;
  fsSync: Record<string, unknown>;
  toFiniteTimestamp: (...args: unknown[]) => number;
  OPS_HISTORY_MAX_LIMIT: number;
  OPS_HISTORY_DEFAULT_LIMIT: number;
  OPS_REGRESSION_MAX_LIMIT: number;
  OPS_REGRESSION_DEFAULT_LIMIT: number;
  OPS_REGRESSION_DEFAULT_MIN_SAMPLES: number;
  readOperationHistory: (...args: unknown[]) => unknown;
  buildOperationRegressionsReport: (...args: unknown[]) => unknown;
  createApiRequestId: () => string;
  findOperationEventById: (...args: unknown[]) => unknown;
  enqueueReplayJobFromOperation: (...args: unknown[]) => unknown;
  queueJobAcceptedPayload: (...args: unknown[]) => unknown;
  getSystemContext: (systemHeader: string) => unknown;
  isDevRuntime: () => boolean;
  resolveRepoFilePath: (root: string, requestedPath: string) => string | null;
  sha256Text: (value: string) => string;
  readTextFileLimited: (...args: unknown[]) => Promise<{ content: string; truncated: boolean }>;
  findLineForQuery: (content: string, query: string) => number | null;
  buildSnippet: (...args: unknown[]) => { targetLine: number; startLine: number; endLine: number; snippet: string };
  guessContentType: (filePath: string) => string;
  MAX_FILE_BYTES: number;
  queueJobs: Map<string, unknown>;
  listQueueJobEvents: (...args: unknown[]) => Array<{ seq: number }>;
  queueJobSnapshot: (...args: unknown[]) => unknown;
  isQueueJobFinalStatus: (status: string) => boolean;
  cancelQueueJob: (...args: unknown[]) => unknown;
  toQueueTerminalEvent: (...args: unknown[]) => unknown;
  buildApiErrorPayload: (...args: unknown[]) => Record<string, unknown>;
  MAX_RETAINED_EVENTS: number;
  enqueueQueueJob: (...args: unknown[]) => unknown;
  runQueuedSpawnCommand: (...args: unknown[]) => Promise<unknown>;
  queueNpmScript: (...args: unknown[]) => unknown;
  queueNodeJsonCommand: (...args: unknown[]) => unknown;
  toBooleanString: (value: unknown, fallback: boolean) => string;
  toNumberString: (value: unknown, fallback: number, max: number) => string;
  validateGitRef: (value: string) => string | null;
  componentRepo?: import('../db/component-repository.js').ComponentRepository;
  healthRepo?: import('../db/health-repository.js').HealthRepository;
  tokenRepo?: import('../db/token-repository.js').TokenRepository;
  db?: import('better-sqlite3').Database;
}

export type CreateServerAppRouteDeps = CreateServerAppRouteDepsConfig;

/**
 * Build app route dependencies from config.
 */
export function buildCreateServerAppRouteDeps(config: CreateServerAppRouteDepsConfig): CreateServerAppRouteDeps {
  return {
    readJsonBody: config.readJsonBody,
    designSystemRepository: config.designSystemRepository,
    normalizeSystemId: config.normalizeSystemId,
    ensureRelativeDir: config.ensureRelativeDir,
    normalizeFigmaApiTokenRef: config.normalizeFigmaApiTokenRef,
    normalizeCollectionList: config.normalizeCollectionList,
    summarizeDesignSystemsConfig: config.summarizeDesignSystemsConfig,
    resolveSafeSystemPathsForDeletion: config.resolveSafeSystemPathsForDeletion,
    repoRoot: config.repoRoot,
    fsSync: config.fsSync,
    toFiniteTimestamp: config.toFiniteTimestamp,
    OPS_HISTORY_MAX_LIMIT: config.OPS_HISTORY_MAX_LIMIT,
    OPS_HISTORY_DEFAULT_LIMIT: config.OPS_HISTORY_DEFAULT_LIMIT,
    OPS_REGRESSION_MAX_LIMIT: config.OPS_REGRESSION_MAX_LIMIT,
    OPS_REGRESSION_DEFAULT_LIMIT: config.OPS_REGRESSION_DEFAULT_LIMIT,
    OPS_REGRESSION_DEFAULT_MIN_SAMPLES: config.OPS_REGRESSION_DEFAULT_MIN_SAMPLES,
    readOperationHistory: config.readOperationHistory,
    buildOperationRegressionsReport: config.buildOperationRegressionsReport,
    createApiRequestId: config.createApiRequestId,
    findOperationEventById: config.findOperationEventById,
    enqueueReplayJobFromOperation: config.enqueueReplayJobFromOperation,
    queueJobAcceptedPayload: config.queueJobAcceptedPayload,
    getSystemContext: config.getSystemContext,
    isDevRuntime: config.isDevRuntime,
    resolveRepoFilePath: config.resolveRepoFilePath,
    sha256Text: config.sha256Text,
    readTextFileLimited: config.readTextFileLimited,
    findLineForQuery: config.findLineForQuery,
    buildSnippet: config.buildSnippet,
    guessContentType: config.guessContentType,
    MAX_FILE_BYTES: config.MAX_FILE_BYTES,
    queueJobs: config.queueJobs,
    listQueueJobEvents: config.listQueueJobEvents,
    queueJobSnapshot: config.queueJobSnapshot,
    isQueueJobFinalStatus: config.isQueueJobFinalStatus,
    cancelQueueJob: config.cancelQueueJob,
    toQueueTerminalEvent: config.toQueueTerminalEvent,
    buildApiErrorPayload: config.buildApiErrorPayload,
    MAX_RETAINED_EVENTS: config.MAX_RETAINED_EVENTS,
    enqueueQueueJob: config.enqueueQueueJob,
    runQueuedSpawnCommand: config.runQueuedSpawnCommand,
    queueNpmScript: config.queueNpmScript,
    queueNodeJsonCommand: config.queueNodeJsonCommand,
    toBooleanString: config.toBooleanString,
    toNumberString: config.toNumberString,
    validateGitRef: config.validateGitRef,
    componentRepo: config.componentRepo,
    healthRepo: config.healthRepo,
    tokenRepo: config.tokenRepo,
    db: config.db,
  };
}
