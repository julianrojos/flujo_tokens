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
import {
  compareComponentRegistryToSources,
  DEFAULT_COMPONENT_DOCS_DIR,
  DEFAULT_COMPONENT_REGISTRY_PATH,
  DEFAULT_COMPONENT_SPECS_DIR,
  DEFAULT_RENDER_PAYLOADS_DIR,
  DEFAULT_VISUAL_PROOFS_DIR,
} from "./lib/component-registry/index.mjs";

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

function uniqueSorted(values) {
  return Array.from(new Set(values)).sort((a, b) =>
    a.localeCompare(b, "en", { sensitivity: "base" }),
  );
}

function collectManifestRuleFiles(manifest) {
  const rules = Array.isArray(manifest?.rules) ? manifest.rules : [];
  return uniqueSorted(
    rules
      .map((entry) =>
        entry && typeof entry === "object" ? String(entry.file || "").trim() : "",
      )
      .filter(Boolean),
  );
}

function collectRuleFilesOnDisk(manifestPath) {
  const rulesDir = path.dirname(path.resolve(manifestPath));
  if (!fs.existsSync(rulesDir)) return [];
  return uniqueSorted(
    fs
      .readdirSync(rulesDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".mdc"))
      .map((entry) => entry.name),
  );
}

function collectSkillFiles(skillsRoot) {
  const root = path.resolve(skillsRoot);
  if (!fs.existsSync(root)) return [];
  const files = [];
  const queue = [root];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(fullPath);
        continue;
      }
      if (entry.isFile() && entry.name === "SKILL.md") {
        files.push(fullPath);
      }
    }
  }
  return files.sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
}

function parseSkillFrontmatter(skillPath) {
  const raw = fs.readFileSync(skillPath, "utf8");
  const match = raw.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) {
    throw new Error("Missing YAML frontmatter block.");
  }
  return parseYamlDocument(match[1], `skill frontmatter (${path.basename(skillPath)})`);
}

function validateSkillVersioning(skillsRoot) {
  const skillFiles = collectSkillFiles(skillsRoot);
  const issues = [];

  for (const filePath of skillFiles) {
    try {
      const frontmatter = parseSkillFrontmatter(filePath);
      const missing = [];

      const version = String(frontmatter.version || "").trim();
      if (!version) missing.push("version");

      if (!Array.isArray(frontmatter.requires_rules) || frontmatter.requires_rules.length === 0) {
        missing.push("requires_rules");
      }

      if (
        !Array.isArray(frontmatter.compatible_agents) ||
        frontmatter.compatible_agents.length === 0
      ) {
        missing.push("compatible_agents");
      }

      if (missing.length > 0) {
        issues.push({
          file: filePath,
          missing,
        });
      }
    } catch (error) {
      issues.push({
        file: filePath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    checked: skillFiles.length,
    issues,
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
  const componentRegistryPath = path.resolve(
    args["component-registry"] || DEFAULT_COMPONENT_REGISTRY_PATH,
  );
  const renderPayloadDir = path.resolve(
    args["render-dir"] || DEFAULT_RENDER_PAYLOADS_DIR,
  );
  const visualProofDir = path.resolve(
    args["proof-dir"] || DEFAULT_VISUAL_PROOFS_DIR,
  );
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
      const parsedManifest = parseYamlDocument(
        fs.readFileSync(manifestPath, "utf8"),
        "rules manifest",
      );
      checks.push(
        createCheck("RULE_MANIFEST", "pass", "Rules manifest is readable.", {
          manifestPath,
        })
      );

      const manifestRuleFiles = collectManifestRuleFiles(parsedManifest);
      const diskRuleFiles = collectRuleFilesOnDisk(manifestPath);
      const missingInManifest = diskRuleFiles.filter(
        (fileName) => !manifestRuleFiles.includes(fileName),
      );
      const missingOnDisk = manifestRuleFiles.filter(
        (fileName) => !diskRuleFiles.includes(fileName),
      );

      if (missingInManifest.length === 0 && missingOnDisk.length === 0) {
        checks.push(
          createCheck(
            "RULE_MANIFEST_COVERAGE",
            "pass",
            "Rules manifest covers all rule files on disk.",
            {
              ruleFiles: diskRuleFiles.length,
            },
          ),
        );
      } else {
        checks.push(
          createCheck(
            "RULE_MANIFEST_COVERAGE",
            "fail",
            "Rules manifest and on-disk rule files are out of sync.",
            {
              missingInManifest,
              missingOnDisk,
            },
          ),
        );
      }
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

  try {
    const componentRegistryCheck = compareComponentRegistryToSources({
      registryPath: componentRegistryPath,
      specsDir: specRoot || DEFAULT_COMPONENT_SPECS_DIR,
      docsDir: docsRoot || DEFAULT_COMPONENT_DOCS_DIR,
      renderDir: renderPayloadDir,
      proofsDir: visualProofDir,
    });
    if (componentRegistryCheck.exists && componentRegistryCheck.matches) {
      checks.push(
        createCheck(
          "COMPONENT_REGISTRY",
          "pass",
          "Component registry is present and synchronized.",
          {
            componentRegistryPath,
            fingerprint: componentRegistryCheck.expected.fingerprint_sha256,
            components: componentRegistryCheck.expected.summary.total_components,
          },
        ),
      );
    } else {
      checks.push(
        createCheck(
          "COMPONENT_REGISTRY",
          "fail",
          componentRegistryCheck.exists
            ? "Component registry is out of sync with docs/spec/render/proof artifacts."
            : "Component registry is missing.",
          {
            componentRegistryPath,
            exists: componentRegistryCheck.exists,
            hint: "Run `npm run ds:registry:sync`.",
          },
        ),
      );
    }
  } catch (error) {
    checks.push(
      createCheck(
        "COMPONENT_REGISTRY",
        "fail",
        "Component registry check failed.",
        {
          componentRegistryPath,
          error: error instanceof Error ? error.message : String(error),
          hint: "Run `npm run ds:registry:sync` to regenerate a valid registry.",
        },
      ),
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

  const skillsRoot = path.join(PROJECT_ROOT, ".agent", "skills");
  const skillVersioning = validateSkillVersioning(skillsRoot);
  if (skillVersioning.issues.length === 0) {
    checks.push(
      createCheck(
        "SKILL_VERSIONING",
        "pass",
        "All local skills include required versioning metadata.",
        {
          checked: skillVersioning.checked,
        },
      ),
    );
  } else {
    checks.push(
      createCheck(
        "SKILL_VERSIONING",
        "fail",
        "One or more skills are missing required versioning metadata.",
        {
          checked: skillVersioning.checked,
          issues: skillVersioning.issues,
        },
      ),
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
