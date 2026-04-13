/**
 * Command Route Handler Service
 *
 * Handles command-related route logic.
 */

import { spawn, type SpawnOptions } from 'node:child_process';
import type { Context } from 'hono';

import {
  buildCaptureFigmaScreenshotCommandConfig,
  buildHealthSnapshotCommandConfig,
  isInvalidTokensSourceError,
  buildRunScriptCommandArgs,
} from '../lib/command-route-service.ts';
import {
  buildCaptureFigmaScreenshotQueueArgs,
  buildRefreshScriptQueueArgs,
  buildRunScriptQueueConfig,
  parseScriptNameFromRoute,
} from '../lib/command-route-enqueue-service.ts';
import { resolveFileKeyForSystem, syncDesignSystemFromPlugin } from './figma-db-sync-service.ts';
import { getPluginConnectionManager } from './plugin-connection-manager.ts';
import { persistCapturePayloadToComponentRepo } from './capture-db-persistence-service.ts';
import {
  captureHealthSnapshotDbOnly,
  refreshComponentsHealthSnapshotDbOnly,
  refreshRegistryDbOnly,
  refreshTokenGraphDbOnly,
  refreshTokenHealthSnapshotDbOnly,
  refreshUsageIndexDbOnly,
} from './ops-db-maintenance-service.ts';

// ---------------------------------------------------------------------------
// Alias resolution helpers
// ---------------------------------------------------------------------------

const COMPONENT_ALIASES = ['component', 'componentName', 'componentSlug'] as const;
const SPEC_FILE_ALIASES = ['specFile', 'spec_file', 'spec-file'] as const;

/**
 * Return the first value that, once stringified and trimmed, is non-empty.
 * Returns `undefined` when no candidate qualifies.
 */
function pickFirstNonEmpty(...values: unknown[]): string | undefined {
  for (const value of values) {
    const normalized = String(value || '').trim();
    if (normalized) return normalized;
  }
  return undefined;
}

/**
 * Resolve component and specFile from an incoming request body + query string,
 * collapsing all known alias variants (camelCase, snake_case, kebab-case) into
 * a single canonical pair.
 */
function normalizeComponentDocArgs(
  body: Record<string, unknown>,
  queryFn: (key: string) => string | undefined
): { component: string | undefined; specFile: string | undefined } {
  const component = pickFirstNonEmpty(
    ...COMPONENT_ALIASES.map((k) => body[k]),
    ...COMPONENT_ALIASES.map((k) => queryFn(k))
  );
  const specFile = pickFirstNonEmpty(
    ...SPEC_FILE_ALIASES.map((k) => body[k]),
    ...SPEC_FILE_ALIASES.map((k) => queryFn(k))
  );
  return { component, specFile };
}

function failBuildCommandConfig(
  c: Context,
  deps: { failJson: (c: Context, statusCode: number, args: Record<string, unknown>) => Response },
  requestId: string,
  error: unknown
): Response {
  const { failJson } = deps;
  const message = error instanceof Error ? error.message : String(error);
  const isTokensSourceError = isInvalidTokensSourceError(error);
  return failJson(c, isTokensSourceError ? 400 : 500, {
    code: isTokensSourceError ? 'validation.invalid_tokens_source' : 'internal.command_build_failed',
    userMessage: message,
    recoverable: isTokensSourceError,
    context: { field: isTokensSourceError ? 'tokensSource' : undefined },
    requestId,
  });
}

