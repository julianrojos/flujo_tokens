/**
 * Governance Validators
 *
 * Rule manifest loading and findings annotation.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { isPlainObject } from '../utils/is-plain-object.js';
import { parseYamlDocument } from '../utils/parse-frontmatter.js';
import type { DocsValidatorIssue, DocsValidationReport } from './docs-validator-types.js';

export interface ManifestCheck {
  rule_ids?: string[];
  blocking?: boolean;
  [key: string]: unknown;
}

export interface ManifestInfo {
  path: string;
  checks: Record<string, ManifestCheck>;
  loaded: boolean;
  error: string | null;
}

/**
 * Create base validation report structure.
 */
export function createBaseReport(options: { manifestPath: string }): DocsValidationReport {
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    governance: {
      manifestPath: options.manifestPath,
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

/**
 * Load rule manifest from YAML file.
 */
export function loadRuleManifest(manifestPath: string): ManifestInfo {
  const resolvedPath = path.resolve(manifestPath);
  if (!fs.existsSync(resolvedPath)) {
    return {
      path: resolvedPath,
      checks: {},
      loaded: false,
      error: null,
    };
  }

  try {
    const parsed = parseYamlDocument<Record<string, unknown>>(
      fs.readFileSync(resolvedPath, 'utf8'),
      `rule manifest (${path.basename(resolvedPath)})`
    );
    const checks = isPlainObject(parsed.checks) ? (parsed.checks as Record<string, ManifestCheck>) : {};
    return {
      path: resolvedPath,
      checks,
      loaded: true,
      error: null,
    };
  } catch (error) {
    return {
      path: resolvedPath,
      checks: {},
      loaded: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Annotate findings with manifest metadata (rule_ids, blocking).
 */
export function annotateFindingsWithManifest(
  findings: DocsValidatorIssue[],
  manifestChecks: Record<string, ManifestCheck>
): void {
  if (!Array.isArray(findings) || findings.length === 0) return;
  for (const finding of findings) {
    const code = String(finding?.code || '').trim();
    if (!code) continue;
    const manifestEntry = manifestChecks[code];
    if (!isPlainObject(manifestEntry)) continue;
    const ruleIds = Array.isArray(manifestEntry.rule_ids)
      ? manifestEntry.rule_ids
          .map((value) => String(value || '').trim())
          .filter(Boolean)
      : [];
    finding.rule_ids = ruleIds;
    if (typeof manifestEntry.blocking === 'boolean') {
      finding.blocking = manifestEntry.blocking;
    }
  }
}
