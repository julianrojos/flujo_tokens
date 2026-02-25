#!/usr/bin/env node

/**
 * Foundations Sync Runner
 *
 * Generates deterministic foundations markdown pages from token registry.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { parseArgs, printUsage } from '../utils/parse-args.js';
import { resolveSystemContextSafe, PROJECT_ROOT } from '../utils/system-context.js';
import { logger } from '../utils/logger.js';

const CLI_CONFIG = {
  command: 'ds:foundations:sync [options]',
  description:
    'Generate deterministic foundations markdown pages from docs/_generated/token-registry.json.',
  options: [
    {
      name: '--docs-root',
      description: 'Docs root path.',
      defaultValue: 'docs',
    },
    {
      name: '--foundations-root',
      description: 'Foundations docs directory.',
      defaultValue: 'docs/foundations',
    },
    {
      name: '--registry',
      description: 'Token registry JSON path.',
      defaultValue: 'docs/_generated/token-registry.json',
    },
    {
      name: '--status',
      description: 'Frontmatter doc_status for generated pages.',
      defaultValue: 'draft',
    },
    {
      name: '--max-samples',
      description: 'Maximum token samples per group row.',
      defaultValue: '2',
    },
    {
      name: '--create-root',
      description: 'Create docs/foundations when missing.',
      defaultValue: 'false',
    },
    {
      name: '--dry-run',
      description: 'Report changes without writing files.',
      defaultValue: 'false',
    },
    {
      name: '--help',
      description: 'Show this help message.',
    },
  ],
};

const DOC_STATUS_ALLOWED = new Set(['draft', 'ready', 'needs-review']);
const DEFAULT_STATUS = 'draft';

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

export async function runFoundationsSync(args: string[] = []): Promise<void> {
  const parsed = parseArgs(args);

  if (parsed.help) {
    printUsage(CLI_CONFIG);
    process.exit(0);
  }

  const ctx = resolveSystemContextSafe({ system: parsed.system });
  const docsRoot = path.resolve(String(parsed['docs-root'] || ctx.paths.docs));
  const foundationsRoot = path.resolve(
    String(parsed['foundations-root'] || path.join(docsRoot, 'foundations')),
  );
  const registryPath = path.resolve(
    String(parsed.registry || path.join(docsRoot, '_generated', 'token-registry.json')),
  );

  const status = String(parsed.status || DEFAULT_STATUS).trim().toLowerCase();
  const createRoot = parseBooleanOption(String(parsed['create-root']), '--create-root', false);
  const dryRun = parseBooleanOption(String(parsed['dry-run']), '--dry-run', false);
  const maxSamples = Math.max(1, Math.floor(Number(parsed['max-samples'] || 2)));

  if (!DOC_STATUS_ALLOWED.has(status)) {
    console.error(
      `Invalid --status value: ${status}. Allowed: ${Array.from(DOC_STATUS_ALLOWED).join(', ')}`,
    );
    process.exit(1);
  }

  if (!fs.existsSync(foundationsRoot) && !createRoot) {
    console.error(
      'Foundations directory does not exist. Use --create-root true to create it explicitly.',
    );
    console.error(`Path: ${foundationsRoot}`);
    process.exit(1);
  }

  // Load registry
  let registry: any;
  try {
    const content = fs.readFileSync(registryPath, 'utf8');
    registry = JSON.parse(content);
  } catch (error) {
    logger.error('Failed to load token registry:', error);
    process.exit(1);
  }

  // Generate pages (delegate to service functions during migration)
  // For now, report what would be generated
  const report = {
    ok: true,
    dryRun,
    foundationsRoot,
    registryPath,
    status,
    maxSamples,
    pages: [
      { title: 'Color', fileName: 'color.md' },
      { title: 'Typography', fileName: 'typography.md' },
      { title: 'Spacing & Sizing', fileName: 'spacing-sizing.md' },
      { title: 'Elevation', fileName: 'elevation.md' },
      { title: 'Iconography', fileName: 'iconography.md' },
      { title: 'A11y', fileName: 'a11y.md' },
      { title: 'Overview', fileName: 'overview.md' },
    ],
  };

  console.log(JSON.stringify(report, null, 2));
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  runFoundationsSync(process.argv.slice(2)).catch((error) => {
    logger.error('Foundations sync runner failed:', error);
    process.exit(1);
  });
}
