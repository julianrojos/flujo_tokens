#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

import { parseArgs, printUsage } from "./lib/parse-args.mjs";
import { parseYamlDocument } from "./lib/parse-frontmatter.mjs";
import { resolveSystemContextSafe } from "./lib/system-context.mjs";
import { loadTokenRegistry } from "./lib/token-registry.mjs";
import {
  componentNameToDisplayName,
  normalizeComponentName,
} from "./lib/component-name.mjs";
import { isPlainObject } from "./lib/is-plain-object.mjs";
import { normalizeNodeId } from "./lib/node-id.mjs";
import { isTbdMarker } from "./lib/tbd.mjs";
import { runOrThrow } from "./lib/exec.mjs";
import {
  mergeWithTemplate,
  normalizeSpecOrder,
} from "./lib/spec-normalizer.mjs";
import {
  buildSpecPrompt,
  buildSpecValidationFeedbackPrompt,
  runSpecGenerationPrompt,
  runSpecRepairPrompt,
} from "./lib/spec-agent-runner.mjs";
import { buildSpecOutputPath } from "./lib/spec-paths.mjs";
import {
  buildTokenMenuLines,
  countTbdValues,
  extractUniqueRegistryEntries,
  pickComponentTokenCandidates,
  prefillTokenMapping,
} from "./lib/spec-token-mapping.mjs";
import { validateGeneratedSpec } from "./lib/spec-validation.mjs";
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

