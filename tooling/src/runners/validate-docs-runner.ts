#!/usr/bin/env node

/**
 * Validate Docs Runner
 *
 * Validates component documentation and specs against project rules.
 */

import * as path from 'node:path';

import { parseArgs, printUsage } from '../utils/parse-args.js';
import { resolveSystemContextSafe } from '../utils/system-context.js';
import { logger } from '../utils/logger.js';

// Import from existing lib during migration
import { validateDocs } from '../utils/docs-validator.js';

const TOKEN_REGISTRY_CHECK = 'token-registry';
const TOKEN_SOURCE_CODES = new Set(['TOK01', 'TOK02', 'TOK03', 'SPEC01']);

const CLI_CONFIG = {
  command: 'validate:docs [options]',
  description: 'Validates component documentation and specs against project rules.',
  options: [
    {
      name: '--docs-root',
      description: 'Component docs root directory.',
      defaultValue: 'docs/components',
    },
    {
      name: '--registry',
      description: 'Token registry JSON path.',
      defaultValue: 'docs/_generated/token-registry.json',
    },
    {
      name: '--file',
      description: 'Single component markdown file to validate.',
    },
    {
      name: '--spec-file',
      description: 'Single spec YAML file to validate.',
    },
    {
      name: '--strict',
      description: 'Fail on warnings.',
      defaultValue: 'false',
    },
    {
      name: '--no-overview',
      description: 'Skip overview.md validation.',
      defaultValue: 'false',
    },
    {
      name: '--no-specs',
      description: 'Skip spec YAML validation.',
      defaultValue: 'false',
    },
    {
      name: '--allow-extra-h2',
      description: 'Allow extra H2 headings in component docs.',
      defaultValue: 'false',
    },
    {
      name: '--check',
      description: 'Focused validation check (e.g., token-registry).',
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

function parseBooleanOption(rawValue: unknown, fallback: boolean): boolean {
  const normalized = String(rawValue ?? fallback).trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  throw new Error(`Invalid boolean value: ${rawValue}`);
}

function mapTokenRegistryCode(finding: any): string {
  const message = String(finding?.message || '').toLowerCase();
  if (message.includes('deprecated')) return 'TOKEN_DEPRECATED';
  if (message.includes('ambiguous') || message.includes('collision')) return 'TOKEN_AMBIGUOUS';
  return 'TOKEN_MISSING';
}

function projectTokenRegistryReport(report: any): any {
  const mapFinding = (finding: any) => {
    const sourceCode = String(finding?.code || '');
    const mappedCode = mapTokenRegistryCode(finding);
    return {
      ...finding,
      code: mappedCode,
      source_code: sourceCode,
    };
  };

  const errors = report.errors
    .filter((finding: any) => TOKEN_SOURCE_CODES.has(String(finding?.code || '')))
    .map(mapFinding);
  const warnings = report.warnings
    .filter((finding: any) => TOKEN_SOURCE_CODES.has(String(finding?.code || '')))
    .map(mapFinding);

  return {
    ...report,
    ok: errors.length === 0,
    summary: {
      ...report.summary,
      errors: errors.length,
      warnings: warnings.length,
    },
    errors,
    warnings,
  };
}

export async function runValidateDocs(args: string[] = []): Promise<void> {
  const parsed = parseArgs(args);

  if (parsed.help) {
    printUsage(CLI_CONFIG);
    process.exit(0);
  }

  const ctx = resolveSystemContextSafe({ system: parsed.system });

  const docsRoot = String(parsed['docs-root'] || ctx.paths.docs);
  const registryPath = String(parsed.registry || ctx.paths.tokenRegistry);
  const filePath = parsed.file ? path.resolve(String(parsed.file)) : null;
  const specFilePath = parsed['spec-file'] ? path.resolve(String(parsed['spec-file'])) : null;
  const strict = parseBooleanOption(parsed.strict, false);
  const noOverview = parseBooleanOption(parsed['no-overview'], false);
  const noSpecs = parseBooleanOption(parsed['no-specs'], false);
  const allowExtraH2 = parseBooleanOption(parsed['allow-extra-h2'], false);
  const check = String(parsed.check || '').trim().toLowerCase();

  if (check && check !== TOKEN_REGISTRY_CHECK) {
    console.error(`Unsupported --check value: ${check}. Supported values: ${TOKEN_REGISTRY_CHECK}`);
    process.exit(1);
  }

  const baseReport = validateDocs({
    docsRoot,
    registryPath,
    filePath,
    specFilePath,
    allowExtraH2,
    checkOverview: !noOverview,
    checkSpecs: !noSpecs,
  });

  const report = check === TOKEN_REGISTRY_CHECK ? projectTokenRegistryReport(baseReport) : baseReport;

  console.log(JSON.stringify(report, null, 2));

  const shouldFail = !report.ok || (strict && report.summary.warnings > 0);
  if (shouldFail) {
    logger.error('Validation failed:', report.errors.slice(0, 5));
    process.exit(1);
  }
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  runValidateDocs(process.argv.slice(2)).catch((error) => {
    logger.error('Validate docs runner failed:', error);
    process.exit(1);
  });
}