export interface CommandRouteHandlerDeps {
  failJson: (c: Context, statusCode: number, args: Record<string, unknown>) => Response;
  createApiRequestId: () => string;
  getSystemContext: (systemHeader: string) => {
    repoRoot: string;
    systemId: string;
    figmaFileId?: string;
    captureFromFigmaUrlScriptPath: string;
  };
  queueNpmScript: (args: unknown) => { id: string };
  queueJobAcceptedPayload: (job: { id: string }) => { ok: boolean; jobId: string };
  processEnv?: Record<string, string | undefined>;
  spawnProcessFn?: RestartSpawnFn;
  setTimeoutFn?: RestartSetTimeoutFn;
  exitProcessFn?: (code?: number) => void;
  processCwd?: string;
  exitDelayMs?: number;
  readJsonBody: (c: Context) => Promise<Record<string, unknown>>;
  enqueueQueueJob: (args: unknown) => { id: string };
  sha256Text: (value: string) => string;
  runQueuedSpawnCommand: (options: unknown) => Promise<{ ok: boolean }>;
  queueNodeJsonCommand: (args: unknown) => { id: string };
  componentRepo?: import('../db/component-repository.js').ComponentRepository;
  db?: import('better-sqlite3').Database;
  tokenRepo?: import('../db/token-repository.js').TokenRepository;
  healthRepo?: import('../db/health-repository.js').HealthRepository;
  syncDesignSystemFromPluginFn?: typeof syncDesignSystemFromPlugin;
  hasPluginSocketForFile?: (fileKey: string) => boolean;
  validateGitRef: (value: string) => string | null;
  toBooleanString: (value: unknown, fallback: boolean) => string;
  toNumberString: (value: unknown, fallback: number, max: number) => string;
}

