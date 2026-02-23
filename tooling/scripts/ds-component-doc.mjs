#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

import { parseArgs, printUsage } from "./lib/parse-args.mjs";
import { runAgentPrompt } from "./lib/agent-runner.mjs";
import { validateDocs } from "./lib/docs-validator.mjs";
import {
  parseMarkdownFrontmatter,
  parseYamlDocument,
} from "./lib/parse-frontmatter.mjs";
import { resolveSystemContextSafe } from "./lib/system-context.mjs";
import { loadTokenRegistry } from "./lib/token-registry.mjs";
import { resolveStyleReferencePath } from "./lib/style-reference.mjs";
import { extractGapsFromSpec, upsertGapsSection } from "./lib/gaps.mjs";
import { isPlainObject } from "./lib/is-plain-object.mjs";
import { deriveFigmaFrontmatterTraceability } from "./lib/figma-traceability.mjs";
import { normalizeAgentOutputFile } from "./lib/agent-output-normalizer.mjs";
import {
  GOLDEN_COMPONENT_DOC_SAMPLE_PATH,
  writeComponentDocSkeleton,
} from "./lib/doc-templates.mjs";
import {
  validateAgentOutputContract,
  writeAgentOutputErrorReport,
} from "./lib/agent-output-contract.mjs";
import { updateAgentDriftBaseline } from "./lib/agent-drift-detector.mjs";
import {
  buildAgentPrompt,
  canonicalH2ConstraintLines,
  RULE_BLOCKS,
} from "./lib/prompts.mjs";
import { formatMarkdownTarget } from "./lib/format-markdown.mjs";
import {
  normalizeComponentName,
  componentNameFromFilePath,
  componentNameToSnakeCase,
} from "./lib/component-name.mjs";
import {
  computeFingerprint,
  shouldSkipTask,
  updateTaskState,
} from "./lib/cache-utils.mjs";
import { TRACEABILITY_CONTRACT_VERSION } from "./lib/docs-config.mjs";
import {
  captureFileSnapshot,
  restoreFileSnapshot,
} from "./lib/file-snapshot.mjs";
import {
  assertDocStatusStable,
  assertEvidenceGatedScalarChanges,
} from "./lib/evidence-gated-mutations.mjs";
import {
  assertScopedWritePolicy,
  captureScopedWriteSnapshot,
} from "./lib/scoped-write-guard.mjs";
import { syncDocumentationIndices } from "./lib/component-registry/index.mjs";
import { TempArtifactManager } from "./lib/temp-artifacts.mjs";

