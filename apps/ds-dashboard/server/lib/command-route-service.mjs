function toTrimmed(value) {
  return String(value || "").trim();
}

function toLowerTrimmed(value) {
  return toTrimmed(value).toLowerCase();
}

function redactFigmaToken(args) {
  const commandDisplayArgs = [...args];
  const tokenIdx = commandDisplayArgs.indexOf("--figma-token");
  if (tokenIdx >= 0 && tokenIdx + 1 < commandDisplayArgs.length) {
    commandDisplayArgs[tokenIdx + 1] = "***redacted***";
  }
  return commandDisplayArgs;
}

export function buildRunScriptCommandArgs({ scriptName, body, systemId }) {
  const args = ["run", scriptName, "--", "--system", systemId];
  if (scriptName !== "ds:pipeline") return { args };
  if (body.all) args.push("--all");
  if (body.component) args.push("--component", String(body.component));
  if (body.fromStep) args.push("--from-step", String(body.fromStep));
  if (body.dryRun) args.push("--status-only");
  return { args };
}

export function buildHealthSnapshotCommandConfig({ body, validateGitRef, toBooleanString }) {
  const beforeRefRaw = toTrimmed(body.beforeRef ?? "HEAD~1");
  const beforeRef = validateGitRef(beforeRefRaw);
  if (!beforeRef) {
    return {
      ok: false,
      errorArgs: {
        code: "validation.invalid_git_ref",
        userMessage: "Invalid beforeRef. Allowed characters: A-Z a-z 0-9 . _ / ~ ^ -",
        recoverable: true,
        context: { beforeRef: beforeRefRaw },
      },
    };
  }

  const retentionDaysRaw = Number(body.retentionDays);
  const retentionDays =
    Number.isFinite(retentionDaysRaw) && retentionDaysRaw > 0 ? String(Math.floor(retentionDaysRaw)) : "120";
  const skipDiff = toBooleanString(body.skipDiff, false);

  return {
    ok: true,
    commandLabel:
      `node tooling/scripts/ds-health-snapshot.mjs --before-ref ${beforeRef} ` +
      `--retention-days ${retentionDays} --skip-diff ${skipDiff}`,
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
  };
}

export function buildSyncFigmaTokensCommandConfig({ body, toBooleanString }) {
  const figmaUrl = toTrimmed(body.url ?? body.figmaUrl);
  const figmaToken = toTrimmed(body.figmaToken);
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

  return {
    commandArgs,
    commandDisplayArgs: redactFigmaToken(commandArgs),
  };
}

export function buildCaptureFigmaScreenshotCommandConfig({ body, toBooleanString, toNumberString }) {
  const figmaUrl = toTrimmed(body.figmaUrl ?? body.url);
  if (!figmaUrl) {
    return {
      ok: false,
      errorArgs: {
        code: "validation.figma_url_required",
        userMessage: "figmaUrl is required in request body.",
        recoverable: true,
        context: { field: "figmaUrl" },
      },
    };
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(figmaUrl);
  } catch {
    return {
      ok: false,
      errorArgs: {
        code: "validation.invalid_figma_url",
        userMessage: "Invalid figmaUrl.",
        recoverable: true,
        context: { figmaUrl },
      },
    };
  }

  const host = toLowerTrimmed(parsedUrl.hostname);
  if (host !== "figma.com" && !host.endsWith(".figma.com")) {
    return {
      ok: false,
      errorArgs: {
        code: "validation.invalid_figma_host",
        userMessage: `URL host is not figma.com: ${host}`,
        recoverable: true,
        context: { host, figmaUrl },
      },
    };
  }

  const componentSlug = toLowerTrimmed(body.componentSlug);
  const figmaToken = toTrimmed(body.figmaToken);
  const includeVariants = toBooleanString(body.includeVariants, true);
  const requireExistingDoc = toBooleanString(body.requireExistingDoc, true);
  const continueOnError = toBooleanString(body.continueOnError, true);
  const refreshIndices = toBooleanString(body.refreshIndices, true);
  const dryRun = toBooleanString(body.dryRun, false);
  const injectDocSpecs = toBooleanString(body.injectDocSpecs, false);
  const variantLimit = toNumberString(body.variantLimit, 6, 20);
  const scale = toNumberString(body.scale, 2, 4);
  const format = toLowerTrimmed(body.format ?? "png") || "png";
  const mainCaptureMode = toLowerTrimmed(body.mainCaptureMode ?? "rest") || "rest";
  const componentKind = toLowerTrimmed(body.componentKind ?? "component_set") || "component_set";

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

  return {
    ok: true,
    commandArgs,
    commandDisplayArgs: redactFigmaToken(commandArgs),
  };
}
