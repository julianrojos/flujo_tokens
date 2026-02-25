import path from "node:path";
import { runCaptureBatch } from "./capture-batch-runner.mjs";

function runNodeScriptJson({ repoRoot, scriptPath, scriptArgs, runJsonCommandFn }) {
  const scriptArgsList = Array.isArray(scriptArgs) ? [...scriptArgs] : [];
  const displayArgs = [...scriptArgsList];
  const tokenArgIndex = displayArgs.indexOf("--figma-token");
  if (tokenArgIndex >= 0 && tokenArgIndex + 1 < displayArgs.length) {
    displayArgs[tokenArgIndex + 1] = "***redacted***";
  }

  const result = runJsonCommandFn(process.execPath, [scriptPath, ...scriptArgsList], {
    cwd: repoRoot,
    displayArgs: [path.relative(repoRoot, scriptPath), ...displayArgs],
  });
  return result.data;
}

export function executeCaptureBatchAndRefresh({
  report,
  targets,
  projectRoot,
  systemId,
  runCaptureBatchFn = runCaptureBatch,
  runJsonCommandFn,
  continueOnError,
  figmaToken,
  format,
  scale,
  proofDir,
  proofImageDir,
  includeVariants,
  variantLimit,
  agent,
  mainCaptureMode,
  refreshIndices,
}) {
  const captureScriptPath = path.join(projectRoot, "tooling", "scripts", "ds-capture-visual-proof.mjs");
  const registryRefreshScriptPath = path.join(projectRoot, "tooling", "scripts", "ds-registry-refresh.mjs");

  const captureBatch = runCaptureBatchFn({
    targets,
    repoRoot: projectRoot,
    captureScriptPath,
    runScriptJson: (params) =>
      runNodeScriptJson({
        ...params,
        repoRoot: projectRoot,
        runJsonCommandFn,
      }),
    continueOnError,
    figmaToken,
    format,
    scale,
    proofDir,
    proofImageDir,
    includeVariants,
    variantLimit,
    agent,
    mainCaptureMode,
  });
  
  report.captured = captureBatch.captured;
  report.failed = captureBatch.failed;

  if (refreshIndices) {
    const refreshArgs = ["--system", systemId];
    const refreshResult = runNodeScriptJson({
      repoRoot: projectRoot,
      scriptPath: registryRefreshScriptPath,
      scriptArgs: refreshArgs,
      runJsonCommandFn,
    });
    report.indices_refreshed = Boolean(refreshResult?.ok);
    report.registry_refresh = refreshResult;
  }

  report.ok = report.captured.length > 0 && report.failed.length === 0;
  return report;
}