export function enqueueRefreshScriptJob(
  c: Context,
  script: string,
  deps: Pick<
    CommandRouteHandlerDeps,
    | 'failJson'
    | 'createApiRequestId'
    | 'getSystemContext'
    | 'queueNpmScript'
    | 'queueJobAcceptedPayload'
    | 'enqueueQueueJob'
    | 'sha256Text'
    | 'componentRepo'
    | 'tokenRepo'
    | 'healthRepo'
    | 'db'
  >
): Response {
  const {
    failJson,
    createApiRequestId,
    getSystemContext,
    queueNpmScript,
    queueJobAcceptedPayload,
    enqueueQueueJob,
    sha256Text,
    componentRepo,
    tokenRepo,
    healthRepo,
    db,
  } = deps;
  const requestId = createApiRequestId();
  const sysCtx = getSystemContext(c.req.header('x-ds-system') ?? '');
  const normalizedScript = String(script || '').trim();
  type RefreshDepKey = 'componentRepo' | 'db' | 'tokenRepo' | 'healthRepo';
  const queueDbOnlyJob = (args: {
    label: string;
    operationName: string;
    execute: (ctx: { emitChunk: (kind: string, text: string) => void }) => {
      ok: boolean;
      code?: number;
      summary: string;
      payload?: unknown;
    };
  }) =>
    enqueueQueueJob({
      label: args.label,
      systemId: sysCtx.systemId,
      operationName: args.operationName,
      requestId,
      inputHash: sha256Text(
        JSON.stringify({
          script: normalizedScript,
          operationName: args.operationName,
          systemId: sysCtx.systemId,
          mode: 'db-only',
        }),
      ),
      execute: async ({ emitChunk }: { emitChunk: (kind: string, text: string) => void }) =>
        args.execute({ emitChunk }),
    });

  const hasDep = (dep: RefreshDepKey): boolean => {
    if (dep === 'componentRepo') return Boolean(componentRepo);
    if (dep === 'db') return Boolean(db);
    if (dep === 'tokenRepo') return Boolean(tokenRepo);
    return Boolean(healthRepo);
  };

  const refreshDbOnlyConfigByScript: Partial<Record<string, {
    deps: RefreshDepKey[];
    build: (emitChunk: (kind: string, text: string) => void) => {
      ok: boolean;
      code?: number;
      summary: string;
      payload?: unknown;
    };
    label: string;
    operationName: string;
  }>> = {
    'ds:registry:refresh': {
      deps: ['componentRepo'],
      label: 'refresh registry (db-only)',
      operationName: 'refresh:registry',
      build: (emitChunk) =>
        refreshRegistryDbOnly({
          systemId: sysCtx.systemId,
          componentRepo: componentRepo as NonNullable<typeof componentRepo>,
          emitChunk,
        }),
    },
    'ds:token-usage-index': {
      deps: ['db', 'tokenRepo'],
      label: 'refresh token usage (db-only)',
      operationName: 'refresh:token-usage-index',
      build: (emitChunk) =>
        refreshUsageIndexDbOnly({
          systemId: sysCtx.systemId,
          emitChunk,
          db: db as NonNullable<typeof db>,
          tokenRepo: tokenRepo as NonNullable<typeof tokenRepo>,
        }),
    },
    'ds:token-graph': {
      deps: ['db', 'tokenRepo'],
      label: 'refresh token graph (db-only)',
      operationName: 'refresh:token-graph',
      build: (emitChunk) =>
        refreshTokenGraphDbOnly({
          systemId: sysCtx.systemId,
          emitChunk,
          db: db as NonNullable<typeof db>,
          tokenRepo: tokenRepo as NonNullable<typeof tokenRepo>,
          sha256Text,
        }),
    },
    'ds:token-health': {
      deps: ['db', 'tokenRepo', 'healthRepo'],
      label: 'refresh token health (db-only)',
      operationName: 'refresh:token-health',
      build: (emitChunk) =>
        refreshTokenHealthSnapshotDbOnly({
          systemId: sysCtx.systemId,
          emitChunk,
          tokenRepo: tokenRepo as NonNullable<typeof tokenRepo>,
          healthRepo: healthRepo as NonNullable<typeof healthRepo>,
          db: db as NonNullable<typeof db>,
          sha256Text,
        }),
    },
    'ds:registry:report': {
      deps: ['componentRepo', 'healthRepo'],
      label: 'refresh components health (db-only)',
      operationName: 'refresh:components-health',
      build: (emitChunk) =>
        refreshComponentsHealthSnapshotDbOnly({
          systemId: sysCtx.systemId,
          emitChunk,
          componentRepo: componentRepo as NonNullable<typeof componentRepo>,
          healthRepo: healthRepo as NonNullable<typeof healthRepo>,
          sha256Text,
        }),
    },
  };

  const dbOnlyConfig = refreshDbOnlyConfigByScript[normalizedScript];
  if (dbOnlyConfig) {
    const missingDep = dbOnlyConfig.deps.find((dep) => !hasDep(dep));
    if (missingDep) {
      return failJson(c, 500, {
        code: 'internal.refresh_dependencies_missing',
        userMessage: `Missing dependency "${missingDep}" for ${normalizedScript}.`,
        recoverable: false,
        requestId,
      });
    }
    const job = queueDbOnlyJob({
      label: dbOnlyConfig.label,
      operationName: dbOnlyConfig.operationName,
      execute: ({ emitChunk }) => dbOnlyConfig.build(emitChunk),
    });
    return c.json(queueJobAcceptedPayload(job), 202);
  }

  const job = queueNpmScript(buildRefreshScriptQueueArgs({ sysCtx, requestId, script }));
  return c.json(queueJobAcceptedPayload(job), 202);
}

export interface HandleRestartApiDeps {
  failJson: (c: Context, statusCode: number, args: Record<string, unknown>) => Response;
  createApiRequestId: () => string;
  processEnv?: Record<string, string | undefined>;
  spawnProcessFn?: RestartSpawnFn;
  setTimeoutFn?: RestartSetTimeoutFn;
  exitProcessFn?: (code?: number) => void;
  processCwd?: string;
  exitDelayMs?: number;
}

