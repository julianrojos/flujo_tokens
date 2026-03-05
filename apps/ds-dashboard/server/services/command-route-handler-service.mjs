import {
  buildCaptureFigmaScreenshotCommandConfig,
  buildHealthSnapshotCommandConfig,
  buildRunScriptCommandArgs,
  buildSyncFigmaTokensCommandConfig,
} from "../lib/command-route-service.mjs";
import {
  buildCaptureFigmaScreenshotQueueArgs,
  buildHealthSnapshotQueueArgs,
  buildRefreshScriptQueueArgs,
  buildRunScriptQueueConfig,
  buildSyncFigmaTokensQueueArgs,
  parseScriptNameFromRoute,
} from "../lib/command-route-enqueue-service.mjs";

export function enqueueRefreshScriptJob(c, script, deps) {
  const { createApiRequestId, getSystemContext, queueNpmScript, queueJobAcceptedPayload } = deps;
  const requestId = createApiRequestId();
  const sysCtx = getSystemContext(c.req.header("x-ds-system"));
  const job = queueNpmScript(buildRefreshScriptQueueArgs({ sysCtx, requestId, script }));
  return c.json(queueJobAcceptedPayload(job), 202);
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
  const sysCtx = getSystemContext(c.req.header("x-ds-system"));
  const runConfig = buildRunScriptQueueConfig({
    scriptName: parsedScript.scriptName,
    body,
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