function parseFigmaUrl(figmaUrl) {
  if (!figmaUrl) return { fileKey: "", nodeId: "" };
  let url;
  try {
    url = new URL(figmaUrl);
  } catch {
    return { fileKey: "", nodeId: "" };
  }

  const pathnameParts = url.pathname.split("/").filter(Boolean);
  const keyRootIndex = pathnameParts.findIndex(
    (part) => part === "design" || part === "file",
  );
  const fileKey =
    keyRootIndex >= 0 && pathnameParts[keyRootIndex + 1]
      ? pathnameParts[keyRootIndex + 1]
      : "";

  const nodeParamKeys = ["node-id", "node_id", "nodeId"];
  let rawNodeId = "";
  for (const key of nodeParamKeys) {
    const value = url.searchParams.get(key);
    if (value) {
      rawNodeId = value;
      break;
    }
  }

  if (!rawNodeId) {
    const hashRaw = String(url.hash || "").replace(/^#/, "");
    if (hashRaw) {
      const hashParams = new URLSearchParams(hashRaw.replace(/^[/?]+/, ""));
      for (const key of nodeParamKeys) {
        const value = hashParams.get(key);
        if (value) {
          rawNodeId = value;
          break;
        }
      }

      if (!rawNodeId) {
        const match = hashRaw.match(/(?:^|[?&])node-?id=([^&]+)/i);
        if (match && match[1]) {
          rawNodeId = decodeURIComponent(match[1]);
        }
      }
    }
  }

  const nodeId = normalizeNodeId(rawNodeId);
  return { fileKey, nodeId };
}

function formatYamlFile(outputPath) {
  runOrThrow("npx", ["prettier", "--write", outputPath]);
}

function ensureSpecMetadata(spec, { componentName, nodeId, fileKeyFromUrl }) {
  if (!isPlainObject(spec.figma)) spec.figma = {};
  if (componentName && isTbdMarker(spec.name))
    spec.name = componentNameToDisplayName(componentName);
  if (componentName && !String(spec.name || "").trim())
    spec.name = componentNameToDisplayName(componentName);

  if (fileKeyFromUrl && (!spec.figma.file || isTbdMarker(spec.figma.file))) {
    spec.figma.file = fileKeyFromUrl;
  }
  if (
    nodeId &&
    (!spec.figma.component_set_node_id ||
      isTbdMarker(spec.figma.component_set_node_id))
  ) {
    spec.figma.component_set_node_id = nodeId;
  }
  return spec;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (String(args.help || "false") === "true") {
    printUsage(USAGE, { exitCode: 0 });
  }

  const ctx = resolveSystemContextSafe({ system: args.system });

  const figmaUrl = String(args.url || "").trim();
  const explicitNodeId = normalizeNodeId(args["component-set-node-id"] || "");
  const rawComponentName = String(args["component-name"] || "").trim();
  const normalizedName = normalizeComponentName(rawComponentName);
  const componentName = normalizedName.displayName;
  const componentSlug = normalizedName.fileSlug;
  const specRoot = args["spec-root"] || ctx.paths.specs;
  const resolvedSpecRoot = path.resolve(specRoot);
  const docsRootDir = ctx.paths.docs;
  const templatePath = path.resolve(args.template || path.join(resolvedSpecRoot, "_template.yml"));
  const registryPath = path.resolve(
    args.registry || ctx.paths.tokenRegistry,
  );
  const force = String(args.force || "false") === "true";
  const skipValidation = String(args["skip-validation"] || "false") === "true";
  const allowNonEvidenceUpdates =
    String(args["allow-non-evidence-updates"] || "false") === "true";
  const agent = args.agent || "auto";

  if (skipValidation && !force) {
    console.error(
      "Validation gate bypass requires explicit force.\n" +
        "Use `--skip-validation true --force true` only for exceptional cases.",
    );
    process.exit(1);
  }

  if (allowNonEvidenceUpdates && !force) {
    console.error(
      "Evidence gate bypass requires explicit force.\n" +
        "Use `--allow-non-evidence-updates true --force true` only for exceptional cases.",
    );
    process.exit(1);
  }

  const parsedUrl = parseFigmaUrl(figmaUrl);
  const fileKeyFromUrl = parsedUrl.fileKey;
  const nodeId = explicitNodeId || parsedUrl.nodeId;

  if (!figmaUrl && !nodeId && !rawComponentName) {
    console.error(
      "Missing Figma source.\nUse one of:\n- --url <figma-url>\n- --component-set-node-id <node-id>\n- --component-name <name> (less deterministic)",
    );
    printUsage(USAGE, { stream: "stderr", exitCode: 1 });
  }

  const outputPath = buildSpecOutputPath(
    args,
    specRoot,
    componentSlug,
    nodeId,
  );
  if (!outputPath) {
    console.error(
      "Missing output target.\nProvide --output or --component-name.",
    );
    process.exit(1);
  }
  const outputSnapshot = captureFileSnapshot(outputPath);
  let existingSpec = null;
  if (outputSnapshot.exists) {
    try {
      existingSpec = parseYamlDocument(
        outputSnapshot.content,
        `existing spec (${outputPath})`,
      );
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }
  const overviewPath = path.resolve(path.join(ctx.paths.docs, "overview.md"));
  const registryIndexPath = path.resolve(ctx.paths.registry);
  const scopeSnapshot = captureScopedWriteSnapshot({
    directories: [resolvedSpecRoot, ctx.paths.docs],
    files: [registryIndexPath],
    extensions: [".yml", ".md", ".json"],
  });
  const allowedWritePaths = [outputPath, overviewPath, registryIndexPath];

  if (!fs.existsSync(templatePath)) {
    console.error(`Spec template not found: ${templatePath}`);
    process.exit(1);
  }

  let registryIndex;
  try {
    registryIndex = loadTokenRegistry(registryPath);
  } catch (error) {
    console.error(
      `${error instanceof Error ? error.message : String(error)}. Run \`npm run generate:registry\` first.`,
    );
    process.exit(1);
  }

  const prompt = buildSpecPrompt({
    figmaUrl,
    nodeId,
    componentName,
    outputPath,
    templatePath,
    registryPath,
    fileKeyFromUrl,
    tokenMenuLines: buildTokenMenuLines(
      extractUniqueRegistryEntries(registryIndex),
      componentName || componentSlug,
    ),
  });

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  try {
    const materializeAndWriteSpec = () => {
      if (!fs.existsSync(outputPath)) {
        throw new Error(
          `Expected generated spec file not found at ${outputPath}`,
        );
      }

      const templateSpec = parseYamlDocument(
        fs.readFileSync(templatePath, "utf8"),
        `spec template (${templatePath})`,
      );
      const generatedSpecRaw = parseYamlDocument(
        fs.readFileSync(outputPath, "utf8"),
        `generated spec (${outputPath})`,
      );

      const mergedSpec = mergeWithTemplate(templateSpec, generatedSpecRaw);
      ensureSpecMetadata(mergedSpec, { componentName, nodeId, fileKeyFromUrl });

      const registryEntries = extractUniqueRegistryEntries(registryIndex);
      const tokenCandidates = pickComponentTokenCandidates(
        registryEntries,
        mergedSpec.name || componentName,
      );
      const prefilledCount = prefillTokenMapping(
        mergedSpec.token_mapping,
        tokenCandidates,
        "token_mapping",
      );

      const normalizedSpec = normalizeSpecOrder(mergedSpec);
      if (existingSpec && !allowNonEvidenceUpdates) {
        assertEvidenceGatedScalarChanges({
          before: existingSpec,
          after: normalizedSpec,
          allowedKnownToKnownPrefixes: SPEC_EVIDENCE_BACKED_PREFIXES,
          label: `${outputPath} spec`,
        });
      }
      fs.writeFileSync(
        outputPath,
        yaml.dump(normalizedSpec, {
          lineWidth: 120,
          noRefs: true,
          sortKeys: false,
        }),
        "utf8",
      );
      formatYamlFile(outputPath);

      return {
        normalizedSpec,
        prefilledCount,
      };
    };

    runSpecGenerationPrompt({
      prompt,
      agent,
      componentName,
      nodeId,
    });
    let { normalizedSpec, prefilledCount } = materializeAndWriteSpec();

    let validationReport = null;
    if (!skipValidation) {
      let validation = validateGeneratedSpec(outputPath, registryPath);
      if (!validation.ok) {
        const feedbackPrompt = buildSpecValidationFeedbackPrompt({
          basePrompt: prompt,
          outputPath,
          validationErrors: validation.errors,
        });
        runSpecRepairPrompt({
          prompt: feedbackPrompt,
          agent,
          componentName,
          nodeId,
        });
        ({ normalizedSpec, prefilledCount } = materializeAndWriteSpec());
        validation = validateGeneratedSpec(outputPath, registryPath);
        if (!validation.ok) {
          throw new Error(
            `Generated spec failed validation after automatic repair.\n${JSON.stringify(
              {
                file: outputPath,
                errors: validation.errors,
              },
              null,
              2,
            )}`,
          );
        }
      }
      validationReport = validation.report;
    }

    const indicesSync = syncDocumentationIndices({
      specsDir: resolvedSpecRoot,
      docsDir: path.join(docsRootDir, "components"),
      overviewPath,
      proofsDir: path.join(docsRootDir, "_generated", "visual-proofs"),
      renderDir: path.join(docsRootDir, "_generated", "figma_doc_models"),
      registryPath: registryIndexPath,
    });
    assertScopedWritePolicy({
      snapshot: scopeSnapshot,
      allowedPaths: allowedWritePaths,
      label: "ds-spec-from-figma",
    });

    process.stdout.write(
      `${JSON.stringify(
        {
          ok: true,
          outputPath,
          componentName: normalizedSpec.name || componentName || null,
          componentSetNodeId: nodeId || null,
          tokenPrefilled: prefilledCount,
          unresolvedTbdCount: countTbdValues(normalizedSpec),
          validation: validationReport
            ? {
                ok: validationReport.ok,
                errors: validationReport.summary.errors,
                warnings: validationReport.summary.warnings,
              }
            : { skipped: true },
          documentationIndices: {
            changed: indicesSync.changed,
            written: indicesSync.written,
            registryPath: indicesSync.registry.registryPath,
            registryFingerprint: indicesSync.registry.fingerprint,
            overviewPath: indicesSync.overview.overviewPath,
          },
        },
        null,
        2,
      )}\n`,
    );
  } catch (error) {
    restoreFileSnapshot(outputPath, outputSnapshot);
    let scopeMessage = "";
    try {
      assertScopedWritePolicy({
        snapshot: scopeSnapshot,
        allowedPaths: allowedWritePaths,
        label: "ds-spec-from-figma",
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
