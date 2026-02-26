#!/usr/bin/env node

/**
 * Registry Sync Runner
 *
 * I/O operations and CLI entry point for component registry sync.
 */

import * as path from 'node:path';

import { parseArgs, printUsage } from '../utils/parse-args.js';
import { resolveSystemContextSafe, PROJECT_ROOT } from '../utils/system-context.js';
import { logger } from '../utils/logger.js';

// Import from existing lib during migration period
import { syncComponentRegistry } from '../services/component-registry-index.js';

const CLI_CONFIG = {
  command: 'ds:registry:sync [options]',
  description:
    'Build and sync docs/_generated/component-registry.json from specs/docs/render/proof artifacts.',
  options: [
    {
      name: '--registry',
      description: 'Output path for the generated component registry JSON.',
      defaultValue: 'docs/_generated/component-registry.json',
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

export async function runRegistrySync(args: string[] = []): Promise<void> {
  const parsed = parseArgs(args);

  if (parsed.help) {
    printUsage(CLI_CONFIG);
    process.exit(0);
  }

  const dryRun = parseBooleanOption(String(parsed['dry-run']), '--dry-run', false);
  const ctx = resolveSystemContextSafe({ system: parsed.system });

  try {
    const report = syncComponentRegistry({
      registryPath: path.resolve(String(parsed.registry || ctx.paths.registry)),
      specsDir: path.resolve(String(parsed['spec-root'] || ctx.paths.specs)),
      docsDir: path.resolve(String(parsed['docs-root'] || ctx.paths.docs)),
      renderDir: path.resolve(String(parsed['render-dir'] || path.join(ctx.paths.generated, 'figma_doc_models'))),
      proofsDir: path.resolve(String(parsed['proof-dir'] || path.join(ctx.paths.generated, 'visual-proofs'))),
      dryRun,
    });

    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    logger.error('Registry sync failed:', error);
    process.exit(1);
  }
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  runRegistrySync(process.argv.slice(2)).catch((error) => {
    logger.error('Registry sync runner failed:', error);
    process.exit(1);
  });
}
