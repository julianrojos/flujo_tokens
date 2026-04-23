import fs from "node:fs";
import path from "node:path";

import { isPlainObject } from "../is-plain-object.mjs";
import { parseYamlDocument } from "../parse-frontmatter.mjs";

export function createBaseReport({ manifestPath }) {
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    governance: {
      manifestPath,
      manifestLoaded: false,
    },
    summary: {
      filesChecked: 0,
      tokenRefsChecked: 0,
      tokenRefsInvalid: 0,
      errors: 0,
      warnings: 0,
    },
    errors: [],
    warnings: [],
  };
}

export function loadRuleManifest(manifestPath) {
  const resolvedPath = path.resolve(manifestPath);
  if (!fs.existsSync(resolvedPath)) {
    return {
      path: resolvedPath,
      validation: {
        source_catalog: null,
        checks: {},
      },
      checks: {},
      loaded: false,
      error: null,
    };
  }

  try {
    const parsed = parseYamlDocument(
      fs.readFileSync(resolvedPath, "utf8"),
      `rule manifest (${path.basename(resolvedPath)})`,
    );
    const validation = isPlainObject(parsed.validation) ? parsed.validation : {};
    const checks = isPlainObject(validation.checks) ? validation.checks : {};
    return {
      path: resolvedPath,
      validation,
      checks,
      loaded: true,
      error: null,
    };
  } catch (error) {
    return {
      path: resolvedPath,
      validation: {
        source_catalog: null,
        checks: {},
      },
      checks: {},
      loaded: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function annotateFindingsWithManifest(findings, manifestChecks) {
  if (!Array.isArray(findings) || findings.length === 0) return;
  for (const finding of findings) {
    const code = String(finding?.code || "").trim();
    if (!code) continue;
    const manifestEntry = manifestChecks[code];
    if (!isPlainObject(manifestEntry)) continue;
    const ruleIds = Array.isArray(manifestEntry.rule_ids)
      ? manifestEntry.rule_ids
          .map((value) => String(value || "").trim())
          .filter(Boolean)
      : [];
    finding.rule_ids = ruleIds;
    if (typeof manifestEntry.blocking === "boolean") {
      finding.blocking = manifestEntry.blocking;
    }
  }
}