export function handleRestartApiRoute(c: Context, deps: HandleRestartApiDeps): Response {
  const { failJson, createApiRequestId } = deps;
  const requestId = createApiRequestId();
  const env = deps.processEnv ?? process.env;
  const isSupervised = String(env.DS_DASHBOARD_SUPERVISED ?? '') === '1';
  const isProduction = String(env.NODE_ENV ?? '').toLowerCase() === 'production';
  const selfRestartDisabled = String(env.DS_DASHBOARD_DISABLE_SELF_RESTART ?? '') === '1';

  if (isSupervised) {
    return failJson(c, 409, {
      code: 'server.restart_requires_supervisor',
      userMessage:
        'API is running under the combined dev supervisor. Restart `npm --prefix apps/ds-dashboard run dev` from your terminal.',
      recoverable: true,
      requestId,
      context: {
        restartCommand: 'npm --prefix apps/ds-dashboard run dev',
      },
    });
  }

  if (isProduction || selfRestartDisabled) {
    return failJson(c, 403, {
      code: 'server.restart_forbidden',
      userMessage: 'Automatic API restart is disabled in this runtime.',
      recoverable: false,
      requestId,
    });
  }

  const spawnFn: RestartSpawnFn =
    deps.spawnProcessFn ??
    ((command, args, options) => spawn(command, [...args], (options ?? {}) as SpawnOptions));
  const setTimeoutFn: RestartSetTimeoutFn =
    deps.setTimeoutFn ??
    ((callback, delayMs) => setTimeout(callback, delayMs));
  const exitProcessFn = deps.exitProcessFn ?? ((code?: number) => process.exit(code));
  const cwd = deps.processCwd ?? process.cwd();
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

  // Configurable exit delay with minimum safe threshold
  const exitDelayMs = Math.max(deps.exitDelayMs ?? 400, 300);

  try {
    const child = spawnFn(npmCommand, ['run', 'dev:api'], {
      cwd,
      detached: true,
      stdio: 'ignore',
      shell: false,
      env: {
        ...env,
        NODE_ENV: env.NODE_ENV ?? 'development',
      },
    });
    if (typeof child?.unref === 'function') child.unref();
  } catch (error) {
    return failJson(c, 500, {
      code: 'server.restart_spawn_failed',
      userMessage: error instanceof Error ? error.message : String(error),
      recoverable: true,
      requestId,
    });
  }

  // Schedule exit after response is sent
  // The delay ensures the HTTP response has time to be transmitted
  const exitTimer = setTimeoutFn(() => {
    try {
      exitProcessFn(0);
    } catch {
      // ignore process exit failures
    }
  }, exitDelayMs);

  // Prevent timer from keeping process alive if other cleanup is needed
  if (typeof exitTimer === 'object' && exitTimer !== null && typeof exitTimer.unref === 'function') {
    exitTimer.unref();
  }

  return c.json(
    {
      ok: true,
      mode: 'standalone',
      restartCommand: 'npm --prefix apps/ds-dashboard run dev:api',
      message: 'API restart requested.',
      requestId,
    },
    202
  );
}

interface RestartSpawnOptions {
  cwd?: string;
  detached?: boolean;
  stdio?: 'ignore';
  shell?: boolean;
  env?: NodeJS.ProcessEnv;
}

type RestartSpawnFn = (
  command: string,
  args: readonly string[],
  options?: RestartSpawnOptions
) => {
  unref?: () => void;
};

type RestartSetTimeoutHandle = {
  unref?: () => void;
} | number;

type RestartSetTimeoutFn = (
  callback: (...args: unknown[]) => void,
  delayMs?: number
) => RestartSetTimeoutHandle;

