#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { parseArgs, printUsage } from "./lib/parse-args.mjs";
import { COMPONENT_DOCS_DIR } from "./lib/paths.mjs";
import { runAgentPrompt } from "./lib/agent-runner.mjs";
import {
  normalizeComponentName,
  componentNameToSnakeCase,
} from "./lib/component-name.mjs";
import { resolveStyleReferencePath } from "./lib/style-reference.mjs";
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
import { runOrThrow } from "./lib/exec.mjs";

const USAGE = {
  command:
    'npm run ds:doc-from-figma-url -- --url "https://www.figma.com/design/..." [--component-name Button] [--output docs/components/button.md] [--agent codex]',
  description:
    "Generate one component markdown from a Figma URL using an agent CLI.",
  options: [
    {
      name: "--url <figma-url>",
      description: "Figma URL with node-id for the component.",
      required: true,
    },
    {
      name: "--component-name <name>",
      description: "Optional display name hint for H1 and output naming.",
    },
    {
      name: "--output <path>",
      description: "Optional markdown output path.",
    },
    {
      name: "--docs-root <path>",
      description: "Docs root or docs/components directory.",
      defaultValue: "docs/components",
    },
    {
      name: "--agent <codex|claude|gemini|auto>",
      description: "Agent CLI used for generation.",
      defaultValue: "auto",
    },
    {
      name: "--help",
      description: "Show this help message.",
    },
  ],
};

function formatMarkdown({ outputPath, docsRoot }) {
  const target = outputPath
    ? path.resolve(outputPath)
    : path.join(path.resolve(docsRoot), "**/*.md");
  runOrThrow("npx", ["prettier", "--write", target]);
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
  if (String(args.help || "false") === "true") {
    printUsage(USAGE, { exitCode: 0 });
  }

  const figmaUrl = args.url;
  if (!figmaUrl) {
    printUsage(USAGE, { stream: "stderr", exitCode: 1 });
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
  const skeletonPath = writeComponentDocSkeleton({
    componentName: componentName || "Component",
    outputPath: outputPath || undefined,
  });
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
      `Canonical markdown skeleton (fill-only): ${skeletonPath}`,
      `Golden markdown example for tone/detail: ${GOLDEN_COMPONENT_DOC_SAMPLE_PATH}`,
      outputPath
        ? `Output path (required): ${outputPath}`
        : "Output path: one file under docs/components/ based on the real component name.",
    ],
    constraints: [
      RULE_BLOCKS.FIGMA_MCP_WORKFLOW,
      RULE_BLOCKS.DOCUMENTATION_ONLY,
      ...canonicalH2ConstraintLines(),
      "Use the skeleton file as the source layout: keep all H2 headings and table columns unchanged.",
      "Fill placeholders with concrete content, but do not add or remove H2 sections.",
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
