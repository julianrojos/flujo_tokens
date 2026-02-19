#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "./lib/parse-args.mjs";
import {
  DOCS_SPEC_DIR,
  FIGMA_DOC_MODELS_DIR,
  FIGMA_DOC_THEME_PATH,
  PROJECT_ROOT,
} from "./lib/paths.mjs";
import { normalizeComponentName, componentNameToSnakeCase } from "./lib/component-name.mjs";
import {
  computeFingerprint,
  loadSyncState,
  shouldSkipTask,
  updateTaskState,
} from "./lib/cache-utils.mjs";
import { runAgentPrompt } from "./lib/agent-runner.mjs";
import { validateDocs } from "./lib/docs-validator.mjs";
import { DEFAULT_TOKEN_REGISTRY_PATH } from "./lib/token-registry.mjs";
import { parseYamlDocument } from "./lib/parse-frontmatter.mjs";

function runOrFail(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error) {
    throw new Error(result.error.message);
  }
  if ((result.status ?? 1) !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with code ${result.status}`);
  }
}

function normalizeNodeId(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";
  if (value.includes(":")) return value;
  if (value.includes("-")) {
    const parts = value.split("-").filter(Boolean);
    if (parts.length === 2) return `${parts[0]}:${parts[1]}`;
  }
  return value;
}

function isValidNodeId(raw) {
  return /^[A-Za-z0-9]+:[A-Za-z0-9]+$/.test(String(raw || "").trim());
}

function isTbd(raw) {
  return /^tbd$/i.test(String(raw || "").trim());
}

function validateSpecPreflight(specPath, tokenRegistryPath) {
  const report = validateDocs({
    docsRoot: path.join(PROJECT_ROOT, "__docs_validation_stub__"),
    registryPath: tokenRegistryPath,
    checkOverview: false,
    checkSpecs: true,
    specFilePath: specPath,
  });

  if (report.ok) return;

  const specErrors = report.errors.filter(
    (error) => path.resolve(String(error.file || "")) === path.resolve(specPath)
  );
  const payload = {
    file: specPath,
    errors: specErrors.length > 0 ? specErrors : report.errors,
  };
  throw new Error(
    "Spec validation failed. Rendering to Figma was blocked.\n" +
      `Run: npm run validate:docs -- --spec-file "${specPath}" --no-overview true\n` +
      `${JSON.stringify(payload, null, 2)}`
  );
}

function detectMarkdownStaleness({
  specPath,
  markdownPath,
  syncStatePath,
}) {
  const specPathResolved = path.resolve(specPath);
  const markdownPathResolved = path.resolve(markdownPath);
  const taskId = `ds-component-doc:${specPathResolved}->${markdownPathResolved}`;
  const state = loadSyncState(syncStatePath);
  const task = state.tasks?.[taskId];
  const currentSpecHash = computeFingerprint({ files: [specPathResolved] });

  if (task?.metadata?.specHashAtGeneration) {
    if (String(task.metadata.specHashAtGeneration) === currentSpecHash) {
      return { stale: false, reason: "spec_unchanged_since_markdown_generation" };
    }
    return {
      stale: true,
      reason: "spec_changed_since_markdown_generation",
      taskId,
    };
  }

  // Backward-compatible fallback for older sync state entries.
  const specMtime = fs.statSync(specPathResolved).mtimeMs;
  const markdownMtime = fs.statSync(markdownPathResolved).mtimeMs;
  if (specMtime > markdownMtime) {
    return {
      stale: true,
      reason: "spec_newer_than_markdown",
      taskId,
    };
  }

  return { stale: false, reason: "timestamp_fallback_allows_render" };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const activeMarkdown =
    args.markdown ||
    process.env.ANTIGRAVITY_ACTIVE_FILE ||
    process.env.ACTIVE_FILE ||
    process.env.AG_ACTIVE_FILE;

  if (!activeMarkdown) {
    console.error(
      "Missing active markdown path.\nUse --markdown <path> (and optionally --agent codex|claude|gemini) or export ANTIGRAVITY_ACTIVE_FILE."
    );
    process.exit(1);
  }

  const markdownPath = path.resolve(activeMarkdown);
  if (!fs.existsSync(markdownPath)) {
    console.error(`Markdown file not found: ${markdownPath}`);
    process.exit(1);
  }

  const fileBase = path.basename(markdownPath, path.extname(markdownPath));
  const normalizedName = normalizeComponentName(args["component-name"] || fileBase);
  const componentName = normalizedName.displayName || "Component";
  const componentSlug = normalizedName.fileSlug || componentNameToSnakeCase(fileBase);
  const specPath = path.resolve(
    args["spec-file"] || path.join(DOCS_SPEC_DIR, "components", `${componentSlug}.yml`)
  );

  if (!fs.existsSync(specPath)) {
    console.error(
      "Missing required spec file.\n" +
        `Spec: ${specPath}\n` +
        `Run: npm run ds:component-doc -- --spec-file "${specPath}" --output "${markdownPath}"`
    );
    process.exit(1);
  }

  const skipValidation = String(args["skip-validation"] || "false") === "true";
  const force = String(args.force || "false") === "true";
  const syncStatePath = args["sync-state"] || undefined;
  const tokenRegistryPath = args["token-registry"] || DEFAULT_TOKEN_REGISTRY_PATH;

  if (skipValidation && !force) {
    console.error(
      "Validation gate bypass requires explicit force.\n" +
        "Use `--skip-validation true --force true` only for exceptional cases."
    );
    process.exit(1);
  }

  let specStatus = "draft";
  let specNodeId = "";
  try {
    const specParsed = parseYamlDocument(
      fs.readFileSync(specPath, "utf8"),
      `spec YAML (${path.basename(specPath)})`
    );
    specStatus = String(specParsed.status || "draft").trim().toLowerCase();
    const specFigma = specParsed && typeof specParsed.figma === "object" ? specParsed.figma : {};
    const specNodeIdRaw = String(specFigma?.component_set_node_id || "").trim();
    if (specNodeIdRaw && !isTbd(specNodeIdRaw)) {
      const normalizedSpecNodeId = normalizeNodeId(specNodeIdRaw);
      if (!isValidNodeId(normalizedSpecNodeId)) {
        if (specStatus === "ready") {
          console.error(
            "Invalid figma.component_set_node_id in ready spec.\n" +
              `Spec: ${specPath}\n` +
              "Expected format: 123:456"
          );
          process.exit(1);
        }
        console.warn(
          `Warning: ignoring invalid figma.component_set_node_id in spec (${specNodeIdRaw}).`
        );
      } else {
        specNodeId = normalizedSpecNodeId;
      }
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  const cliNodeIdRaw = String(args["component-set-id"] || "").trim();
  const cliNodeId = cliNodeIdRaw ? normalizeNodeId(cliNodeIdRaw) : "";
  if (cliNodeId && !isValidNodeId(cliNodeId)) {
    console.error(
      "Invalid --component-set-id format.\n" +
        `Provided: ${cliNodeIdRaw}\n` +
        "Expected format: 123:456"
    );
    process.exit(1);
  }

  if (cliNodeId && specNodeId && cliNodeId !== specNodeId && !force) {
    console.error(
      "Traceability mismatch between CLI and spec.\n" +
        `CLI --component-set-id: ${cliNodeId}\n` +
        `Spec figma.component_set_node_id: ${specNodeId}\n` +
        "Use --force true only if you intentionally want to override the spec."
    );
    process.exit(1);
  }

  const resolvedComponentSetId = cliNodeId || specNodeId || "";
  if (!resolvedComponentSetId) {
    if (specStatus === "ready") {
      console.error(
        "Missing figma.component_set_node_id for ready spec.\n" +
          `Spec: ${specPath}\n` +
          "Add figma.component_set_node_id to the spec to keep Figma placement deterministic."
      );
      process.exit(1);
    }
    console.warn(
      "Warning: component_set_node_id not available. Falling back to name-based lookup (non-deterministic)."
    );
  }

  if (!skipValidation) {
    const validationReport = validateDocs({
      filePath: markdownPath,
      checkOverview: false,
    });
    if (!validationReport.ok) {
      console.error("Documentation validation failed. Rendering to Figma was blocked.");
      process.stdout.write(`${JSON.stringify(validationReport, null, 2)}\n`);
      process.exit(1);
    }

    try {
      validateSpecPreflight(specPath, tokenRegistryPath);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  if (!force) {
    const staleness = detectMarkdownStaleness({
      specPath,
      markdownPath,
      syncStatePath,
    });
    if (staleness.stale) {
      console.error(
        "Markdown is stale relative to its source spec. Rendering to Figma was blocked.\n" +
          `Reason: ${staleness.reason}\n` +
          `Spec: ${specPath}\n` +
          `Markdown: ${markdownPath}\n` +
          `Run: npm run ds:component-doc -- --spec-file "${specPath}" --output "${markdownPath}"\n` +
          "Use --force true only if you intentionally want to render without regenerating markdown."
      );
      process.exit(1);
    }
  }

  const agent = args.agent || "auto";
  const generatedDir = args["generated-dir"] || FIGMA_DOC_MODELS_DIR;
  const themePath = args.theme || FIGMA_DOC_THEME_PATH;
  const docModelPath = path.join(generatedDir, `${fileBase}.doc-model.json`);
  const executePath = path.join(generatedDir, `${fileBase}.figma-execute.js`);
  const payloadPath = path.join(generatedDir, `${fileBase}.render-payload.json`);
  const offsetX = args["offset-x"] || "200";
  const figmaUrl = args.url || "";
  const markdownToModelScriptPath = path.resolve(
    ".agent/skills/document-design-system/ds-markdown-to-figma-section/scripts/markdown_to_doc_model.mjs"
  );
  const modelToExecuteScriptPath = path.resolve(
    ".agent/skills/document-design-system/ds-markdown-to-figma-section/scripts/build_figma_execute_code.mjs"
  );

  fs.mkdirSync(path.resolve(generatedDir), { recursive: true });

  const modelTaskId = `ds-markdown-to-figma:model:${path.resolve(markdownPath)}`;
  const modelFingerprint = computeFingerprint({
    files: [markdownPath, markdownToModelScriptPath],
    values: {
      componentName,
      docModelPath: path.resolve(docModelPath),
    },
  });
  const modelSync = shouldSkipTask({
    taskId: modelTaskId,
    fingerprint: modelFingerprint,
    outputs: [docModelPath],
    force,
    statePath: syncStatePath,
  });

  if (!modelSync.skip) {
    runOrFail("node", [
      ".agent/skills/document-design-system/ds-markdown-to-figma-section/scripts/markdown_to_doc_model.mjs",
      "--markdown",
      markdownPath,
      "--component-name",
      componentName,
      "--out",
      docModelPath,
    ]);
    updateTaskState({
      taskId: modelTaskId,
      fingerprint: modelFingerprint,
      outputs: [docModelPath],
      metadata: {
        command: "markdown_to_doc_model",
      },
      statePath: syncStatePath,
    });
  }

  const stepBArgs = [
    ".agent/skills/document-design-system/ds-markdown-to-figma-section/scripts/build_figma_execute_code.mjs",
    "--model",
    docModelPath,
    "--theme",
    themePath,
    "--component-name",
    componentName,
    "--offset-x",
    String(offsetX),
    "--out",
    executePath,
    "--payload-out",
    payloadPath,
  ];

  if (resolvedComponentSetId) {
    stepBArgs.push("--component-set-id", resolvedComponentSetId);
  }
  stepBArgs.push("--token-registry", tokenRegistryPath);

  const executeTaskId = `ds-markdown-to-figma:execute:${path.resolve(markdownPath)}`;
  const executeFingerprint = computeFingerprint({
    files: [docModelPath, themePath, modelToExecuteScriptPath, tokenRegistryPath],
    values: {
      componentName,
      componentSetId: resolvedComponentSetId,
      offsetX: String(offsetX),
      executePath: path.resolve(executePath),
      payloadPath: path.resolve(payloadPath),
    },
  });
  const executeSync = shouldSkipTask({
    taskId: executeTaskId,
    fingerprint: executeFingerprint,
    outputs: [executePath, payloadPath],
    force,
    statePath: syncStatePath,
  });

  if (!executeSync.skip) {
    runOrFail("node", stepBArgs);
    updateTaskState({
      taskId: executeTaskId,
      fingerprint: executeFingerprint,
      outputs: [executePath, payloadPath],
      metadata: {
        command: "build_figma_execute_code",
      },
      statePath: syncStatePath,
    });
  }

  const renderTaskId = `ds-markdown-to-figma:render:${path.resolve(markdownPath)}`;
  const renderFingerprint = computeFingerprint({
    files: [executePath, payloadPath],
    values: {
      componentName,
      componentSetId: resolvedComponentSetId,
      figmaUrl,
      offsetX: String(offsetX),
    },
  });
  const renderSync = shouldSkipTask({
    taskId: renderTaskId,
    fingerprint: renderFingerprint,
    outputs: [executePath, payloadPath],
    force,
    statePath: syncStatePath,
  });

  if (renderSync.skip) {
    process.stdout.write(
      `${JSON.stringify(
        {
          ok: true,
          skipped: true,
          reason: renderSync.reason,
          markdownPath,
          componentName,
          outputs: {
            docModelPath,
            executePath,
            payloadPath,
          },
          hint: "Use --force true to regenerate and re-render in Figma.",
        },
        null,
        2
      )}\n`
    );
    return;
  }

  const prompt = [
    "Context",
    "- Render markdown documentation into a Figma section using generated script artifacts.",
    "",
    "Sources",
    figmaUrl ? `- Figma URL (if connection needed): ${figmaUrl}` : "",
    `- Markdown source: ${markdownPath}`,
    `- Generated figma_execute script: ${path.resolve(executePath)}`,
    "",
    "Constraints",
    "- Read the generated figma_execute script from disk.",
    "- Execute it with figma_execute.",
    "- Keep section idempotent and place it 200px to the right of the component section.",
    "- Do not alter unrelated components/sections.",
    "- Report unsupported markdown blocks if any.",
    "",
    "Expected Output",
    "- Return: target_section_id, target_section_name, offset_x_applied, unsupported_blocks count.",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    runAgentPrompt({
      prompt,
      agent,
      label: `active-md-to-figma-${fileBase}`,
    });
    updateTaskState({
      taskId: renderTaskId,
      fingerprint: renderFingerprint,
      outputs: [executePath, payloadPath],
      metadata: {
        command: "figma_execute_render",
      },
      statePath: syncStatePath,
    });
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : String(error));
  }
}

main();
