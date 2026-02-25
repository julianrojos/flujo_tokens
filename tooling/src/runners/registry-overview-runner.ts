#!/usr/bin/env node

/**
 * Registry Overview Runner
 *
 * Regenerates docs/components/overview.md from component registry.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { parseArgs, printUsage } from '../utils/parse-args.js';
import { logger } from '../utils/logger.js';

// Import from existing lib during migration period
import {
  DEFAULT_COMPONENT_OVERVIEW_PATH,
  DEFAULT_COMPONENT_REGISTRY_PATH,
  syncComponentOverview,
} from '../../scripts/lib/component-registry/index.mjs';

const CLI_CONFIG = {
  command: 'ds:registry:overview [options]',
  description:
    'Regenerate docs/components/overview.md component list from the component registry.',
  options: [
    {
      name: '--registry',
      description: 'Component registry path.',
      defaultValue: 'docs/_generated/component-registry.json',
    },
    {
      name: '--overview',
      description: 'Overview markdown path.',
      defaultValue: 'docs/components/overview.md',
    },
    {
      name: '--dry-run',
      description: 'Report pending changes without writing files.',
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

export async function runRegistryOverview(args: string[] = []): Promise<void> {
  const parsed = parseArgs(args);

  if (parsed.help) {
    printUsage(CLI_CONFIG);
    process.exit(0);
  }

  const dryRun = parseBooleanOption(String(parsed['dry-run']), '--dry-run', false);
  const registryPath = path.resolve(String(parsed.registry || DEFAULT_COMPONENT_REGISTRY_PATH));
  const overviewPath = path.resolve(String(parsed.overview || DEFAULT_COMPONENT_OVERVIEW_PATH));

  if (!fs.existsSync(overviewPath)) {
    console.error(`Overview file not found: ${overviewPath}`);
    process.exit(1);
  }

  try {
    const report = syncComponentOverview({
      registryPath,
      overviewPath,
      dryRun,
    });
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    logger.error('Registry overview failed:', error);
    process.exit(1);
  }
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  runRegistryOverview(process.argv.slice(2)).catch((error) => {
    logger.error('Registry overview runner failed:', error);
    process.exit(1);
  });
}
