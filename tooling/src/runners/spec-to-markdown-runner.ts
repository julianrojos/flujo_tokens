#!/usr/bin/env node

/**
 * Spec to Markdown Runner
 *
 * Injects YAML component specifications into HTML boundaries within Markdown.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as yaml from 'js-yaml';

import { parseArgs, printUsage, isMain } from '../utils/index.js';
import { injectSpecZones, isSpecInput } from '../utils/index.js';
import { logger } from '../utils/logger.js';
import { resolveRunnerSystemContextOrExit } from '../utils/runner-system-context.js';

const CLI_CONFIG = {
  command: 'npm run ds:spec-to-markdown -- --slug alert',
  description:
    'Injects YAML component specifications into HTML boundaries within Markdown.',
  options: [
    {
      name: '--slug <name>',
      description: 'Component slug to sync.',
    },
    {
      name: '--spec-dir <path>',
      description:
        'Spec components directory (defaults to active system context).',
    },
    {
      name: '--md-dir <path>',
      description:
        'Markdown documentation directory (defaults to active system context).',
    },
    {
      name: '--check <true|false>',
      description: 'CI read-only mode (exits 1 if desynced)',
      defaultValue: 'false',
    },
    {
      name: '--dry-run <true|false>',
      description: 'Console report what would change without touching disk',
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

/**
 * Extract the number of meaningful table rows in a zone.
 * Counts pipe-delimited table rows, ignoring headers and empty lines.
 */
function extractZoneRowsLength(markdown: string, zoneName: string): number {
  const startTag = `<!-- AUTO-GENERATED-${zoneName}:START -->`;
  const endTag = `<!-- AUTO-GENERATED-${zoneName}:END -->`;
  const startIdx = markdown.indexOf(startTag);
  const endIdx = markdown.indexOf(endTag);

  if (startIdx === -1 || endIdx === -1) return 0;

  const inner = markdown.slice(startIdx + startTag.length, endIdx);
  const lines = inner.split('\n');

  // Count table rows (lines starting with | but not header separator |---|)
  let rowCount = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('|') && !trimmed.startsWith('|---')) {
      rowCount++;
    }
  }

  // If no table rows found, count non-empty content lines (fallback for non-table zones)
  if (rowCount === 0) {
    rowCount = lines.filter((line) => line.trim().length > 0).length;
  }

  return rowCount;
}

/**
 * Count total lines in markdown.
 */
function countLines(markdown: string): number {
  return markdown.split('\n').length;
}

/**
 * Zone change report.
 */
interface ZoneChangeReport {
  zone: string;
  oldRows: number;
  newRows: number;
}

/**
 * Main runner function.
 */
