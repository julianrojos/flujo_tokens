import {
  buildCaptureFigmaScreenshotCommandConfig,
  buildHealthSnapshotCommandConfig,
  buildRunScriptCommandArgs,
  buildSyncFigmaTokensCommandConfig,
} from "../lib/command-route-service.mjs";
import { spawn } from "node:child_process";
import {
  buildCaptureFigmaScreenshotQueueArgs,
  buildHealthSnapshotQueueArgs,
  buildRefreshScriptQueueArgs,
  buildRunScriptQueueConfig,
  buildSyncFigmaTokensQueueArgs,
  parseScriptNameFromRoute,
} from "../lib/command-route-enqueue-service.mjs";

// ---------------------------------------------------------------------------
// Alias resolution helpers
// ---------------------------------------------------------------------------

/**
 * Return the first value that, once stringified and trimmed, is non-empty.
 * Returns `undefined` when no candidate qualifies.
 *
 * @param {...unknown} values - Candidate values to inspect.
 * @returns {string | undefined}
 */
function pickFirstNonEmpty(...values) {
  for (const value of values) {
    const normalized = String(value || "").trim();
    if (normalized) return normalized;
  }
  return undefined;
}

/** @type {readonly string[]} */
const COMPONENT_ALIASES = /** @type {const} */ (["component", "componentName", "componentSlug"]);

/** @type {readonly string[]} */
const SPEC_FILE_ALIASES = /** @type {const} */ (["specFile", "spec_file", "spec-file"]);

/**
 * Resolve component and specFile from an incoming request body + query string,
 * collapsing all known alias variants (camelCase, snake_case, kebab-case) into
 * a single canonical pair.
 *
 * @param {Record<string, unknown>} body    - Parsed JSON body.
 * @param {(key: string) => string | undefined} queryFn - Accessor for query-string values.
 * @returns {{ component: string | undefined; specFile: string | undefined }}
 */
function normalizeComponentDocArgs(body, queryFn) {
  const component = pickFirstNonEmpty(
    ...COMPONENT_ALIASES.map((k) => body[k]),
    ...COMPONENT_ALIASES.map((k) => queryFn(k)),
  );
  const specFile = pickFirstNonEmpty(
    ...SPEC_FILE_ALIASES.map((k) => body[k]),
    ...SPEC_FILE_ALIASES.map((k) => queryFn(k)),
  );
  return { component, specFile };
}

export function enqueueRefreshScriptJob(c, script, deps) {
  const { createApiRequestId, getSystemContext, queueNpmScript, queueJobAcceptedPayload } = deps;
  const requestId = createApiRequestId();
  const sysCtx = getSystemContext(c.req.header("x-ds-system"));
  const job = queueNpmScript(buildRefreshScriptQueueArgs({ sysCtx, requestId, script }));
  return c.json(queueJobAcceptedPayload(job), 202);
}

