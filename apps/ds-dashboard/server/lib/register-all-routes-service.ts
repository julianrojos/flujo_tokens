/**
 * Register All Routes Service
 *
 * Builds consolidated dependencies for all route handlers.
 */

export interface SharedSystemContextDeps {
  failJson: (c: unknown, statusCode: number, args: Record<string, unknown>) => unknown;
  getSystemContext: (systemHeader: string) => unknown;
}

export interface SystemDeps {
  buildHealthPayload: (args: unknown) => unknown;
  failJson: (c: unknown, statusCode: number, args: Record<string, unknown>) => unknown;
  readJsonBody: (c: unknown) => Promise<Record<string, unknown>>;
  designSystemRepository: unknown;
  normalizeSystemId: (id: string) => string;
  ensureRelativeDir: (path: string) => string;
  normalizeFigmaApiTokenRef: (token: string) => string;
  normalizeCollectionList: (collections: unknown) => unknown;
  summarizeDesignSystemsConfig: (config: unknown) => unknown;
  resolveSafeSystemPathsForDeletion: (args: unknown) => unknown;
  repoRoot: string;
  fsSync: unknown;
}

export interface OperationsDeps {
  failJson: (c: unknown, statusCode: number, args: Record<string, unknown>) => unknown;
  toFiniteTimestamp: (value: unknown) => number;
  OPS_HISTORY_MAX_LIMIT: number;
  OPS_HISTORY_DEFAULT_LIMIT: number;
  OPS_REGRESSION_MAX_LIMIT: number;
  OPS_REGRESSION_DEFAULT_LIMIT: number;
  OPS_REGRESSION_DEFAULT_MIN_SAMPLES: number;
  designSystemRepository: unknown;
  readOperationHistory: (args: unknown) => unknown;
  buildOperationRegressionsReport: (args: unknown) => unknown;
  createApiRequestId: () => string;
  readJsonBody: (c: unknown) => Promise<Record<string, unknown>>;
  normalizeSystemId: (id: string) => string;
  findOperationEventById: (id: string) => unknown;
  enqueueReplayJobFromOperation: (args: unknown) => unknown;
  queueJobAcceptedPayload: (job: unknown) => unknown;
}

export interface ComponentSpecDeps extends SharedSystemContextDeps {
  isDevRuntime: () => boolean;
  readJsonBody: (c: unknown) => Promise<Record<string, unknown>>;
  resolveRepoFilePath: (root: string, requestedPath: string) => string | null;
  sha256Text: (value: string) => string;
}

export interface FileDeps extends SharedSystemContextDeps {
  resolveRepoFilePath: (root: string, requestedPath: string) => string | null;
  readTextFileLimited: (...args: unknown[]) => Promise<{ content: string; truncated: boolean }>;
  findLineForQuery: (content: string, query: string) => number | null;
  buildSnippet: (...args: unknown[]) => { targetLine: number; startLine: number; endLine: number; snippet: string };
  guessContentType: (filePath: string) => string;
  MAX_FILE_BYTES: number;
}

export interface JobDeps {
  failJson: (c: unknown, statusCode: number, args: Record<string, unknown>) => unknown;
  queueJobs: Map<string, unknown>;
  listQueueJobEvents: (...args: unknown[]) => Array<{ seq: number }>;
  queueJobSnapshot: (job: unknown) => unknown;
  isQueueJobFinalStatus: (status: string) => boolean;
  cancelQueueJob: (id: string) => unknown;
  toQueueTerminalEvent: (args: unknown) => unknown;
  buildApiErrorPayload: (args: unknown) => unknown;
  MAX_RETAINED_EVENTS: number;
}

export interface CommandDeps {
  failJson: (c: unknown, statusCode: number, args: Record<string, unknown>) => unknown;
  createApiRequestId: () => string;
  readJsonBody: (c: unknown) => Promise<Record<string, unknown>>;
  getSystemContext: (systemHeader: string) => unknown;
  queueJobAcceptedPayload: (job: unknown) => unknown;
  enqueueQueueJob: (args: unknown) => unknown;
  sha256Text: (value: string) => string;
  runQueuedSpawnCommand: (args: unknown) => Promise<unknown>;
  queueNpmScript: (args: unknown) => unknown;
  enqueueRefreshNamingDebtJob: (args: unknown) => unknown;
  queueNodeJsonCommand: (args: unknown) => unknown;
  toBooleanString: (value: unknown, fallback: boolean) => string;
  toNumberString: (value: unknown, fallback: number, max: number) => string;
  validateGitRef: (value: string) => string | null;
}

