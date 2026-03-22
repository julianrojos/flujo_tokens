/**
 * Design System Doctor Service
 *
 * Core validation logic for Design System health checks.
 * This module contains pure functions (no I/O) that can be tested in isolation.
 *
 * @see ./runners/doctor-runner.ts for I/O operations
 */

import type {
  CheckStatus,
  DoctorCheck,
  DoctorReport,
  DoctorSummary,
  ManifestDocument,
  ManifestRuleEntry,
  SkillFrontmatter,
  SkillVersioningResult,
  SkillVersioningIssue,
  ValidateSkillVersioningOptions,
  AllowedContextValues,
  DeprecatedRulesMap,
  CreateCheckOptions,
} from './doctor-types.js';

const ALLOWED_CHECK_STATUS: ReadonlySet<CheckStatus> = new Set(['pass', 'fail', 'warn']);

/**
 * Create a normalized doctor check object
 */
export function createCheck({
  id,
  status,
  message,
  details = {},
}: CreateCheckOptions): DoctorCheck {
  const normalizedStatus = ALLOWED_CHECK_STATUS.has(status) ? status : 'fail';
  return {
    id,
    status: normalizedStatus,
    message,
    details,
  };
}

/**
 * Sort and deduplicate string values
 *
 * Note: This is string-specific. For generic arrays, use the uniqueSorted
 * utility from figma-component-map.ts which accepts a comparator.
 */
export function sortUniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values)).sort((a, b) =>
    a.localeCompare(b, 'en', { sensitivity: 'base' }),
  );
}

/**
 * Normalize a rule ID to its canonical form
 */
export function normalizeRuleId(rawRuleId: string): string {
  const raw = String(rawRuleId || '').trim();
  if (!raw) return '';
  const basename = raw.split('/').pop() || raw;
  return basename.replace(/\.mdc$/i, '').trim();
}

/**
 * Collect rule IDs from a skill's requires_rules frontmatter
 */
export function collectRequiresRuleIds(frontmatter: SkillFrontmatter | null): string[] {
  if (!frontmatter || !Array.isArray(frontmatter.requires_rules)) return [];
  const ids: string[] = [];
  for (const entry of frontmatter.requires_rules) {
    if (typeof entry === 'string') {
      const normalized = normalizeRuleId(entry);
      if (normalized) ids.push(normalized);
      continue;
    }
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    for (const ruleId of Object.keys(entry)) {
      const normalized = normalizeRuleId(ruleId);
      if (normalized) ids.push(normalized);
    }
  }
  return sortUniqueStrings(ids);
}

/**
 * Check if a skill has valid context (doc_type + stage)
 */
export function hasValidSkillContext(frontmatter: SkillFrontmatter | null): boolean {
  if (!frontmatter || typeof frontmatter !== 'object') return false;
  const context = frontmatter.context;
  if (!context || typeof context !== 'object' || Array.isArray(context)) return false;
  const docType = String(context.doc_type || '').trim();
  const stage = String(context.stage || '').trim();
  return Boolean(docType) && Boolean(stage);
}

/**
 * Collect rule files from manifest (non-deprecated only)
 */
export function collectManifestRuleFiles(manifest: ManifestDocument | null): string[] {
  const rules = Array.isArray(manifest?.rules) ? manifest.rules : [];
  return sortUniqueStrings(
    rules
      .filter((entry): entry is ManifestRuleEntry =>
        !(entry && typeof entry === 'object' && entry.deprecated === true),
      )
      .map((entry) => (entry && typeof entry === 'object' ? String(entry.file || '').trim() : ''))
      .filter(Boolean),
  );
}

/**
 * Collect deprecated rules from manifest
 */
export function collectDeprecatedRulesFromManifest(
  manifest: ManifestDocument | null,
): DeprecatedRulesMap {
  const rules = Array.isArray(manifest?.rules) ? manifest.rules : [];
  const deprecatedMap = new Map<string, string | null>();
  for (const entry of rules) {
    if (!entry || typeof entry !== 'object') continue;
    if (entry.deprecated !== true) continue;
    const id = normalizeRuleId(entry.id || '');
    if (!id) continue;
    const supersededBy = normalizeRuleId(entry.superseded_by || '');
    deprecatedMap.set(id, supersededBy || null);
  }
  return deprecatedMap;
}

/**
 * Collect allowed context values from manifest matrix
 */
export function collectAllowedContextValues(manifest: ManifestDocument | null): AllowedContextValues {
  const docTypes = new Set<string>();
  const stages = new Set<string>();

  if (!manifest || typeof manifest !== 'object') {
    return { docTypes, stages };
  }

  const matrix = manifest.matrix && typeof manifest.matrix === 'object' ? manifest.matrix : {};
  const byDocType =
    matrix.by_doc_type && typeof matrix.by_doc_type === 'object' ? matrix.by_doc_type : {};
  for (const key of Object.keys(byDocType)) {
    const normalized = String(key || '').trim();
    if (normalized) docTypes.add(normalized);
  }

  const byStage =
    matrix.by_stage && typeof matrix.by_stage === 'object' ? matrix.by_stage : {};
  for (const key of Object.keys(byStage)) {
    const normalized = String(key || '').trim();
    if (normalized) stages.add(normalized);
  }

  return { docTypes, stages };
}

