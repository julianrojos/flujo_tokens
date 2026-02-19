#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "./lib/parse-args.mjs";
import {
  FIGMA_DOC_MODELS_DIR,
  FIGMA_DOC_THEME_PATH,
} from "./lib/paths.mjs";
import {
  computeFingerprint,
  shouldSkipTask,
  updateTaskState,
} from "./lib/cache-utils.mjs";
import { runAgentPrompt } from "./lib/agent-runner.mjs";
import { validateDocs } from "./lib/docs-validator.mjs";
import { DEFAULT_TOKEN_REGISTRY_PATH } from "./lib/token-registry.mjs";

function toComponentName(raw) {
  return String(raw)
    .replace(/\.[^.]+$/, "")
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join("");
}

function runOrFail(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error) {
    throw new Error(result.error.message);
  }
  if ((result.status ?? 1) !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with code ${result.status}`);
  }
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

  const skipValidation = String(args["skip-validation"] || "false") === "true";
  const force = String(args.force || "false") === "true";
  const syncStatePath = args["sync-state"] || undefined;
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
  }

  const fileBase = path.basename(markdownPath, path.extname(markdownPath));
  const agent = args.agent || "auto";
  const componentName = args["component-name"] || toComponentName(fileBase);
  const generatedDir = args["generated-dir"] || FIGMA_DOC_MODELS_DIR;
  const themePath = args.theme || FIGMA_DOC_THEME_PATH;
  const docModelPath = path.join(generatedDir, `${fileBase}.doc-model.json`);
  const executePath = path.join(generatedDir, `${fileBase}.figma-execute.js`);
  const payloadPath = path.join(generatedDir, `${fileBase}.render-payload.json`);
  const offsetX = args["offset-x"] || "200";
  const componentSetId = args["component-set-id"] || "";
  const tokenRegistryPath = args["token-registry"] || DEFAULT_TOKEN_REGISTRY_PATH;
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

  if (componentSetId) {
    stepBArgs.push("--component-set-id", componentSetId);
  }
  stepBArgs.push("--token-registry", tokenRegistryPath);

  const executeTaskId = `ds-markdown-to-figma:execute:${path.resolve(markdownPath)}`;
  const executeFingerprint = computeFingerprint({
    files: [docModelPath, themePath, modelToExecuteScriptPath, tokenRegistryPath],
    values: {
      componentName,
      componentSetId,
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
      componentSetId,
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
