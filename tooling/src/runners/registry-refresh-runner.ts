#!/usr/bin/env node

/**
 * Registry Refresh Runner
 *
 * Atomically refresh component registry JSON and components overview markdown together.
 */

import * as path from 'node:path';

import { getStringArg, parseArgs, printUsage } from '../utils/parse-args.js';
import { resolveSystemContextSafe, PROJECT_ROOT } from '../utils/system-context.js';
import { logger } from '../utils/logger.js';

// Import from existing lib during migration period
import { syncDocumentationIndices } from '../services/component-registry-index.js';

const CLI_CONFIG = {
  command: 'ds:registry:refresh [options]',
  description:
    'Atomically refresh component registry JSON and components overview markdown together.',
  options: [
    {
      name: '--registry',
      description: 'Output path for the generated component registry JSON.',
      defaultValue: 'docs/_generated/component-registry.json',
    },
    {
      name: '--overview',
      description: 'Component overview markdown path.',
      defaultValue: 'docs/components/overview.md',
    },
    {
      name: '--spec-root',
      description: 'Component spec directory.',
      defaultValue: 'docs/_spec/components',
    },
    {
      name: '--docs-root',
      description: 'Component docs directory.',
      defaultValue: 'docs/components',
    },
    {
      name: '--render-dir',
      description: 'Directory for markdown->Figma render payload files.',
      defaultValue: 'docs/_generated/figma_doc_models',
    },
    {
      name: '--proof-dir',
      description: 'Directory for visual proof metadata files.',
      defaultValue: 'docs/_generated/visual-proofs',
    },
    {
      name: '--dry-run',
      description: 'Compute and report changes without writing files.',
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

export async function runRegistryRefresh(args: string[] = []): Promise<void> {
  const parsed = parseArgs(args);

  if (parsed.help) {
    printUsage(CLI_CONFIG);
    process.exit(0);
  }

  const dryRun = parseBooleanOption(parsed['dry-run'], '--dry-run', false);
  const ctx = resolveSystemContextSafe({ system: getStringArg(parsed, 'system') });

  try {
    const report = syncDocumentationIndices({
      registryPath: path.resolve(String(getStringArg(parsed, 'registry') || ctx.paths.registry)),
      overviewPath: path.resolve(String(getStringArg(parsed, 'overview') || path.join(ctx.paths.docs, 'overview.md'))),
      specsDir: path.resolve(String(getStringArg(parsed, 'spec-root') || ctx.paths.specs)),
      docsDir: path.resolve(String(getStringArg(parsed, 'docs-root') || ctx.paths.docs)),
      renderDir: path.resolve(String(getStringArg(parsed, 'render-dir') || path.join(ctx.paths.generated, 'figma_doc_models'))),
      proofsDir: path.resolve(String(getStringArg(parsed, 'proof-dir') || path.join(ctx.paths.generated, 'visual-proofs'))),
      dryRun,
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
