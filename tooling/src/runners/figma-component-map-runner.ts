#!/usr/bin/env node

/**
 * Figma Component Map Runner
 *
 * Extract all COMPONENT / COMPONENT_SET nodes across all pages from a Figma file
 * and record nesting/dependency relations.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import {
  parseArgs,
  printUsage,
  isMain,
  fetchFigmaFile,
  parseFigmaFileUrl,
  buildFigmaComponentMap,
  buildFigmaComponentMapSummary,
  renderFigmaComponentMapText,
  resolveSystemContextSafe,
  PROJECT_ROOT,
} from '../utils/index.js';
import { logger } from '../utils/logger.js';

const DEFAULT_TIMEOUT_MS = 30_000;

const CLI_CONFIG = {
  command:
    'npm run ds:figma-component-map -- --url "https://www.figma.com/design/<fileKey>/<slug>"',
  description:
    'Extract all COMPONENT / COMPONENT_SET nodes across all pages from a Figma file and record nesting/dependency relations.',
  options: [
    {
      name: '--url <figma-file-url>',
      description: 'Figma file/design URL.',
      required: true,
    },
    {
      name: '--token <figma-token>',
      description:
        'Figma personal access token. If omitted, reads FIGMA_TOKEN from environment.',
    },
    {
      name: '--out <path>',
      description:
        'Output JSON path. Default: docs/_generated/figma-component-map/<fileKey>.json',
    },
    {
      name: '--depth <number>',
      description:
        'Optional Figma API depth parameter. Omit for full file traversal.',
    },
    {
      name: '--timeout-ms <number>',
      description: 'HTTP timeout in milliseconds.',
      defaultValue: String(DEFAULT_TIMEOUT_MS),
    },
    {
      name: '--include-instances <true|false>',
      description:
        'Track component dependencies from INSTANCE nodes inside components.',
      defaultValue: 'true',
    },
    {
      name: '--strict-unresolved-instances <true|false>',
      description:
        'Exit non-zero if unresolved instance references exist in the map.',
      defaultValue: 'false',
    },
    {
      name: '--allow-outside-project <true|false>',
      description: 'Allow output paths outside repository root (unsafe).',
      defaultValue: 'false',
    },
    {
      name: '--format <json|text>',
      description: 'Stdout format.',
      defaultValue: 'json',
    },
    {
      name: '--dry-run <true|false>',
      description: 'Do not write output file; only print summary.',
      defaultValue: 'false',
    },
    {
      name: '--help',
      description: 'Show this help message.',
    },
  ],
};

/**
 * Parse boolean option with validation.
 */
function parseBooleanOption(
  rawValue: unknown,
  optionName: string,
  fallback = false,
): boolean {
  const normalized = String(rawValue ?? fallback).trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  throw new Error(
    `Invalid ${optionName} value: ${rawValue}. Allowed: true, false.`,
  );
}

/**
 * Parse positive integer option with validation.
 */
function parsePositiveInteger(
  rawValue: unknown,
  optionName: string,
  fallback: number | undefined,
): number | undefined {
  if (rawValue === undefined || rawValue === null || rawValue === '') {
    return fallback;
  }
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) {
    throw new Error(
      `Invalid ${optionName} value: ${rawValue}. Expected a number.`,
    );
  }
  if (parsed <= 0) {
    throw new Error(
      `Invalid ${optionName} value: ${rawValue}. Expected a positive integer.`,
    );
  }
  return Math.floor(parsed);
}

/**
 * Resolve path safely (optionally restrict to project root).
 */
function resolveSafePath(
  rawPath: unknown,
  label: string,
  { allowOutsideProject = false } = {},
): string {
  const resolved = path.resolve(String(rawPath || '').trim());
  const rootWithSep = PROJECT_ROOT.endsWith(path.sep)
    ? PROJECT_ROOT
    : `${PROJECT_ROOT}${path.sep}`;
  const isInsideProject =
    resolved === PROJECT_ROOT || resolved.startsWith(rootWithSep);

  if (!allowOutsideProject && !isInsideProject) {
    throw new Error(
      `${label} must be inside project root (${PROJECT_ROOT}). Received: ${resolved}`,
    );
  }
  return resolved;
}

/**
 * Write text file atomically if changed.
 */
