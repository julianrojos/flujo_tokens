import path from "node:path";

import { countTbdValues } from "./spec-token-mapping.mjs";
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
    renderDir: path.join(docsRootDir, "_generated", "figma_doc_models"),
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
