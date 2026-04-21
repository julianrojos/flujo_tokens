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
  db?: unknown;
  normalizeSystemId: (id: string) => string;
  ensureRelativeDir: (path: string) => string;
  normalizeFigmaApiTokenRef: (token: string) => string;
  normalizeCollectionList: (collections: unknown) => unknown;
  summarizeDesignSystemsConfig: (config: unknown) => unknown;
  resolveSafeSystemPathsForDeletion: (args: unknown) => unknown;
  repoRoot: string;
  fsSync: unknown;
}

export interface ComponentSpecDeps extends SharedSystemContextDeps {
  isDevRuntime: () => boolean;
  readJsonBody: (c: unknown) => Promise<Record<string, unknown>>;
  resolveRepoFilePath: (root: string, requestedPath: string) => string | null;
  sha256Text: (value: string) => string;
  tokenRepo?: import('../db/token-repository.js').TokenRepository;
  componentRepo?: import('../db/component-repository.js').ComponentRepository;
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
  queueNodeJsonCommand: (args: unknown) => unknown;
  componentRepo?: import('../db/component-repository.js').ComponentRepository;
  tokenRepo?: import('../db/token-repository.js').TokenRepository;
  healthRepo?: import('../db/health-repository.js').HealthRepository;
  db?: import('postgres').Sql;
  toBooleanString: (value: unknown, fallback: boolean) => string;
  toNumberString: (value: unknown, fallback: number, max: number) => string;
  validateGitRef: (value: string) => string | null;
}

export interface FigmaMcpPingDeps {
  failJson: (c: unknown, statusCode: number, args: Record<string, unknown>) => unknown;
  readJsonBody: (c: unknown) => Promise<Record<string, unknown>>;
}

export interface AllRouteDeps {
  systemDeps: SystemDeps;
  registryDeps: SharedSystemContextDeps;
  tokenUsageIndexDeps: SharedSystemContextDeps;
  healthDeps: SharedSystemContextDeps;
  componentRepo?: import('../db/component-repository.js').ComponentRepository;
  tokenRepo?: import('../db/token-repository.js').TokenRepository;
  healthRepo?: import('../db/health-repository.js').HealthRepository;
  componentSpecDeps: ComponentSpecDeps;
  jobDeps: JobDeps;
  commandDeps: CommandDeps;
  figmaMcpPingDeps: FigmaMcpPingDeps;
}

export interface ServerDeps {
  failJson: (c: unknown, statusCode: number, args: Record<string, unknown>) => unknown;
  getSystemContext: (systemHeader: string) => unknown;
  buildHealthPayload: (args: unknown) => unknown;
  readJsonBody: (c: unknown) => Promise<Record<string, unknown>>;
  designSystemRepository: unknown;
  componentRepo?: import('../db/component-repository.js').ComponentRepository;
  tokenRepo?: import('../db/token-repository.js').TokenRepository;
  healthRepo?: import('../db/health-repository.js').HealthRepository;
  normalizeSystemId: (id: string) => string;
  ensureRelativeDir: (path: string) => string;
  normalizeFigmaApiTokenRef: (token: string) => string;
  normalizeCollectionList: (collections: unknown) => unknown;
  summarizeDesignSystemsConfig: (config: unknown) => unknown;
  resolveSafeSystemPathsForDeletion: (args: unknown) => unknown;
  repoRoot: string;
  fsSync: unknown;
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
  queueJobAcceptedPayload: (job: unknown) => unknown;
  enqueueQueueJob: (args: unknown) => unknown;
  runQueuedSpawnCommand: (args: unknown) => Promise<unknown>;
  queueNpmScript: (args: unknown) => unknown;
  queueNodeJsonCommand: (args: unknown) => unknown;
  toBooleanString: (value: unknown, fallback: boolean) => string;
  toNumberString: (value: unknown, fallback: number, max: number) => string;
  validateGitRef: (value: string) => string | null;
  tokenRepo?: import('../db/token-repository.js').TokenRepository;
  db?: import('postgres').Sql;
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
      db: deps.db,
      normalizeSystemId: deps.normalizeSystemId,
      ensureRelativeDir: deps.ensureRelativeDir,
      normalizeFigmaApiTokenRef: deps.normalizeFigmaApiTokenRef,
      normalizeCollectionList: deps.normalizeCollectionList,
      summarizeDesignSystemsConfig: deps.summarizeDesignSystemsConfig,
      resolveSafeSystemPathsForDeletion: deps.resolveSafeSystemPathsForDeletion,
      repoRoot: deps.repoRoot,
      fsSync: deps.fsSync,
    },
    registryDeps: sharedSystemContextDeps,
    tokenUsageIndexDeps: sharedSystemContextDeps,
    healthDeps: sharedSystemContextDeps,
    componentRepo: deps.componentRepo,
    tokenRepo: deps.tokenRepo,
    healthRepo: deps.healthRepo,
    componentSpecDeps: {
      ...sharedSystemContextDeps,
      isDevRuntime: deps.isDevRuntime,
      readJsonBody: deps.readJsonBody,
      resolveRepoFilePath: deps.resolveRepoFilePath,
      sha256Text: deps.sha256Text,
      tokenRepo: deps.tokenRepo,
      componentRepo: deps.componentRepo,
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
      queueNodeJsonCommand: deps.queueNodeJsonCommand,
      componentRepo: deps.componentRepo,
      tokenRepo: deps.tokenRepo,
      healthRepo: deps.healthRepo,
      db: deps.db,
      toBooleanString: deps.toBooleanString,
      toNumberString: deps.toNumberString,
      validateGitRef: deps.validateGitRef,
    },
    figmaMcpPingDeps: {
      failJson: deps.failJson,
      readJsonBody: deps.readJsonBody,
    },
  };
}
