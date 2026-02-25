#!/usr/bin/env node

/**
 * Migrate Markdown Zones Runner
 *
 * Wraps component markdown sections with auto-generated boundary tags.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { parseArgs, printUsage, isMain } from '../utils/index.js';
import { logger } from '../utils/logger.js';

/**
 * Zone configuration for migration.
 */
export interface MigrationZone {
  name: string;
  pattern: RegExp;
  searchString: string;
}

/**
 * Zones affected by the migration.
 */
export const MIGRATION_ZONES: MigrationZone[] = [
  {
    name: 'ANATOMY',
    pattern: /(?<before>##\s+Anatomy\s*\n)(?<body>[\s\S]*?)(?=\n## |\n*$)/,
    searchString: '## Anatomy',
  },
  {
    name: 'PROPERTIES',
    pattern:
      /(?<before>###\s+Properties\s*\n)(?<body>[\s\S]*?)(?=\n### |\n## |\n*$)/,
    searchString: '### Properties',
  },
  {
    name: 'VISUALS',
    pattern:
      /(?<before>###\s+Per-variant attributes[\s\S]*?###\s+Layout and spacing\s*\n\s*)(?<body>[\s\S]*?)(?=\n### |\n## |\n*$)/,
    searchString: '### Layout and spacing',
  },
  {
    name: 'VARIANTS',
    pattern: /(?<before>##\s+Variants\s*\n)(?<body>[\s\S]*?)(?=\n## |\n*$)/,
    searchString: '## Variants',
  },
];

const CLI_CONFIG = {
  command: 'ds:migrate-markdown-zones [options]',
  description:
    'Wraps component markdown sections with auto-generated boundary tags.',
  options: [
    {
      name: '--docs-dir',
      description: 'Component docs directory.',
      defaultValue: 'docs/components',
    },
    {
      name: '--dry-run',
      description: 'Preview changes without writing files.',
      defaultValue: 'false',
    },
    {
      name: '--format',
      description: 'Output format (text|json).',
      defaultValue: 'text',
    },
    {
      name: '--help',
      description: 'Show this help message.',
    },
  ],
};

function parseBooleanOption(rawValue: unknown, fallback: boolean): boolean {
  const normalized = String(rawValue ?? fallback)
    .trim()
    .toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return fallback;
}

function wrapSection(
  content: string,
  pattern: RegExp,
  zoneName: string,
  searchString?: string,
): { content: string; migrated: boolean } {
  const startTag = `<!-- AUTO-GENERATED-${zoneName}:START -->`;
  const endTag = `<!-- AUTO-GENERATED-${zoneName}:END -->`;

  if (content.includes(`${zoneName}:START`)) {
    return { content, migrated: false }; // Already wrapped
  }

  if (searchString && !content.includes(searchString)) {
    return { content, migrated: false }; // Zone not found
  }

  let migrated = false;
  const nextContent = content.replace(pattern, (match, ...args) => {
    // Last args before match are named groups if present
    const groups = args[args.length - 1] as Record<string, unknown> | undefined;

    // Validate named groups exist and are strings (defensive programming)
    if (
      !groups ||
      !('before' in groups) ||
      !('body' in groups) ||
      typeof groups.before !== 'string' ||
      typeof groups.body !== 'string'
    ) {
      migrated = false;
      return match; // Return original if groups are invalid
    }

    const before = groups.before;
    const body = groups.body;
    migrated = true;
    return `${before}${startTag}\n${body}\n${endTag}`;
  });

  return { content: nextContent, migrated };
}

export interface MigrationResult {
  file: string;
  status: 'migrated' | 'skipped' | 'unchanged';
  zones?: string[];
}

export interface MigrationReport {
  ok: boolean;
  results: MigrationResult[];
  summary: {
    totalFiles: number;
    migrated: number;
    skipped: number;
  };
}

/**
 * Validate that all zone patterns have required named groups.
 */
function validateMigrationZones(): void {
  const requiredGroups = ['before', 'body'];

  for (const zone of MIGRATION_ZONES) {
    const groups = zone.pattern.namedGroups;
    if (!groups) {
      logger.error(
        `Zone "${zone.name}" pattern has no named groups. Required: ${requiredGroups.join(', ')}`,
      );
      process.exit(1);
    }

    for (const group of requiredGroups) {
      if (!(group in groups)) {
        logger.error(
          `Zone "${zone.name}" pattern missing required group "${group}". Required: ${requiredGroups.join(', ')}`,
        );
        process.exit(1);
      }
    }
  }
}

export async function runMigrateMarkdownZones(
  args: string[] = [],
): Promise<void> {
  const parsed = parseArgs(args);

  if (parsed.help) {
    printUsage(CLI_CONFIG);
    process.exit(0);
  }

  // Validate zone patterns before processing
  validateMigrationZones();

  const format = String(parsed.format || 'text').toLowerCase();
  const mdDir = path.resolve(
    typeof parsed['docs-dir'] === 'string'
      ? parsed['docs-dir']
      : 'docs/components',
  );
  const dryRun = parseBooleanOption(parsed['dry-run'], false);

  let files: string[];
  try {
    files = await fs.readdir(mdDir);
  } catch (error) {
    logger.error(`Docs directory not found: ${mdDir}`);
    process.exit(1);
    return;
  }

  const mdFiles = files.filter((f) => f.endsWith('.md') && !f.startsWith('_'));
  const results: MigrationResult[] = [];
  let migratedCount = 0;

  for (const file of mdFiles) {
    const fullPath = path.join(mdDir, file);
    let original: string;
    try {
      original = await fs.readFile(fullPath, 'utf-8');
    } catch {
      results.push({ file, status: 'skipped' });
      continue;
    }

    let content = original;
    const migrationZones: string[] = [];

    for (const zone of MIGRATION_ZONES) {
      const result = wrapSection(
        content,
        zone.pattern,
        zone.name,
        zone.searchString,
      );
      if (result.migrated) {
        content = result.content;
        migrationZones.push(zone.name);
      }
    }

    if (content !== original) {
      if (!dryRun) {
        await fs.writeFile(fullPath, content, 'utf-8');
      }
      results.push({
        file,
        status: 'migrated',
        zones: migrationZones,
      });
      migratedCount++;
      if (format === 'text') {
        logger.info(
          `[${dryRun ? 'DRY-RUN' : 'MIGRATED'}] ${file} (${migrationZones.join(', ')})`,
        );
      }
    } else {
      results.push({ file, status: 'unchanged' });
    }
  }

  if (format === 'json') {
    const report: MigrationReport = {
      ok: true,
      results,
      summary: {
        totalFiles: mdFiles.length,
        migrated: migratedCount,
        skipped: results.filter((r) => r.status === 'skipped').length,
      },
    };
    logger.info(JSON.stringify(report, null, 2));
  } else {
    logger.info(
      `\nMigration complete. ${dryRun ? 'Would wrap' : 'Wrapped'} ${migratedCount} files with boundary tags.`,
    );
  }
}

// CLI entry point
if (isMain(import.meta.url)) {
  runMigrateMarkdownZones(process.argv.slice(2)).catch((error) => {
    logger.error(
      `Migrate markdown zones runner failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  });
}