export async function handleRunScriptRoute(c: Context, deps: CommandRouteHandlerDeps): Promise<Response> {
  const {
    failJson,
    createApiRequestId,
    readJsonBody,
    getSystemContext,
    queueJobAcceptedPayload,
    enqueueQueueJob,
    sha256Text,
    runQueuedSpawnCommand,
  } = deps;

  const requestId = createApiRequestId();
  const parsedScript = parseScriptNameFromRoute(c.req.param('script'), requestId);
  if (!parsedScript.ok) {
    return failJson(c, parsedScript.statusCode, parsedScript.errorArgs);
  }

  const body = await readJsonBody(c);
  const { component, specFile } = normalizeComponentDocArgs(body, (key) => c.req.query(key));
  const mergedBody = {
    ...body,
    component,
    componentName: component,
    componentSlug: component,
    specFile,
    spec_file: specFile,
    'spec-file': specFile,
    fromStep: pickFirstNonEmpty(body.fromStep, c.req.query('fromStep')),
    onlyStep: pickFirstNonEmpty(body.onlyStep, c.req.query('onlyStep')),
  };
  const sysCtx = getSystemContext(c.req.header('x-ds-system') ?? '');

  if (parsedScript.scriptName === 'ds:component-doc') {
    if (!specFile && !component) {
      return failJson(c, 400, {
        code: 'validation.component_doc_args_required',
        userMessage: 'Either componentName or specFile is required.',
        recoverable: true,
        requestId,
      });
    }
  }

  const runConfig = buildRunScriptQueueConfig({
    scriptName: parsedScript.scriptName,
    body: mergedBody,
    sysCtx,
    requestId,
    buildRunScriptCommandArgsFn: buildRunScriptCommandArgs,
    sha256TextFn: sha256Text,
  });

  const job = enqueueQueueJob({
    ...runConfig.queueArgs,
    execute: async ({ emitChunk, setProcess }: { emitChunk: unknown; setProcess: unknown }) =>
      await runQueuedSpawnCommand({
        ...runConfig.runCommand,
        emitChunk,
        registerProcess: setProcess,
      }),
  });

  return c.json(queueJobAcceptedPayload(job), 202);
}

export async function handleCaptureHealthSnapshotRoute(c: Context, deps: CommandRouteHandlerDeps): Promise<Response> {
  const {
    failJson,
    createApiRequestId,
    getSystemContext,
    readJsonBody,
    validateGitRef,
    toBooleanString,
    enqueueQueueJob,
    sha256Text,
    queueJobAcceptedPayload,
    tokenRepo,
    healthRepo,
    db,
  } = deps;

  const requestId = createApiRequestId();
  const sysCtx = getSystemContext(c.req.header('x-ds-system') ?? '');
  const body = await readJsonBody(c);

  const parsed = buildHealthSnapshotCommandConfig({
    body,
    validateGitRef,
    toBooleanString,
  });
  if (!parsed.ok) {
    return failJson(c, 400, {
      ...parsed.errorArgs,
      requestId,
    });
  }

  if (!tokenRepo || !healthRepo || !db) {
    return failJson(c, 500, {
      code: 'internal.health_snapshot_dependencies_missing',
      userMessage: 'Cannot capture health snapshot: DB repositories are not initialized.',
      recoverable: false,
      requestId,
    });
  }

  const job = enqueueQueueJob({
    label: 'capture health snapshot (db-only)',
    systemId: sysCtx.systemId,
    operationName: 'capture:health-snapshot',
    requestId,
    inputHash: sha256Text(
      JSON.stringify({
        operation: 'capture:health-snapshot',
        systemId: sysCtx.systemId,
        beforeRef: parsed.beforeRef,
        retentionDays: parsed.retentionDays,
        skipDiff: parsed.skipDiff,
        allowDuplicateDay: parsed.allowDuplicateDay,
      }),
    ),
    execute: async ({ emitChunk }: { emitChunk: (kind: string, text: string) => void }) =>
      captureHealthSnapshotDbOnly({
        systemId: sysCtx.systemId,
        beforeRef: parsed.beforeRef,
        retentionDays: parsed.retentionDays,
        allowDuplicateDay: parsed.allowDuplicateDay,
        skipDiff: parsed.skipDiff,
        emitChunk,
        tokenRepo,
        healthRepo,
        db,
        sha256Text,
      }),
  });
  return c.json(queueJobAcceptedPayload(job), 202);
}

