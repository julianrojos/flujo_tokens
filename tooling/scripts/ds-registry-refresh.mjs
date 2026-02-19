#!/usr/bin/env node

import path from "node:path";

import { parseArgs, printUsage } from "./lib/parse-args.mjs";
import {
  DEFAULT_COMPONENT_DOCS_DIR,
  DEFAULT_COMPONENT_OVERVIEW_PATH,
  DEFAULT_COMPONENT_REGISTRY_PATH,
  DEFAULT_COMPONENT_SPECS_DIR,
  DEFAULT_RENDER_PAYLOADS_DIR,
  DEFAULT_VISUAL_PROOFS_DIR,
  syncDocumentationIndices,
} from "./lib/component-registry/index.mjs";

const USAGE = {
  command: "npm run ds:registry:refresh [-- --dry-run true]",
  description:
    "Atomically refresh component registry JSON and components overview markdown together.",
  options: [
    {
      name: "--registry <path>",
      description: "Output path for the generated component registry JSON.",
      defaultValue: "docs/_generated/component-registry.json",
    },
    {
      name: "--overview <path>",
      description: "Component overview markdown path.",
      defaultValue: "docs/components/overview.md",
    },
    {
      name: "--spec-root <path>",
      description: "Component spec directory.",
      defaultValue: "docs/_spec/components",
    },
    {
      name: "--docs-root <path>",
      description: "Component docs directory.",
      defaultValue: "docs/components",
    },
    {
      name: "--render-dir <path>",
      description: "Directory for markdown->Figma render payload files.",
      defaultValue: "docs/_generated/figma_doc_models",
    },
    {
      name: "--proof-dir <path>",
      description: "Directory for visual proof metadata files.",
      defaultValue: "docs/_generated/visual-proofs",
    },
    {
      name: "--dry-run <true|false>",
      description: "Compute and report changes without writing files.",
      defaultValue: "false",
    },
    {
      name: "--help",
      description: "Show this help message.",
    },
  ],
};

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (String(args.help || "false") === "true") {
    printUsage(USAGE, { exitCode: 0 });
  }

  const dryRun = String(args["dry-run"] || "false") === "true";

  try {
    const report = syncDocumentationIndices({
      registryPath: path.resolve(args.registry || DEFAULT_COMPONENT_REGISTRY_PATH),
      overviewPath: path.resolve(args.overview || DEFAULT_COMPONENT_OVERVIEW_PATH),
      specsDir: path.resolve(args["spec-root"] || DEFAULT_COMPONENT_SPECS_DIR),
      docsDir: path.resolve(args["docs-root"] || DEFAULT_COMPONENT_DOCS_DIR),
      renderDir: path.resolve(args["render-dir"] || DEFAULT_RENDER_PAYLOADS_DIR),
      proofsDir: path.resolve(args["proof-dir"] || DEFAULT_VISUAL_PROOFS_DIR),
      dryRun,
    });

    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}

main();
