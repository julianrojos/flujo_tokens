/**
 * Create Server Route Dependencies
 *
 * Builds route dependencies object from config.
 * Migrated from apps/ds-dashboard/server/lib/create-server-route-deps.mjs
 */

export interface CreateServerRouteDepsConfig {
  createApiRequestId: () => string;
  queueJobAcceptedPayload: (job: { id: string }) => { ok: boolean; jobId: string };
  buildHealthPayload: () => unknown;
  failJson: (...args: unknown[]) => unknown;
  readJsonBody: (c: unknown) => Promise<Record<string, unknown>>;
  designSystemRepository: import('../db/design-system-repository.js').DesignSystemRepository;
  normalizeSystemId: (value: string) => string;
  ensureRelativeDir: (...args: unknown[]) => string;
  normalizeFigmaApiTokenRef: (token: string) => string;
  normalizeCollectionList: (...args: unknown[]) => unknown;
  summarizeDesignSystemsConfig: (...args: unknown[]) => unknown;
  resolveSafeSystemPathsForDeletion: (...args: unknown[]) => unknown;
  repoRoot: string;
  fsSync: Record<string, unknown>;
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
  toNumberString: (value: unknown, fallback: number, max?: number) => string;
  validateGitRef: (...args: unknown[]) => string | null;
  exitDelayMs?: number;
  componentRepo?: import('../db/component-repository.js').ComponentRepository;
  healthRepo?: import('../db/health-repository.js').HealthRepository;
  tokenRepo?: import('../db/token-repository.js').TokenRepository;
  db?: import('postgres').Sql;
}

export type CreateServerRouteDeps = CreateServerRouteDepsConfig;

/**
 * Build route dependencies from config.
 */
export function buildCreateServerRouteDeps(deps: CreateServerRouteDepsConfig): CreateServerRouteDeps {
  return {
    createApiRequestId: deps.createApiRequestId,
    queueJobAcceptedPayload: deps.queueJobAcceptedPayload,
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
    queueNodeJsonCommand: deps.queueNodeJsonCommand,
    toBooleanString: deps.toBooleanString,
    toNumberString: deps.toNumberString,
    validateGitRef: deps.validateGitRef,
    exitDelayMs: deps.exitDelayMs,
    componentRepo: deps.componentRepo,
    healthRepo: deps.healthRepo,
    tokenRepo: deps.tokenRepo,
    db: deps.db,
  };
}