export interface FigmaPingDeps {
  failJson: (c: unknown, statusCode: number, args: Record<string, unknown>) => unknown;
  readJsonBody: (c: unknown) => Promise<Record<string, unknown>>;
}

export interface FigmaMcpPingDeps {
  failJson: (c: unknown, statusCode: number, args: Record<string, unknown>) => unknown;
  readJsonBody: (c: unknown) => Promise<Record<string, unknown>>;
}

export interface AllRouteDeps {
  systemDeps: SystemDeps;
  operationsDeps: OperationsDeps;
  registryDeps: SharedSystemContextDeps;
  tokenGraphDeps: SharedSystemContextDeps & { tokenRepo?: import('../db/token-repository.js').TokenRepository };
  healthDeps: SharedSystemContextDeps;
  analysisDeps: SharedSystemContextDeps;
  componentSpecDeps: ComponentSpecDeps;
  fileDeps: FileDeps;
  jobDeps: JobDeps;
  commandDeps: CommandDeps;
  figmaPingDeps: FigmaPingDeps;
  figmaMcpPingDeps: FigmaMcpPingDeps;
}

export interface ServerDeps {
  failJson: (c: unknown, statusCode: number, args: Record<string, unknown>) => unknown;
  getSystemContext: (systemHeader: string) => unknown;
  buildHealthPayload: (args: unknown) => unknown;
  readJsonBody: (c: unknown) => Promise<Record<string, unknown>>;
  designSystemRepository: unknown;
  normalizeSystemId: (id: string) => string;
  ensureRelativeDir: (path: string) => string;
  normalizeFigmaApiTokenRef: (token: string) => string;
  normalizeCollectionList: (collections: unknown) => unknown;
  summarizeDesignSystemsConfig: (config: unknown) => unknown;
  resolveSafeSystemPathsForDeletion: (args: unknown) => unknown;
  repoRoot: string;
  fsSync: unknown;
  toFiniteTimestamp: (value: unknown) => number;
  OPS_HISTORY_MAX_LIMIT: number;
  OPS_HISTORY_DEFAULT_LIMIT: number;
  OPS_REGRESSION_MAX_LIMIT: number;
  OPS_REGRESSION_DEFAULT_LIMIT: number;
  OPS_REGRESSION_DEFAULT_MIN_SAMPLES: number;
  readOperationHistory: (args: unknown) => unknown;
  buildOperationRegressionsReport: (args: unknown) => unknown;
  createApiRequestId: () => string;
  findOperationEventById: (id: string) => unknown;
  enqueueReplayJobFromOperation: (args: unknown) => unknown;
  queueJobAcceptedPayload: (job: unknown) => unknown;
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
  queueJobSnapshot: (job: unknown) => unknown;
  isQueueJobFinalStatus: (status: string) => boolean;
  cancelQueueJob: (id: string) => unknown;
  toQueueTerminalEvent: (args: unknown) => unknown;
  buildApiErrorPayload: (args: unknown) => unknown;
  MAX_RETAINED_EVENTS: number;
  enqueueQueueJob: (args: unknown) => unknown;
  runQueuedSpawnCommand: (args: unknown) => Promise<unknown>;
  queueNpmScript: (args: unknown) => unknown;
  enqueueRefreshNamingDebtJob: (args: unknown) => unknown;
  queueNodeJsonCommand: (args: unknown) => unknown;
  toBooleanString: (value: unknown, fallback: boolean) => string;
  toNumberString: (value: unknown, fallback: number, max: number) => string;
  validateGitRef: (value: string) => string | null;
  tokenRepo?: import('../db/token-repository.js').TokenRepository;
  db?: import('better-sqlite3').Database;
}

export function buildSharedSystemContextDeps(deps: ServerDeps): SharedSystemContextDeps {
  return {
    failJson: deps.failJson,
    getSystemContext: deps.getSystemContext,
  };
}

