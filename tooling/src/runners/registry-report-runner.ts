#!/usr/bin/env node

/**
 * Registry Report Runner (DB-only)
 *
 * Builds read-only component status projections from PostgreSQL-backed component state.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { getStringArg, parseArgs, printUsage } from '../utils/parse-args.js';
import { PROJECT_ROOT } from '../utils/system-context.js';
import { logger } from '../utils/logger.js';
import { resolveRunnerSystemContextOrExit } from '../utils/runner-system-context.js';
import {
  bootstrapDatabase,
  resolveDashboardDbUrl,
} from '../../../apps/ds-dashboard/server/db/pg-db-service.js';
import { ComponentRepository } from '../../../apps/ds-dashboard/server/db/component-repository.js';

const REPORT_SCHEMA_VERSION = 1;

const CLI_CONFIG = {
  command: 'ds:registry:report [options]',
  description:
    'Build read-only component status projections from DB-backed component registry.',
  options: [
    {
      name: '--out-md',
      description:
        'Markdown index output path (defaults to active system docs/_generated/components-index.md).',
    },
    {
      name: '--out-json',
      description:
        'JSON health projection output path (defaults to active system docs/_generated/components-health.json).',
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
      name: '--system <id>',
      description: 'Target design system context.',
    },
    {
      name: '--help',
      description: 'Show this help message.',
    },
  ],
};

function parseBooleanOption(
  rawValue: unknown,
  optionName: string,
  fallback: boolean = false,
): boolean {
  const normalized = String(rawValue ?? fallback)
    .trim()
    .toLowerCase();
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

function writeTextIfChanged(
  filePath: string,
  content: string,
  dryRun: boolean,
): boolean {
  const resolved = path.resolve(filePath);
  const current = fs.existsSync(resolved)
    ? fs.readFileSync(resolved, 'utf8')
    : null;
  if (current === content) return false;
  if (!dryRun) {
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, content, 'utf8');
  }
  return true;
}

function hasExistingMarkdown(
  markdownPath: string | undefined,
  docsDir?: string,
): boolean {
  const normalized = String(markdownPath || '').trim();
  if (!normalized) return false;
  if (path.isAbsolute(normalized)) {
    return fs.existsSync(path.resolve(normalized));
  }

  const docsBase = String(docsDir || '').trim();
  const candidates = [
    docsBase ? path.resolve(docsBase, normalized) : '',
    path.resolve(PROJECT_ROOT, normalized),
  ].filter(Boolean);

  return candidates.some((candidate) => fs.existsSync(candidate));
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
  databaseUrl: string;
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

function buildReport(
  components: ComponentSummary[],
  databaseUrl: string,
  maxFilterItems: number,
): RegistryReport {
  const byStatus: Record<string, number> = {};
  const byStage: Record<string, number> = {};

  for (const component of components) {
    byStatus[component.status] = (byStatus[component.status] || 0) + 1;
    const stage =
      component.inFigma &&
      component.hasSpec &&
      component.hasDoc &&
      component.hasVisualProof
        ? 'visual-proof'
        : component.inFigma && component.hasSpec && component.hasDoc
          ? 'markdown'
          : component.inFigma && component.hasSpec
            ? 'spec'
            : 'missing-spec';
    byStage[stage] = (byStage[stage] || 0) + 1;
  }

  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    databaseUrl: databaseUrl,
    totalComponents: components.length,
    byStatus,
    byStage,
    quickFilters: {
      needsReview: components
        .filter((c) => c.needsReview)
        .slice(0, maxFilterItems)
        .map((c) => c.slug),
      draft: components
        .filter((c) => c.status === 'draft')
        .slice(0, maxFilterItems)
        .map((c) => c.slug),
      ready: components
        .filter((c) => c.status === 'ready')
        .slice(0, maxFilterItems)
        .map((c) => c.slug),
      inFigmaOnly: components
        .filter((c) => c.inFigma && !c.hasSpec && !c.hasDoc)
        .slice(0, maxFilterItems)
        .map((c) => c.slug),
    },
    components: components.sort((a, b) =>
      a.slug.localeCompare(b.slug, 'en', { sensitivity: 'base' }),
    ),
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

  lines.push('\n## All Components\n');
  lines.push(
    '| Slug | Status | In Figma | Has Spec | Has Doc | Visual Proof |',
  );
  lines.push(
    '|------|--------|----------|----------|---------|--------------|',
  );
  for (const component of report.components) {
    lines.push(
      `| ${component.slug} | ${component.status} | ${component.inFigma ? 'yes' : 'no'} | ${component.hasSpec ? 'yes' : 'no'} | ${component.hasDoc ? 'yes' : 'no'} | ${component.hasVisualProof ? 'yes' : 'no'} |`,
    );
  }

  return `${lines.join('\n')}\n`;
}

export async function runRegistryReport(args: string[] = []): Promise<void> {
  const parsed = parseArgs(args);

  if (parsed.help) {
    printUsage(CLI_CONFIG);
    process.exit(0);
  }

  const ctx = resolveRunnerSystemContextOrExit({ parsedArgs: parsed, logger });
  const databaseUrl = resolveDashboardDbUrl(process.env);
  const defaultOutMd = path.join(
    ctx.docsDir,
    '_generated',
    'components-index.md',
  );
  const defaultOutJson = path.join(
    ctx.docsDir,
    '_generated',
    'components-health.json',
  );
  const outMdArg = getStringArg(parsed, 'out-md');
  const outJsonArg = getStringArg(parsed, 'out-json');
  const outMd = path.resolve(String(outMdArg || defaultOutMd));
  const outJson = path.resolve(String(outJsonArg || defaultOutJson));
  const format = String(getStringArg(parsed, 'format') || 'json');
  const maxFilterItems = parseIntegerOption(
    String(parsed['max-filter-items']),
    '--max-filter-items',
    20,
    1,
  );
  const skipMd = parseBooleanOption(parsed['no-md'], '--no-md', false);
  const skipJson = parseBooleanOption(parsed['no-json'], '--no-json', false);
  const dryRun = parseBooleanOption(parsed['dry-run'], '--dry-run', false);

  if (!outMdArg || !outJsonArg) {
    logger.info(
      `Using system-scoped defaults for registry report outputs (system=${ctx.id}). ` +
        `Set --out-md/--out-json to override explicitly.`,
    );
  }

  const db = await bootstrapDatabase(databaseUrl);
  let report: RegistryReport;
  try {
    const repo = new ComponentRepository(db);
    const rows = await repo.getAll(ctx.id);
    const components: ComponentSummary[] = rows.map((row) => {
      const spec = row.specs?.[0];
      const proof = row.visualProofs?.[0];
      return {
        slug: row.slug,
        name: row.name || row.slug,
        status: row.status || 'draft',
        inFigma: Boolean(row.figmaComponentSetNodeId),
        hasSpec: Boolean(spec?.markdownPath),
        hasDoc: hasExistingMarkdown(spec?.markdownPath, ctx.docsDir),
        hasVisualProof: Boolean(proof?.imagePath || proof?.screenshotUrl),
        needsReview: spec?.docStatus === 'needs-review',
      };
    });
    report = buildReport(components, databaseUrl, maxFilterItems);
  } finally {
    await db.end();
  }

  if (format === 'json') {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`\n=== Component Registry Report ===\n`);
    console.log(`Total: ${report.totalComponents} components`);
    console.log(`By Status: ${JSON.stringify(report.byStatus)}`);
    console.log(`By Stage: ${JSON.stringify(report.byStage)}`);
  }

  if (!skipMd) {
    const markdown = generateMarkdown(report);
    const wrote = writeTextIfChanged(outMd, markdown, dryRun);
    if (wrote && !dryRun) {
      logger.info(`Markdown report written to ${outMd}`);
    }
  }

  if (!skipJson) {
    const json = `${JSON.stringify(report, null, 2)}\n`;
    const wrote = writeTextIfChanged(outJson, json, dryRun);
    if (wrote && !dryRun) {
      logger.info(`JSON report written to ${outJson}`);
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runRegistryReport(process.argv.slice(2)).catch((error) => {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Registry report runner failed: ${errorMessage}`);
    process.exit(1);
  });
}
