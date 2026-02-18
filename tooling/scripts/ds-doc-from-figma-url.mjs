#!/usr/bin/env node

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

function toSafeFileName(raw) {
  return String(raw)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const figmaUrl = args.url;
  if (!figmaUrl) {
    console.error(
      "Missing --url\nExample: npm run ds:doc-from-figma-url -- --url \"https://www.figma.com/design/...\" --agent codex"
    );
    process.exit(1);
  }

  const docsRoot = args["docs-root"] || "docs/components";
  const agent = args.agent || "auto";
  const componentName = args["component-name"] || "";
  const outputPath =
    args.output ||
    (componentName
      ? path.join(docsRoot, `${toSafeFileName(componentName)}.md`)
      : null);

  if (outputPath) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  }

  const prompt = [
    "Use the figma MCP workflow to document one component from this URL.",
    `Figma URL: ${figmaUrl}`,
    componentName ? `Expected component name: ${componentName}` : "",
    outputPath
      ? `Write/update exactly this file: ${outputPath}`
      : "Write/update one markdown file under docs/components/ based on the real component name.",
    "Required behavior:",
    "- Connect to the Figma file and inspect the referenced node/component.",
    "- Produce a component markdown consistent with docs/components/alert.md structure and tone.",
    "- Include real properties, variants, layout, typography, tokens and usage guidance from Figma.",
    "- Do not document system_cover or non-component pages.",
    "- Save the file directly in the repo and finish with a short report including the final path.",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    runAgentPrompt({
      prompt,
      agent,
      label: `doc-from-figma-url-${toSafeFileName(componentName || "component")}`,
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