export function handleRestartApiRoute(c, deps) {
  const { failJson, createApiRequestId } = deps;
  const requestId = createApiRequestId();
  const env = deps.processEnv || process.env;
  const isSupervised = String(env.DS_DASHBOARD_SUPERVISED || "") === "1";
  const isProduction = String(env.NODE_ENV || "").toLowerCase() === "production";
  const selfRestartDisabled = String(env.DS_DASHBOARD_DISABLE_SELF_RESTART || "") === "1";

  if (isSupervised) {
    return failJson(c, 409, {
      code: "server.restart_requires_supervisor",
      userMessage:
        "API is running under the combined dev supervisor. Restart `npm --prefix apps/ds-dashboard run dev` from your terminal.",
      recoverable: true,
      requestId,
      context: {
        restartCommand: "npm --prefix apps/ds-dashboard run dev",
      },
    });
  }

  if (isProduction || selfRestartDisabled) {
    return failJson(c, 403, {
      code: "server.restart_forbidden",
      userMessage: "Automatic API restart is disabled in this runtime.",
      recoverable: false,
      requestId,
    });
  }

  const spawnFn = deps.spawnProcessFn || spawn;
  const setTimeoutFn = deps.setTimeoutFn || setTimeout;
  const exitProcessFn = deps.exitProcessFn || ((code) => process.exit(code));
  const cwd = deps.processCwd || process.cwd();
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

  // Configurable exit delay with minimum safe threshold
  const exitDelayMs = Math.max(Number(deps.exitDelayMs) || 400, 300);

  try {
    const child = spawnFn(npmCommand, ["run", "dev:api"], {
      cwd,
      detached: true,
      stdio: "ignore",
      shell: false,
      env: {
        ...env,
        NODE_ENV: env.NODE_ENV || "development",
      },
    });
    if (typeof child?.unref === "function") child.unref();
  } catch (error) {
    return failJson(c, 500, {
      code: "server.restart_spawn_failed",
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
  if (typeof exitTimer.unref === "function") {
    exitTimer.unref();
  }

  return c.json(
    {
      ok: true,
      mode: "standalone",
      restartCommand: "npm --prefix apps/ds-dashboard run dev:api",
      message: "API restart requested.",
      requestId,
    },
    202,
  );
}

export async function handleRunScriptRoute(c, deps) {
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
  const parsedScript = parseScriptNameFromRoute(c.req.param("script"), requestId);
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
    "spec-file": specFile,
    fromStep: pickFirstNonEmpty(body.fromStep, c.req.query("fromStep")),
    onlyStep: pickFirstNonEmpty(body.onlyStep, c.req.query("onlyStep")),
  };
  const sysCtx = getSystemContext(c.req.header("x-ds-system"));

  if (parsedScript.scriptName === "ds:component-doc") {
    if (!specFile && !component) {
      return failJson(c, 400, {
        code: "validation.component_doc_args_required",
        userMessage: "Either componentName or specFile is required.",
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
    execute: async ({ emitChunk, setProcess }) =>
      await runQueuedSpawnCommand({
        ...runConfig.runCommand,
        emitChunk,
        registerProcess: setProcess,
      }),
  });

  return c.json(queueJobAcceptedPayload(job), 202);
}

export function handleRefreshNamingDebtRoute(c, deps) {
  const { createApiRequestId, getSystemContext, enqueueRefreshNamingDebtJob, queueJobAcceptedPayload } = deps;
  const requestId = createApiRequestId();
  const sysCtx = getSystemContext(c.req.header("x-ds-system"));
  const job = enqueueRefreshNamingDebtJob({
    sysCtx,
    requestId,
  });
  return c.json(queueJobAcceptedPayload(job), 202);
}

export async function handleCaptureHealthSnapshotRoute(c, deps) {
  const {
    failJson,
    createApiRequestId,
    getSystemContext,
    readJsonBody,
    validateGitRef,
    toBooleanString,
    queueNodeJsonCommand,
    queueJobAcceptedPayload,
  } = deps;

  const requestId = createApiRequestId();
  const sysCtx = getSystemContext(c.req.header("x-ds-system"));
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

  const job = queueNodeJsonCommand(buildHealthSnapshotQueueArgs({ sysCtx, requestId, parsed }));
  return c.json(queueJobAcceptedPayload(job), 202);
}

export async function handleSyncFigmaTokensRoute(c, deps) {
  const {
    createApiRequestId,
    getSystemContext,
    readJsonBody,
    toBooleanString,
    queueNodeJsonCommand,
    queueJobAcceptedPayload,
  } = deps;

  const requestId = createApiRequestId();
  const sysCtx = getSystemContext(c.req.header("x-ds-system"));
  const body = await readJsonBody(c);
  const parsed = buildSyncFigmaTokensCommandConfig({
    body,
    toBooleanString,
  });

  const job = queueNodeJsonCommand(buildSyncFigmaTokensQueueArgs({ sysCtx, requestId, parsed }));
  return c.json(queueJobAcceptedPayload(job), 202);
}

export async function handleCaptureFigmaScreenshotRoute(c, deps) {
  const {
    failJson,
    createApiRequestId,
    getSystemContext,
    readJsonBody,
    toBooleanString,
    toNumberString,
    queueNodeJsonCommand,
    queueJobAcceptedPayload,
  } = deps;

  const requestId = createApiRequestId();
  const sysCtx = getSystemContext(c.req.header("x-ds-system"));
  const body = await readJsonBody(c);
  const parsed = buildCaptureFigmaScreenshotCommandConfig({
    body,
    toBooleanString,
    toNumberString,
  });
  if (!parsed.ok) {
    return failJson(c, 400, {
      ...parsed.errorArgs,
      requestId,
    });
  }

  const job = queueNodeJsonCommand(buildCaptureFigmaScreenshotQueueArgs({ sysCtx, requestId, parsed }));
  return c.json(queueJobAcceptedPayload(job), 202);
}
