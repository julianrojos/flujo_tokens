/**
 * Doctor Checks
 *
 * Individual health check functions for the design system doctor.
 * Each function returns DoctorCheck[] results.
 */

import fs from 'node:fs';
import path from 'node:path';

import {
  createCheck,
  sortUniqueStrings,
  collectManifestRuleFiles,
  collectDeprecatedRulesFromManifest,
  collectAllowedContextValues,
  validateRuleCoverage,
  validateSkillVersioning,
  validateDeprecatedRuleReferences,
} from './doctor.js';

import type { DoctorCheck, ManifestDocument, SkillFrontmatter } from './doctor-types.js';
import { parseYamlDocument } from '../utils/parse-frontmatter.js';
import { validateDocs } from './docs-validator.js';
import { loadTokenRegistry } from './token-registry.js';
import { commandExists } from '../utils/command-exists.js';
import { compareComponentRegistryToSources } from './component-registry-index.js';
import { componentNameToSnakeCase } from '../utils/component-name.js';
import { createDesignSystemRepository } from '../../scripts/lib/system-repository.mjs';

// ============================================================================
// Type Definitions
// ============================================================================

export interface DoctorContext {
  systemId: string;
  docsRoot: string;
  specRoot: string;
  registryPath: string;
  componentRegistryPath: string;
  visualProofDir: string;
  manifestPath: string;
  rawComponentName: string;
  skipValidate: boolean;
  skillsRoot: string;
}

export interface DoctorCheckResult {
  checks: DoctorCheck[];
  manifest?: ManifestDocument | null;
}

// ============================================================================
// Context Resolution
// ============================================================================

/**
 * Resolve doctor context from parsed args and system context.
 */
export function resolveDoctorContext(
  parsed: Record<string, unknown>,
  systemCtx: {
    id: string;
    paths: { docs: string; specs: string; tokenRegistry: string; registry: string; generated: string };
  },
  projectRoot: string,
): DoctorContext {
  const docsRoot = path.resolve(String(parsed['docs-root'] ?? systemCtx.paths.docs));
  const specRoot = path.resolve(String(parsed['spec-root'] ?? systemCtx.paths.specs));
  const registryPath = path.resolve(String(parsed.registry ?? systemCtx.paths.tokenRegistry));
  const componentRegistryPath = path.resolve(
    String(parsed['component-registry'] ?? systemCtx.paths.registry),
  );
  const visualProofDir = path.resolve(
    String(parsed['proof-dir'] ?? path.join(systemCtx.paths.generated, 'visual-proofs')),
  );
  const manifestPath = path.resolve(
    String(parsed.manifest ?? path.join(projectRoot, '.agents', 'rules', '_manifest.yml')),
  );
  const rawComponentName = String(parsed['component-name'] ?? '');
  const skipValidate = String(parsed['skip-validate'] ?? 'false') === 'true';
  const skillsRoot = path.join(projectRoot, '.agents', 'skills');

  return {
    systemId: String(systemCtx.id || '').trim() || 'sys-01',
    docsRoot,
    specRoot,
    registryPath,
    componentRegistryPath,
    visualProofDir,
    manifestPath,
    rawComponentName,
    skipValidate,
    skillsRoot,
  };
}

// ============================================================================
// Private Helpers
// ============================================================================

/**
 * Collect rule files from disk (non-deprecated only)
 */
function collectRuleFilesOnDisk(manifestPath: string): string[] {
  const rulesDir = path.dirname(path.resolve(manifestPath));
  if (!fs.existsSync(rulesDir)) return [];

  const isDeprecatedRuleFile = (fileName: string): boolean => {
    const fullPath = path.join(rulesDir, fileName);
    try {
      const raw = fs.readFileSync(fullPath, 'utf8');
      const match = raw.match(/^---\n([\s\S]*?)\n---\n/);
      if (!match) return false;
      const frontmatter = parseYamlDocument(
        match[1],
        `rule frontmatter (${path.basename(fullPath)})`,
      );
      return (frontmatter as Record<string, unknown>).deprecated === true;
    } catch {
      // If the rule can't be parsed, treat it as non-deprecated
      return false;
    }
  };

  return sortUniqueStrings(
    fs
      .readdirSync(rulesDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.mdc'))
      .map((entry) => entry.name),
  ).filter((fileName) => !isDeprecatedRuleFile(fileName));
}

/**
 * Collect all skill files from a directory tree
 */
function collectSkillFiles(skillsRoot: string): string[] {
  const root = path.resolve(skillsRoot);
  if (!fs.existsSync(root)) return [];

  const files: string[] = [];
  const queue: string[] = [root];

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
      if (entry.isFile() && entry.name === 'SKILL.md') {
        files.push(fullPath);
      }
    }
  }

  return files.sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
}

