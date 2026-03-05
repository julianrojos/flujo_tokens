#!/usr/bin/env node

/**
 * Token Diff Runner
 *
 * Compares token registry versions and reports Added/Modified/Removed changes
 * with breaking classification.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import * as crypto from 'node:crypto';

import { parseArgs, printUsage } from '../utils/parse-args.js';
import { resolveSystemContextSafe, PROJECT_ROOT } from '../utils/system-context.js';
import { logger } from '../utils/logger.js';

const DEFAULT_BEFORE_REF = 'HEAD';
const IDENTITY_FIELDS = ['path', 'slashPath', 'cssVar'];
const COMPARE_FIELDS = ['path', 'slashPath', 'cssVar', 'type', 'collection', 'resolvedValue'];
const BREAKING_MODIFIED_FIELDS = new Set(['type', 'cssVar']);

const CLI_CONFIG = {
  command: 'ds:token-diff [options]',
  description:
    'Compare token registry versions and report Added/Modified/Removed changes with breaking classification.',
  options: [
    {
      name: '--current',
      description: 'Current token registry JSON path.',
      defaultValue: 'docs/_generated/token-registry.json',
    },
    {
      name: '--before',
      description: 'Previous token registry JSON file path.',
    },
    {
      name: '--before-ref',
      description: 'Git reference for the previous registry.',
      defaultValue: 'HEAD',
    },
    {
      name: '--registry-at-ref',
      description: 'Registry path inside the git ref used with --before-ref.',
      defaultValue: 'docs/_generated/token-registry.json',
    },
    {
      name: '--format',
      description: 'Stdout output format.',
      defaultValue: 'json',
    },
    {
      name: '--out-json',
      description: 'Optional JSON report output path.',
    },
    {
      name: '--out-md',
      description: 'Optional markdown summary output path.',
    },
    {
      name: '--strict',
      description: 'Exit non-zero when breaking changes are detected.',
      defaultValue: 'false',
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
  throw new Error(`Invalid ${optionName} value: ${rawValue}. Allowed: true, false.`);
}

function readRegistryFromGitRef(gitRef: string, registryPathInRef: string): string {
  const ref = String(gitRef || '').trim();
  const internalPath = String(registryPathInRef || '').trim();
  if (!ref) {
    throw new Error('Missing --before-ref value.');
  }
  if (!internalPath) {
    throw new Error('Missing --registry-at-ref value.');
  }

  const objectRef = `${ref}:${internalPath}`;
  const result = spawnSync('git', ['show', objectRef], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.error) {
    throw new Error(`Failed running git show for ${objectRef}: ${result.error.message}`);
  }

  if ((result.status ?? 1) !== 0) {
    const stderr = String(result.stderr || '').trim();
    throw new Error(
      `Unable to read registry from git ref (${objectRef}).` +
        (stderr ? `\n${stderr}` : ''),
    );
  }

  return String(result.stdout || '');
}

function parseRegistryJson(rawJson: string, label: string): any[] {
  let parsed: any;
  try {
    parsed = JSON.parse(rawJson);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid JSON in ${label}: ${reason}`);
  }

  let entries: any[] = [];
  if (Array.isArray(parsed)) {
    entries = parsed;
  } else if (parsed && typeof parsed === 'object' && Array.isArray(parsed.entries)) {
    entries = parsed.entries;
  } else if (
    parsed &&
    typeof parsed === 'object' &&
    parsed.byPath &&
    typeof parsed.byPath === 'object'
  ) {
    entries = Object.values(parsed.byPath);
  } else if (parsed && typeof parsed === 'object') {
    entries = Object.values(parsed);
  }

  const normalized: any[] = [];
  for (const rawEntry of entries) {
    if (!rawEntry || typeof rawEntry !== 'object') continue;
    normalized.push({
      path: String(rawEntry.path || '').trim(),
      slashPath: String(rawEntry.slashPath || '').trim(),
      cssVar: String(rawEntry.cssVar || '').trim(),
      type: String(rawEntry.type || '').trim().toLowerCase(),
      collection: String(rawEntry.collection || '').trim(),
      resolvedValue: String(rawEntry.resolvedValue || '').trim(),
    });
  }

  normalized.sort((a, b) => {
    const keyA = `${a.path}|${a.slashPath}|${a.cssVar}`;
    const keyB = `${b.path}|${b.slashPath}|${b.cssVar}`;
    return keyA.localeCompare(keyB, 'en', { sensitivity: 'base' });
  });

  return normalized;
}

function buildIdentityKey(entry: any): string {
  return IDENTITY_FIELDS.map((field) => String((entry as any)[field] || '')).join('|');
}

function buildCompareKey(entry: any): string {
  return COMPARE_FIELDS.map((field) => String((entry as any)[field] || '')).join('|');
}

function isBreakingChange(before: any, current: any): boolean {
  for (const field of BREAKING_MODIFIED_FIELDS) {
    const beforeVal = String(before[field] || '').trim();
    const currentVal = String(current[field] || '').trim();
    if (beforeVal !== currentVal) {
      return true;
    }
  }
  return false;
}

function computeFingerprint(diffResult: any): string {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(diffResult))
    .digest('hex');
}

function generateMarkdownReport(diffResult: any): string {
  const lines: string[] = [];
  lines.push('# Token Diff Report\n');
  lines.push(`Generated: ${new Date().toISOString()}\n`);
  lines.push(`Before: ${diffResult.beforeRef || 'N/A'}\n`);
  lines.push(`Current: ${diffResult.currentPath || 'N/A'}\n\n`);

  lines.push('## Summary\n');
  lines.push(`- **Added:** ${diffResult.summary?.added || 0}`);
  lines.push(`- **Modified:** ${diffResult.summary?.modified || 0}`);
  lines.push(`  - Breaking: ${diffResult.summary?.breaking_modified || 0}`);
  lines.push(`  - Non-breaking: ${(diffResult.summary?.modified || 0) - (diffResult.summary?.breaking_modified || 0)}`);
  lines.push(`- **Removed:** ${diffResult.summary?.removed || 0}`);
  lines.push(`- **Breaking Changes:** ${diffResult.summary?.breaking_changes || 0}\n`);

  if (diffResult.added && diffResult.added.length > 0) {
    lines.push('\n## Added Tokens\n');
    for (const item of diffResult.added.slice(0, 20)) {
      lines.push(`- \`${item.path}\` (${item.type})`);
    }
    if (diffResult.added.length > 20) {
      lines.push(`\n... and ${diffResult.added.length - 20} more`);
    }
  }

  if (diffResult.modified && diffResult.modified.length > 0) {
    lines.push('\n## Modified Tokens\n');
    for (const item of diffResult.modified.slice(0, 20)) {
      const breaking = item.isBreaking ? ' ⚠️ **BREAKING**' : '';
      lines.push(`- \`${item.path}\`${breaking}`);
    }
    if (diffResult.modified.length > 20) {
      lines.push(`\n... and ${diffResult.modified.length - 20} more`);
    }
  }

  if (diffResult.removed && diffResult.removed.length > 0) {
    lines.push('\n## Removed Tokens\n');
    for (const item of diffResult.removed.slice(0, 20)) {
      lines.push(`- \`${item.path}\` (${item.type})`);
    }
    if (diffResult.removed.length > 20) {
      lines.push(`\n... and ${diffResult.removed.length - 20} more`);
    }
  }

  return lines.join('\n');
}

export async function runTokenDiff(args: string[] = []): Promise<void> {
  const parsed = parseArgs(args);

  if (parsed.help) {
    printUsage(CLI_CONFIG);
    process.exit(0);
  }

  const format = String(parsed.format || 'json').trim().toLowerCase();
  if (format !== 'json' && format !== 'text') {
    throw new Error(`Invalid --format value: ${format}. Allowed: json, text.`);
  }

  const strict = parseBooleanOption(String(parsed.strict), '--strict', false);
  const currentPath = path.resolve(String(parsed.current || 'docs/_generated/token-registry.json'));
  const beforeRef = String(parsed['before-ref'] || DEFAULT_BEFORE_REF).trim();
  const registryAtRef = String(parsed['registry-at-ref'] || 'docs/_generated/token-registry.json').trim();
  const outJson = parsed['out-json'] ? path.resolve(String(parsed['out-json'])) : null;
  const outMd = parsed['out-md'] ? path.resolve(String(parsed['out-md'])) : null;

  // Load current registry
  let currentRaw: string;
  try {
    currentRaw = fs.readFileSync(currentPath, 'utf8');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to read current registry: ${errorMessage}`);
    process.exit(1);
  }

  // Load before registry (from file or git ref)
  let beforeRaw: string;
  const beforeFile = parsed.before;
  if (beforeFile) {
    try {
      beforeRaw = fs.readFileSync(path.resolve(String(beforeFile)), 'utf8');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to read before registry: ${errorMessage}`);
      process.exit(1);
    }
  } else {
    try {
      beforeRaw = readRegistryFromGitRef(beforeRef, registryAtRef);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to read registry from git ref: ${errorMessage}`);
      process.exit(1);
    }
  }

  // Parse registries
  const currentEntries = parseRegistryJson(currentRaw, 'current registry');
  const beforeEntries = parseRegistryJson(beforeRaw, 'before registry');

  // Build maps
  const beforeByIdentity = new Map<string, any>();
  for (const entry of beforeEntries) {
    beforeByIdentity.set(buildIdentityKey(entry), entry);
  }

  const currentByIdentity = new Map<string, any>();
  for (const entry of currentEntries) {
    currentByIdentity.set(buildIdentityKey(entry), entry);
  }

  // Compute diff
  const added: any[] = [];
  const modified: any[] = [];
  const removed: any[] = [];

  for (const [key, currentEntry] of currentByIdentity.entries()) {
    const beforeEntry = beforeByIdentity.get(key);
    if (!beforeEntry) {
      added.push(currentEntry);
    } else {
      const beforeCompare = buildCompareKey(beforeEntry);
      const currentCompare = buildCompareKey(currentEntry);
      if (beforeCompare !== currentCompare) {
        modified.push({
          ...currentEntry,
          before: beforeEntry,
          isBreaking: isBreakingChange(beforeEntry, currentEntry),
        });
      }
    }
  }

  for (const [key, beforeEntry] of beforeByIdentity.entries()) {
    if (!currentByIdentity.has(key)) {
      removed.push(beforeEntry);
    }
  }

  const breakingModified = modified.filter((m) => m.isBreaking);

  const diffResult = {
    beforeRef,
    currentPath,
    summary: {
      added: added.length,
      modified: modified.length,
      breaking_modified: breakingModified.length,
      removed: removed.length,
      breaking_changes: breakingModified.length,
    },
    added,
    modified,
    removed,
    fingerprint: computeFingerprint({
      added: added.length,
      modified: modified.length,
      breaking_modified: breakingModified.length,
      removed: removed.length,
    }),
  };

  // Output
  if (format === 'json') {
    console.log(JSON.stringify(diffResult, null, 2));
  } else {
    console.log(`\n=== Token Diff Summary ===\n`);
    console.log(`Before: ${beforeRef}`);
    console.log(`Current: ${currentPath}\n`);
    console.log(`Added: ${diffResult.summary.added}`);
    console.log(`Modified: ${diffResult.summary.modified} (${diffResult.summary.breaking_modified} breaking)`);
    console.log(`Removed: ${diffResult.summary.removed}`);
    console.log(`\nBreaking Changes: ${diffResult.summary.breaking_changes}`);
  }

  // Write output files
  if (outJson) {
    fs.mkdirSync(path.dirname(outJson), { recursive: true });
    fs.writeFileSync(outJson, JSON.stringify(diffResult, null, 2), 'utf8');
    logger.info(`JSON report written to ${outJson}`);
  }

  if (outMd) {
    fs.mkdirSync(path.dirname(outMd), { recursive: true });
    const mdContent = generateMarkdownReport(diffResult);
    fs.writeFileSync(outMd, mdContent, 'utf8');
    logger.info(`Markdown report written to ${outMd}`);
  }

  // Exit with error if strict and breaking changes
  if (strict && diffResult.summary.breaking_changes > 0) {
    process.exit(1);
  }
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  runTokenDiff(process.argv.slice(2)).catch((error) => {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Token diff runner failed: ${errorMessage}`);
    process.exit(1);
  });
}
