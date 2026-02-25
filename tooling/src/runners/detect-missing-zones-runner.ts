#!/usr/bin/env node

/**
 * Detect Missing Zones Runner
 *
 * Scans component markdown files for missing auto-generated zone boundaries.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { parseArgs, printUsage } from '../utils/parse-args.js';
import { logger } from '../utils/logger.js';

export const ZONES = ['ANATOMY', 'PROPERTIES', 'VISUALS', 'VARIANTS'];

const CLI_CONFIG = {
  command: 'ds:detect-missing-zones [options]',
  description:
    'Scans component markdown files for missing auto-generated zone boundaries.',
  options: [
    {
      name: '--docs-dir',
      description: 'Component docs directory.',
      defaultValue: 'docs/components',
    },
    {
      name: '--help',
      description: 'Show this help message.',
    },
  ],
};

export async function runDetectMissingZones(
  args: string[] = [],
): Promise<void> {
  const parsed = parseArgs(args);

  if (parsed.help) {
    printUsage(CLI_CONFIG);
    process.exit(0);
  }

  const mdDir = path.resolve(
    typeof parsed['docs-dir'] === 'string'
      ? parsed['docs-dir']
      : 'docs/components',
  );

  try {
    const stat = await fs.stat(mdDir);
    if (!stat.isDirectory()) {
      throw new Error(`Not a directory: ${mdDir}`);
    }
  } catch (error) {
    logger.error(`Docs directory not found: ${mdDir}`);
    process.exit(1);
  }

  const files = await fs.readdir(mdDir);
  const mdFiles = files.filter((f) => f.endsWith('.md') && !f.startsWith('_'));

  let totalMissing = 0;
  const warnings: string[] = [];

  for (const file of mdFiles) {
    const fullPath = path.join(mdDir, file);
    const content = await fs.readFile(fullPath, 'utf-8');

    const missingZones = ZONES.filter(
      (zone) => !content.includes(`<!-- AUTO-GENERATED-${zone}:START -->`),
    );

    if (missingZones.length > 0) {
      warnings.push(
        `[WARN] ${file} is missing boundary tags: ${missingZones.join(', ')}`,
      );
      totalMissing++;
    }
  }

  // Output warnings
  for (const warning of warnings) {
    logger.warn(warning);
  }

  if (totalMissing > 0) {
    logger.info(
      `\nScan complete. Found ${totalMissing} components lacking strict zonal boundaries.`,
    );
  } else {
    logger.info(
      '\nScan complete. All components have strict zonal boundaries.',
    );
  }

  // Matching legacy behavior: do not exit 1 unless we add a --strict flag in the future
  // For now, we keep it as a reporter only.
}

// CLI entry point
if (import.meta.url === `file://${path.resolve(process.argv[1])}`) {
  runDetectMissingZones(process.argv.slice(2)).catch((error) => {
    logger.error(
      `Detect missing zones runner failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  });
}
