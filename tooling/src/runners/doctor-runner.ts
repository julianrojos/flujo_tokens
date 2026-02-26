#!/usr/bin/env node

/**
 * Design System Doctor Runner
 *
 * I/O operations and CLI entry point for the doctor health check.
 * This module handles filesystem operations, external command execution,
 * and orchestrates the pure validation logic from ./services/doctor.ts
 */

import fs from 'node:fs';
import path from 'node:path';

import {
  createCheck,
  sortUniqueStrings,
  collectManifestRuleFiles,
  collectDeprecatedRulesFromManifest,
  collectAllowedContextValues,
  normalizeRuleId,
  validateSkillVersioning,
  validateDeprecatedRuleReferences,
  buildDoctorReport,
  validateRuleCoverage,
} from '../services/doctor.js';

import type {
  DoctorCheck,
  ManifestDocument,
  SkillFrontmatter,
  SkillVersioningResult,
} from '../services/doctor-types.js';

import { parseArgs, printUsage } from '../utils/parse-args.js';
import { parseYamlDocument } from '../utils/parse-frontmatter.js';
import { resolveSystemContextSafe, PROJECT_ROOT } from '../utils/system-context.js';
import { commandExists } from '../utils/command-exists.js';
import { logger } from '../utils/logger.js';

// Re-import these from legacy modules for now
// TODO: Migrate to services in future iteration
import { validateDocs } from '../../scripts/lib/docs-validator.mjs';
import { loadTokenRegistry } from '../../scripts/lib/token-registry.mjs';
import { componentNameToSnakeCase } from '../../scripts/lib/component-name.mjs';
import { compareComponentRegistryToSources } from '../services/component-registry-index.js';

const CLI_CONFIG = {
  command: 'ds:doctor [options]',
  description: 'Run Design System health checks and validation.',
  options: [
    { name: '--docs-root', description: 'Root directory for component docs' },
    { name: '--spec-root', description: 'Root directory for component specs' },
    { name: '--registry', description: 'Path to token registry JSON' },
    { name: '--component-registry', description: 'Path to component registry JSON' },
    { name: '--render-dir', description: 'Directory for Figma render payloads' },
    { name: '--proof-dir', description: 'Directory for visual proof files' },
    { name: '--manifest', description: 'Path to rules manifest YAML' },
    { name: '--component-name', description: 'Check specific component by name' },
    { name: '--skip-validate', description: 'Skip validate:docs check' },
    { name: '--system', description: 'Target design system (default: iter)' },
    { name: '--help', description: 'Show help' },
  ],
};

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
      return frontmatter && frontmatter.deprecated === true;
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

/**
 * Print report as JSON and exit
 */
