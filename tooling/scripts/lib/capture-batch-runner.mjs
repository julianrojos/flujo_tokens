import path from "node:path";

export function buildCaptureArgs({
  target,
  figmaToken,
  format,
  scale,
  proofDir,
  proofImageDir,
  includeVariants,
  variantLimit,
  agent,
  mainCaptureMode,
}) {
  const captureArgs = [
    "--markdown",
    target.markdownPath,
    "--component-set-id",
    target.nodeId,
    "--url",
    target.nodeUrl,
    "--figma-token",
    figmaToken,
    "--format",
    format,
    "--scale",
    String(scale),
    "--proof-dir",
    proofDir,
    "--proof-image-dir",
    proofImageDir,
    "--include-variants",
    includeVariants ? "true" : "false",
    "--variant-limit",
    String(variantLimit),
    "--agent",
    agent,
    "--main-capture-mode",
    mainCaptureMode,
    "--skip-index-sync",
    "true",
  ];

  if (target.specExists) {
    captureArgs.push("--spec-file", target.specPath);
  }

  return captureArgs;
}

export function runCaptureBatch({
  targets,
  repoRoot,
  captureScriptPath,
  runScriptJson,
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
}) {
  const captured = [];
  const failed = [];

  for (const target of targets) {
    const captureArgs = buildCaptureArgs({
      target,
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

    try {
      const captureResult = runScriptJson({
        repoRoot,
        scriptPath: captureScriptPath,
        scriptArgs: captureArgs,
      });
      captured.push({
        slug: target.slug,
        node_id: target.nodeId,
        markdown_path: path.relative(repoRoot, target.markdownPath),
        proof_file_path: captureResult.proofFilePath || null,
        screenshot_url: captureResult.screenshotUrl || null,
        local_image_path: captureResult.localImagePath || null,
        variants_count: Number(captureResult.variantsCount || 0),
      });
    } catch (error) {
      failed.push({
        slug: target.slug,
        node_id: target.nodeId,
        markdown_path: path.relative(repoRoot, target.markdownPath),
        error: error instanceof Error ? error.message : String(error),
      });
      if (!continueOnError) {
        break;
      }
    }
  }

  return { captured, failed };
}
