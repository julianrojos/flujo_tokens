import { resolveSystemContextSafe } from "./system-context.mjs";
import { loadTokenRegistry } from "./token-registry.mjs";
import { runSpecGenerationPrompt, runSpecRepairPrompt } from "./spec-agent-runner.mjs";
import { createSpecRunContext } from "./spec-run-context.mjs";
import { buildSpecPromptWithRegistry, loadRegistryOrThrow } from "./spec-registry-prompt.mjs";
import { runSpecGenerationFlow } from "./spec-generation-flow.mjs";
import { finalizeSpecResult } from "./spec-finalization.mjs";
import { runSpecWithGuards } from "./spec-runner.mjs";
import { validateGeneratedSpec } from "./spec-validation.mjs";
import {
  ensureSpecOutputDirectory,
  ensureSpecTemplateExists,
  materializeSpec,
} from "./spec-write-adapter.mjs";
import { assertEvidenceGatedScalarChanges } from "./evidence-gated-mutations.mjs";
import { assertScopedWritePolicy, captureScopedWriteSnapshot } from "./scoped-write-guard.mjs";
import { syncDocumentationIndices } from "./component-registry/index.mjs";
import { writeSpecWithSnapshotGuard } from "./spec-writer.mjs";

import { createPipelineContext } from "./pipeline-context.mjs";

const SPEC_EVIDENCE_BACKED_PREFIXES = Object.freeze([
  "name",
  "figma.file",
  "figma.page",
  "figma.component_set",
  "figma.component_set_node_id",
  "properties",
  "anatomy",
]);

export function runSpecFromFigma(args, deps = {}) {
  const {
    loadTokenRegistryFn = loadTokenRegistry,
    captureScopedWriteSnapshotFn = captureScopedWriteSnapshot,
    assertScopedWritePolicyFn = assertScopedWritePolicy,
    ensureSpecTemplateExistsFn = ensureSpecTemplateExists,
    ensureSpecOutputDirectoryFn = ensureSpecOutputDirectory,
    materializeSpecFn = materializeSpec,
    assertEvidenceGatedScalarChangesFn = assertEvidenceGatedScalarChanges,
    runSpecGenerationPromptFn = runSpecGenerationPrompt,
    runSpecRepairPromptFn = runSpecRepairPrompt,
    validateGeneratedSpecFn = validateGeneratedSpec,
    syncDocumentationIndicesFn = syncDocumentationIndices,
    runSpecWithGuardsFn = runSpecWithGuards,
    createPipelineContextFn = createPipelineContext,
    writeSpecWithSnapshotGuardFn = writeSpecWithSnapshotGuard,
  } = deps;

  const context = createPipelineContextFn(args);

  const runCtx = createSpecRunContext({ context, args });
  const {
    figmaUrl,
    componentName,
    componentSlug,
    resolvedSpecRoot,
    docsRootDir,
    templatePath,
    registryPath,
    skipValidation,
    allowNonEvidenceUpdates,
    agent,
    fileKeyFromUrl,
    nodeId,
    outputPath,
    overviewPath,
    registryDbPath,
    allowedWritePaths,
  } = runCtx;

  return runSpecWithGuardsFn({
    outputPath,
    resolvedSpecRoot,
    docsPath: context.system.paths.docs,
    registryDbPath,
    allowedWritePaths,
    captureScopedWriteSnapshotFn,
    assertScopedWritePolicyFn,
    run: ({ existingSpec }) => {
      ensureSpecTemplateExistsFn(templatePath);

      const registryIndex = loadRegistryOrThrow({
        loadTokenRegistryFn,
        registryPath,
      });

      const prompt = buildSpecPromptWithRegistry({
        figmaUrl,
        nodeId,
        componentName,
        componentSlug,
        outputPath,
        templatePath,
        registryPath,
        fileKeyFromUrl,
        registryIndex,
      });

      ensureSpecOutputDirectoryFn(outputPath);



      const { normalizedSpec, prefilledCount, validationReport } = runSpecGenerationFlow({
        prompt,
        agent,
        componentName,
        nodeId,
        skipValidation,
        outputPath,
        registryPath,
        runSpecGenerationPromptFn,
        runSpecRepairPromptFn,
        validateGeneratedSpecFn,
        materializeGeneratedSpec: () => {
           const result = materializeSpecFn({
              outputPath,
              templatePath,
              registryIndex,
              componentName,
              nodeId,
              fileKeyFromUrl,
              existingSpec,
              allowNonEvidenceUpdates,
              evidenceGate: assertEvidenceGatedScalarChangesFn,
              evidenceBackedPrefixes: SPEC_EVIDENCE_BACKED_PREFIXES,
            });
            writeSpecWithSnapshotGuardFn({
              outputPath,
              normalizedSpec: result.normalizedSpec
            });
            return result;
        },
      });

      return finalizeSpecResult({
        outputPath,
        normalizedSpec,
        componentName,
        nodeId,
        prefilledCount,
        validationReport,
        resolvedSpecRoot,
        docsRootDir,
        overviewPath,
        registryDbPath,
        systemId: context.system.id,
        syncDocumentationIndicesFn,
      });
    },
  });
}
