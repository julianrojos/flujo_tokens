#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

import { parseArgs, printUsage } from "./lib/parse-args.mjs";
import {
  DEFAULT_COMPONENT_OVERVIEW_PATH,
  DEFAULT_COMPONENT_REGISTRY_PATH,
  syncComponentOverview,
} from "./lib/component-registry/index.mjs";

const USAGE = {
  command: "npm run ds:registry:overview [-- --dry-run true]",
  description:
    "Regenerate docs/components/overview.md component list from the component registry.",
  options: [
    {
      name: "--registry <path>",
      description: "Component registry path.",
      defaultValue: "docs/_generated/component-registry.json",
    },
    {
      name: "--overview <path>",
      description: "Overview markdown path.",
      defaultValue: "docs/components/overview.md",
    },
    {
      name: "--dry-run <true|false>",
      description: "Report pending changes without writing files.",
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
  const registryPath = path.resolve(args.registry || DEFAULT_COMPONENT_REGISTRY_PATH);
  const overviewPath = path.resolve(args.overview || DEFAULT_COMPONENT_OVERVIEW_PATH);

  if (!fs.existsSync(overviewPath)) {
    process.stderr.write(`Overview file not found: ${overviewPath}\n`);
    process.exit(1);
  }

  try {
    const report = syncComponentOverview({
      registryPath,
      overviewPath,
      dryRun,
    });
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}

main();
