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

export function registerCommandRoutes(app, deps) {
  const {
    failJson,
    createApiRequestId,
    readJsonBody,
    getSystemContext,
    queueJobAcceptedPayload,
    enqueueQueueJob,
    sha256Text,
    runQueuedSpawnCommand,
    queueNpmScript,
    enqueueRefreshNamingDebtJob,
    queueNodeJsonCommand,
    toBooleanString,
    toNumberString,
    validateGitRef,
  } = deps;

  function enqueueRefreshScriptJob(c, script) {
    const requestId = createApiRequestId();
    const sysCtx = getSystemContext(c.req.header("x-ds-system"));
    const job = queueNpmScript(buildRefreshScriptQueueArgs({ sysCtx, requestId, script }));
    return c.json(queueJobAcceptedPayload(job), 202);
  }

  app.post("/api/run/:script", async (c) => {
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
  });

  app.post("/api/refresh-registry", (c) => enqueueRefreshScriptJob(c, "ds:registry:refresh"));
  app.post("/api/refresh-token-usage-index", (c) => enqueueRefreshScriptJob(c, "ds:token-usage-index"));
  app.post("/api/refresh-token-graph", (c) => enqueueRefreshScriptJob(c, "ds:token-graph"));
  app.post("/api/refresh-token-health", (c) => enqueueRefreshScriptJob(c, "ds:token-health"));
  app.post("/api/refresh-components-health", (c) => enqueueRefreshScriptJob(c, "ds:registry:report"));

  app.post("/api/refresh-naming-debt", (c) => {
    const requestId = createApiRequestId();
    const sysCtx = getSystemContext(c.req.header("x-ds-system"));
    const job = enqueueRefreshNamingDebtJob({
      sysCtx,
      requestId,
    });
    return c.json(queueJobAcceptedPayload(job), 202);
  });

  app.post("/api/capture-health-snapshot", async (c) => {
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
  });

  app.post("/api/sync-figma-tokens", async (c) => {
    const requestId = createApiRequestId();
    const sysCtx = getSystemContext(c.req.header("x-ds-system"));
    const body = await readJsonBody(c);
    const { commandArgs, commandDisplayArgs } = buildSyncFigmaTokensCommandConfig({
      body,
      toBooleanString,
    });
    const parsed = { commandArgs, commandDisplayArgs };

    const job = queueNodeJsonCommand(buildSyncFigmaTokensQueueArgs({ sysCtx, requestId, parsed }));
    return c.json(queueJobAcceptedPayload(job), 202);
  });

  app.post("/api/capture-figma-screenshot", async (c) => {
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
  });
}
