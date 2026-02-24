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
    const args = ["run", scriptName, "--", "--system", sysCtx.systemId];

    if (scriptName === "ds:pipeline") {
      if (body.all) args.push("--all");
      if (body.component) {
        args.push("--component", String(body.component));
      }
      if (body.fromStep) {
        args.push("--from-step", String(body.fromStep));
      }
      if (body.dryRun) args.push("--status-only");
    }

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

  app.post("/api/refresh-registry", (c) => {
    const requestId = createApiRequestId();
    const sysCtx = getSystemContext(c.req.header("x-ds-system"));
    const job = queueNpmScript({
      repoRoot: sysCtx.repoRoot,
      script: "ds:registry:refresh",
      systemId: sysCtx.systemId,
      requestId,
    });
    return c.json(queueJobAcceptedPayload(job), 202);
  });

  app.post("/api/refresh-token-usage-index", (c) => {
    const requestId = createApiRequestId();
    const sysCtx = getSystemContext(c.req.header("x-ds-system"));
    const job = queueNpmScript({
      repoRoot: sysCtx.repoRoot,
      script: "ds:token-usage-index",
      systemId: sysCtx.systemId,
      requestId,
    });
    return c.json(queueJobAcceptedPayload(job), 202);
  });

  app.post("/api/refresh-token-graph", (c) => {
    const requestId = createApiRequestId();
    const sysCtx = getSystemContext(c.req.header("x-ds-system"));
    const job = queueNpmScript({
      repoRoot: sysCtx.repoRoot,
      script: "ds:token-graph",
      systemId: sysCtx.systemId,
      requestId,
    });
    return c.json(queueJobAcceptedPayload(job), 202);
  });

  app.post("/api/refresh-token-health", (c) => {
    const requestId = createApiRequestId();
    const sysCtx = getSystemContext(c.req.header("x-ds-system"));
    const job = queueNpmScript({
      repoRoot: sysCtx.repoRoot,
      script: "ds:token-health",
      systemId: sysCtx.systemId,
      requestId,
    });
    return c.json(queueJobAcceptedPayload(job), 202);
  });

  app.post("/api/refresh-components-health", (c) => {
    const requestId = createApiRequestId();
    const sysCtx = getSystemContext(c.req.header("x-ds-system"));
    const job = queueNpmScript({
      repoRoot: sysCtx.repoRoot,
      script: "ds:registry:report",
      systemId: sysCtx.systemId,
      requestId,
    });
    return c.json(queueJobAcceptedPayload(job), 202);
  });

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

    const beforeRefRaw = String(body.beforeRef ?? "HEAD~1").trim();
    const beforeRef = validateGitRef(beforeRefRaw);
    if (!beforeRef) {
      return failJson(c, 400, {
        code: "validation.invalid_git_ref",
        userMessage: "Invalid beforeRef. Allowed characters: A-Z a-z 0-9 . _ / ~ ^ -",
        recoverable: true,
        context: { beforeRef: beforeRefRaw },
        requestId,
      });
    }

    const retentionDaysRaw = Number(body.retentionDays);
    const retentionDays =
      Number.isFinite(retentionDaysRaw) && retentionDaysRaw > 0
        ? String(Math.floor(retentionDaysRaw))
        : "120";
    const skipDiff = toBooleanString(body.skipDiff, false);

    const job = queueNodeJsonCommand({
      repoRoot: sysCtx.repoRoot,
      commandLabel:
        `node tooling/scripts/ds-health-snapshot.mjs --before-ref ${beforeRef} ` +
        `--retention-days ${retentionDays} --skip-diff ${skipDiff}`,
      scriptPath: sysCtx.healthSnapshotScriptPath,
      systemId: sysCtx.systemId,
      requestId,
      scriptArgs: [
        "--before-ref",
        beforeRef,
        "--retention-days",
        retentionDays,
        "--skip-diff",
        skipDiff,
        "--format",
        "json",
      ],
    });
    return c.json(queueJobAcceptedPayload(job), 202);
  });

  app.post("/api/sync-figma-tokens", async (c) => {
    const requestId = createApiRequestId();
    const sysCtx = getSystemContext(c.req.header("x-ds-system"));
    const body = await readJsonBody(c);
    const figmaUrl = String(body.url ?? body.figmaUrl ?? "").trim();
    const figmaToken = String(body.figmaToken ?? "").trim();
    const force = toBooleanString(body.force, false);
    const merge = toBooleanString(body.merge, false);
    const compile = toBooleanString(body.compile, true);
    const dryRun = toBooleanString(body.dryRun, true);

    const commandArgs = [
      "--force",
      force,
      "--merge",
      merge,
      "--compile",
      compile,
      "--dry-run",
      dryRun,
    ];
    if (figmaUrl) commandArgs.push("--url", figmaUrl);
    if (figmaToken) commandArgs.push("--figma-token", figmaToken);

    const commandDisplayArgs = [...commandArgs];
    const tokenIdx = commandDisplayArgs.indexOf("--figma-token");
    if (tokenIdx >= 0 && tokenIdx + 1 < commandDisplayArgs.length) {
      commandDisplayArgs[tokenIdx + 1] = "***redacted***";
    }

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
    const figmaUrl = String(body.figmaUrl ?? body.url ?? "").trim();
    if (!figmaUrl) {
      return failJson(c, 400, {
        code: "validation.figma_url_required",
        userMessage: "figmaUrl is required in request body.",
        recoverable: true,
        context: { field: "figmaUrl" },
        requestId,
      });
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(figmaUrl);
    } catch {
      return failJson(c, 400, {
        code: "validation.invalid_figma_url",
        userMessage: "Invalid figmaUrl.",
        recoverable: true,
        context: { figmaUrl },
        requestId,
      });
    }
    const host = String(parsedUrl.hostname || "").toLowerCase();
    if (host !== "figma.com" && !host.endsWith(".figma.com")) {
      return failJson(c, 400, {
        code: "validation.invalid_figma_host",
        userMessage: `URL host is not figma.com: ${host}`,
        recoverable: true,
        context: { host, figmaUrl },
        requestId,
      });
    }

    const componentSlug = String(body.componentSlug ?? "").trim().toLowerCase();
    const figmaToken = String(body.figmaToken ?? "").trim();
    const includeVariants = toBooleanString(body.includeVariants, true);
    const requireExistingDoc = toBooleanString(body.requireExistingDoc, true);
    const continueOnError = toBooleanString(body.continueOnError, true);
    const refreshIndices = toBooleanString(body.refreshIndices, true);
    const dryRun = toBooleanString(body.dryRun, false);
    const injectDocSpecs = toBooleanString(body.injectDocSpecs, false);
    const variantLimit = toNumberString(body.variantLimit, 6, 20);
    const scale = toNumberString(body.scale, 2, 4);
    const format = String(body.format ?? "png").trim().toLowerCase() || "png";
    const mainCaptureMode = String(body.mainCaptureMode ?? "rest").trim().toLowerCase() || "rest";
    const componentKind =
      String(body.componentKind ?? "component_set").trim().toLowerCase() || "component_set";

    const commandArgs = [
      "--url",
      figmaUrl,
      "--include-variants",
      includeVariants,
      "--variant-limit",
      variantLimit,
      "--require-existing-doc",
      requireExistingDoc,
      "--continue-on-error",
      continueOnError,
      "--refresh-indices",
      refreshIndices,
      "--dry-run",
      dryRun,
      "--inject-doc-specs",
      injectDocSpecs,
      "--scale",
      scale,
      "--format",
      format,
      "--main-capture-mode",
      mainCaptureMode,
      "--component-kind",
      componentKind,
    ];
    if (componentSlug) commandArgs.push("--component-slug", componentSlug);
    if (figmaToken) commandArgs.push("--figma-token", figmaToken);

    const commandDisplayArgs = [...commandArgs];
    const tokenIdx = commandDisplayArgs.indexOf("--figma-token");
    if (tokenIdx >= 0 && tokenIdx + 1 < commandDisplayArgs.length) {
      commandDisplayArgs[tokenIdx + 1] = "***redacted***";
    }

    const job = queueNodeJsonCommand({
      repoRoot: sysCtx.repoRoot,
      commandLabel: `node tooling/scripts/ds-capture-from-figma-url.mjs ${commandDisplayArgs.join(" ")}`,
      scriptPath: sysCtx.captureFromFigmaUrlScriptPath,
      systemId: sysCtx.systemId,
      requestId,
      scriptArgs: commandArgs,
      allowNonZeroJson: true,
    });
    return c.json(queueJobAcceptedPayload(job), 202);
  });
}
