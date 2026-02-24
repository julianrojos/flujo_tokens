import { resolveSystemContextSafe } from "./system-context.mjs";
import { loadTokenRegistry } from "./token-registry.mjs";
import { runOrThrow } from "./exec.mjs";
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
  materializeAndWriteSpec as materializeSpecAndWrite,
} from "./spec-write-adapter.mjs";
import { captureFileSnapshot, restoreFileSnapshot } from "./file-snapshot.mjs";
import { assertEvidenceGatedScalarChanges } from "./evidence-gated-mutations.mjs";
import { assertScopedWritePolicy, captureScopedWriteSnapshot } from "./scoped-write-guard.mjs";
import { syncDocumentationIndices } from "./component-registry/index.mjs";

const SPEC_EVIDENCE_BACKED_PREFIXES = Object.freeze([
  "name",
  "figma.file",
  "figma.page",
  "figma.component_set",
  "figma.component_set_node_id",
  "properties",
  "anatomy",
]);

function formatYamlFile(outputPath) {
  runOrThrow("npx", ["prettier", "--write", outputPath]);
}

export function runSpecFromFigma(args, deps = {}) {
  const {
    resolveSystemContextSafeFn = resolveSystemContextSafe,
    loadTokenRegistryFn = loadTokenRegistry,
    captureFileSnapshotFn = captureFileSnapshot,
    restoreFileSnapshotFn = restoreFileSnapshot,
    captureScopedWriteSnapshotFn = captureScopedWriteSnapshot,
    assertScopedWritePolicyFn = assertScopedWritePolicy,
    ensureSpecTemplateExistsFn = ensureSpecTemplateExists,
    ensureSpecOutputDirectoryFn = ensureSpecOutputDirectory,
    materializeSpecAndWriteFn = materializeSpecAndWrite,
    assertEvidenceGatedScalarChangesFn = assertEvidenceGatedScalarChanges,
    runSpecGenerationPromptFn = runSpecGenerationPrompt,
    runSpecRepairPromptFn = runSpecRepairPrompt,
    validateGeneratedSpecFn = validateGeneratedSpec,
    syncDocumentationIndicesFn = syncDocumentationIndices,
    formatYamlFileFn = formatYamlFile,
    runSpecWithGuardsFn = runSpecWithGuards,
  } = deps;

  const ctx = resolveSystemContextSafeFn({ system: args.system });

  const runCtx = createSpecRunContext({ args, ctx });
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
    registryIndexPath,
    allowedWritePaths,
  } = runCtx;

  return runSpecWithGuardsFn({
    outputPath,
    resolvedSpecRoot,
    docsPath: ctx.paths.docs,
    registryIndexPath,
    allowedWritePaths,
    captureFileSnapshotFn,
    restoreFileSnapshotFn,
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

      const materializeGeneratedSpec = () => {
        return materializeSpecAndWriteFn({
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
          formatYamlFile: formatYamlFileFn,
        });
      };

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
        materializeGeneratedSpec,
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
        registryIndexPath,
        syncDocumentationIndicesFn,
      });
    },
  });
}
