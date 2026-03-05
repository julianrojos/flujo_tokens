#!/usr/bin/env node

/**
 * Regenerate Docs Runner
 *
 * Regenerates markdown docs from spec YAML files in batch.
 * Orchestrates multiple calls to ds-component-doc.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';

import { getStringArg, parseArgs, printUsage } from '../utils/parse-args.js';
import { resolveSystemContextSafe, PROJECT_ROOT } from '../utils/system-context.js';
import { componentNameToSnakeCase } from '../utils/component-name.js';

const COMPONENT_DOC_SCRIPT_PATH = path.join(
  PROJECT_ROOT,
  'tooling',
  'scripts',
  'ds-component-doc.mjs',
);

const CLI_CONFIG = {
  command: 'ds:regenerate-docs [options]',
  description: 'Regenerates markdown docs from spec YAML files in batch.',
  options: [
    { name: '--docs-root', description: 'Component docs root directory' },
    { name: '--spec-root', description: 'Component spec root directory' },
    { name: '--registry', description: 'Token registry JSON path' },
    { name: '--component', description: 'Filter by component name or slug' },
    { name: '--agent', description: 'Agent CLI to use (codex|claude|gemini|auto)' },
    { name: '--force', description: 'Force regeneration (default: true)' },
    { name: '--skip-validation', description: 'Skip validate:docs check' },
    { name: '--dry-run', description: 'Show commands without executing' },
    { name: '--continue-on-error', description: 'Continue on error (default: false)' },
    { name: '--system', description: 'Target design system context' },
    { name: '--help', description: 'Show help' },
  ],
};

function listSpecFiles(specRoot: string): string[] {
  if (!fs.existsSync(specRoot)) return [];
  return fs
    .readdirSync(specRoot, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.endsWith('.yml') &&
        entry.name !== '_template.yml',
    )
    .map((entry) => path.resolve(path.join(specRoot, entry.name)))
    .sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
}

function normalizeComponentFilter(rawValue: string | undefined | null): string {
  const raw = String(rawValue || '').trim();
  if (!raw) return '';
  const normalized = componentNameToSnakeCase(raw);
  return normalized || raw.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

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

interface Failure {
  specPath: string;
  outputPath: string;
  exitCode: number;
}

interface ExecutionSummary {
  ok: boolean;
  dryRun: boolean;
  processed: number;
  totalTargets: number;
  failed: number;
  failures: Failure[];
}

export async function runRegenerateDocs(args: string[] = []): Promise<void> {
  const parsed = parseArgs(args);

  if (parsed.help) {
    printUsage(CLI_CONFIG);
    process.exit(0);
  }

  const ctx = resolveSystemContextSafe({ system: getStringArg(parsed, 'system') });
  const docsRootInput = path.resolve(String(getStringArg(parsed, 'docs-root') || ctx.paths.docs));
  const componentDocsDir =
    path.basename(docsRootInput) === 'components'
      ? docsRootInput
      : path.join(docsRootInput, 'components');
  const specRoot = path.resolve(String(getStringArg(parsed, 'spec-root') || ctx.paths.specs));
  const registryPath = path.resolve(String(getStringArg(parsed, 'registry') || ctx.paths.tokenRegistry));
  const agent = String(getStringArg(parsed, 'agent') || process.env.DS_AGENT || 'auto');
  const force = parseBooleanOption(String(parsed.force), '--force', true) ? 'true' : 'false';
  const skipValidation = parseBooleanOption(String(parsed['skip-validation']), '--skip-validation', false);
  const dryRun = parseBooleanOption(String(parsed['dry-run']), '--dry-run', false);
  const continueOnError = parseBooleanOption(String(parsed['continue-on-error']), '--continue-on-error', false);
  const componentFilter = normalizeComponentFilter(String(parsed.component || parsed['component-name'] || ''));

  if (!fs.existsSync(COMPONENT_DOC_SCRIPT_PATH)) {
    console.error(`Missing script: ${COMPONENT_DOC_SCRIPT_PATH}`);
    process.exit(1);
  }

  const specs = listSpecFiles(specRoot).filter((specPath) => {
    if (!componentFilter) return true;
    const slug = path.basename(specPath, path.extname(specPath));
    return slug === componentFilter;
  });

  if (specs.length === 0) {
    console.error(
      componentFilter
        ? `No spec found for component filter: ${componentFilter}`
        : `No component specs found in: ${specRoot}`,
    );
    process.exit(1);
  }

  const failures: Failure[] = [];
  let processed = 0;

  for (const specPath of specs) {
    const slug = path.basename(specPath, path.extname(specPath));
    const outputPath = path.resolve(path.join(componentDocsDir, `${slug}.md`));
    const cmdArgs = [
      COMPONENT_DOC_SCRIPT_PATH,
      '--spec-file',
      specPath,
      '--output',
      outputPath,
      '--registry',
      registryPath,
      '--agent',
      agent,
      '--force',
      force,
    ];
    if (skipValidation) {
      cmdArgs.push('--skip-validation', 'true');
    }

    if (dryRun) {
      console.log(
        JSON.stringify(
          {
            dryRun: true,
            command: process.execPath,
            args: cmdArgs,
          },
          null,
          2,
        ),
      );
      processed += 1;
      continue;
    }

    const result = spawnSync(process.execPath, cmdArgs, {
      stdio: 'inherit',
      cwd: PROJECT_ROOT,
    });
    processed += 1;

    if ((result.status ?? 1) === 0) continue;
    failures.push({
      specPath,
      outputPath,
      exitCode: result.status ?? 1,
    });

    if (!continueOnError) break;
  }

  const summary: ExecutionSummary = {
    ok: failures.length === 0,
    dryRun,
    processed,
    totalTargets: specs.length,
    failed: failures.length,
    failures,
  };

  console.log(JSON.stringify(summary, null, 2));
  process.exit(summary.ok ? 0 : 1);
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  runRegenerateDocs(process.argv.slice(2)).catch((error) => {
    console.error(`FATAL: ${error.message}`);
    process.exit(1);
  });
}
