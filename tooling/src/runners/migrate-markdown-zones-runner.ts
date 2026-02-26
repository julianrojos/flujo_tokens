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
 * Each zone is self-contained with its own test case for validation.
 */
export interface MigrationZone {
  name: string;
  pattern: RegExp;
  searchString: string;
  /**
   * Minimal test content that should match this zone's pattern.
   * Used for validation at module load time.
   */
  testCase: string;
}

/**
 * Factory function to create a validated migration zone.
 * Ensures each zone has a valid pattern and test case.
 */
function createMigrationZone(zone: MigrationZone): MigrationZone {
  // Validate pattern doesn't use global flag (would break exec() reuse)
  if (zone.pattern.global) {
    throw new Error(
      `Zone "${zone.name}" pattern cannot use global flag (/g). ` +
        `The exec() method is called once per zone and should not maintain state.`,
    );
  }

  // Validate pattern matches its own test case
  const match = zone.pattern.exec(zone.testCase);
  const groups = match?.groups;

  if (!groups) {
    throw new Error(
      `Zone "${zone.name}" pattern does not match its test case. ` +
        `Ensure the pattern has named groups 'before' and 'body'.`,
    );
  }

  if (!('before' in groups) || !('body' in groups)) {
    throw new Error(
      `Zone "${zone.name}" pattern missing required named groups. ` +
        `Required: 'before' and 'body'. Found: ${Object.keys(groups).join(', ')}`,
    );
  }

  return zone;
}

/**
 * Zones affected by the migration.
 * Each zone includes its own test case for self-validation.
 */
export const MIGRATION_ZONES: MigrationZone[] = [
  {
    name: 'ANATOMY',
    pattern: /(?<before>##\s+Anatomy\s*\n)(?<body>[\s\S]*?)(?=\n## |\n*$)/,
    searchString: '## Anatomy',
    testCase: [
      '## Anatomy',
      '',
      'Test anatomy content here',
      '',
      '## Next section',
    ].join('\n'),
  },
  {
    name: 'PROPERTIES',
    pattern:
      /(?<before>###\s+Properties\s*\n)(?<body>[\s\S]*?)(?=\n### |\n## |\n*$)/,
    searchString: '### Properties',
    testCase: [
      '### Properties',
      '',
      'Test properties content here',
      '',
      '### Next subsection',
    ].join('\n'),
  },
  {
    name: 'VISUALS',
    pattern:
      /(?<before>###\s+Per-variant attributes[\s\S]*?###\s+Layout and spacing\s*\n\s*)(?<body>[\s\S]*?)(?=\n### |\n## |\n*$)/,
    searchString: '### Layout and spacing',
    testCase: [
      '### Per-variant attributes',
      '',
      'Some variant attributes',
      '',
      '### Layout and spacing',
      '',
      'Test layout content here',
      '',
      '### Next subsection',
    ].join('\n'),
  },
  {
    name: 'VARIANTS',
    pattern: /(?<before>##\s+Variants\s*\n)(?<body>[\s\S]*?)(?=\n## |\n*$)/,
    searchString: '## Variants',
    testCase: [
      '## Variants',
      '',
      'Test variants content here',
      '',
      '## Next section',
    ].join('\n'),
  },
];

/**
 * Validate and initialize zones at module load time.
 * Returns validated zones or throws error immediately.
 */
function validateAndInitializeZones(): MigrationZone[] {
  // Each zone is already validated by createMigrationZone factory
  // This function ensures all zones pass validation before use
  return MIGRATION_ZONES.map(createMigrationZone);
}

/**
 * Validated zones (checked at module load time).
 * 
 * IMPORTANT: If a zone pattern is invalid, this initialization will throw
 * an error BEFORE the script starts executing. This is intentional fail-fast
 * behavior - configuration errors are caught immediately rather than during
 * file processing.
 */
const VALIDATED_ZONES = validateAndInitializeZones();

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

  // Use exec() for robust named group access.
  // Note: pattern must NOT have /g flag (validated at module load time).
  // exec() without /g resets lastIndex automatically on each call.
  const match = pattern.exec(content);
  const groups = match?.groups;

  // Validate named groups exist and are strings (defensive programming)
  if (
    !groups ||
    !('before' in groups) ||
    !('body' in groups) ||
    typeof groups.before !== 'string' ||
    typeof groups.body !== 'string'
  ) {
    return { content, migrated: false }; // Return original if groups are invalid
  }

  const before = groups.before;
  const body = groups.body;
  const wrappedContent = `${before}${startTag}\n${body}\n${endTag}`;

  return { content: wrappedContent, migrated: true };
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

export async function runMigrateMarkdownZones(
  args: string[] = [],
): Promise<void> {
  const parsed = parseArgs(args);

  if (parsed.help) {
    printUsage(CLI_CONFIG);
    process.exit(0);
  }

  // Zones are already validated at module load time (VALIDATED_ZONES).
  // If a zone pattern is invalid, the script threw during initialization,
  // before this function was called.

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

    for (const zone of VALIDATED_ZONES) {
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