const __filename = fileURLToPath(import.meta.url);
const USAGE = {
  command:
    "npm run ds:component-doc -- --component-name Alert [--agent codex] [--output docs/components/alert.md]",
  description:
    "Generate or update one component markdown from a component spec YAML.",
  options: [
    {
      name: "--component-name <name>",
      description:
        "Display component name (PascalCase). Used to infer spec/output paths.",
    },
    {
      name: "--spec-file <path>",
      description: "Explicit spec YAML path.",
    },
    {
      name: "--output <path>",
      description: "Explicit markdown output path.",
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
      name: "--allow-doc-status-change <true|false>",
      description:
        "Allow doc_status changes in frontmatter (requires --force true).",
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

const FRONTMATTER_EVIDENCE_PREFIXES = Object.freeze([
  "figma.file_url",
  "figma.page",
  "figma.component",
  "figma.component_set_node_id",
  "figma.last_verified",
  "figma.component_hash",
  "figma.properties_count",
  "figma.variants_count",
  "pipeline.ds_component_doc",
]);

function validateSpecPreflight(specPath, registryPath, ctx) {
  const report = validateDocs({
    docsRoot: path.join(ctx.paths.docs, "__docs_validation_stub__"),
    specFilePath: specPath,
    registryPath,
    checkOverview: false,
    checkSpecs: true,
    checkPairing: false,
  });

  if (report.ok) return;

  const specErrors = report.errors.filter(
    (error) =>
      path.resolve(String(error.file || "")) === path.resolve(specPath),
  );

  const payload = {
    file: specPath,
    errors: specErrors.length > 0 ? specErrors : report.errors,
  };
  throw new Error(
    "Spec validation failed. Markdown generation was blocked.\n" +
      `Run: npm run validate:docs -- --spec-file "${specPath}" --no-overview true\n` +
      `${JSON.stringify(payload, null, 2)}`,
  );
}

function buildValidationFeedbackPrompt({
  basePrompt,
  outputPath,
  specPath,
  validationErrors,
}) {
  return (
    `${basePrompt}\n\n` +
    "Validation Feedback\n" +
    `- The generated markdown at \`${outputPath}\` failed docs validation.\n` +
    `- Source spec remains \`${specPath}\`.\n` +
    "- Fix the existing markdown file in place and keep the same output path.\n" +
    "- Preserve canonical H2 headings, table schemas, and frontmatter contract.\n" +
    "- Validation errors (JSON):\n" +
    `${JSON.stringify(validationErrors, null, 2)}\n`
  );
}

function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

function orderFigmaFrontmatter(figma) {
  const preferredOrder = [
    "file_url",
    "page",
    "component",
    "component_set_node_id",
    "last_verified",
    "component_hash",
    "properties_count",
    "variants_count",
  ];
  const ordered = {};
  for (const key of preferredOrder) {
    if (key in figma) ordered[key] = figma[key];
  }
  for (const [key, value] of Object.entries(figma)) {
    if (!(key in ordered)) ordered[key] = value;
  }
  return ordered;
}

function upsertTraceabilityFrontmatter({
  markdownPath,
  specPath,
  registryPath,
  generatorScriptPath,
}) {
  const rawMarkdown = fs.readFileSync(markdownPath, "utf8");
  const { frontmatter, content } = parseMarkdownFrontmatter(rawMarkdown);
  const fm = isPlainObject(frontmatter) ? { ...frontmatter } : {};
  const spec = parseYamlDocument(
    fs.readFileSync(specPath, "utf8"),
    `spec YAML (${path.basename(specPath)})`,
  );
  const figmaTraceability = deriveFigmaFrontmatterTraceability(spec);

  if (!isPlainObject(fm.figma)) fm.figma = {};
  if (figmaTraceability.componentSetNodeId) {
    fm.figma.component_set_node_id = figmaTraceability.componentSetNodeId;
  }
  fm.figma.component_hash = figmaTraceability.componentHash;
  fm.figma.properties_count = figmaTraceability.propertiesCount;
  fm.figma.variants_count = figmaTraceability.variantsCount;
  fm.figma = orderFigmaFrontmatter(fm.figma);

  if (!isPlainObject(fm.pipeline)) fm.pipeline = {};
  if (!isPlainObject(fm.pipeline.ds_component_doc)) {
    fm.pipeline.ds_component_doc = {};
  }

  fm.pipeline.ds_component_doc = {
    contract_version: TRACEABILITY_CONTRACT_VERSION,
    spec_sha256: sha256File(specPath),
    token_registry_sha256: sha256File(registryPath),
    generator_script_sha256: sha256File(generatorScriptPath),
  };

  const preferredOrder = ["doc_type", "doc_status", "figma", "pipeline"];
  const orderedFm = {};
  for (const key of preferredOrder) {
    if (key in fm) orderedFm[key] = fm[key];
  }
  for (const [key, value] of Object.entries(fm)) {
    if (!(key in orderedFm)) orderedFm[key] = value;
  }

  const frontmatterYaml = yaml.dump(orderedFm, {
    lineWidth: 120,
    noRefs: true,
    sortKeys: false,
  });
  const normalizedContent = String(content || "").replace(/^\n+/, "");

  // Compute content_sha256 after final markdown is assembled.
  const contentSha256 = crypto
    .createHash("sha256")
    .update(normalizedContent)
    .digest("hex");
  fm.pipeline.ds_component_doc.content_sha256 = contentSha256;

  // Rebuild markdown with updated pipeline block including content_sha256.
  const finalOrderedFm = {};
  for (const key of preferredOrder) {
    if (key in fm) finalOrderedFm[key] = fm[key];
  }
  for (const [key, value] of Object.entries(fm)) {
    if (!(key in finalOrderedFm)) finalOrderedFm[key] = value;
  }
  const finalFrontmatterYaml = yaml.dump(finalOrderedFm, {
    lineWidth: 120,
    noRefs: true,
    sortKeys: false,
  });
  const finalMarkdown = `---\n${finalFrontmatterYaml.trimEnd()}\n---\n\n${normalizedContent}`;

  if (finalMarkdown !== rawMarkdown) {
    fs.writeFileSync(markdownPath, finalMarkdown, "utf8");
  }
}

function syncGapsSection({ specPath, markdownPath, registryPath }) {
  const spec = parseYamlDocument(
    fs.readFileSync(specPath, "utf8"),
    `spec YAML (${path.basename(specPath)})`,
  );
  const registry = loadTokenRegistry(registryPath);
  const gaps = extractGapsFromSpec({ spec, registry });
  const currentMarkdown = fs.readFileSync(markdownPath, "utf8");
  const nextMarkdown = upsertGapsSection(currentMarkdown, gaps);
  if (nextMarkdown !== currentMarkdown) {
    fs.writeFileSync(markdownPath, nextMarkdown, "utf8");
  }
  return gaps.length;
}

function validateGeneratedMarkdown({ outputPath, specPath, registryPath }) {
  return validateDocs({
    filePath: outputPath,
    specFilePath: specPath,
    registryPath,
    checkOverview: false,
    checkSpecs: false,
  });
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const tempArtifacts = new TempArtifactManager();
  tempArtifacts.attachProcessHooks();
  if (String(args.help || "false") === "true") {
    printUsage(USAGE, { exitCode: 0 });
  }

  const ctx = resolveSystemContextSafe({ system: args.system });

  const rawComponentName = String(args["component-name"] || "").trim();
  const docsRootInput = path.resolve(args["docs-root"] || ctx.paths.docs);
  const componentDocsDir =
    path.basename(docsRootInput) === "components"
      ? docsRootInput
      : path.join(docsRootInput, "components");
  const docsRootDir =
    path.basename(docsRootInput) === "components"
      ? path.dirname(docsRootInput)
      : docsRootInput;
  const specRoot = args["spec-root"] || ctx.paths.specs;
  const force = String(args.force || "false") === "true";
  const skipValidation = String(args["skip-validation"] || "false") === "true";
  const allowDocStatusChange =
    String(args["allow-doc-status-change"] || "false") === "true";
  const syncStatePath = args["sync-state"] || undefined;
  const registryPath = path.resolve(
    args.registry || ctx.paths.tokenRegistry,
  );
  const agent = args.agent || "auto";

  if (skipValidation && !force) {
    console.error(
      "Validation gate bypass requires explicit force.\n" +
        "Use `--skip-validation true --force true` only for exceptional cases.",
    );
    process.exit(1);
  }

  if (allowDocStatusChange && !force) {
    console.error(
      "doc_status override requires explicit force.\n" +
        "Use `--allow-doc-status-change true --force true` only for exceptional cases.",
    );
    process.exit(1);
  }

  try {
    loadTokenRegistry(registryPath);
  } catch (error) {
    console.error(
      `${error instanceof Error ? error.message : String(error)}. Run \`npm run generate:registry\` first.`,
    );
    process.exit(1);
  }

  if (!rawComponentName && !args["spec-file"]) {
    console.error("Missing --component-name or --spec-file.");
    printUsage(USAGE, { stream: "stderr", exitCode: 1 });
  }

  const normalizedFromArg = normalizeComponentName(rawComponentName);
  const componentName = normalizedFromArg.displayName;
  const componentSlugFromArg = normalizedFromArg.fileSlug;
  if (!args["spec-file"] && !componentSlugFromArg) {
    console.error(
      "Invalid --component-name for path inference. Provide a valid component name, or pass --spec-file/--output explicitly.",
    );
    process.exit(1);
  }
  const specPath = path.resolve(
    args["spec-file"] || path.join(specRoot, `${componentSlugFromArg}.yml`),
  );
  const normalizedFromSpecPath = componentNameFromFilePath(specPath);
  const componentSlug = componentSlugFromArg || normalizedFromSpecPath.fileSlug;
  const effectiveComponentName =
    componentName || normalizedFromSpecPath.displayName;

  const outputPath = path.resolve(
    args.output || path.join(componentDocsDir, `${componentSlug}.md`),
  );
  const overviewPath = path.resolve(path.join(componentDocsDir, "overview.md"));
  const registryIndexPath = path.resolve(
    path.join(docsRootDir, "_generated", "component-registry.json"),
  );
  const scopeSnapshot = captureScopedWriteSnapshot({
    directories: [componentDocsDir, path.dirname(specPath)],
    files: [registryIndexPath],
    extensions: [".md", ".yml", ".json"],
  });
  const allowedWritePaths = [outputPath, overviewPath, registryIndexPath];
  const styleReferencePath = resolveStyleReferencePath({
    componentDocsDir,
    outputPath,
  });
  const safeName = componentNameToSnakeCase(
    effectiveComponentName || componentSlug || "component",
  );
  const skeletonPath = writeComponentDocSkeleton({
    componentName: effectiveComponentName,
    outputPath,
  });
  tempArtifacts.track(skeletonPath);

  if (!fs.existsSync(specPath)) {
    const suggestedName =
      effectiveComponentName || componentSlug || "Component";
    console.error(
      "Missing required spec file.\n" +
        `Spec: ${specPath}\n` +
        `Run: npm run ds:spec-from-figma -- --component-name "${suggestedName}" --output "${specPath}"`,
    );
    process.exit(1);
  }

  if (!skipValidation) {
    try {
      validateSpecPreflight(specPath, registryPath, ctx);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  const taskId = `ds-component-doc:${specPath}->${outputPath}`;
  const fingerprint = computeFingerprint({
    files: [specPath, __filename, registryPath],
    values: {
      componentName:
        effectiveComponentName ||
        path.basename(specPath, path.extname(specPath)),
      outputPath,
      docsRoot: docsRootInput,
    },
  });
  const sync = shouldSkipTask({
    taskId,
    fingerprint,
    outputs: [outputPath],
    force,
    statePath: syncStatePath,
  });

  if (sync.skip) {
    process.stdout.write(
      `${JSON.stringify(
        {
          ok: true,
          skipped: true,
          reason: sync.reason,
          outputPath,
          specPath,
          hint: "Use --force true to regenerate markdown.",
        },
        null,
        2,
      )}\n`,
    );
    return;
  }

  const outputSnapshot = captureFileSnapshot(outputPath);
  const previousFrontmatter = outputSnapshot.exists
    ? parseMarkdownFrontmatter(outputSnapshot.content).frontmatter
    : {};

  const prompt = buildAgentPrompt({
    context: [
      "Generate one component documentation markdown from a spec YAML.",
      effectiveComponentName ? `Component name: ${effectiveComponentName}` : "",
    ],
    sources: [
      `Spec YAML (source of truth): ${specPath}`,
      styleReferencePath
        ? `Existing docs style reference: ${styleReferencePath}`
        : "",
      `Canonical markdown skeleton (fill-only): ${skeletonPath}`,
      `Golden markdown example for tone/detail: ${GOLDEN_COMPONENT_DOC_SAMPLE_PATH}`,
      `Output component markdown path (required): ${outputPath}`,
      `Overview path to keep in sync: ${overviewPath}`,
    ],
    constraints: [
      RULE_BLOCKS.NO_INVENTION,
      ...canonicalH2ConstraintLines(),
      "Use the skeleton file as the source layout: keep all H2 headings and table columns unchanged.",
      "Fill placeholders with concrete content, but do not add or remove H2 sections.",
      "Inside `## Overview`, include a `### Visual Proof` subsection. If no screenshot proof exists yet, keep explicit `TBD` placeholders.",
      "Inside `## Usage Guidelines`, include `### Behavior` and `### Examples` subsections. Use `TBD` if evidence is missing.",
      "If spec lacks information, keep explicit `TBD` values.",
      RULE_BLOCKS.NO_INTERNAL_IDS,
      "If spec includes figma.component_set_node_id, mirror it in markdown frontmatter figma.component_set_node_id.",
      "Keep language and tone consistent with the golden markdown example and existing component docs.",
      "Update overview links if needed so the component is discoverable.",
      RULE_BLOCKS.GAPS_AUTOMANAGED,
    ],
    examples: [
      "GOOD token reference: `Semantic.Color.Focus-Outline.Inner` (#3B82F6).",
      "BAD token reference: Semantic.Color.Focus-Outline.Inner (#3B82F6) without backticks.",
      "GOOD fallback marker for unknown value: `TBD`.",
      "BAD unknown markers: `pending`, `unknown`, `to be defined`.",
      "GOOD H2 flow: `Overview -> Anatomy -> Component API -> ... -> Related Components`.",
      "BAD extra H2: `## Examples` or `## Changelog`.",
    ],
    expectedOutput: [
      "Write/update the markdown file at the exact output path.",
      "Return a short report with final path and unresolved TBD count.",
    ],
  });

  try {
    let gapsCount = 0;
    const finalizeGeneratedMarkdown = () => {
      if (!fs.existsSync(outputPath)) {
        throw new Error(
          `Agent did not produce markdown output at: ${outputPath}`,
        );
      }
      normalizeAgentOutputFile(outputPath);
      gapsCount = syncGapsSection({
        specPath,
        markdownPath: outputPath,
        registryPath,
      });
      upsertTraceabilityFrontmatter({
        markdownPath: outputPath,
        specPath,
        registryPath,
        generatorScriptPath: __filename,
      });
      formatMarkdownTarget(outputPath);

      const generatedMarkdown = fs.readFileSync(outputPath, "utf8");
      const { frontmatter: generatedFrontmatter } =
        parseMarkdownFrontmatter(generatedMarkdown);
      if (outputSnapshot.exists) {
        assertDocStatusStable({
          beforeFrontmatter: previousFrontmatter,
          afterFrontmatter: generatedFrontmatter,
          allowDocStatusChange,
          label: `${outputPath} frontmatter`,
        });
        assertEvidenceGatedScalarChanges({
          before: previousFrontmatter,
          after: generatedFrontmatter,
          allowedKnownToKnownPrefixes: FRONTMATTER_EVIDENCE_PREFIXES,
          label: `${outputPath} frontmatter`,
        });
      }
      const outputContract = validateAgentOutputContract({
        markdown: generatedMarkdown,
        expectedComponentName: effectiveComponentName,
        unresolvedGapCount: gapsCount,
      });
      if (!outputContract.ok) {
        const reportPath = writeAgentOutputErrorReport({
          componentSlug,
          scriptName: "ds-component-doc",
          markdownPath: outputPath,
          errors: outputContract.errors,
          rawOutput: generatedMarkdown,
        });
        throw new Error(
          "Generated markdown failed output contract.\n" +
            `Report: ${reportPath}\n` +
            `${JSON.stringify({ file: outputPath, errors: outputContract.errors }, null, 2)}`,
        );
      }
    };

    runAgentPrompt({
      prompt,
      agent,
      label: `component-doc-${safeName}`,
    });
    finalizeGeneratedMarkdown();

    if (!skipValidation) {
      let report = validateGeneratedMarkdown({
        outputPath,
        specPath,
        registryPath,
      });
      if (!report.ok) {
        const feedbackPrompt = buildValidationFeedbackPrompt({
          basePrompt: prompt,
          outputPath,
          specPath,
          validationErrors: report.errors,
        });
        runAgentPrompt({
          prompt: feedbackPrompt,
          agent,
          label: `component-doc-repair-${safeName}`,
        });
        finalizeGeneratedMarkdown();
        report = validateGeneratedMarkdown({
          outputPath,
          specPath,
          registryPath,
        });
        if (!report.ok) {
          throw new Error(
            `Generated markdown failed validation after automatic repair.\n${JSON.stringify(
              {
                file: outputPath,
                errors: report.errors,
              },
              null,
              2,
            )}`,
          );
        }
      }
    }

    const drift = updateAgentDriftBaseline({
      markdownPath: outputPath,
      componentSlug,
      scriptName: "ds-component-doc",
    });
    if (drift.driftDetected) {
      console.warn(
        "Output contract drift detected.\n" +
          `Baseline: ${drift.baselinePath}\n` +
          `Previous hash: ${drift.previousHash}\n` +
          `Current hash: ${drift.hash}`,
      );
    }

    updateTaskState({
      taskId,
      fingerprint,
      outputs: [outputPath],
      metadata: {
        command: "ds-component-doc",
        specPath,
        registryPath,
        gapsCount,
        outputContractHash: drift.hash,
        specHashAtGeneration: computeFingerprint({ files: [specPath] }),
        markdownHashAtGeneration: computeFingerprint({ files: [outputPath] }),
      },
      statePath: syncStatePath,
    });

    syncDocumentationIndices({
      docsDir: componentDocsDir,
      overviewPath,
      specsDir: path.dirname(specPath),
      proofsDir: path.join(docsRootDir, "_generated", "visual-proofs"),
      renderDir: path.join(docsRootDir, "_generated", "figma_doc_models"),
      registryPath: registryIndexPath,
    });
    assertScopedWritePolicy({
      snapshot: scopeSnapshot,
      allowedPaths: allowedWritePaths,
      label: "ds-component-doc",
    });
  } catch (error) {
    restoreFileSnapshot(outputPath, outputSnapshot);
    let scopeMessage = "";
    try {
      assertScopedWritePolicy({
        snapshot: scopeSnapshot,
        allowedPaths: allowedWritePaths,
        label: "ds-component-doc",
      });
    } catch (scopeError) {
      scopeMessage = `\n${scopeError instanceof Error ? scopeError.message : String(scopeError)}`;
    }
    console.error(
      `${error instanceof Error ? error.message : String(error)}${scopeMessage}`,
    );
    process.exit(1);
  }
}

main();
