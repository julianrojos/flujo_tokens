/**
 * Create Server Route Dependencies
 *
 * Builds route dependencies object from config.
 * Migrated from apps/ds-dashboard/server/lib/create-server-route-deps.mjs
 */

export interface CreateServerRouteDepsConfig {
  buildHealthPayload: () => unknown;
  failJson: (...args: unknown[]) => unknown;
  readJsonBody: (c: unknown) => Promise<Record<string, unknown>>;
  designSystemRepository: Record<string, unknown>;
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
  enqueueRefreshNamingDebtJob: (...args: unknown[]) => unknown;
  queueNodeJsonCommand: (...args: unknown[]) => unknown;
  toBooleanString: (value: unknown, fallback: boolean) => string;
  toNumberString: (value: unknown, fallback: number, max?: number) => string;
  validateGitRef: (...args: unknown[]) => unknown;
}

export type CreateServerRouteDeps = CreateServerRouteDepsConfig;

/**
 * Build route dependencies from config.
 */
export function buildCreateServerRouteDeps(deps: CreateServerRouteDepsConfig): CreateServerRouteDeps {
  return {
    buildHealthPayload: deps.buildHealthPayload,
    failJson: deps.failJson,
    readJsonBody: deps.readJsonBody,
    designSystemRepository: deps.designSystemRepository,
    normalizeSystemId: deps.normalizeSystemId,
    ensureRelativeDir: deps.ensureRelativeDir,
    normalizeFigmaApiTokenRef: deps.normalizeFigmaApiTokenRef,
    normalizeCollectionList: deps.normalizeCollectionList,
    summarizeDesignSystemsConfig: deps.summarizeDesignSystemsConfig,
    resolveSafeSystemPathsForDeletion: deps.resolveSafeSystemPathsForDeletion,
    repoRoot: deps.repoRoot,
    fsSync: deps.fsSync,
    toFiniteTimestamp: deps.toFiniteTimestamp,
    OPS_HISTORY_MAX_LIMIT: deps.OPS_HISTORY_MAX_LIMIT,
    OPS_HISTORY_DEFAULT_LIMIT: deps.OPS_HISTORY_DEFAULT_LIMIT,
    OPS_REGRESSION_MAX_LIMIT: deps.OPS_REGRESSION_MAX_LIMIT,
    OPS_REGRESSION_DEFAULT_LIMIT: deps.OPS_REGRESSION_DEFAULT_LIMIT,
    OPS_REGRESSION_DEFAULT_MIN_SAMPLES: deps.OPS_REGRESSION_DEFAULT_MIN_SAMPLES,
    readOperationHistory: deps.readOperationHistory,
    buildOperationRegressionsReport: deps.buildOperationRegressionsReport,
    createApiRequestId: deps.createApiRequestId,
    findOperationEventById: deps.findOperationEventById,
    enqueueReplayJobFromOperation: deps.enqueueReplayJobFromOperation,
    queueJobAcceptedPayload: deps.queueJobAcceptedPayload,
    getSystemContext: deps.getSystemContext,
    isDevRuntime: deps.isDevRuntime,
    resolveRepoFilePath: deps.resolveRepoFilePath,
    sha256Text: deps.sha256Text,
    readTextFileLimited: deps.readTextFileLimited,
    findLineForQuery: deps.findLineForQuery,
    buildSnippet: deps.buildSnippet,
    guessContentType: deps.guessContentType,
    MAX_FILE_BYTES: deps.MAX_FILE_BYTES,
    queueJobs: deps.queueJobs,
    listQueueJobEvents: deps.listQueueJobEvents,
    queueJobSnapshot: deps.queueJobSnapshot,
    isQueueJobFinalStatus: deps.isQueueJobFinalStatus,
    cancelQueueJob: deps.cancelQueueJob,
    toQueueTerminalEvent: deps.toQueueTerminalEvent,
    buildApiErrorPayload: deps.buildApiErrorPayload,
    MAX_RETAINED_EVENTS: deps.MAX_RETAINED_EVENTS,
    enqueueQueueJob: deps.enqueueQueueJob,
    runQueuedSpawnCommand: deps.runQueuedSpawnCommand,
    queueNpmScript: deps.queueNpmScript,
    enqueueRefreshNamingDebtJob: deps.enqueueRefreshNamingDebtJob,
    queueNodeJsonCommand: deps.queueNodeJsonCommand,
    toBooleanString: deps.toBooleanString,
    toNumberString: deps.toNumberString,
    validateGitRef: deps.validateGitRef,
  };
}
