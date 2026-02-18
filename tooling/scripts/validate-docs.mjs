#!/usr/bin/env node

import path from "node:path";

import { parseArgs } from "./lib/parse-args.mjs";
import { COMPONENT_DOCS_DIR } from "./lib/paths.mjs";
import { DEFAULT_TOKEN_REGISTRY_PATH } from "./lib/token-registry.mjs";
import { validateDocs } from "./lib/docs-validator.mjs";

function main() {
  const args = parseArgs(process.argv.slice(2));

  const docsRoot = args["docs-root"] || COMPONENT_DOCS_DIR;
  const registryPath = args.registry || DEFAULT_TOKEN_REGISTRY_PATH;
  const filePath = args.file ? path.resolve(args.file) : null;
  const specFilePath = args["spec-file"] ? path.resolve(args["spec-file"]) : null;
  const strict = String(args.strict || "false") === "true";
  const noOverview = String(args["no-overview"] || "false") === "true";
  const noSpecs = String(args["no-specs"] || "false") === "true";

  const report = validateDocs({
    docsRoot,
    registryPath,
    filePath,
    specFilePath,
    checkOverview: !noOverview,
    checkSpecs: !noSpecs,
  });

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

  const shouldFail = !report.ok || (strict && report.summary.warnings > 0);
  process.exit(shouldFail ? 1 : 0);
}

main();