export async function runSpecToMarkdown(args: string[] = []): Promise<void> {
  const parsed = parseArgs(args);

  if (parsed.help) {
    printUsage(CLI_CONFIG);
    process.exit(0);
  }

  const slug = String(parsed.slug || '').trim();
  if (!slug) {
    logger.error('Missing --slug <name>');
    printUsage(CLI_CONFIG);
    process.exit(1);
  }

  const ctx = resolveRunnerSystemContextOrExit({ parsedArgs: parsed, logger });
  const specDir = path.resolve(
    typeof parsed['spec-dir'] === 'string' && parsed['spec-dir'].trim()
      ? parsed['spec-dir']
      : ctx.paths.specs,
  );
  const mdDir = path.resolve(
    typeof parsed['md-dir'] === 'string' && parsed['md-dir'].trim()
      ? parsed['md-dir']
      : ctx.paths.docs,
  );

  const isCheck = String(parsed.check || 'false') === 'true';
  const isDryRun = String(parsed['dry-run'] || 'false') === 'true';

  const ymlPath = path.join(specDir, `${slug}.yml`);
  const mdPath = path.join(mdDir, `${slug}.md`);

  let specContent: string;
  let mdContent: string;

  try {
    specContent = await fs.readFile(ymlPath, 'utf-8');
  } catch {
    logger.error(`YAML spec not found or unreadable: ${ymlPath}`);
    process.exit(1);
  }

  try {
    mdContent = await fs.readFile(mdPath, 'utf-8');
  } catch {
    logger.error(
      `Markdown file not found or unreadable: ${mdPath}. Prose scaffolds must exist.`,
    );
    process.exit(1);
  }

  // Parse YAML spec
  const spec = yaml.load(specContent) as unknown;

  // Validate spec structure
  if (!isSpecInput(spec)) {
    logger.error('Invalid or empty spec YAML structure.');
    logger.error('Spec must contain at least one of: anatomy, properties, layout, or variants.');
    logger.error('Example valid structure:');
    logger.error('  anatomy:');
    logger.error('    - name: "Container"');
    logger.error('      dimensions:');
    logger.error('        width: 320');
    logger.error('        height: 48');
    process.exit(1);
  }

  // Inject zones
  const injectionResult = injectSpecZones(mdContent, spec, slug);
  const newMdContent = injectionResult.content;

  // Log warnings from missing zone tags
  if (injectionResult.warnings.length > 0) {
    for (const warning of injectionResult.warnings) {
      logger.warn(warning);
    }
  }

  const changed = mdContent !== newMdContent;

  // Check mode: validate sync status
  if (isCheck) {
    if (changed) {
      logger.error(
        `❌ [DESYNC] ${slug}.md is out of sync with ${slug}.yml.`,
      );
      logger.error(
        `Run 'npm run ds:spec-to-markdown -- --slug ${slug}' to fix.`,
      );
      process.exit(1);
    } else {
      logger.info(`✅ [SYNC] ${slug}.md matches ${slug}.yml`);
      return;
    }
  }

  // Dry-run mode: report changes without writing
  if (isDryRun) {
    if (!changed) {
      logger.info(
        `Would update: ${path.relative(process.cwd(), mdPath)} (No changes detected).`,
      );
      return;
    }

    logger.info(`Would update: ${path.relative(process.cwd(), mdPath)}`);

    const zones = ['ANATOMY', 'PROPERTIES', 'VISUALS', 'VARIANTS'];
    const zoneReports: ZoneChangeReport[] = [];

    for (const zone of zones) {
      const oldRows = extractZoneRowsLength(mdContent, zone);
      const newRows = extractZoneRowsLength(newMdContent, zone);
      if (oldRows !== newRows) {
        zoneReports.push({ zone, oldRows, newRows });
        logger.info(
          `  - AUTO-GENERATED-${zone}: ${oldRows} rows → ${newRows} rows`,
        );
      }
    }

    const linesDiff = countLines(newMdContent) - countLines(mdContent);
    logger.info(
      `Total line delta: ${linesDiff > 0 ? '+' : ''}${linesDiff}`,
    );

    if (zoneReports.length === 0) {
      logger.info('  (No zone changes detected)');
    }
    return;
  }

  // Skip if no changes
  if (!changed) {
    logger.info(`[SKIPPED] ${slug}.md is already up to date.`);
    return;
  }

  // Atomic write via temp file + rename
  const tmpPath = `${mdPath}.tmp.${Date.now()}`;
  try {
    await fs.writeFile(tmpPath, newMdContent, 'utf-8');
    await fs.rename(tmpPath, mdPath);
    logger.info(`[SUCCESS] Updated ${path.relative(process.cwd(), mdPath)}`);
  } catch (error) {
    // Cleanup temp file on error
    try {
      await fs.unlink(tmpPath);
    } catch {
      // Ignore cleanup errors
    }
    logger.error(
      `Failed to write atomically: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }
}

// CLI entry point
if (isMain(import.meta.url)) {
  runSpecToMarkdown(process.argv.slice(2)).catch((error) => {
    logger.error(
      `Spec to markdown runner failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  });
}