export async function handleSyncFigmaTokensRoute(c: Context, deps: CommandRouteHandlerDeps): Promise<Response> {
  const {
    createApiRequestId,
    getSystemContext,
    readJsonBody,
    toBooleanString,
    enqueueQueueJob,
    sha256Text,
    componentRepo,
    db,
    syncDesignSystemFromPluginFn = syncDesignSystemFromPlugin,
    hasPluginSocketForFile,
    queueJobAcceptedPayload,
    failJson,
  } = deps;

  const requestId = createApiRequestId();
  const sysCtx = getSystemContext(c.req.header('x-ds-system') ?? '');
  const body = await readJsonBody(c);
  const tokensSource = String(body.tokensSource ?? body.tokens_source ?? body['tokens-source'] ?? 'mcp')
    .trim()
    .toLowerCase();
  if (tokensSource && tokensSource !== 'mcp') {
    return failJson(c, 400, {
      code: 'validation.invalid_tokens_source',
      userMessage: 'Only plugin-based sync is supported (tokensSource=mcp).',
      recoverable: true,
      context: { field: 'tokensSource' },
      requestId,
    });
  }

  if (!db || !componentRepo) {
    return failJson(c, 500, {
      code: 'internal.sync_dependencies_missing',
      userMessage: 'Sync dependencies are not initialized.',
      recoverable: false,
      requestId,
    });
  }

  const figmaFileId = resolveFileKeyForSystem(sysCtx.figmaFileId, body);
  if (!figmaFileId) {
    return failJson(c, 400, {
      code: 'validation.figma_file_key_missing',
      userMessage: 'Missing Figma file key. Configure figmaFileId on the system or pass url/fileKey.',
      recoverable: true,
      requestId,
    });
  }

  const canUsePluginSocket =
    typeof hasPluginSocketForFile === 'function'
      ? hasPluginSocketForFile(figmaFileId)
      : (() => {
        const manager = getPluginConnectionManager();
        // Best-effort precheck:
        // 1) Prefer an OPEN socket bound to this exact file key.
        // 2) Fallback only when there is exactly one OPEN unkeyed socket (Draft file).
        // The socket can still disconnect before sync starts; service-level error mapping
        // provides the user-facing message in that case.
        if (manager.getPreferredSocketId(figmaFileId)) return true;
        return manager.getConnectionCount() === 1 && manager.getActiveFileKeys().length === 0;
      })();
  if (!canUsePluginSocket) {
    console.warn(`[handleSyncFigmaTokensRoute] No plugin socket available for file: ${figmaFileId}`);
    return failJson(c, 409, {
      code: 'sync.no_plugin_socket_for_file',
      userMessage:
        `No plugin connection is available for Figma file "${figmaFileId}". ` +
        'Open that exact file in Figma Desktop, run the Figma Desktop Bridge plugin, and retry.',
      recoverable: true,
      requestId,
      context: {
        figmaFileId,
      },
    });
  }

  const dryRun = toBooleanString(body.dryRun, false) === 'true';
  const includeComponents = toBooleanString(body.includeComponents, true) === 'true';
  const selectedComponentNodeIds = Array.isArray(body.selectedComponentNodeIds)
    ? body.selectedComponentNodeIds.filter((id: unknown): id is string => typeof id === 'string' && id.trim().length > 0)
    : undefined;
  const requireComponentProofs = toBooleanString(body.requireComponentProofs, true) === 'true';
  const requireVariantProofsWhenPresent = toBooleanString(body.requireVariantProofsWhenPresent, true) === 'true';

  const job = enqueueQueueJob({
    label: 'sync figma (plugin→db)',
    systemId: sysCtx.systemId,
    operationName: 'sync:figma-db',
    requestId,
    inputHash: sha256Text(
      JSON.stringify({
        systemId: sysCtx.systemId,
        figmaFileId,
        dryRun,
        includeComponents,
        importMode: selectedComponentNodeIds?.length ? 'partial' : 'full',
        selectedCount: selectedComponentNodeIds?.length || 0,
        requireComponentProofs,
        requireVariantProofsWhenPresent,
      }),
    ),
    execute: async ({ emitChunk }: { emitChunk: (kind: string, message: string) => void }) => {
      emitChunk('system', `Syncing "${sysCtx.systemId}" from plugin...`);
      const result = await syncDesignSystemFromPluginFn({
        db,
        componentRepo,
        dsId: sysCtx.systemId,
        figmaFileId,
        dryRun,
        includeComponents,
        selectedComponentNodeIds,
        requireComponentProofs,
        requireVariantProofsWhenPresent,
        captureComponentProofs: includeComponents && !dryRun,
        captureComponentProofVariants: includeComponents && !dryRun,
        repoRoot: sysCtx.repoRoot,
        reindexUsageFromFilesystem: !dryRun,
        usageReindexStrict: true,
      });
      if (result.componentsTruncated) {
        emitChunk('warning', 'Component list was truncated by the plugin search limit; missing-component reconciliation may be partial.');
      }
      if (result.usageReindexed > 0) {
        emitChunk('result', `Reindexed ${result.usageReindexed} token usage occurrence(s) from current filesystem sources.`);
      }
      if (result.usageReindexWarnings.length > 0) {
        for (const warning of result.usageReindexWarnings) {
          emitChunk('warning', warning);
        }
      }
      if (result.usageReindexStatus === 'failed' && result.usageReindexReason !== 'none') {
        emitChunk('warning', `Token usage reindex status: failed (${result.usageReindexReason}).`);
      }
      emitChunk('result', `Imported ${result.tokens} tokens and ${result.components} components.`);
      return {
        ok: true,
        code: 0,
        summary: 'Sync completed.',
        payload: result,
      };
    },
  });
  return c.json(queueJobAcceptedPayload(job), 202);
}

