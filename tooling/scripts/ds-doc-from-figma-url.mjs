#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "./lib/parse-args.mjs";
import { COMPONENT_DOCS_DIR } from "./lib/paths.mjs";
import { runAgentPrompt } from "./lib/agent-runner.mjs";
import {
  normalizeComponentName,
  componentNameToSnakeCase,
} from "./lib/component-name.mjs";
import { resolveStyleReferencePath } from "./lib/style-reference.mjs";
import { normalizeAgentOutputFile } from "./lib/agent-output-normalizer.mjs";
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

function captureFileSnapshot(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return { exists: false, content: "" };
  }
  return {
    exists: true,
    content: fs.readFileSync(filePath, "utf8"),
  };
}

function restoreFileSnapshot(filePath, snapshot) {
  if (!filePath) return;
  if (!snapshot.exists) {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    return;
  }
  fs.writeFileSync(filePath, snapshot.content, "utf8");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const figmaUrl = args.url;
  if (!figmaUrl) {
    console.error(
      'Missing --url\nExample: npm run ds:doc-from-figma-url -- --url "https://www.figma.com/design/..." --agent codex',
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
    (componentSlug ? path.join(componentDocsDir, `${componentSlug}.md`) : null);

  if (outputPath) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  }
  const styleReferencePath = resolveStyleReferencePath({
    componentDocsDir,
    outputPath,
  });

  const prompt = buildAgentPrompt({
    context: [
      "Generate one component documentation markdown from Figma.",
      componentName ? `Expected component name: ${componentName}` : "",
    ],
    sources: [
      `Figma URL: ${figmaUrl}`,
      styleReferencePath
        ? `Existing docs style reference: ${styleReferencePath}`
        : "",
      outputPath
        ? `Output path (required): ${outputPath}`
        : "Output path: one file under docs/components/ based on the real component name.",
    ],
    constraints: [
      RULE_BLOCKS.FIGMA_MCP_WORKFLOW,
      RULE_BLOCKS.DOCUMENTATION_ONLY,
      ...canonicalH2ConstraintLines(),
      "Do not invent properties, variants, states, or token semantics.",
      RULE_BLOCKS.NO_INTERNAL_IDS,
      "Figma node IDs are allowed for source traceability (for example in `node-id` URLs).",
      "Include component metadata/frontmatter expected by project rules.",
      "Do not document system_cover or non-component pages.",
    ],
    examples: [
      "GOOD token reference: `Semantic.Color.Text.Neutral.Default` (#121212).",
      "BAD token reference: VariableID:123:456.",
      "GOOD unresolved marker: `TBD`.",
      "BAD unresolved markers: `pending` or `unknown`.",
      "GOOD H2 order: canonical sections only, no extra H2 headings.",
    ],
    expectedOutput: [
      "Write/update the markdown file in the repo.",
      "Return a short report with: final path, doc_status value, and unresolved TBD count.",
    ],
  });
  const outputSnapshot = captureFileSnapshot(outputPath);

  try {
    runAgentPrompt({
      prompt,
      agent,
      label: `doc-from-figma-url-${componentNameToSnakeCase(componentName || "component")}`,
    });
    if (outputPath && fs.existsSync(outputPath)) {
      normalizeAgentOutputFile(outputPath);
    }
    formatMarkdown({ outputPath, docsRoot: componentDocsDir });

    if (outputPath && fs.existsSync(outputPath)) {
      const generatedMarkdown = fs.readFileSync(outputPath, "utf8");
      const outputContract = validateAgentOutputContract({
        markdown: generatedMarkdown,
        expectedComponentName: componentName || undefined,
      });
      if (!outputContract.ok) {
        const reportPath = writeAgentOutputErrorReport({
          componentSlug:
            componentSlug ||
            path.basename(outputPath, path.extname(outputPath)),
          scriptName: "ds-doc-from-figma-url",
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

      const drift = updateAgentDriftBaseline({
        markdownPath: outputPath,
        componentSlug:
          componentSlug || path.basename(outputPath, path.extname(outputPath)),
        scriptName: "ds-doc-from-figma-url",
      });
      if (drift.driftDetected) {
        console.warn(
          "Output contract drift detected.\n" +
            `Baseline: ${drift.baselinePath}\n` +
            `Previous hash: ${drift.previousHash}\n` +
            `Current hash: ${drift.hash}`,
        );
      }
    }
  } catch (error) {
    restoreFileSnapshot(outputPath, outputSnapshot);
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
