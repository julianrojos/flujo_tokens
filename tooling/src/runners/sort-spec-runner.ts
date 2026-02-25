#!/usr/bin/env node

/**
 * Spec Sorter Runner
 *
 * Sorts properties in component spec YAML files to canonical order.
 * I/O operations and CLI entry point.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { parseArgs, printUsage } from '../utils/parse-args.js';
import { resolveSystemContextSafe, PROJECT_ROOT } from '../utils/system-context.js';
import {
  parseSpec,
  dumpSpec,
  checkSpecSort,
  sortSpec,
} from '../services/sort-spec.js';
import { isPlainObject } from '../utils/is-plain-object.js';

const CLI_CONFIG = {
  command: 'ds:sort-spec [options]',
  description: 'Sort properties in component spec YAML files to canonical order.',
  options: [
    { name: '--file', description: 'Spec YAML file to sort (may be repeated)' },
    { name: '--all', description: 'Sort all files in docs/_spec/components/*.yml' },
    { name: '--check', description: 'Dry-run: report unsorted files, exit 1 if any found' },
    { name: '--json', description: 'Output JSON result' },
    { name: '--system', description: 'Target design system context' },
    { name: '--help', description: 'Show help' },
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

interface ProcessResult {
  file: string;
  status: 'ok' | 'sorted' | 'needs-sort' | 'error' | 'skip';
  error?: string;
  reason?: string;
  changed?: boolean;
  groupsOk?: boolean;
  fieldsOk?: boolean;
}

/**
 * Process a single spec file.
 */
function processSpecFile(filePath: string, { check = false } = {}): ProcessResult {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    return { file: filePath, status: 'error', error: (err as Error).message };
  }

  let spec: unknown;
  try {
    spec = parseSpec(raw);
  } catch (err) {
    return { file: filePath, status: 'error', error: `YAML parse error: ${(err as Error).message}` };
  }

  if (!isPlainObject(spec)) {
    return { file: filePath, status: 'skip', reason: 'not a plain object' };
  }

  const specAny = spec as Record<string, unknown>;
  if (!Array.isArray(specAny.properties)) {
    return { file: filePath, status: 'skip', reason: 'no properties array' };
  }

  const { alreadySorted, groupsOk, fieldsOk } = checkSpecSort(specAny);

  if (alreadySorted) {
    return { file: filePath, status: 'ok', changed: false };
  }

  if (check) {
    return {
      file: filePath,
      status: 'needs-sort',
      changed: true,
      groupsOk,
      fieldsOk,
    };
  }

  const sortedSpec = sortSpec(specAny);
  const newYaml = dumpSpec(sortedSpec);

  try {
    fs.writeFileSync(filePath, newYaml, 'utf8');
  } catch (err) {
    return { file: filePath, status: 'error', error: `Write error: ${(err as Error).message}` };
  }

  return { file: filePath, status: 'sorted', changed: true };
}

export async function runSortSpec(args: string[] = []): Promise<void> {
  const parsed = parseArgs(args);

  if (parsed.help) {
    printUsage(CLI_CONFIG);
    process.exit(0);
  }

  const hasFile = !!parsed.file;
  const hasAll = !!parsed.all;

  if (!hasFile && !hasAll) {
    console.error('ERROR: --file <path> or --all is required.');
    console.error('Usage:');
    console.error('  npm run ds:sort-spec -- --file <path>');
    console.error('  npm run ds:sort-spec -- --all [--check]');
    console.error('Options: --file, --all, --check, --system <id>, --json');
    process.exit(1);
  }

  // Resolve list of files
  let files: string[] = [];
  if (hasAll) {
    const ctx = resolveSystemContextSafe({ system: parsed.system });
    const specDir = ctx.paths.specs;

    if (!fs.existsSync(specDir)) {
      console.error(`ERROR: Spec dir not found: ${specDir}`);
      process.exit(1);
    }
    files = fs
      .readdirSync(specDir)
      .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
      .map((f) => path.join(specDir, f));
  } else {
    const rawFile = Array.isArray(parsed.file) ? parsed.file : [parsed.file];
    files = rawFile.map((f) => path.resolve(String(f)));
  }

  if (files.length === 0) {
    console.error('ERROR: No spec files found.');
    process.exit(1);
  }

  const check = parseBooleanOption(String(parsed.check), '--check', false);
  const json = parseBooleanOption(String(parsed.json), '--json', false);

  const results = files.map((f) => processSpecFile(f, { check }));

  const needsSort = results.filter((r) => r.status === 'needs-sort');
  const sorted = results.filter((r) => r.status === 'sorted');
  const ok = results.filter((r) => r.status === 'ok');
  const errors = results.filter((r) => r.status === 'error');
  const skipped = results.filter((r) => r.status === 'skip');

  if (json) {
    console.log(
      JSON.stringify(
        {
          check,
          total: files.length,
          ok: ok.length,
          sorted: sorted.length,
          needsSort: needsSort.length,
          errors: errors.length,
          skipped: skipped.length,
          results,
        },
        null,
        2,
      ),
    );
  } else {
    const rel = (f: string) => path.relative(process.cwd(), f);

    if (check) {
      if (needsSort.length === 0 && errors.length === 0) {
        console.log(`✓ All ${ok.length} spec file(s) have canonical property order.`);
      } else {
        if (needsSort.length > 0) {
          console.error(`✗ ${needsSort.length} spec file(s) need sorting:`);
          for (const r of needsSort) {
            const issues = [];
            if (!r.groupsOk) issues.push('group order');
            if (!r.fieldsOk) issues.push('field order');
            console.error(`  ${rel(r.file)}  [${issues.join(', ')}]`);
          }
          console.error(`\n  Fix: npm run ds:sort-spec -- --all`);
        }
        if (errors.length > 0) {
          console.error(`\n✗ ${errors.length} error(s):`);
          for (const r of errors) console.error(`  ${rel(r.file)}: ${r.error}`);
        }
      }
    } else {
      if (sorted.length > 0) {
        console.log(`✓ Sorted ${sorted.length} spec file(s):`);
        for (const r of sorted) console.log(`  ${rel(r.file)}`);
      }
      if (ok.length > 0) {
        console.log(`✓ Already sorted: ${ok.length} file(s)`);
      }
      if (errors.length > 0) {
        console.error(`✗ Errors in ${errors.length} file(s):`);
        for (const r of errors) console.error(`  ${rel(r.file)}: ${r.error}`);
      }
      if (skipped.length > 0) {
        console.log(`  Skipped: ${skipped.length} file(s) (${skipped.map((r) => r.reason).join(', ')})`);
      }
    }
  }

  // Exit codes
  if (check && (needsSort.length > 0 || errors.length > 0)) {
    process.exit(1);
  }
  if (!check && errors.length > 0) {
    process.exit(1);
  }
  process.exit(0);
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  runSortSpec(process.argv.slice(2)).catch((error) => {
    console.error(`FATAL: ${error.message}`);
    process.exit(1);
  });
}
