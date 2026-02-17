#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { runAgentPrompt } from "./lib/agent-runner.mjs";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = "true";
      continue;
    }
    args[key] = next;
    i += 1;
  }
  return args;
}

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

  const fileBase = path.basename(markdownPath, path.extname(markdownPath));
  const agent = args.agent || "auto";
  const componentName = args["component-name"] || toComponentName(fileBase);
  const generatedDir =
    args["generated-dir"] || "docs/design_system/_generated/figma_doc_models";
  const themePath = args.theme || "docs/design_system/_spec/figma_doc_theme.yml";
  const docModelPath = path.join(generatedDir, `${fileBase}.doc-model.json`);
  const executePath = path.join(generatedDir, `${fileBase}.figma-execute.js`);
  const payloadPath = path.join(generatedDir, `${fileBase}.render-payload.json`);
  const offsetX = args["offset-x"] || "200";
  const componentSetId = args["component-set-id"] || "";
  const figmaUrl = args.url || "";

  fs.mkdirSync(path.resolve(generatedDir), { recursive: true });

  runOrFail("node", [
    ".agent/skills/document-design-system/ds-markdown-to-figma-section/scripts/markdown_to_doc_model.mjs",
    "--markdown",
    markdownPath,
    "--component-name",
    componentName,
    "--out",
    docModelPath,
  ]);

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

  runOrFail("node", stepBArgs);

  const prompt = [
    "Render markdown documentation to Figma using figma MCP.",
    figmaUrl ? `If needed, connect to this Figma URL first: ${figmaUrl}` : "",
    `Markdown source: ${markdownPath}`,
    `Generated figma_execute script path: ${path.resolve(executePath)}`,
    "Required behavior:",
    "- Read the generated figma_execute script from disk.",
    "- Execute it using figma_execute.",
    "- Ensure target section is idempotent and placed 200px to the right of the component section.",
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
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : String(error));
  }
}

main();
