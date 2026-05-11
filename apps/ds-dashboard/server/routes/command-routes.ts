/**
 * Command Routes
 *
 * Registers command-related API routes.
 */

import type { Context } from 'hono';

import {
  enqueueRefreshScriptJob,
  handleCaptureFigmaScreenshotRoute,
  handleRestartApiRoute,
  handleRunScriptRoute,
  handleSyncDesignSystemApplyRoute,
  handleSyncDesignSystemDryRunRoute,
  handleSyncDesignSystemVariablesDryRunRoute,
  handleSyncDesignSystemRoute,
  handleSyncDesignSystemStepRoute,
  handleSyncFigmaTokensRoute,
  type CommandRouteHandlerDeps,
  type HandleRestartApiDeps,
} from '../services/command-route-handler-service.ts';

export interface CommandRoutesDeps {
  failJson: (
    c: Context,
    statusCode: number,
    args: Record<string, unknown>,
  ) => Response;
  createApiRequestId: () => string;
  readJsonBody: (c: Context) => Promise<Record<string, unknown>>;
  getSystemContext: (
    systemHeader: string,
  ) =>
    | {
        repoRoot: string;
        systemId: string;
        figmaFileId?: string;
        captureFromFigmaUrlScriptPath: string;
      }
    | Promise<{
        repoRoot: string;
        systemId: string;
        figmaFileId?: string;
        captureFromFigmaUrlScriptPath: string;
      }>;
  queueJobAcceptedPayload: (job: { id: string }) => {
    ok: boolean;
    jobId: string;
  };
  enqueueQueueJob: (args: unknown) => { id: string };
  sha256Text: (value: string) => string;
  runQueuedSpawnCommand: (
    options: unknown,
  ) => Promise<Record<string, unknown> & { ok: boolean }>;
  runCaptureFromFigmaUrlFn?: CommandRouteHandlerDeps['runCaptureFromFigmaUrlFn'];
  searchComponentsDirectFn?: CommandRouteHandlerDeps['searchComponentsDirectFn'];
  disableLeanRestPath?: CommandRouteHandlerDeps['disableLeanRestPath'];
  queueNpmScript: (args: unknown) => { id: string };
  queueNodeJsonCommand: (args: unknown) => { id: string };
  componentRepo?: import('../db/component-repository.js').ComponentRepository;
  tokenRepo?: import('../db/token-repository.js').TokenRepository;
  db?: import('postgres').Sql;
  databaseUrl?: string;
  syncDesignSystemFromPluginFn?: CommandRouteHandlerDeps['syncDesignSystemFromPluginFn'];
  hasPluginSocketForFile?: CommandRouteHandlerDeps['hasPluginSocketForFile'];
  toBooleanString: (value: unknown, fallback: boolean) => string;
  toNumberString: (value: unknown, fallback: number, max: number) => string;
  processEnv?: Record<string, string | undefined>;
  processCwd?: string;
  spawnProcessFn?: HandleRestartApiDeps['spawnProcessFn'];
  setTimeoutFn?: HandleRestartApiDeps['setTimeoutFn'];
  exitProcessFn?: (code?: number) => void;
  exitDelayMs?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function assertJobWithId(value: unknown, source: string): { id: string } {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    value.id.length === 0
  ) {
    throw new TypeError(
      `CommandRoutesDeps.${source} must return an object with a non-empty string id.`,
    );
  }
  return { id: value.id };
}

function assertQueueJobAcceptedPayload(
  value: unknown,
  source: string,
): { ok: boolean; jobId: string } {
  if (
    !isRecord(value) ||
    typeof value.ok !== 'boolean' ||
    typeof value.jobId !== 'string' ||
    value.jobId.length === 0
  ) {
    throw new TypeError(
      `CommandRoutesDeps.${source} must return { ok: boolean; jobId: string }.`,
    );
  }
  return { ok: value.ok, jobId: value.jobId };
}

async function assertQueuedSpawnResult(
  value: Promise<unknown>,
  source: string,
): Promise<Record<string, unknown> & { ok: boolean }> {
  const resolved = await value;
  if (!isRecord(resolved) || typeof resolved.ok !== 'boolean') {
    throw new TypeError(
      `CommandRoutesDeps.${source} must resolve to an object with boolean ok.`,
    );
  }
  return resolved as Record<string, unknown> & { ok: boolean };
}

