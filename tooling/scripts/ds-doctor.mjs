#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

import { parseArgs } from "./lib/parse-args.mjs";
import { parseYamlDocument } from "./lib/parse-frontmatter.mjs";
import { validateDocs } from "./lib/docs-validator.mjs";
import { loadTokenRegistry, DEFAULT_TOKEN_REGISTRY_PATH } from "./lib/token-registry.mjs";
import { componentNameToSnakeCase } from "./lib/component-name.mjs";
import { DOCS_ROOT, DOCS_SPEC_DIR, PROJECT_ROOT } from "./lib/paths.mjs";
import { commandExists } from "./lib/command-exists.mjs";

const ALLOWED_CHECK_STATUS = new Set(["pass", "fail", "warn"]);

function createCheck(id, status, message, details = {}) {
  const normalizedStatus = ALLOWED_CHECK_STATUS.has(status) ? status : "fail";
  return {
    id,
    status: normalizedStatus,
    message,
    details,
  };
}

function printAndExit(report) {
  try {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    process.exit(report.ok ? 0 : 1);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    process.stderr.write(
      `Failed to serialize doctor report as JSON: ${reason}\n`,
    );
    process.stderr.write(
      `Fallback report status: ok=${String(Boolean(report && report.ok))}\n`,
    );
    process.exit(1);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const docsRoot = path.resolve(args["docs-root"] || path.join(DOCS_ROOT, "components"));
  const specRoot = path.resolve(args["spec-root"] || path.join(DOCS_SPEC_DIR, "components"));
  const registryPath = path.resolve(args.registry || DEFAULT_TOKEN_REGISTRY_PATH);
  const manifestPath = path.resolve(args.manifest || path.join(PROJECT_ROOT, ".agent", "rules", "_manifest.yml"));
  const rawComponentName = String(args["component-name"] || "").trim();
  const skipValidate = String(args["skip-validate"] || "false") === "true";

  const checks = [];

  if (fs.existsSync(docsRoot)) {
    checks.push(createCheck("PATH_DOCS", "pass", "Component docs directory found.", { docsRoot }));
  } else {
    checks.push(createCheck("PATH_DOCS", "fail", "Missing component docs directory.", { docsRoot }));
  }

  if (fs.existsSync(specRoot)) {
    checks.push(createCheck("PATH_SPECS", "pass", "Component spec directory found.", { specRoot }));
  } else {
    checks.push(createCheck("PATH_SPECS", "fail", "Missing component spec directory.", { specRoot }));
  }

  if (!fs.existsSync(manifestPath)) {
    checks.push(
      createCheck("RULE_MANIFEST", "fail", "Rules manifest is missing.", {
        manifestPath,
      })
    );
  } else {
    try {
      parseYamlDocument(fs.readFileSync(manifestPath, "utf8"), "rules manifest");
      checks.push(
        createCheck("RULE_MANIFEST", "pass", "Rules manifest is readable.", {
          manifestPath,
        })
      );
    } catch (error) {
      checks.push(
        createCheck("RULE_MANIFEST", "fail", "Rules manifest is invalid YAML.", {
          manifestPath,
          error: error instanceof Error ? error.message : String(error),
        })
      );
    }
  }

  try {
    loadTokenRegistry(registryPath);
    checks.push(
      createCheck("TOKEN_REGISTRY", "pass", "Token registry is present and readable.", {
        registryPath,
      })
    );
  } catch (error) {
    checks.push(
      createCheck("TOKEN_REGISTRY", "fail", "Token registry is missing or invalid.", {
        registryPath,
        error: error instanceof Error ? error.message : String(error),
      })
    );
  }

  const supportedAgents = ["codex", "claude", "gemini"];
  const availableAgents = supportedAgents.filter((agent) => commandExists(agent));
  if (availableAgents.length > 0) {
    checks.push(
      createCheck("AGENTS", "pass", "At least one supported agent CLI is available.", {
        availableAgents,
      })
    );
  } else {
    checks.push(
      createCheck("AGENTS", "fail", "No supported agent CLI found in PATH.", {
        supportedAgents,
      })
    );
  }

  if (rawComponentName) {
    const componentSlug = componentNameToSnakeCase(rawComponentName);
    if (!componentSlug) {
      checks.push(
        createCheck(
          "COMPONENT_NAME",
          "fail",
          "Unable to normalize component name to a slug.",
          { componentName: rawComponentName }
        )
      );
    } else {
      const markdownPath = path.join(docsRoot, `${componentSlug}.md`);
      const specPath = path.join(specRoot, `${componentSlug}.yml`);

      checks.push(
        fs.existsSync(markdownPath)
          ? createCheck("COMPONENT_MD", "pass", "Component markdown exists.", { markdownPath })
          : createCheck("COMPONENT_MD", "fail", "Component markdown is missing.", { markdownPath })
      );
      checks.push(
        fs.existsSync(specPath)
          ? createCheck("COMPONENT_SPEC", "pass", "Component spec exists.", { specPath })
          : createCheck("COMPONENT_SPEC", "fail", "Component spec is missing.", { specPath })
      );
    }
  }

  if (!skipValidate) {
    const validation = validateDocs({
      docsRoot,
      specRoot,
      registryPath,
    });

    if (validation.ok) {
      checks.push(
        createCheck("VALIDATE_DOCS", "pass", "validate:docs passed.", {
          errors: validation.summary.errors,
          warnings: validation.summary.warnings,
        })
      );
    } else {
      checks.push(
        createCheck("VALIDATE_DOCS", "fail", "validate:docs failed.", {
          errors: validation.summary.errors,
          warnings: validation.summary.warnings,
          firstErrors: validation.errors.slice(0, 3),
        })
      );
    }
  } else {
    checks.push(
      createCheck("VALIDATE_DOCS", "warn", "validate:docs check skipped.", {
        hint: "Run without --skip-validate true for a full health check.",
      })
    );
  }

  const summary = checks.reduce(
    (acc, check) => {
      if (check.status === "fail") acc.fails += 1;
      if (check.status === "warn") acc.warnings += 1;
      if (check.status === "pass") acc.passes += 1;
      return acc;
    },
    { passes: 0, warnings: 0, fails: 0 }
  );

  printAndExit({
    ok: summary.fails === 0,
    generatedAt: new Date().toISOString(),
    summary,
    checks,
  });
}

main();
