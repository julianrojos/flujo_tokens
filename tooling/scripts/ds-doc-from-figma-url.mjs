#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "./lib/parse-args.mjs";
import { COMPONENT_DOCS_DIR } from "./lib/paths.mjs";
import { runAgentPrompt } from "./lib/agent-runner.mjs";
import { CANONICAL_H2_ORDER } from "./lib/docs-validator.mjs";
import { normalizeComponentName, componentNameToSnakeCase } from "./lib/component-name.mjs";
import { resolveStyleReferencePath } from "./lib/style-reference.mjs";

const REQUIRED_CANONICAL_H2 = CANONICAL_H2_ORDER.slice(0, 10);
const OPTIONAL_CANONICAL_H2 = CANONICAL_H2_ORDER.slice(10);

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
  const docsRootResolved = path.resolve(docsRoot);
  const componentDocsDir =
    path.basename(docsRootResolved) === "components"
      ? docsRootResolved
      : path.join(docsRootResolved, "components");
  const agent = args.agent || "auto";
  const rawComponentName = args["component-name"] || "";
  const normalized = normalizeComponentName(rawComponentName);
  const componentName = normalized.displayName;
  const componentSlug = normalized.fileSlug;
  const outputPath =
    args.output ||
    (componentSlug
      ? path.join(componentDocsDir, `${componentSlug}.md`)
      : null);

  if (outputPath) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  }
  const styleReferencePath = resolveStyleReferencePath({
    componentDocsDir,
    outputPath,
  });

  const prompt = [
    "Context",
    "- Generate one component documentation markdown from Figma.",
    componentName ? `- Expected component name: ${componentName}` : "",
    "",
    "Sources",
    `- Figma URL: ${figmaUrl}`,
    styleReferencePath ? `- Existing docs style reference: ${styleReferencePath}` : "",
    outputPath
      ? `- Output path (required): ${outputPath}`
      : "- Output path: one file under docs/components/ based on the real component name.",
    "",
    "Constraints",
    "- Use figma MCP workflow and inspect the referenced component/set.",
    "- Documentation only. Do not generate component implementation code.",
    "- Use only canonical H2 sections in exact canonical order.",
    `- Required H2 order: ${REQUIRED_CANONICAL_H2.join(" -> ")}.`,
    `- Optional H2 (include only when applicable, still canonical order): ${OPTIONAL_CANONICAL_H2.join(
      " -> "
    )}.`,
    "- Do not create extra H2 headings outside the canonical set.",
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
      label: `doc-from-figma-url-${componentNameToSnakeCase(componentName || "component")}`,
    });
    formatMarkdown({ outputPath, docsRoot: componentDocsDir });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