async function writeTextFileAtomicIfChanged(
  filePath: string,
  content: string,
  { dryRun = false } = {},
): Promise<{ path: string; changed: boolean; written: boolean }> {
  const resolved = path.resolve(filePath);
  const previous = await fs.readFile(resolved, 'utf8').catch(() => null);
  const changed = previous !== content;
  let written = false;

  if (changed && !dryRun) {
    await fs.mkdir(path.dirname(resolved), { recursive: true });
    const tempPath = `${resolved}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tempPath, content, 'utf8');
    await fs.rename(tempPath, resolved);
    written = true;
  }

  return {
    path: resolved,
    changed,
    written,
  };
}

/**
 * Parse format option.
 */
function parseFormat(rawValue: unknown): 'json' | 'text' {
  const normalized = String(rawValue || 'json').trim().toLowerCase();
  if (normalized === 'json' || normalized === 'text') return normalized;
  throw new Error(
    `Invalid --format value: ${rawValue}. Allowed: json, text.`,
  );
}

/**
 * Get default output directory.
 */
function getDefaultOutputDir(): string {
  const ctx = resolveSystemContextSafe();
  return path.join(ctx.paths.generated, 'figma-component-map');
}

/**
 * Main runner function.
 */
export async function runFigmaComponentMap(
  args: string[] = [],
): Promise<void> {
  const parsed = parseArgs(args);

  if (parsed.help) {
    printUsage(CLI_CONFIG);
    process.exit(0);
  }

  const figmaUrl = String(parsed.url || '').trim();
  if (!figmaUrl) {
    logger.error('Missing required --url <figma-file-url>');
    printUsage(CLI_CONFIG, { stream: 'stderr' });
    process.exit(1);
  }

  const parsedUrl = parseFigmaFileUrl(figmaUrl);
  const token = String(parsed.token || process.env.FIGMA_TOKEN || '').trim();
  if (!token) {
    logger.error(
      'Missing Figma token. Provide --token <token> or set FIGMA_TOKEN.',
    );
    process.exit(1);
  }

  const allowOutsideProject = parseBooleanOption(
    parsed['allow-outside-project'],
    '--allow-outside-project',
    false,
  );
  const includeInstances = parseBooleanOption(
    parsed['include-instances'],
    '--include-instances',
    true,
  );
  const strictUnresolvedInstances = parseBooleanOption(
    parsed['strict-unresolved-instances'],
    '--strict-unresolved-instances',
    false,
  );
  const dryRun = parseBooleanOption(parsed['dry-run'], '--dry-run', false);
  const format = parseFormat(parsed.format);

  const timeoutMs = parsePositiveInteger(
    parsed['timeout-ms'],
    '--timeout-ms',
    DEFAULT_TIMEOUT_MS,
  );
  const depth = parsePositiveInteger(parsed.depth, '--depth', undefined);

  const defaultOutputPath = path.join(
    getDefaultOutputDir(),
    `${parsedUrl.fileKey}.json`,
  );
  const outputPath = resolveSafePath(
    parsed.out || defaultOutputPath,
    '--out',
    { allowOutsideProject },
  );

  // Fetch Figma file
  const filePayload = await fetchFigmaFile({
    fileKey: parsedUrl.fileKey,
    token,
    depth: depth?.toString(),
    timeoutMs,
  });

  // Build component map
  const componentMap = buildFigmaComponentMap({
    filePayload,
    fileDescriptor: parsedUrl,
    includeInstances,
  });
  const summary = buildFigmaComponentMapSummary(componentMap);

  // Check for unresolved instances
  if (
    strictUnresolvedInstances &&
    Number(summary.stats.unresolved_instance_records || 0) > 0
  ) {
    logger.error(
      `Blocking unresolved instance references: ${summary.stats.unresolved_instance_records}. Re-run with --strict-unresolved-instances false to allow.`,
    );
    process.exit(1);
  }

  // Write output file
  const writeResult = await writeTextFileAtomicIfChanged(
    outputPath,
    `${JSON.stringify(componentMap, null, 2)}\n`,
    { dryRun },
  );

  // Output results
  if (format === 'text') {
    process.stdout.write(renderFigmaComponentMapText(componentMap));
    process.stdout.write(`Output: ${writeResult.path}\n`);
    process.stdout.write(
      `Changed: ${writeResult.changed ? 'yes' : 'no'}${dryRun ? ' (dry-run)' : ''}\n`,
    );
    return;
  }

  // JSON output
  process.stdout.write(
    `${JSON.stringify(
      {
        source: summary.source,
        stats: summary.stats,
        output: {
          path: writeResult.path,
          changed: writeResult.changed,
          written: writeResult.written,
          dry_run: dryRun,
        },
      },
      null,
      2,
    )}\n`,
  );
}

// CLI entry point
if (isMain(import.meta.url)) {
  runFigmaComponentMap(process.argv.slice(2)).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(message);
    process.exit(1);
  });
}
