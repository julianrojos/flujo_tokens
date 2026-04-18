#!/usr/bin/env node

/**
 * Audit Consistency Runner
 *
 * Audits consistency between spec ↔ markdown ↔ token-registry ↔ Figma.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { parseArgs, printUsage, isMain } from '../utils/index.js';
import { logger } from '../utils/logger.js';
import { resolveRunnerSystemContextOrExit } from '../utils/runner-system-context.js';
import type { RegistryEntry, RegistryLookup } from '../types/registry.js';
import {
  checkSpecMarkdownConsistency,
  checkMarkdownFigmaConsistency,
  checkTokenValidity,
  type CheckResult,
  type TokenValidityResult,
} from '../services/audit-consistency-checks.js';
import { loadTokenRegistry, DEFAULT_TOKEN_REGISTRY_PATH } from '../services/token-registry.js';
import { componentNameToSnakeCase } from '../utils/component-name.js';
import { parseYamlDocument } from '../utils/parse-frontmatter.js';

// ============================================================================
// Type Definitions
// ============================================================================

interface ComponentPair {
  slug: string;
  markdownPath: string;
  specPath: string;
}

interface ComponentAuditReport {
  component: string;
  ok: boolean;
  paths: {
    markdown: string | null;
    spec: string | null;
  };
  checks: {
    spec_markdown_consistency: CheckResult;
    markdown_figma_consistency: CheckResult;
    token_validity: TokenValidityResult;
  };
  suggested: string[];
}

interface AuditReport {
  ok: boolean;
  generatedAt: string;
  summary: {
    componentsAudited: number;
    passed: number;
    failures: number;
  };
  components: ComponentAuditReport[];
}

const CLI_CONFIG = {
  command: 'ds:audit-consistency [options]',
  description:
    'Audits consistency between spec ↔ markdown ↔ token-registry ↔ Figma.',
  options: [
    {
      name: '--docs-root',
      description: 'Component docs root directory (resolves from system context if not provided).',
    },
    {
      name: '--spec-root',
      description: 'Component spec directory (resolves from system context if not provided).',
    },
    {
      name: '--registry',
      description: 'Token registry JSON path (resolves from system context if not provided).',
    },
    {
      name: '--component-name',
      description: 'Audit specific component by name.',
    },
    {
      name: '--system <id>',
      description: 'Target design system context.',
    },
    {
      name: '--help',
      description: 'Show this help message.',
    },
  ],
};

function collectComponentPairs(params: {
  docsRoot: string;
  specRoot: string;
  componentName?: string | null;
}): ComponentPair[] {
  const { docsRoot, specRoot, componentName } = params;
  const markdownBySlug = new Map<string, string>();
  const specBySlug = new Map<string, string>();

  if (fs.existsSync(docsRoot)) {
    for (const entry of fs.readdirSync(docsRoot, { withFileTypes: true })) {
      if (
        !entry.isFile() ||
        !entry.name.endsWith('.md') ||
        entry.name === 'overview.md'
      )
        continue;
      const slug = path.basename(entry.name, '.md');
      markdownBySlug.set(slug, path.join(docsRoot, entry.name));
    }
  }

  if (fs.existsSync(specRoot)) {
    for (const entry of fs.readdirSync(specRoot, { withFileTypes: true })) {
      if (
        !entry.isFile() ||
        !entry.name.endsWith('.yml') ||
        entry.name === '_template.yml'
      )
        continue;
      const slug = path.basename(entry.name, '.yml');
      specBySlug.set(slug, path.join(specRoot, entry.name));
    }
  }

  const slugs = componentName
    ? [componentNameToSnakeCase(componentName)]
    : Array.from(
      new Set([...markdownBySlug.keys(), ...specBySlug.keys()]),
    ).sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));

  return slugs.filter(Boolean).map((slug) => ({
    slug,
    markdownPath: markdownBySlug.get(slug) || '',
    specPath: specBySlug.get(slug) || '',
  }));
}

function buildRegistryLookup(
  registry: Record<string, RegistryEntry>,
): RegistryLookup {
  const entries: RegistryEntry[] = [];
  const seen = new Set<string>();

  for (const value of Object.values(registry)) {
    if (!value || typeof value !== 'object') continue;
    const pathKey = String(value.path || '').trim();
    const slashKey = String(value.slashPath || '').trim();
    const dedupeKey = `${pathKey}|${slashKey}`;
    if (!pathKey && !slashKey) continue;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    entries.push(value);
  }

  const byPath = new Map<string, RegistryEntry>();
  const bySlash = new Map<string, RegistryEntry>();
  for (const entry of entries) {
    const pathKey = String(entry.path || '').trim();
    const slashKey = String(entry.slashPath || '').trim();
    if (pathKey) byPath.set(pathKey, entry);
    if (slashKey) bySlash.set(slashKey, entry);
  }

  return { entries, byPath, bySlash };
}

function buildSuggestedCommands(params: {
  markdownPath: string;
  specPath: string;
  registryPath: string;
}) {
  const { markdownPath, specPath, registryPath } = params;
  return [
    `npm run validate:docs -- --check token-registry --file "${markdownPath}" --spec-file "${specPath}" --no-overview true`,
    `Update the component docs entry in the dashboard for "${markdownPath}" if the docs content is stale.`,
    'npm run generate:registry',
  ];
}

export async function runAuditConsistency(args: string[] = []): Promise<void> {
  const parsed = parseArgs(args);

  if (parsed.help) {
    printUsage(CLI_CONFIG);
    return;
  }

  const ctx = resolveRunnerSystemContextOrExit({ parsedArgs: parsed, logger });
  const docsRoot = path.resolve(
    typeof parsed['docs-root'] === 'string'
      ? parsed['docs-root']
      : ctx.paths.docs,
  );
  const specRoot = path.resolve(
    typeof parsed['spec-root'] === 'string'
      ? parsed['spec-root']
      : ctx.paths.specs,
  );
  const registryPath = path.resolve(
    typeof parsed.registry === 'string'
      ? parsed.registry
      : DEFAULT_TOKEN_REGISTRY_PATH,
  );
  const componentName = String(parsed['component-name'] || '').trim() || null;

  let registry: Record<string, RegistryEntry>;
  try {
    registry = loadTokenRegistry(registryPath);
  } catch (error) {
    const report: AuditReport = {
      ok: false,
      generatedAt: new Date().toISOString(),
      summary: {
        componentsAudited: 0,
        passed: 0,
        failures: 1,
      },
      components: [],
    };
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = 1;
    throw new Error(
      `Failed to load token registry: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const lookup = buildRegistryLookup(registry);
  const pairs = collectComponentPairs({ docsRoot, specRoot, componentName });

  if (pairs.length === 0) {
    const report: AuditReport = {
      ok: false,
      generatedAt: new Date().toISOString(),
      summary: {
        componentsAudited: 0,
        passed: 0,
        failures: 1,
      },
      components: [],
    };
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = 1;
    throw new Error(
      `No component pairs found to audit. docsRoot: ${docsRoot}, specRoot: ${specRoot}, componentName: ${componentName || 'all'}`,
    );
  }

  const componentReports: ComponentAuditReport[] = [];

  for (const pair of pairs) {
    const problems: unknown[] = [];
    if (!pair.markdownPath || !fs.existsSync(pair.markdownPath)) {
      problems.push(
        `Missing markdown file: ${pair.markdownPath || `<design-systems/<id>/docs/components/${pair.slug}.md>`}`,
      );
    }
    if (!pair.specPath || !fs.existsSync(pair.specPath)) {
      problems.push(
        `Missing spec file: ${pair.specPath || `<design-systems/<id>/docs/_spec/components/${pair.slug}.yml>`}`,
      );
    }

    if (problems.length > 0) {
      componentReports.push({
        component: pair.slug,
        ok: false,
        paths: {
          markdown: pair.markdownPath || null,
          spec: pair.specPath || null,
        },
        checks: {
          spec_markdown_consistency: { ok: false, errors: problems },
          markdown_figma_consistency: { ok: false, errors: [] },
          token_validity: { ok: false, errors: [], warnings: [] },
        },
        suggested: buildSuggestedCommands({
          markdownPath:
            pair.markdownPath || path.join(docsRoot, `${pair.slug}.md`),
          specPath: pair.specPath || path.join(specRoot, `${pair.slug}.yml`),
          registryPath,
        }),
      });
      continue;
    }

    let spec: Record<string, unknown>;
    let markdown: string;
    try {
      spec = parseYamlDocument(
        fs.readFileSync(pair.specPath, 'utf8'),
        `spec YAML (${path.basename(pair.specPath)})`,
      );
      markdown = fs.readFileSync(pair.markdownPath, 'utf8');
    } catch (error) {
      componentReports.push({
        component: pair.slug,
        ok: false,
        paths: { markdown: pair.markdownPath, spec: pair.specPath },
        checks: {
          spec_markdown_consistency: {
            ok: false,
            errors: [error instanceof Error ? error.message : String(error)],
          },
          markdown_figma_consistency: { ok: false, errors: [] },
          token_validity: { ok: false, errors: [], warnings: [] },
        },
        suggested: buildSuggestedCommands({
          markdownPath: pair.markdownPath,
          specPath: pair.specPath,
          registryPath,
        }),
      });
      continue;
    }

    const specMarkdown = checkSpecMarkdownConsistency({
      spec,
      markdownContent: markdown,
      lookup,
    });
    const markdownFigma = checkMarkdownFigmaConsistency({
      spec,
      markdownContent: markdown,
    });
    const tokenValidity = checkTokenValidity({
      markdownPath: pair.markdownPath,
      specPath: pair.specPath,
      docsRoot,
      specRoot,
      registryPath,
    });

    componentReports.push({
      component: pair.slug,
      ok: specMarkdown.ok && markdownFigma.ok && tokenValidity.ok,
      paths: { markdown: pair.markdownPath, spec: pair.specPath },
      checks: {
        spec_markdown_consistency: specMarkdown,
        markdown_figma_consistency: markdownFigma,
        token_validity: tokenValidity,
      },
      suggested: buildSuggestedCommands({
        markdownPath: pair.markdownPath,
        specPath: pair.specPath,
        registryPath,
      }),
    });
  }

  const failedComponents = componentReports.filter((item) => !item.ok);
  const report: AuditReport = {
    ok: failedComponents.length === 0,
    generatedAt: new Date().toISOString(),
    summary: {
      componentsAudited: componentReports.length,
      passed: componentReports.length - failedComponents.length,
      failures: failedComponents.length,
    },
    components: componentReports,
  };

  console.log(JSON.stringify(report, null, 2));

  if (!report.ok) {
    process.exitCode = 1;
  }
}

// CLI entry point
if (isMain(import.meta.url)) {
  runAuditConsistency(process.argv.slice(2)).catch((error) => {
    // Error ya fue manejado internamente (JSON impreso + exitCode fijado)
    // Solo salimos con el código de error sin log adicional
    process.exit(process.exitCode || 1);
  });
}
