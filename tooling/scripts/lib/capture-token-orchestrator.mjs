import {
  bootstrapInputJsonFromFigmaVariables,
  ensureCollectionsConfigured,
  getSystemConfig,
  runTokensCompileIfNeeded,
} from "./capture-system-bootstrap.mjs";

export async function orchestrateTokenSync({
  dryRun,
  projectRoot,
  systemId,
  fileKey,
  figmaToken,
  getSystemConfigFn = getSystemConfig,
  bootstrapInputJsonFromFigmaVariablesFn = bootstrapInputJsonFromFigmaVariables,
  ensureCollectionsConfiguredFn = ensureCollectionsConfigured,
  runTokensCompileIfNeededFn = runTokensCompileIfNeeded,
}) {
  let tokenBootstrap = {
    attempted: false,
    created: false,
    reason: dryRun ? "skipped-dry-run" : "not-run",
  };
  let tokenCompile = {
    attempted: false,
    compiled: false,
    reason: dryRun ? "skipped-dry-run" : "not-run",
  };

  if (!dryRun) {
    let systemConfig = getSystemConfigFn({ repoRoot: projectRoot, systemId });
    tokenBootstrap = await bootstrapInputJsonFromFigmaVariablesFn({
      repoRoot: projectRoot,
      system: systemConfig,
      fileKey,
      figmaToken,
    });
    ensureCollectionsConfiguredFn({ repoRoot: projectRoot, systemId });
    systemConfig = getSystemConfigFn({ repoRoot: projectRoot, systemId });
    tokenCompile = runTokensCompileIfNeededFn({
      repoRoot: projectRoot,
      system: systemConfig,
    });
  }

  return { tokenBootstrap, tokenCompile };
}
