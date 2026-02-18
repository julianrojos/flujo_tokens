#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "./lib/parse-args.mjs";
import { COMPONENT_DOCS_DIR } from "./lib/paths.mjs";
import { runAgentPrompt } from "./lib/agent-runner.mjs";

function toSafeFileName(raw) {
  return String(raw)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function formatMarkdown({ outputPath, docsRoot }) {
  const target = outputPath
    ? path.resolve(outputPath)
    : path.join(path.resolve(docsRoot), "**/*.md");
  const result = spawnSync("npx", ["prettier", "--write", target], {
    stdio: "inherit",
  });
  if (result.error) {
    throw new Error(`Failed to run Prettier: ${result.error.message}`);
  }
  if ((result.status ?? 1) !== 0) {
    throw new Error(`Prettier exited with code ${result.status}`);
  }
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

  const docsRoot = args["docs-root"] || COMPONENT_DOCS_DIR;
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
    "Context",
    "- Generate one component documentation markdown from Figma.",
    componentName ? `- Expected component name: ${componentName}` : "",
    "",
    "Sources",
    `- Figma URL: ${figmaUrl}`,
    "- Existing docs style reference: docs/components/alert.md",
    outputPath
      ? `- Output path (required): ${outputPath}`
      : "- Output path: one file under docs/components/ based on the real component name.",
    "",
    "Constraints",
    "- Use figma MCP workflow and inspect the referenced component/set.",
    "- Documentation only. Do not generate component implementation code.",
    "- Do not invent properties, variants, states, or token semantics.",
    "- Never use Figma internal variable IDs (VariableID) in user-facing prose/tables.",
    "- Figma node IDs are allowed for source traceability (for example in `node-id` URLs).",
    "- Include component metadata/frontmatter expected by project rules.",
    "- Do not document system_cover or non-component pages.",
    "",
    "Expected Output",
    "- Write/update the markdown file in the repo.",
    "- Return a short report with: final path, doc_status value, and unresolved TBD count.",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    runAgentPrompt({
      prompt,
      agent,
      label: `doc-from-figma-url-${toSafeFileName(componentName || "component")}`,
    });
    formatMarkdown({ outputPath, docsRoot });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