function toCommandRouteHandlerDeps(
  deps: CommandRoutesDeps,
): CommandRouteHandlerDeps {
  return {
    failJson: deps.failJson,
    createApiRequestId: deps.createApiRequestId,
    readJsonBody: deps.readJsonBody,
    getSystemContext: deps.getSystemContext,
    queueJobAcceptedPayload: (job) =>
      assertQueueJobAcceptedPayload(
        deps.queueJobAcceptedPayload(job),
        'queueJobAcceptedPayload',
      ),
    enqueueQueueJob: (args) =>
      assertJobWithId(deps.enqueueQueueJob(args), 'enqueueQueueJob'),
    sha256Text: deps.sha256Text,
    runQueuedSpawnCommand: (options) =>
      assertQueuedSpawnResult(
        deps.runQueuedSpawnCommand(options),
        'runQueuedSpawnCommand',
      ),
    runCaptureFromFigmaUrlFn: deps.runCaptureFromFigmaUrlFn,
    searchComponentsDirectFn: deps.searchComponentsDirectFn,
    disableLeanRestPath: deps.disableLeanRestPath,
    queueNpmScript: (args) =>
      assertJobWithId(deps.queueNpmScript(args), 'queueNpmScript'),
    queueNodeJsonCommand: (args) =>
      assertJobWithId(deps.queueNodeJsonCommand(args), 'queueNodeJsonCommand'),
    componentRepo: deps.componentRepo,
    tokenRepo: deps.tokenRepo,
    db: deps.db,
    databaseUrl: deps.databaseUrl,
    syncDesignSystemFromPluginFn: deps.syncDesignSystemFromPluginFn,
    hasPluginSocketForFile: deps.hasPluginSocketForFile,
    toBooleanString: deps.toBooleanString,
    toNumberString: deps.toNumberString,
    processEnv: deps.processEnv ?? process.env,
    processCwd: deps.processCwd,
    spawnProcessFn: deps.spawnProcessFn,
    setTimeoutFn: deps.setTimeoutFn,
    exitProcessFn: deps.exitProcessFn,
    exitDelayMs: deps.exitDelayMs,
  };
}

function toHandleRestartApiDeps(deps: CommandRoutesDeps): HandleRestartApiDeps {
  return {
    failJson: deps.failJson,
    createApiRequestId: deps.createApiRequestId,
    processEnv: deps.processEnv ?? process.env,
    processCwd: deps.processCwd,
    spawnProcessFn: deps.spawnProcessFn,
    setTimeoutFn: deps.setTimeoutFn,
    exitProcessFn: deps.exitProcessFn,
    exitDelayMs: deps.exitDelayMs,
  };
}

/**
 * Register command routes on the Hono app.
 */
export function registerCommandRoutes(
  app: { post: (path: string, handler: (c: Context) => unknown) => void },
  deps: CommandRoutesDeps,
): void {
  const commandDeps = toCommandRouteHandlerDeps(deps);
  const restartDeps = toHandleRestartApiDeps(deps);

  app.post('/api/run/:script', (c: Context) =>
    handleRunScriptRoute(c, commandDeps),
  );
  app.post('/api/admin/restart-api', (c: Context) =>
    handleRestartApiRoute(c, restartDeps),
  );
  app.post('/api/refresh-token-usage-index', (c: Context) =>
    enqueueRefreshScriptJob(c, 'ds:token-usage-index', commandDeps),
  );
  app.post('/api/sync-figma-tokens', (c: Context) =>
    handleSyncFigmaTokensRoute(c, commandDeps),
  );
  app.post('/api/:systemId/sync/dry-run', (c: Context) =>
    handleSyncDesignSystemDryRunRoute(c, commandDeps),
  );
  app.post('/api/:systemId/sync/variables/dry-run', (c: Context) =>
    handleSyncDesignSystemVariablesDryRunRoute(c, commandDeps),
  );
  app.post('/api/:systemId/sync/apply', (c: Context) =>
    handleSyncDesignSystemApplyRoute(c, commandDeps),
  );
  app.post('/api/sync-design-system', (c: Context) =>
    handleSyncDesignSystemRoute(c, commandDeps),
  );
  app.post('/api/sync-design-system/step/:step', (c: Context) =>
    handleSyncDesignSystemStepRoute(c, commandDeps),
  );
  app.post('/api/capture-figma-screenshot', (c: Context) =>
    handleCaptureFigmaScreenshotRoute(c, commandDeps),
  );
}
