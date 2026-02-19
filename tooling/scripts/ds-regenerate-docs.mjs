#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { parseArgs } from "./lib/parse-args.mjs";
import {
  COMPONENT_DOCS_DIR,
  DOCS_SPEC_DIR,
  resolveProjectPath,
} from "./lib/paths.mjs";
import { DEFAULT_TOKEN_REGISTRY_PATH } from "./lib/token-registry.mjs";
import { componentNameToSnakeCase } from "./lib/component-name.mjs";

const COMPONENT_DOC_SCRIPT_PATH = resolveProjectPath(
  "tooling",
  "scripts",
  "ds-component-doc.mjs",
);

function listSpecFiles(specRoot) {
  if (!fs.existsSync(specRoot)) return [];
  return fs
    .readdirSync(specRoot, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.endsWith(".yml") &&
        entry.name !== "_template.yml"
    )
    .map((entry) => path.resolve(path.join(specRoot, entry.name)))
    .sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
}

function normalizeComponentFilter(rawValue) {
  const raw = String(rawValue || "").trim();
  if (!raw) return "";
  const normalized = componentNameToSnakeCase(raw);
  return normalized || raw.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const docsRootInput = path.resolve(args["docs-root"] || COMPONENT_DOCS_DIR);
  const componentDocsDir =
    path.basename(docsRootInput) === "components"
      ? docsRootInput
      : path.join(docsRootInput, "components");
  const specRoot = path.resolve(args["spec-root"] || path.join(DOCS_SPEC_DIR, "components"));
  const registryPath = path.resolve(args.registry || DEFAULT_TOKEN_REGISTRY_PATH);
  const agent = String(args.agent || process.env.DS_AGENT || "auto");
  const force = String(args.force || "true") === "false" ? "false" : "true";
  const skipValidation = String(args["skip-validation"] || "false") === "true";
  const dryRun = String(args["dry-run"] || "false") === "true";
  const continueOnError = String(args["continue-on-error"] || "false") === "true";
  const componentFilter = normalizeComponentFilter(
    args.component || args["component-name"] || ""
  );

  if (!fs.existsSync(COMPONENT_DOC_SCRIPT_PATH)) {
    console.error(`Missing script: ${COMPONENT_DOC_SCRIPT_PATH}`);
    process.exit(1);
  }

  const specs = listSpecFiles(specRoot).filter((specPath) => {
    if (!componentFilter) return true;
    const slug = path.basename(specPath, path.extname(specPath));
    return slug === componentFilter;
  });

  if (specs.length === 0) {
    console.error(
      componentFilter
        ? `No spec found for component filter: ${componentFilter}`
        : `No component specs found in: ${specRoot}`
    );
    process.exit(1);
  }

  const failures = [];
  let processed = 0;

  for (const specPath of specs) {
    const slug = path.basename(specPath, path.extname(specPath));
    const outputPath = path.resolve(path.join(componentDocsDir, `${slug}.md`));
    const cmdArgs = [
      COMPONENT_DOC_SCRIPT_PATH,
      "--spec-file",
      specPath,
      "--output",
      outputPath,
      "--registry",
      registryPath,
      "--agent",
      agent,
      "--force",
      force,
    ];
    if (skipValidation) {
      cmdArgs.push("--skip-validation", "true");
    }

    if (dryRun) {
      process.stdout.write(
        `${JSON.stringify(
          {
            dryRun: true,
            command: process.execPath,
            args: cmdArgs,
          },
          null,
          2
        )}\n`
      );
      processed += 1;
      continue;
    }

    const result = spawnSync(process.execPath, cmdArgs, {
      stdio: "inherit",
    });
    processed += 1;

    if ((result.status ?? 1) === 0) continue;
    failures.push({
      specPath,
      outputPath,
      exitCode: result.status ?? 1,
    });

    if (!continueOnError) break;
  }

  const summary = {
    ok: failures.length === 0,
    dryRun,
    processed,
    totalTargets: specs.length,
    failed: failures.length,
    failures,
  };

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  process.exit(summary.ok ? 0 : 1);
}

main();
