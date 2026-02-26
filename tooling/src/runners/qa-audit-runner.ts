/**
 * QA Audit Runner
 * 
 * CLI runner for design system QA audit.
 * Runs comprehensive audits on coverage, freshness, completeness, and integrity.
 */

import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../../..');

import { logger } from '../utils/logger.js';
import { runQaAudit, formatAuditReport } from '../services/qa-audit.js';
import type { QaAuditOptions } from '../types/qa-audit.js';

/**
 * Check if script is run directly (not imported).
 */
function isMain(importMetaUrl: string): boolean {
  return process.argv[1]?.endsWith(path.basename(fileURLToPath(importMetaUrl)));
}

/**
 * Parse command line arguments.
 */
function parseArgs(args: string[]): QaAuditOptions {
  const options: QaAuditOptions = {
    projectRoot: PROJECT_ROOT,
    outputReport: false,
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    switch (arg) {
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;

      case '--output-report':
        options.outputReport = true;
        break;

      case '--stale-threshold':
        if (i + 1 < args.length) {
          const value = parseInt(args[i + 1], 10);
          if (Number.isInteger(value) && value > 0) {
            options.staleThresholdDays = value;
          } else {
            logger.error(`--stale-threshold requires a positive integer, got: ${args[i + 1]}`);
            process.exit(1);
          }
          i++;
        } else {
          logger.error('--stale-threshold requires a value');
          process.exit(1);
        }
        break;

      default:
        if (arg.startsWith('-')) {
          logger.error(`Unknown option: ${arg}`);
          logger.error('Use --help for usage information');
          process.exit(1);
        }
    }

    i++;
  }

  return options;
}

/**
 * Print help message.
 */
function printHelp(): void {
  console.log(`
Design System QA Audit

Usage:
  npx tsx qa-audit-runner.ts [options]

Options:
  --help, -h              Show this help message
  --output-report         Write JSON report to docs/_generated/qa-report.json
  --stale-threshold <N>   Days threshold for stale file detection (default: 30)

Audit Categories:
  COVERAGE    Spec YAMLs vs. markdown files, overview links, token paths
  FRESHNESS   Draft specs, needs-review status, last_verified dates
  COMPLETENESS TBD fields in specs, gaps sections in markdown
  INTEGRITY   Missing token refs, broken overview links

Examples:
  # Run audit with console output
  npx tsx qa-audit-runner.ts

  # Run audit and generate JSON report
  npx tsx qa-audit-runner.ts --output-report

  # Run audit with custom stale threshold (60 days)
  npx tsx qa-audit-runner.ts --stale-threshold 60

Exit Codes:
  0 - No errors found
  1 - Errors found or execution failure
`);
}

/**
 * Main entry point.
 */
export async function runQaAuditRunner(args: string[] = []): Promise<void> {
  const options = parseArgs(args);

  try {
    const result = runQaAudit(options);

    // Print formatted report
    const report = formatAuditReport(result);
    console.log(report);

    // Exit with error code if there are errors
    if (result.summary.errors > 0) {
      logger.error(`QA audit found ${result.summary.errors} error(s)`);
      process.exitCode = 1;
    } else {
      logger.info('QA audit completed successfully');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`QA audit failed: ${message}`);
    process.exitCode = 1;
  }
}

// Run if executed directly
if (isMain(import.meta.url)) {
  runQaAuditRunner(process.argv.slice(2));
}
