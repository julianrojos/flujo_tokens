#!/usr/bin/env node

import path from "node:path";
import { pathToFileURL } from "node:url";

import { parseArgs, printUsage } from "./lib/parse-args.mjs";
import { resolveSystemContextSafe } from "./lib/system-context.mjs";
import { loadTokenRegistry } from "./lib/token-registry.mjs";
import { runOrThrow } from "./lib/exec.mjs";
import {
  runSpecGenerationPrompt,
  runSpecRepairPrompt,
} from "./lib/spec-agent-runner.mjs";
import { createSpecRunContext } from "./lib/spec-run-context.mjs";
import {
  buildSpecPromptWithRegistry,
  loadRegistryOrThrow,
} from "./lib/spec-registry-prompt.mjs";
import { runSpecGenerationFlow } from "./lib/spec-generation-flow.mjs";
import { finalizeSpecResult } from "./lib/spec-finalization.mjs";
import { runSpecWithGuards } from "./lib/spec-runner.mjs";
import { validateGeneratedSpec } from "./lib/spec-validation.mjs";
import {
  ensureSpecOutputDirectory,
  ensureSpecTemplateExists,
  materializeAndWriteSpec as materializeSpecAndWrite,
} from "./lib/spec-write-adapter.mjs";
import {
  captureFileSnapshot,
  restoreFileSnapshot,
} from "./lib/file-snapshot.mjs";
import { assertEvidenceGatedScalarChanges } from "./lib/evidence-gated-mutations.mjs";
import {
  assertScopedWritePolicy,
  captureScopedWriteSnapshot,
} from "./lib/scoped-write-guard.mjs";
import { syncDocumentationIndices } from "./lib/component-registry/index.mjs";

const USAGE = {
  command:
    'npm run ds:spec-from-figma -- --url "https://www.figma.com/design/...&node-id=123-456" --component-name Alert',
  description: "Generate or update component spec YAML from Figma context.",
  options: [
    {
      name: "--url <figma-url>",
      description: "Figma URL for component set/node (recommended).",
    },
    {
      name: "--component-set-node-id <node-id>",
      description: "Explicit component set node id (format: 123:456).",
    },
    {
      name: "--component-name <name>",
      description: "Component display name (used for file naming and prompts).",
    },
    {
      name: "--output <path>",
      description: "Explicit output spec path.",
    },
    {
      name: "--spec-root <path>",
      description: "Spec components directory.",
      defaultValue: "docs/_spec/components",
    },
    {
      name: "--template <path>",
      description: "Spec template path.",
      defaultValue: "docs/_spec/components/_template.yml",
    },
    {
      name: "--registry <path>",
      description: "Token registry JSON path.",
      defaultValue: "docs/_generated/token-registry.json",
    },
    {
      name: "--agent <codex|claude|gemini|auto>",
      description: "Agent CLI used for generation.",
      defaultValue: "auto",
    },
    {
      name: "--force <true|false>",
      description: "Bypass incremental cache.",
      defaultValue: "false",
    },
    {
      name: "--skip-validation <true|false>",
      description: "Skip pre/post validation (requires --force true).",
      defaultValue: "false",
    },
    {
      name: "--allow-non-evidence-updates <true|false>",
      description:
        "Allow changing existing known spec values outside evidence-backed fields (requires --force true).",
      defaultValue: "false",
    },
    {
      name: "--system <id>",
      description: "Target design system context.",
    },
    {
      name: "--help",
      description: "Show this help message.",
    },
  ],
};
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

      const {
        normalizedSpec,
        prefilledCount,
        validationReport,
      } = runSpecGenerationFlow({
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

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (String(args.help || "false") === "true") {
    printUsage(USAGE, { exitCode: 0 });
  }

  try {
    const result = runSpecFromFigma(args);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    if (message.startsWith("Missing Figma source.")) {
      printUsage(USAGE, { stream: "stderr" });
    }
    process.exit(1);
  }
}

const isMainModule =
  !!process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMainModule) {
  main();
}
