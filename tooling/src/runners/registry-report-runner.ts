#!/usr/bin/env node

/**
 * Registry Report Runner
 *
 * Builds read-only component status projections from component-registry.json.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { getStringArg, parseArgs, printUsage } from '../utils/parse-args.js';
import { resolveSystemContextSafe, PROJECT_ROOT } from '../utils/system-context.js';
import { logger } from '../utils/logger.js';

// Import from existing lib during migration period
import {
  DEFAULT_COMPONENT_REGISTRY_PATH,
  readComponentRegistry,
} from '../services/component-registry-index.js';
import { normalizeSortKey, stableHash } from '../services/component-registry-index.js';

const REPORT_SCHEMA_VERSION = 1;

const CLI_CONFIG = {
  command: 'ds:registry:report [options]',
  description:
    'Build read-only component status projections from docs/_generated/component-registry.json.',
  options: [
    {
      name: '--registry',
      description: 'Component registry input path.',
      defaultValue: 'docs/_generated/component-registry.json',
    },
    {
      name: '--out-md',
      description: 'Markdown index output path.',
      defaultValue: 'docs/COMPONENTS_INDEX.md',
    },
    {
      name: '--out-json',
      description: 'JSON health projection output path.',
      defaultValue: 'docs/_generated/components-health.json',
    },
    {
      name: '--format',
      description: 'Stdout format.',
      defaultValue: 'json',
    },
    {
      name: '--max-filter-items',
      description: 'Max items listed per quick filter block.',
      defaultValue: '20',
    },
    {
      name: '--no-md',
      description: 'Skip markdown output file generation.',
      defaultValue: 'false',
    },
    {
      name: '--no-json',
      description: 'Skip JSON output file generation.',
      defaultValue: 'false',
    },
    {
      name: '--dry-run',
      description: 'Compute and report without writing output files.',
      defaultValue: 'false',
    },
    {
      name: '--system',
      description: 'Target design system context.',
    },
    {
      name: '--help',
      description: 'Show this help message.',
    },
  ],
};

function parseBooleanOption(
  rawValue: string | undefined | null,
  optionName: string,
  fallback: boolean = false,
): boolean {
  const normalized = String(rawValue ?? fallback).trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  throw new Error(
    `Invalid ${optionName} value: ${rawValue}. Allowed: true, false.`,
  );
}

function parseIntegerOption(
  rawValue: string | undefined | null,
  optionName: string,
  fallback: number,
  minValue: number,
): number {
  const parsed = Number(rawValue ?? fallback);
  if (!Number.isFinite(parsed)) {
    throw new Error(
      `Invalid ${optionName} value: ${rawValue}. Expected a number.`,
    );
  }
  return Math.max(minValue, Math.floor(parsed));
}

function assertPathInsideProject(rawPath: string | undefined | null, label: string): string {
  if (!rawPath) return '';
  const resolved = path.resolve(rawPath);
  const rootWithSep = PROJECT_ROOT.endsWith(path.sep)
    ? PROJECT_ROOT
    : `${PROJECT_ROOT}${path.sep}`;
  if (resolved !== PROJECT_ROOT && !resolved.startsWith(rootWithSep)) {
    throw new Error(`${label} must be inside the project root: ${resolved}`);
  }
  return resolved;
}

function writeTextIfChanged(filePath: string, content: string, dryRun: boolean): boolean {
  const resolved = path.resolve(filePath);
  const current = fs.existsSync(resolved) ? fs.readFileSync(resolved, 'utf8') : null;
  if (current === content) return false;
  if (!dryRun) {
    fs.writeFileSync(resolved, content, 'utf8');
  }
  return true;
}

interface ComponentSummary {
  slug: string;
  name: string;
  status: string;
  inFigma: boolean;
  hasSpec: boolean;
  hasDoc: boolean;
  hasVisualProof: boolean;
  needsReview: boolean;
}

interface RegistryReport {
  schemaVersion: number;
  generatedAt: string;
  registryPath: string;
  totalComponents: number;
  byStatus: Record<string, number>;
  byStage: Record<string, number>;
  quickFilters: {
    needsReview: string[];
    draft: string[];
    ready: string[];
    inFigmaOnly: string[];
  };
  components: ComponentSummary[];
}

function buildReport(registry: any, maxFilterItems: number): RegistryReport {
  const components = (registry.components || []).map((c: any) => ({
    slug: c.slug,
    name: c.name || c.slug,
    status: c.doc?.status || 'unknown',
    inFigma: !!c.figma?.component_set_node_id,
    hasSpec: c.spec?.exists === true,
    hasDoc: c.doc?.exists === true,
    hasVisualProof: !!c.visual_proof?.node_id,
    needsReview: c.doc?.status === 'needs-review',
  }));

  const byStatus: Record<string, number> = {};
  const byStage: Record<string, number> = {};

  for (const comp of components) {
    byStatus[comp.status] = (byStatus[comp.status] || 0) + 1;
    const stage = comp.inFigma && comp.hasSpec && comp.hasDoc ? 'complete' : 'incomplete';
    byStage[stage] = (byStage[stage] || 0) + 1;
  }

  const quickFilters = {
    needsReview: components.filter((c: any) => c.needsReview).slice(0, maxFilterItems).map((c: any) => c.slug),
    draft: components.filter((c: any) => c.status === 'draft').slice(0, maxFilterItems).map((c: any) => c.slug),
    ready: components.filter((c: any) => c.status === 'ready').slice(0, maxFilterItems).map((c: any) => c.slug),
    inFigmaOnly: components.filter((c: any) => c.inFigma && !c.hasSpec && !c.hasDoc).slice(0, maxFilterItems).map((c: any) => c.slug),
  };

  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    registryPath: registry.path || '',
    totalComponents: components.length,
    byStatus,
    byStage,
    quickFilters,
    components: components.sort((a: any, b: any) => a.slug.localeCompare(b.slug)),
  };
}

function generateMarkdown(report: RegistryReport): string {
  const lines: string[] = [];
  lines.push('# Component Index\n');
  lines.push(`Generated: ${report.generatedAt}\n`);
  lines.push(`**Total:** ${report.totalComponents} components\n`);

  lines.push('## By Status\n');
  for (const [status, count] of Object.entries(report.byStatus)) {
    lines.push(`- **${status}:** ${count}`);
  }

  lines.push('\n## By Stage\n');
  for (const [stage, count] of Object.entries(report.byStage)) {
    lines.push(`- **${stage}:** ${count}`);
  }

  lines.push('\n## Quick Filters\n');
  if (report.quickFilters.needsReview.length > 0) {
    lines.push(`### Needs Review (${report.quickFilters.needsReview.length})\n`);
    for (const slug of report.quickFilters.needsReview) {
      lines.push(`- ${slug}`);
    }
  }

  lines.push('\n## All Components\n');
  lines.push('| Slug | Status | In Figma | Has Spec | Has Doc | Visual Proof |');
  lines.push('|------|--------|----------|----------|---------|--------------|');
  for (const comp of report.components) {
    lines.push(
      `| ${comp.slug} | ${comp.status} | ${comp.inFigma ? '✅' : '❌'} | ${comp.hasSpec ? '✅' : '❌'} | ${comp.hasDoc ? '✅' : '❌'} | ${comp.hasVisualProof ? '✅' : '❌'} |`,
    );
  }

  return lines.join('\n');
}

export async function runRegistryReport(args: string[] = []): Promise<void> {
  const parsed = parseArgs(args);

  if (parsed.help) {
    printUsage(CLI_CONFIG);
    process.exit(0);
  }

  const ctx = resolveSystemContextSafe({ system: getStringArg(parsed, 'system') });
  const registryPath = path.resolve(String(getStringArg(parsed, 'registry') || DEFAULT_COMPONENT_REGISTRY_PATH));
  const outMd = assertPathInsideProject(String(getStringArg(parsed, 'out-md') || 'docs/COMPONENTS_INDEX.md'), '--out-md');
  const outJson = assertPathInsideProject(String(getStringArg(parsed, 'out-json') || 'docs/_generated/components-health.json'), '--out-json');
  const format = String(getStringArg(parsed, 'format') || 'json');
  const maxFilterItems = parseIntegerOption(String(parsed['max-filter-items']), '--max-filter-items', 20, 1);
  const skipMd = parseBooleanOption(String(parsed['no-md']), '--no-md', false);
  const skipJson = parseBooleanOption(String(parsed['no-json']), '--no-json', false);
  const dryRun = parseBooleanOption(String(parsed['dry-run']), '--dry-run', false);

  // Load registry
  const registry = readComponentRegistry(registryPath);

  // Build report
  const report = buildReport(registry, maxFilterItems);

  // Output to stdout
  if (format === 'json') {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`\n=== Component Registry Report ===\n`);
    console.log(`Total: ${report.totalComponents} components`);
    console.log(`By Status: ${JSON.stringify(report.byStatus)}`);
    console.log(`By Stage: ${JSON.stringify(report.byStage)}`);
  }

  // Write output files
  if (!skipMd && outMd) {
    const mdContent = generateMarkdown(report);
    const written = writeTextIfChanged(outMd, mdContent, dryRun);
    if (written && !dryRun) {
      logger.info(`Markdown report written to ${outMd}`);
    }
  }

  if (!skipJson && outJson) {
    const jsonContent = JSON.stringify(report, null, 2);
    const written = writeTextIfChanged(outJson, jsonContent, dryRun);
    if (written && !dryRun) {
      logger.info(`JSON report written to ${outJson}`);
    }
  }
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  runRegistryReport(process.argv.slice(2)).catch((error) => {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Registry report runner failed: ${errorMessage}`);
    process.exit(1);
  });
}
