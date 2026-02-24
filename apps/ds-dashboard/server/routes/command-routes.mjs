import {
  buildCaptureFigmaScreenshotCommandConfig,
  buildHealthSnapshotCommandConfig,
  buildRunScriptCommandArgs,
  buildSyncFigmaTokensCommandConfig,
} from "../lib/command-route-service.mjs";

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
    const job = queueNpmScript({
      repoRoot: sysCtx.repoRoot,
      script,
      systemId: sysCtx.systemId,
      requestId,
    });
    return c.json(queueJobAcceptedPayload(job), 202);
  }

  app.post("/api/run/:script", async (c) => {
    const requestId = createApiRequestId();
    const scriptName = String(c.req.param("script") || "").trim();
    if (!scriptName) {
      return failJson(c, 400, {
        code: "validation.missing_script_name",
        userMessage: "Missing script name in URL.",
        recoverable: true,
        requestId,
      });
    }

    const body = await readJsonBody(c);
    const sysCtx = getSystemContext(c.req.header("x-ds-system"));
    const { args } = buildRunScriptCommandArgs({
      scriptName,
      body,
      systemId: sysCtx.systemId,
    });

    const commandLabel = `npm ${args.join(" ")}`;
    const job = enqueueQueueJob({
      label: commandLabel,
      systemId: sysCtx.systemId,
      operationName: `run:${scriptName}`,
      requestId,
      inputHash: sha256Text(
        JSON.stringify({
          command: "npm",
          args,
          cwd: sysCtx.repoRoot,
          systemId: sysCtx.systemId,
          scriptName,
        }),
      ),
      execute: async ({ emitChunk, setProcess }) =>
        await runQueuedSpawnCommand({
          cwd: sysCtx.repoRoot,
          command: "npm",
          commandArgs: args,
          emitChunk,
          registerProcess: setProcess,
          commandLabel,
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

    const job = queueNodeJsonCommand({
      repoRoot: sysCtx.repoRoot,
      commandLabel: parsed.commandLabel,
      scriptPath: sysCtx.healthSnapshotScriptPath,
      systemId: sysCtx.systemId,
      requestId,
      scriptArgs: parsed.scriptArgs,
    });
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

    const job = queueNodeJsonCommand({
      repoRoot: sysCtx.repoRoot,
      commandLabel: `node tooling/scripts/ds-tokens-from-figma.mjs ${commandDisplayArgs.join(" ")}`,
      scriptPath: sysCtx.tokensFromFigmaScriptPath,
      systemId: sysCtx.systemId,
      requestId,
      scriptArgs: commandArgs,
      allowNonZeroJson: true,
    });
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

    const job = queueNodeJsonCommand({
      repoRoot: sysCtx.repoRoot,
      commandLabel: `node tooling/scripts/ds-capture-from-figma-url.mjs ${parsed.commandDisplayArgs.join(" ")}`,
      scriptPath: sysCtx.captureFromFigmaUrlScriptPath,
      systemId: sysCtx.systemId,
      requestId,
      scriptArgs: parsed.commandArgs,
      allowNonZeroJson: true,
    });
    return c.json(queueJobAcceptedPayload(job), 202);
  });
}
