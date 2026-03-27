import path from "node:path";

import { countTbdValues } from "./spec-normalizer.mjs";
import { buildSpecGenerationResult } from "./spec-result.mjs";

export function finalizeSpecResult({
  outputPath,
  normalizedSpec,
  componentName,
  nodeId,
  prefilledCount,
  validationReport,
  resolvedSpecRoot,
  docsRootDir,
  overviewPath,
  registryIndexPath,
  syncDocumentationIndicesFn,
}) {
  const indicesSync = syncDocumentationIndicesFn({
    specsDir: resolvedSpecRoot,
    docsDir: path.join(docsRootDir, "components"),
    overviewPath,
    proofsDir: path.join(docsRootDir, "_generated", "visual-proofs"),
    registryPath: registryIndexPath,
  });

  return buildSpecGenerationResult({
    outputPath,
    normalizedSpec,
    componentName,
    nodeId,
    prefilledCount,
    unresolvedTbdCount: countTbdValues(normalizedSpec),
    validationReport,
    indicesSync,
  });
}
