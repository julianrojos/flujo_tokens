#!/usr/bin/env node

import path from "node:path";

import { parseArgs } from "./lib/parse-args.mjs";
import { COMPONENT_DOCS_DIR } from "./lib/paths.mjs";
import { DEFAULT_TOKEN_REGISTRY_PATH } from "./lib/token-registry.mjs";
import { validateDocs } from "./lib/docs-validator.mjs";

const TOKEN_REGISTRY_CHECK = "token-registry";
const TOKEN_SOURCE_CODES = new Set(["TOK01", "TOK02", "TOK03", "SPEC01"]);

function mapTokenRegistryCode(finding) {
  const message = String(finding?.message || "").toLowerCase();
  if (message.includes("deprecated")) return "TOKEN_DEPRECATED";
  if (message.includes("ambiguous") || message.includes("collision")) return "TOKEN_AMBIGUOUS";
  return "TOKEN_MISSING";
}

function projectTokenRegistryReport(report) {
  const mapFinding = (finding) => {
    const sourceCode = String(finding?.code || "");
    const mappedCode = mapTokenRegistryCode(finding);
    return {
      ...finding,
      code: mappedCode,
      source_code: sourceCode,
    };
  };

  const errors = report.errors
    .filter((finding) => TOKEN_SOURCE_CODES.has(String(finding?.code || "")))
    .map(mapFinding);
  const warnings = report.warnings
    .filter((finding) => TOKEN_SOURCE_CODES.has(String(finding?.code || "")))
    .map(mapFinding);

  return {
    ...report,
    ok: errors.length === 0,
    summary: {
      ...report.summary,
      errors: errors.length,
      warnings: warnings.length,
    },
    errors,
    warnings,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  const docsRoot = args["docs-root"] || COMPONENT_DOCS_DIR;
  const registryPath = args.registry || DEFAULT_TOKEN_REGISTRY_PATH;
  const filePath = args.file ? path.resolve(args.file) : null;
  const specFilePath = args["spec-file"] ? path.resolve(args["spec-file"]) : null;
  const strict = String(args.strict || "false") === "true";
  const noOverview = String(args["no-overview"] || "false") === "true";
  const noSpecs = String(args["no-specs"] || "false") === "true";
  const allowExtraH2 = String(args["allow-extra-h2"] || "false") === "true";
  const check = String(args.check || "").trim().toLowerCase();

  if (check && check !== TOKEN_REGISTRY_CHECK) {
    console.error(`Unsupported --check value: ${check}. Supported values: ${TOKEN_REGISTRY_CHECK}`);
    process.exit(1);
  }

  const baseReport = validateDocs({
    docsRoot,
    registryPath,
    filePath,
    specFilePath,
    allowExtraH2,
    checkOverview: !noOverview,
    checkSpecs: !noSpecs,
  });
  const report = check === TOKEN_REGISTRY_CHECK ? projectTokenRegistryReport(baseReport) : baseReport;

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

  const shouldFail = !report.ok || (strict && report.summary.warnings > 0);
  process.exit(shouldFail ? 1 : 0);
}

main();