/**
 * Validate skill versioning metadata
 *
 * This is a pure function that validates skill frontmatter.
 * File reading is handled by the runner.
 *
 * @param skills - Array of skill frontmatters with their file paths
 * @param options - Validation options
 * @returns Validation result with issues
 */
export function validateSkillVersioning(
  skills: Array<{ filePath: string; frontmatter: SkillFrontmatter | null; error?: string }>,
  options: ValidateSkillVersioningOptions = {},
): SkillVersioningResult {
  const issues: SkillVersioningIssue[] = [];
  const allowedDocTypes = options.allowedDocTypes instanceof Set ? options.allowedDocTypes : new Set();
  const allowedStages = options.allowedStages instanceof Set ? options.allowedStages : new Set();

  for (const skill of skills) {
    if (skill.error) {
      issues.push({
        file: skill.filePath,
        error: skill.error,
      });
      continue;
    }

    const frontmatter = skill.frontmatter;
    if (!frontmatter) {
      issues.push({
        file: skill.filePath,
        missing: ['frontmatter'],
      });
      continue;
    }

    const missing: string[] = [];

    const version = String(frontmatter.version || '').trim();
    if (!version) missing.push('version');

    const hasContext = hasValidSkillContext(frontmatter);
    const hasLegacyRequiresRules =
      Array.isArray(frontmatter.requires_rules) && frontmatter.requires_rules.length > 0;
    if (!hasContext && !hasLegacyRequiresRules) {
      missing.push('context');
    }

    if (
      !Array.isArray(frontmatter.compatible_agents) ||
      frontmatter.compatible_agents.length === 0
    ) {
      missing.push('compatible_agents');
    }

    const contextIssues: string[] = [];
    if (hasContext) {
      const context = frontmatter.context || {};
      const docType = String(context.doc_type || '').trim();
      const stage = String(context.stage || '').trim();
      if (allowedDocTypes.size > 0 && docType && !allowedDocTypes.has(docType)) {
        contextIssues.push(`doc_type:${docType}`);
      }
      if (allowedStages.size > 0 && stage && !allowedStages.has(stage)) {
        contextIssues.push(`stage:${stage}`);
      }
    }

    if (missing.length > 0 || contextIssues.length > 0) {
      issues.push({
        file: skill.filePath,
        missing,
        invalid_context: contextIssues.length > 0 ? contextIssues : undefined,
      });
    }
  }

  return {
    checked: skills.length,
    issues,
  };
}

/**
 * Validate deprecated rule references in skills
 *
 * This is a pure function that checks for deprecated rule references.
 * File reading is handled by the runner.
 *
 * @param skills - Array of skill frontmatters with their file paths
 * @param deprecatedRules - Map of deprecated rule IDs
 * @returns Validation result with issues
 */
export function validateDeprecatedRuleReferences(
  skills: Array<{ filePath: string; frontmatter: SkillFrontmatter | null; error?: string }>,
  deprecatedRules: DeprecatedRulesMap,
): SkillVersioningResult {
  const issues: SkillVersioningIssue[] = [];

  for (const skill of skills) {
    if (skill.error) {
      issues.push({
        file: skill.filePath,
        error: skill.error,
      });
      continue;
    }

    const frontmatter = skill.frontmatter;
    if (!frontmatter) continue;

    const requiredRuleIds = collectRequiresRuleIds(frontmatter);
    const deprecatedRefs = requiredRuleIds
      .filter((ruleId) => deprecatedRules.has(ruleId))
      .map((ruleId) => ({
        rule_id: ruleId,
        superseded_by: deprecatedRules.get(ruleId) || null,
      }));

    if (deprecatedRefs.length > 0) {
      issues.push({
        file: skill.filePath,
        deprecated_requires_rules: deprecatedRefs,
      });
    }
  }

  return {
    checked: skills.length,
    issues,
  };
}

/**
 * Compute summary from check results
 */
export function computeSummary(checks: DoctorCheck[]): DoctorSummary {
  return checks.reduce(
    (acc, check) => {
      if (check.status === 'fail') acc.fails += 1;
      if (check.status === 'warn') acc.warnings += 1;
      if (check.status === 'pass') acc.passes += 1;
      return acc;
    },
    { passes: 0, warnings: 0, fails: 0 },
  );
}

/**
 * Build final doctor report
 */
export function buildDoctorReport(checks: DoctorCheck[]): DoctorReport {
  const summary = computeSummary(checks);
  return {
    ok: summary.fails === 0,
    generatedAt: new Date().toISOString(),
    summary,
    checks,
  };
}

/**
 * Validate rule file coverage (manifest vs disk)
 *
 * Pure function that compares two lists of rule filenames.
 */
export function validateRuleCoverage(
  manifestRuleFiles: string[],
  diskRuleFiles: string[],
): { missingInManifest: string[]; missingOnDisk: string[]; isComplete: boolean } {
  const missingInManifest = diskRuleFiles.filter(
    (fileName) => !manifestRuleFiles.includes(fileName),
  );
  const missingOnDisk = manifestRuleFiles.filter(
    (fileName) => !diskRuleFiles.includes(fileName),
  );
  const isComplete = missingInManifest.length === 0 && missingOnDisk.length === 0;

  return { missingInManifest, missingOnDisk, isComplete };
}