function printAndExit(report: ReturnType<typeof buildDoctorReport>): never {
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

/**
 * Main runner function
 */
export async function runDoctor(args: string[] = []): Promise<void> {
  const parsed = parseArgs(args);

  if (parsed.help) {
    printUsage(CLI_CONFIG);
    process.exit(0);
  }

  const ctx = resolveSystemContextSafe({ system: parsed.system });

  // Resolve paths
  const docsRoot = path.resolve(parsed['docs-root'] || ctx.paths.docs);
  const specRoot = path.resolve(parsed['spec-root'] || ctx.paths.specs);
  const registryPath = path.resolve(parsed.registry || ctx.paths.tokenRegistry);
  const componentRegistryPath = path.resolve(
    parsed['component-registry'] || ctx.paths.registry,
  );
  const renderPayloadDir = path.resolve(
    parsed['render-dir'] || path.join(ctx.paths.generated, 'figma_doc_models'),
  );
  const visualProofDir = path.resolve(
    parsed['proof-dir'] || path.join(ctx.paths.generated, 'visual-proofs'),
  );
  const manifestPath = path.resolve(
    parsed.manifest || path.join(PROJECT_ROOT, '.agent', 'rules', '_manifest.yml'),
  );
  const rawComponentName = String(parsed['component-name'] || '').trim();
  const skipValidate = String(parsed['skip-validate'] || 'false') === 'true';

  let parsedManifest: ManifestDocument | null = null;
  const checks: DoctorCheck[] = [];

  // Check PATH_DOCS
  if (fs.existsSync(docsRoot)) {
    checks.push(
      createCheck({
        id: 'PATH_DOCS',
        status: 'pass',
        message: 'Component docs directory found.',
        details: { docsRoot },
      }),
    );
  } else {
    checks.push(
      createCheck({
        id: 'PATH_DOCS',
        status: 'fail',
        message: 'Missing component docs directory.',
        details: { docsRoot },
      }),
    );
  }

  // Check PATH_SPECS
  if (fs.existsSync(specRoot)) {
    checks.push(
      createCheck({
        id: 'PATH_SPECS',
        status: 'pass',
        message: 'Component spec directory found.',
        details: { specRoot },
      }),
    );
  } else {
    checks.push(
      createCheck({
        id: 'PATH_SPECS',
        status: 'fail',
        message: 'Missing component spec directory.',
        details: { specRoot },
      }),
    );
  }

  // Check RULE_MANIFEST
  if (!fs.existsSync(manifestPath)) {
    checks.push(
      createCheck({
        id: 'RULE_MANIFEST',
        status: 'fail',
        message: 'Rules manifest is missing.',
        details: { manifestPath },
      }),
    );
  } else {
    try {
      parsedManifest = parseYamlDocument(
        fs.readFileSync(manifestPath, 'utf8'),
        'rules manifest',
      ) as ManifestDocument;

      checks.push(
        createCheck({
          id: 'RULE_MANIFEST',
          status: 'pass',
          message: 'Rules manifest is readable.',
          details: { manifestPath },
        }),
      );

      // Check RULE_MANIFEST_COVERAGE
      const manifestRuleFiles = collectManifestRuleFiles(parsedManifest);
      const diskRuleFiles = collectRuleFilesOnDisk(manifestPath);
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
            manifestPath,
            error: error instanceof Error ? error.message : String(error),
          },
        }),
      );
    }
  }

  // Check TOKEN_REGISTRY
  try {
    loadTokenRegistry(registryPath);
    checks.push(
      createCheck({
        id: 'TOKEN_REGISTRY',
        status: 'pass',
        message: 'Token registry is present and readable.',
        details: { registryPath },
      }),
    );
  } catch (error) {
    checks.push(
      createCheck({
        id: 'TOKEN_REGISTRY',
        status: 'fail',
        message: 'Token registry is missing or invalid.',
        details: {
          registryPath,
          error: error instanceof Error ? error.message : String(error),
        },
      }),
    );
  }

  // Check COMPONENT_REGISTRY
  try {
    const componentRegistryCheck = compareComponentRegistryToSources({
      registryPath: componentRegistryPath,
      specsDir: specRoot || ctx.paths.specs,
      docsDir: docsRoot || ctx.paths.docs,
      renderDir: renderPayloadDir,
      proofsDir: visualProofDir,
    });

    if (componentRegistryCheck.exists && componentRegistryCheck.matches) {
      checks.push(
        createCheck({
          id: 'COMPONENT_REGISTRY',
          status: 'pass',
          message: 'Component registry is present and synchronized.',
          details: {
            componentRegistryPath,
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
            ? 'Component registry is out of sync with docs/spec/render/proof artifacts.'
            : 'Component registry is missing.',
          details: {
            componentRegistryPath,
            exists: componentRegistryCheck.exists,
            hint: 'Run `npm run ds:registry:sync`.',
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
          componentRegistryPath,
          error: error instanceof Error ? error.message : String(error),
          hint: 'Run `npm run ds:registry:sync` to regenerate a valid registry.',
        },
      }),
    );
  }

  // Check AGENTS
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

  // Check SKILL_VERSIONING
  const skillsRoot = path.join(PROJECT_ROOT, '.agent', 'skills');
  const allowedContext = collectAllowedContextValues(parsedManifest);
  const skillFiles = collectSkillFiles(skillsRoot);
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
  if (!parsedManifest) {
    checks.push(
      createCheck({
        id: 'DEP01',
        status: 'warn',
        message: 'Deprecated rule reference check skipped because the rule manifest is unavailable.',
        details: { manifestPath },
      }),
    );
  } else {
    const deprecatedRules = collectDeprecatedRulesFromManifest(parsedManifest);
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

  // Check COMPONENT_MD and COMPONENT_SPEC (if component-name provided)
  if (rawComponentName) {
    const componentSlug = componentNameToSnakeCase(rawComponentName);
    if (!componentSlug) {
      checks.push(
        createCheck({
          id: 'COMPONENT_NAME',
          status: 'fail',
          message: 'Unable to normalize component name to a slug.',
          details: { componentName: rawComponentName },
        }),
      );
    } else {
      const markdownPath = path.join(docsRoot, `${componentSlug}.md`);
      const specPath = path.join(specRoot, `${componentSlug}.yml`);

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
  }

  // Check VALIDATE_DOCS
  if (!skipValidate) {
    const validation = validateDocs({
      docsRoot,
      specRoot,
      registryPath,
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
  } else {
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
  }

  // Build and output report
  const report = buildDoctorReport(checks);
  printAndExit(report);
}

/**
 * CLI entry point
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  runDoctor(process.argv.slice(2)).catch((error) => {
    logger.error('Doctor runner failed:', error);
    process.exit(1);
  });
}
