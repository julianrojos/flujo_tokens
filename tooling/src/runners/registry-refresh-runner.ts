#!/usr/bin/env node

/**
 * Registry Refresh Runner
 *
 * Refresh component metadata in DB and sync components overview markdown.
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import { getStringArg, parseArgs, printUsage } from '../utils/parse-args.js';
import { logger } from '../utils/logger.js';
import { resolveRunnerSystemContextOrExit } from '../utils/runner-system-context.js';
import { syncDocumentationState } from '../services/component-registry-index.js';

const CLI_CONFIG = {
  command: 'ds:registry:refresh [options]',
  description:
    'Sync component metadata from specs/docs into DB and refresh components overview markdown.',
  options: [
    {
      name: '--overview',
      description: 'Component overview markdown path (resolves from system context if not provided).',
    },
    {
      name: '--spec-root',
      description: 'Component spec directory (resolves from system context if not provided).',
    },
    {
      name: '--docs-root',
      description: 'Component docs directory (resolves from system context if not provided).',
    },
    {
      name: '--dry-run',
      description: 'Compute and report changes without writing files.',
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
  const normalized = String(rawValue ?? fallback).trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  throw new Error(
    `Invalid ${optionName} value: ${rawValue}. Allowed: true, false.`,
  );
}

function assertExistingDirectory(options: {
  dirPath: string;
  label: string;
  systemId: string;
  cliFlag: string;
}): void {
  const { dirPath, label, systemId, cliFlag } = options;
  if (!fs.existsSync(dirPath)) {
    throw new Error(
      `Missing ${label} directory for system "${systemId}": ${dirPath}. ` +
      `Pass --${cliFlag} <path> or fix the system docs configuration.`,
    );
  }
  const stats = fs.statSync(dirPath);
  if (!stats.isDirectory()) {
    throw new Error(
      `Invalid ${label} path for system "${systemId}" (expected directory): ${dirPath}.`,
    );
  }
}

export async function runRegistryRefresh(args: string[] = []): Promise<void> {
  const parsed = parseArgs(args);

  if (parsed.help) {
    printUsage(CLI_CONFIG);
    process.exit(0);
  }

  const dryRun = parseBooleanOption(parsed['dry-run'], '--dry-run', false);
  const ctx = resolveRunnerSystemContextOrExit({ parsedArgs: parsed, logger });
  const resolvedOverviewPath = path.resolve(
    String(getStringArg(parsed, 'overview') || path.join(ctx.paths.docs, 'overview.md')),
  );
  const resolvedSpecsDir = path.resolve(String(getStringArg(parsed, 'spec-root') || ctx.paths.specs));
  const resolvedDocsDir = path.resolve(String(getStringArg(parsed, 'docs-root') || ctx.paths.docs));
  const resolvedProofsDir = path.resolve(path.join(ctx.paths.generated, 'visual-proofs'));

  assertExistingDirectory({
    dirPath: resolvedDocsDir,
    label: 'docs root',
    systemId: ctx.id,
    cliFlag: 'docs-root',
  });
  assertExistingDirectory({
    dirPath: resolvedSpecsDir,
    label: 'spec root',
    systemId: ctx.id,
    cliFlag: 'spec-root',
  });

  try {
    const report = syncDocumentationState({
      dbPath: path.resolve(String(ctx.paths.registry)),
      overviewPath: resolvedOverviewPath,
      specsDir: resolvedSpecsDir,
      docsDir: resolvedDocsDir,
      proofsDir: resolvedProofsDir,
      dryRun,
      systemId: ctx.id,
    });

    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Registry refresh failed: ${errorMessage}`);
    process.exit(1);
  }
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  runRegistryRefresh(process.argv.slice(2)).catch((error) => {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Registry refresh runner failed: ${errorMessage}`);
    process.exit(1);
  });
}
