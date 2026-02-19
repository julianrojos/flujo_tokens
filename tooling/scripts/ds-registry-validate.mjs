#!/usr/bin/env node

import path from "node:path";

import { parseArgs, printUsage } from "./lib/parse-args.mjs";
import {
  compareComponentRegistryToSources,
  DEFAULT_COMPONENT_DOCS_DIR,
  DEFAULT_COMPONENT_REGISTRY_PATH,
  DEFAULT_COMPONENT_SPECS_DIR,
  DEFAULT_RENDER_PAYLOADS_DIR,
  DEFAULT_VISUAL_PROOFS_DIR,
} from "./lib/component-registry/index.mjs";

const USAGE = {
  command: "npm run ds:registry:validate",
  description:
    "Validate component-registry.json schema and verify it matches current source artifacts.",
  options: [
    {
      name: "--registry <path>",
      description: "Component registry path.",
      defaultValue: "docs/_generated/component-registry.json",
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
      name: "--strict <true|false>",
      description: "Fail on drift (default true).",
      defaultValue: "true",
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

  const strict = String(args.strict || "true") !== "false";

  try {
    const comparison = compareComponentRegistryToSources({
      registryPath: path.resolve(args.registry || DEFAULT_COMPONENT_REGISTRY_PATH),
      specsDir: path.resolve(args["spec-root"] || DEFAULT_COMPONENT_SPECS_DIR),
      docsDir: path.resolve(args["docs-root"] || DEFAULT_COMPONENT_DOCS_DIR),
      renderDir: path.resolve(args["render-dir"] || DEFAULT_RENDER_PAYLOADS_DIR),
      proofsDir: path.resolve(args["proof-dir"] || DEFAULT_VISUAL_PROOFS_DIR),
    });

    const report = {
      ok: comparison.exists && comparison.matches,
      exists: comparison.exists,
      strict,
      registryPath: path.resolve(args.registry || DEFAULT_COMPONENT_REGISTRY_PATH),
      expectedFingerprint: comparison.expected.fingerprint_sha256,
      currentFingerprint: comparison.current?.fingerprint_sha256 || null,
      summary: comparison.expected.summary,
      drift: comparison.exists ? !comparison.matches : true,
      hint: comparison.exists
        ? comparison.matches
          ? "Registry is synchronized."
          : "Run `npm run ds:registry:sync` to update the registry."
        : "Run `npm run ds:registry:sync` to create the registry.",
    };

    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

    if (strict && !report.ok) {
      process.exit(1);
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}

main();