export async function handleCaptureFigmaScreenshotRoute(c: Context, deps: CommandRouteHandlerDeps): Promise<Response> {
  const {
    failJson,
    createApiRequestId,
    getSystemContext,
    readJsonBody,
    toBooleanString,
    toNumberString,
    queueNodeJsonCommand,
    queueJobAcceptedPayload,
    componentRepo,
  } = deps;

  const requestId = createApiRequestId();
  const sysCtx = getSystemContext(c.req.header('x-ds-system') ?? '');
  const body = await readJsonBody(c);

  let parsed;
  try {
    parsed = buildCaptureFigmaScreenshotCommandConfig({
      body,
      toBooleanString,
      toNumberString,
    });
  } catch (error) {
    return failBuildCommandConfig(c, deps, requestId, error);
  }
  if (!parsed.ok) {
    return failJson(c, 400, {
      ...parsed.errorArgs,
      requestId,
    });
  }
  if (!componentRepo) {
    return failJson(c, 500, {
      code: 'internal.component_repo_missing',
      userMessage: 'Component repository is not initialized.',
      recoverable: false,
      requestId,
    });
  }

  const queueArgs = buildCaptureFigmaScreenshotQueueArgs({ sysCtx, requestId, parsed });
  const job = queueNodeJsonCommand({
    ...queueArgs,
    onSuccess: async ({
      payload,
      emitChunk,
    }: {
      payload: unknown;
      emitChunk: (kind: string, text: string) => void;
    }) => {
      const persisted = persistCapturePayloadToComponentRepo({
        payload,
        componentRepo,
        systemId: sysCtx.systemId,
        repoRoot: sysCtx.repoRoot,
      });
      if (persisted.upserted > 0) {
        emitChunk('result', `Persisted ${persisted.upserted} captured component proof(s) to DB.`);
      }
      if (persisted.skipped > 0) {
        emitChunk(
          'warning',
          `Skipped ${persisted.skipped} captured component proof(s) without a local image path.`,
        );
      }
    },
  });
  return c.json(queueJobAcceptedPayload(job), 202);
}
