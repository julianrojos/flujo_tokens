#!/usr/bin/env node

import path from "node:path";
import { pathToFileURL } from "node:url";

import { parseArgs, printUsage } from "./lib/parse-args.mjs";
import { runSpecFromFigma } from "./lib/spec-orchestrator.mjs";

const USAGE = {
  command:
    'npm run ds:spec-from-figma -- --url "https://www.figma.com/design/...&node-id=123-456" --component-name Alert',
  description: "Generate or update component spec YAML from Figma context.",
  options: [
    {
      name: "--url <figma-url>",
      description: "Figma URL for component set/node (recommended).",
    },
    {
      name: "--component-set-node-id <node-id>",
      description: "Explicit component set node id (format: 123:456).",
    },
    {
      name: "--component-name <name>",
      description: "Component display name (used for file naming and prompts).",
    },
    {
      name: "--output <path>",
      description: "Explicit output spec path.",
    },
    {
      name: "--spec-root <path>",
      description: "Spec components directory.",
      defaultValue: "docs/_spec/components",
    },
    {
      name: "--template <path>",
      description: "Spec template path.",
      defaultValue: "docs/_spec/components/_template.yml",
    },
    {
      name: "--registry <path>",
      description: "Token registry JSON path.",
      defaultValue: "docs/_generated/token-registry.json",
    },
    {
      name: "--agent <codex|claude|gemini|auto>",
      description: "Agent CLI used for generation.",
      defaultValue: "auto",
    },
    {
      name: "--force <true|false>",
      description: "Bypass incremental cache.",
      defaultValue: "false",
    },
    {
      name: "--skip-validation <true|false>",
      description: "Skip pre/post validation (requires --force true).",
      defaultValue: "false",
    },
    {
      name: "--allow-non-evidence-updates <true|false>",
      description:
        "Allow changing existing known spec values outside evidence-backed fields (requires --force true).",
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

  try {
    const result = runSpecFromFigma(args);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    if (message.startsWith("Missing Figma source.")) {
      printUsage(USAGE, { stream: "stderr" });
    }
    process.exit(1);
  }
}

const isMainModule =
  !!process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMainModule) {
  main();
}

export { runSpecFromFigma };