export function buildAllRouteDeps(deps: ServerDeps): AllRouteDeps {
  const sharedSystemContextDeps = buildSharedSystemContextDeps(deps);

  return {
    systemDeps: {
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
    },
    operationsDeps: {
      failJson: deps.failJson,
      toFiniteTimestamp: deps.toFiniteTimestamp,
      OPS_HISTORY_MAX_LIMIT: deps.OPS_HISTORY_MAX_LIMIT,
      OPS_HISTORY_DEFAULT_LIMIT: deps.OPS_HISTORY_DEFAULT_LIMIT,
      OPS_REGRESSION_MAX_LIMIT: deps.OPS_REGRESSION_MAX_LIMIT,
      OPS_REGRESSION_DEFAULT_LIMIT: deps.OPS_REGRESSION_DEFAULT_LIMIT,
      OPS_REGRESSION_DEFAULT_MIN_SAMPLES: deps.OPS_REGRESSION_DEFAULT_MIN_SAMPLES,
      designSystemRepository: deps.designSystemRepository,
      readOperationHistory: deps.readOperationHistory,
      buildOperationRegressionsReport: deps.buildOperationRegressionsReport,
      createApiRequestId: deps.createApiRequestId,
      readJsonBody: deps.readJsonBody,
      normalizeSystemId: deps.normalizeSystemId,
      findOperationEventById: deps.findOperationEventById,
      enqueueReplayJobFromOperation: deps.enqueueReplayJobFromOperation,
      queueJobAcceptedPayload: deps.queueJobAcceptedPayload,
    },
    registryDeps: sharedSystemContextDeps,
    tokenGraphDeps: { ...sharedSystemContextDeps, tokenRepo: deps.tokenRepo },
    healthDeps: sharedSystemContextDeps,
    analysisDeps: sharedSystemContextDeps,
    componentSpecDeps: {
      ...sharedSystemContextDeps,
      isDevRuntime: deps.isDevRuntime,
      readJsonBody: deps.readJsonBody,
      resolveRepoFilePath: deps.resolveRepoFilePath,
      sha256Text: deps.sha256Text,
    },
    fileDeps: {
      ...sharedSystemContextDeps,
      resolveRepoFilePath: deps.resolveRepoFilePath,
      readTextFileLimited: deps.readTextFileLimited,
      findLineForQuery: deps.findLineForQuery,
      buildSnippet: deps.buildSnippet,
      guessContentType: deps.guessContentType,
      MAX_FILE_BYTES: deps.MAX_FILE_BYTES,
    },
    jobDeps: {
      failJson: deps.failJson,
      queueJobs: deps.queueJobs,
      listQueueJobEvents: deps.listQueueJobEvents,
      queueJobSnapshot: deps.queueJobSnapshot,
      isQueueJobFinalStatus: deps.isQueueJobFinalStatus,
      cancelQueueJob: deps.cancelQueueJob,
      toQueueTerminalEvent: deps.toQueueTerminalEvent,
      buildApiErrorPayload: deps.buildApiErrorPayload,
      MAX_RETAINED_EVENTS: deps.MAX_RETAINED_EVENTS,
    },
    commandDeps: {
      failJson: deps.failJson,
      createApiRequestId: deps.createApiRequestId,
      readJsonBody: deps.readJsonBody,
      getSystemContext: deps.getSystemContext,
      queueJobAcceptedPayload: deps.queueJobAcceptedPayload,
      enqueueQueueJob: deps.enqueueQueueJob,
      sha256Text: deps.sha256Text,
      runQueuedSpawnCommand: deps.runQueuedSpawnCommand,
      queueNpmScript: deps.queueNpmScript,
      enqueueRefreshNamingDebtJob: deps.enqueueRefreshNamingDebtJob,
      queueNodeJsonCommand: deps.queueNodeJsonCommand,
      toBooleanString: deps.toBooleanString,
      toNumberString: deps.toNumberString,
      validateGitRef: deps.validateGitRef,
    },
    figmaPingDeps: {
      failJson: deps.failJson,
      readJsonBody: deps.readJsonBody,
    },
    figmaMcpPingDeps: {
      failJson: deps.failJson,
      readJsonBody: deps.readJsonBody,
    },
  };
}