/**
 * Parse skill frontmatter from file
 */
function parseSkillFrontmatter(skillPath: string): {
  filePath: string;
  frontmatter: SkillFrontmatter | null;
  error?: string;
} {
  try {
    const raw = fs.readFileSync(skillPath, 'utf8');
    const match = raw.match(/^---\n([\s\S]*?)\n---\n/);
    if (!match) {
      return {
        filePath: skillPath,
        frontmatter: null,
        error: 'Missing YAML frontmatter block.',
      };
    }
    const frontmatter = parseYamlDocument(
      match[1],
      `skill frontmatter (${path.basename(skillPath)})`,
    );
    return {
      filePath: skillPath,
      frontmatter: frontmatter as SkillFrontmatter,
    };
  } catch (error) {
    return {
      filePath: skillPath,
      frontmatter: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ============================================================================
// Public API - Check Functions
// ============================================================================

/**
 * Check PATH_DOCS and PATH_SPECS
 */
export function checkPaths(ctx: DoctorContext): DoctorCheck[] {
  const checks: DoctorCheck[] = [];

  // Check PATH_DOCS
  if (fs.existsSync(ctx.docsRoot)) {
    checks.push(
      createCheck({
        id: 'PATH_DOCS',
        status: 'pass',
        message: 'Component docs directory found.',
        details: { docsRoot: ctx.docsRoot },
      }),
    );
  } else {
    checks.push(
      createCheck({
        id: 'PATH_DOCS',
        status: 'fail',
        message: 'Missing component docs directory.',
        details: { docsRoot: ctx.docsRoot },
      }),
    );
  }

  // Check PATH_SPECS
  if (fs.existsSync(ctx.specRoot)) {
    checks.push(
      createCheck({
        id: 'PATH_SPECS',
        status: 'pass',
        message: 'Component spec directory found.',
        details: { specRoot: ctx.specRoot },
      }),
    );
  } else {
    checks.push(
      createCheck({
        id: 'PATH_SPECS',
        status: 'fail',
        message: 'Missing component spec directory.',
        details: { specRoot: ctx.specRoot },
      }),
    );
  }

  return checks;
}

/**
 * Check alignment between design-systems config and filesystem directories.
 */
export function checkSystemPathAlignment(
  projectRoot: string,
  _options?: { configPath?: string },
): DoctorCheck[] {
  const checks: DoctorCheck[] = [];
  const repository = createDesignSystemRepository({ repoRoot: projectRoot });
  let systems: Array<{ id: string }> = [];
  try {
    systems = repository.getAll().map((row) => ({ id: String(row.id || '').trim() })).filter((row) => row.id);
  } catch (error) {
    checks.push(
      createCheck({
        id: 'SYSTEM_PATH_ALIGNMENT',
        status: 'fail',
        message: 'Failed to load design systems from SQLite.',
        details: {
          source: 'sqlite://design_systems',
          error: error instanceof Error ? error.message : String(error),
        },
      }),
    );
    repository.dispose();
    return checks;
  }
  repository.dispose();

  if (systems.length === 0) {
    checks.push(
      createCheck({
        id: 'SYSTEM_PATH_ALIGNMENT',
        status: 'warn',
        message: 'No design systems configured; path alignment check skipped.',
        details: { source: 'sqlite://design_systems', systems: 0 },
      }),
    );
    return checks;
  }

  const missing: string[] = [];

  for (const row of systems) {
    const id = String(row?.id || '').trim() || '(unknown)';
    const dirs = [
      ['inputDir', path.join('design-systems', id, 'input')],
      ['outputDir', path.join('design-systems', id, 'output')],
      ['docsDir', path.join('design-systems', id, 'docs')],
    ] as const;

    for (const [field, relDir] of dirs) {
      if (!relDir) continue;

      // Security: reject paths with traversal patterns
      const normalizedRelDir = path.normalize(relDir);
      if (normalizedRelDir.includes('..')) {
        checks.push(
          createCheck({
            id: 'SYSTEM_PATH_ALIGNMENT',
            status: 'fail',
            message: `Configured ${field} for system "${id}" contains path traversal pattern.`,
            details: {
              source: 'sqlite://design_systems',
              systemId: id,
              field,
              relDir,
              reason: 'Path traversal detected',
            },
          }),
        );
        return checks;
      }

      const absoluteDir = path.resolve(projectRoot, relDir);
      if (!fs.existsSync(absoluteDir)) {
        missing.push(`${id}:${field}:${relDir}`);
      }
    }
  }

  if (missing.length > 0) {
    checks.push(
      createCheck({
        id: 'SYSTEM_PATH_ALIGNMENT',
        status: 'fail',
        message: 'Some configured system directories do not exist.',
        details: {
          source: 'sqlite://design_systems',
          missingCount: missing.length,
          missing,
        },
      }),
    );
    return checks;
  }

  checks.push(
    createCheck({
      id: 'SYSTEM_PATH_ALIGNMENT',
      status: 'pass',
      message: 'All configured system directories exist and use canonical layout.',
      details: {
        source: 'sqlite://design_systems',
        systems: systems.length,
      },
    }),
  );

  return checks;
}

/**
 * Check RULE_MANIFEST and RULE_MANIFEST_COVERAGE
 */
export function checkRuleManifest(ctx: DoctorContext): DoctorCheckResult {
  const checks: DoctorCheck[] = [];
  let parsedManifest: ManifestDocument | null = null;

  if (!fs.existsSync(ctx.manifestPath)) {
    checks.push(
      createCheck({
        id: 'RULE_MANIFEST',
        status: 'fail',
        message: 'Rules manifest is missing.',
        details: { manifestPath: ctx.manifestPath },
      }),
    );
  } else {
    try {
      parsedManifest = parseYamlDocument(
        fs.readFileSync(ctx.manifestPath, 'utf8'),
        'rules manifest',
      ) as ManifestDocument;

      checks.push(
        createCheck({
          id: 'RULE_MANIFEST',
          status: 'pass',
          message: 'Rules manifest is readable.',
          details: { manifestPath: ctx.manifestPath },
        }),
      );

      // Check RULE_MANIFEST_COVERAGE
      const manifestRuleFiles = collectManifestRuleFiles(parsedManifest);
      const diskRuleFiles = collectRuleFilesOnDisk(ctx.manifestPath);
      const coverage = validateRuleCoverage(manifestRuleFiles, diskRuleFiles);

      if (coverage.isComplete) {
        checks.push(
          createCheck({
            id: 'RULE_MANIFEST_COVERAGE',
            status: 'pass',
            message: 'Rules manifest covers all rule files on disk.',
            details: {
              ruleFiles: diskRuleFiles.length,
            },
          }),
        );
      } else {
        checks.push(
          createCheck({
            id: 'RULE_MANIFEST_COVERAGE',
            status: 'fail',
            message: 'Rules manifest and on-disk rule files are out of sync.',
            details: {
              missingInManifest: coverage.missingInManifest,
              missingOnDisk: coverage.missingOnDisk,
            },
          }),
        );
      }
    } catch (error) {
      checks.push(
        createCheck({
          id: 'RULE_MANIFEST',
          status: 'fail',
          message: 'Rules manifest is invalid YAML.',
          details: {
            manifestPath: ctx.manifestPath,
            error: error instanceof Error ? error.message : String(error),
          },
        }),
      );
    }
  }

  return { checks, manifest: parsedManifest };
}

/**
 * Check TOKEN_REGISTRY
 */
export function checkTokenRegistry(ctx: DoctorContext): DoctorCheck[] {
  const checks: DoctorCheck[] = [];

  try {
    loadTokenRegistry(ctx.registryPath);
    checks.push(
      createCheck({
        id: 'TOKEN_REGISTRY',
        status: 'pass',
        message: 'Token registry is present and readable.',
        details: { registryPath: ctx.registryPath },
      }),
    );
  } catch (error) {
    checks.push(
      createCheck({
        id: 'TOKEN_REGISTRY',
        status: 'fail',
        message: 'Token registry is missing or invalid.',
        details: {
          registryPath: ctx.registryPath,
          error: error instanceof Error ? error.message : String(error),
        },
      }),
    );
  }

  return checks;
}

/**
 * Check COMPONENT_REGISTRY
 */
export function checkComponentRegistry(ctx: DoctorContext): DoctorCheck[] {
  const checks: DoctorCheck[] = [];

  try {
    const componentRegistryCheck = compareComponentRegistryToSources({
      dbPath: ctx.componentRegistryPath,
      systemId: ctx.systemId,
      specsDir: ctx.specRoot,
      docsDir: ctx.docsRoot,
      proofsDir: ctx.visualProofDir,
    });

    if (componentRegistryCheck.exists && componentRegistryCheck.matches) {
      checks.push(
        createCheck({
          id: 'COMPONENT_REGISTRY',
          status: 'pass',
          message: 'Component registry is present and synchronized.',
          details: {
            componentRegistryPath: ctx.componentRegistryPath,
            fingerprint: componentRegistryCheck.expected.fingerprint_sha256,
            components: componentRegistryCheck.expected.summary.total_components,
          },
        }),
      );
    } else {
      checks.push(
        createCheck({
          id: 'COMPONENT_REGISTRY',
          status: 'fail',
          message: componentRegistryCheck.exists
            ? 'Component registry is out of sync with docs/spec/proof artifacts.'
            : 'Component registry is missing.',
          details: {
            componentRegistryPath: ctx.componentRegistryPath,
            exists: componentRegistryCheck.exists,
            hint: 'Run `npm run ds:registry:refresh`.',
          },
        }),
      );
    }
  } catch (error) {
    checks.push(
      createCheck({
        id: 'COMPONENT_REGISTRY',
        status: 'fail',
        message: 'Component registry check failed.',
        details: {
          componentRegistryPath: ctx.componentRegistryPath,
          error: error instanceof Error ? error.message : String(error),
          hint: 'Run `npm run ds:registry:refresh` to regenerate DB state.',
        },
      }),
    );
  }

  return checks;
}

/**
 * Check AGENTS
 */
export function checkAgents(): DoctorCheck[] {
  const checks: DoctorCheck[] = [];
  const supportedAgents = ['codex', 'claude', 'gemini'];
  const availableAgents = supportedAgents.filter((agent) => commandExists(agent));

  if (availableAgents.length > 0) {
    checks.push(
      createCheck({
        id: 'AGENTS',
        status: 'pass',
        message: 'At least one supported agent CLI is available.',
        details: { availableAgents },
      }),
    );
  } else {
    checks.push(
      createCheck({
        id: 'AGENTS',
        status: 'fail',
        message: 'No supported agent CLI found in PATH.',
        details: { supportedAgents },
      }),
    );
  }

  return checks;
}

/**
 * Check SKILL_VERSIONING and DEP01
 */
export function checkSkillVersioning(ctx: DoctorContext, manifest: ManifestDocument | null): DoctorCheck[] {
  const checks: DoctorCheck[] = [];

  const allowedContext = collectAllowedContextValues(manifest);
  const skillFiles = collectSkillFiles(ctx.skillsRoot);
  const skills = skillFiles.map(parseSkillFrontmatter);

  const skillVersioning = validateSkillVersioning(skills, {
    allowedDocTypes: allowedContext.docTypes,
    allowedStages: allowedContext.stages,
  });

  if (skillVersioning.issues.length === 0) {
    checks.push(
      createCheck({
        id: 'SKILL_VERSIONING',
        status: 'pass',
        message: 'All local skills include required versioning metadata.',
        details: {
          checked: skillVersioning.checked,
        },
      }),
    );
  } else {
    checks.push(
      createCheck({
        id: 'SKILL_VERSIONING',
        status: 'fail',
        message: 'One or more skills are missing required versioning metadata.',
        details: {
          checked: skillVersioning.checked,
          issues: skillVersioning.issues,
        },
      }),
    );
  }

  // Check DEP01 (deprecated rule references)
  if (!manifest) {
    checks.push(
      createCheck({
        id: 'DEP01',
        status: 'warn',
        message: 'Deprecated rule reference check skipped because the rule manifest is unavailable.',
        details: { manifestPath: ctx.manifestPath },
      }),
    );
  } else {
    const deprecatedRules = collectDeprecatedRulesFromManifest(manifest);
    const deprecatedRuleRefs = validateDeprecatedRuleReferences(skills, deprecatedRules);

    if (deprecatedRuleRefs.issues.length === 0) {
      checks.push(
        createCheck({
          id: 'DEP01',
          status: 'pass',
          message: 'No skills reference deprecated rules in skill metadata.',
          details: {
            checked: deprecatedRuleRefs.checked,
            deprecatedRules: deprecatedRules.size,
          },
        }),
      );
    } else {
      checks.push(
        createCheck({
          id: 'DEP01',
          status: 'fail',
          message: 'One or more skills reference deprecated rules in skill metadata.',
          details: {
            checked: deprecatedRuleRefs.checked,
            issues: deprecatedRuleRefs.issues,
          },
        }),
      );
    }
  }

  return checks;
}

/**
 * Check COMPONENT_MD and COMPONENT_SPEC (if component-name provided)
 */
export function checkComponentByName(ctx: DoctorContext): DoctorCheck[] {
  const checks: DoctorCheck[] = [];

  if (!ctx.rawComponentName) {
    return checks;
  }

  const componentSlug = componentNameToSnakeCase(ctx.rawComponentName);
  if (!componentSlug) {
    checks.push(
      createCheck({
        id: 'COMPONENT_NAME',
        status: 'fail',
        message: 'Unable to normalize component name to a slug.',
        details: { componentName: ctx.rawComponentName },
      }),
    );
  } else {
    const markdownPath = path.join(ctx.docsRoot, `${componentSlug}.md`);
    const specPath = path.join(ctx.specRoot, `${componentSlug}.yml`);

    checks.push(
      fs.existsSync(markdownPath)
        ? createCheck({
          id: 'COMPONENT_MD',
          status: 'pass',
          message: 'Component markdown exists.',
          details: { markdownPath },
        })
        : createCheck({
          id: 'COMPONENT_MD',
          status: 'fail',
          message: 'Component markdown is missing.',
          details: { markdownPath },
        }),
    );

    checks.push(
      fs.existsSync(specPath)
        ? createCheck({
          id: 'COMPONENT_SPEC',
          status: 'pass',
          message: 'Component spec exists.',
          details: { specPath },
        })
        : createCheck({
          id: 'COMPONENT_SPEC',
          status: 'fail',
          message: 'Component spec is missing.',
          details: { specPath },
        }),
    );
  }

  return checks;
}

/**
 * Check VALIDATE_DOCS
 */
export function checkValidateDocs(ctx: DoctorContext): DoctorCheck[] {
  const checks: DoctorCheck[] = [];

  if (ctx.skipValidate) {
    checks.push(
      createCheck({
        id: 'VALIDATE_DOCS',
        status: 'warn',
        message: 'validate:docs check skipped.',
        details: {
          hint: 'Run without --skip-validate true for a full health check.',
        },
      }),
    );
  } else {
    const validation = validateDocs({
      docsRoot: ctx.docsRoot,
      specRoot: ctx.specRoot,
      registryPath: ctx.registryPath,
    });

    if (validation.ok) {
      checks.push(
        createCheck({
          id: 'VALIDATE_DOCS',
          status: 'pass',
          message: 'validate:docs passed.',
          details: {
            errors: validation.summary.errors,
            warnings: validation.summary.warnings,
          },
        }),
      );
    } else {
      checks.push(
        createCheck({
          id: 'VALIDATE_DOCS',
          status: 'fail',
          message: 'validate:docs failed.',
          details: {
            errors: validation.summary.errors,
            warnings: validation.summary.warnings,
            firstErrors: validation.errors.slice(0, 3),
          },
        }),
      );
    }
  }

  return checks;
}
