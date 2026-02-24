export function parseScriptNameFromRoute(rawScriptName, requestId) {
  const scriptName = String(rawScriptName || "").trim();
  if (scriptName) return { ok: true, scriptName };
  return {
    ok: false,
    statusCode: 400,
    errorArgs: {
      code: "validation.missing_script_name",
      userMessage: "Missing script name in URL.",
      recoverable: true,
      requestId,
    },
  };
}

export function buildRefreshScriptQueueArgs({ sysCtx, requestId, script }) {
  return {
    repoRoot: sysCtx.repoRoot,
    script,
    systemId: sysCtx.systemId,
    requestId,
  };
}

export function buildRunScriptQueueConfig({
  scriptName,
  body,
  sysCtx,
  requestId,
  buildRunScriptCommandArgsFn,
  sha256TextFn,
}) {
  const { args } = buildRunScriptCommandArgsFn({
    scriptName,
    body,
    systemId: sysCtx.systemId,
  });

  const commandLabel = `npm ${args.join(" ")}`;
  return {
    commandLabel,
    queueArgs: {
      label: commandLabel,
      systemId: sysCtx.systemId,
      operationName: `run:${scriptName}`,
      requestId,
      inputHash: sha256TextFn(
        JSON.stringify({
          command: "npm",
          args,
          cwd: sysCtx.repoRoot,
          systemId: sysCtx.systemId,
          scriptName,
        }),
      ),
    },
    runCommand: {
      cwd: sysCtx.repoRoot,
      command: "npm",
      commandArgs: args,
      commandLabel,
    },
  };
}

export function buildHealthSnapshotQueueArgs({ sysCtx, requestId, parsed }) {
  return {
    repoRoot: sysCtx.repoRoot,
    commandLabel: parsed.commandLabel,
    scriptPath: sysCtx.healthSnapshotScriptPath,
    systemId: sysCtx.systemId,
    requestId,
    scriptArgs: parsed.scriptArgs,
  };
}

export function buildSyncFigmaTokensQueueArgs({ sysCtx, requestId, parsed }) {
  return {
    repoRoot: sysCtx.repoRoot,
    commandLabel: `node tooling/scripts/ds-tokens-from-figma.mjs ${parsed.commandDisplayArgs.join(" ")}`,
    scriptPath: sysCtx.tokensFromFigmaScriptPath,
    systemId: sysCtx.systemId,
    requestId,
    scriptArgs: parsed.commandArgs,
    allowNonZeroJson: true,
  };
}

export function buildCaptureFigmaScreenshotQueueArgs({ sysCtx, requestId, parsed }) {
  return {
    repoRoot: sysCtx.repoRoot,
    commandLabel: `node tooling/scripts/ds-capture-from-figma-url.mjs ${parsed.commandDisplayArgs.join(" ")}`,
    scriptPath: sysCtx.captureFromFigmaUrlScriptPath,
    systemId: sysCtx.systemId,
    requestId,
    scriptArgs: parsed.commandArgs,
    allowNonZeroJson: true,
  };
}
