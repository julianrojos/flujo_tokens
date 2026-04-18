#!/usr/bin/env node

/**
 * Validate Docs Runner
 *
 * Validates component documentation and specs against project rules.
 */

import * as path from 'node:path';

import { getStringArg, parseArgs, printUsage } from '../utils/parse-args.js';
import { logger } from '../utils/logger.js';
import { resolveRunnerSystemContextOrExit } from '../utils/runner-system-context.js';

// Import from existing lib during migration
import { validateDocs } from '../services/docs-validator.js';
import type {
  DocsValidationReport,
  DocsValidatorIssue,
} from '../services/docs-validator-types.js';

const TOKEN_REGISTRY_CHECK = 'token-registry';
const TOKEN_SOURCE_CODES = new Set(['TOK01', 'TOK02', 'TOK03', 'SPEC01']);

type ValidationFinding = Pick<
  DocsValidatorIssue,
  'code' | 'message' | 'suggested' | 'token' | 'file' | 'line' | 'rule_ids'
> & {
  source_code?: string;
};

type TokenRegistryReport = Omit<DocsValidationReport, 'errors' | 'warnings'> & {
  ok: boolean;
  summary: DocsValidationReport['summary'] & {
    errors: number;
    warnings: number;
  };
  errors: ValidationFinding[];
  warnings: ValidationFinding[];
};

const CLI_CONFIG = {
  command: 'validate:docs [options]',
  description: 'Validates component documentation and specs against project rules.',
  options: [
    {
      name: '--docs-root',
      description: 'Component docs root directory (resolves from system context if not provided).',
    },
    {
      name: '--registry',
      description: 'Token registry JSON path.',
      defaultValue: '<active-system-docs>/_generated/token-registry.json',
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
      name: '--system <id>',
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

function mapTokenRegistryCode(finding: ValidationFinding): string {
  const message = String(finding.message || '').toLowerCase();
  if (message.includes('deprecated')) return 'TOKEN_DEPRECATED';
  if (message.includes('ambiguous') || message.includes('collision')) return 'TOKEN_AMBIGUOUS';
  return 'TOKEN_MISSING';
}

function projectTokenRegistryReport(report: DocsValidationReport): TokenRegistryReport {
  const mapFinding = (finding: DocsValidatorIssue): ValidationFinding => {
    const sourceCode = String(finding.code || '');
    const mappedCode = mapTokenRegistryCode(finding);
    return {
      ...finding,
      code: mappedCode,
      source_code: sourceCode,
    };
  };

  const errors = report.errors
    .filter((finding) => TOKEN_SOURCE_CODES.has(String(finding.code || '')))
    .map(mapFinding);
  const warnings = report.warnings
    .filter((finding) => TOKEN_SOURCE_CODES.has(String(finding.code || '')))
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

  const ctx = resolveRunnerSystemContextOrExit({ parsedArgs: parsed, logger });

  const docsRoot = String(getStringArg(parsed, 'docs-root') || ctx.paths.docs);
  const registryPath = String(getStringArg(parsed, 'registry') || ctx.paths.tokenRegistry);
  const fileArg = getStringArg(parsed, 'file');
  const specFileArg = getStringArg(parsed, 'spec-file');
  const filePath = fileArg ? path.resolve(fileArg) : null;
  const specFilePath = specFileArg ? path.resolve(specFileArg) : null;
  const strict = parseBooleanOption(getStringArg(parsed, 'strict'), false);
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
    filePath: filePath ?? undefined,
    specFilePath: specFilePath ?? undefined,
    allowExtraH2,
    checkOverview: !noOverview,
    checkSpecs: !noSpecs,
  });

  const report =
    check === TOKEN_REGISTRY_CHECK
      ? projectTokenRegistryReport(baseReport)
      : baseReport;

  console.log(JSON.stringify(report, null, 2));

  const shouldFail = !report.ok || (strict && report.summary.warnings > 0);
  if (shouldFail) {
    const errorMessages = report.errors.slice(0, 5).join('; ');
    logger.error(`Validation failed: ${errorMessages}`);
    process.exit(1);
  }
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  runValidateDocs(process.argv.slice(2)).catch((error) => {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Validate docs runner failed: ${errorMessage}`);
    process.exit(1);
  });
}
