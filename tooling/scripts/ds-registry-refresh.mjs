#!/usr/bin/env node

import path from "node:path";

import { parseArgs, printUsage } from "./lib/parse-args.mjs";
import { syncDocumentationIndices } from "./lib/component-registry/index.mjs";
import { resolveSystemContextSafe, PROJECT_ROOT } from "./lib/system-context.mjs";

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
      name: "--system <id>",
      description: "Target design system context.",
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
  const ctx = resolveSystemContextSafe({ system: args.system });

  try {
    const report = syncDocumentationIndices({
      registryPath: path.resolve(args.registry || ctx.paths.registry),
      overviewPath: path.resolve(args.overview || path.join(ctx.paths.docs, "overview.md")),
      specsDir: path.resolve(args["spec-root"] || ctx.paths.specs),
      docsDir: path.resolve(args["docs-root"] || ctx.paths.docs),
      renderDir: path.resolve(args["render-dir"] || path.join(ctx.paths.generated, "figma_doc_models")),
      proofsDir: path.resolve(args["proof-dir"] || path.join(ctx.paths.generated, "visual-proofs")),
      dryRun,
    });

    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}

main();
