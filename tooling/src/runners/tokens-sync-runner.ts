#!/usr/bin/env node

/**
 * Tokens Sync Runner
 *
 * Incremental token sync with change detection.
 * Skips regeneration when input JSONs and flags are unchanged.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { parseArgs, printUsage } from '../utils/parse-args.js';
import { PROJECT_ROOT } from '../utils/system-context.js';
import { logger } from '../utils/logger.js';
import {
  computeFingerprint,
  shouldSkipTask,
  updateTaskState,
} from '../utils/cache-utils.js';

const GENERATOR_ENTRY = path.resolve(PROJECT_ROOT, 'tooling/src/cli/index.ts');

const CLI_CONFIG = {
  command: 'ds:tokens-sync [options]',
  description:
    'Incremental token sync (change detection). Skips regeneration when input JSONs and flags are unchanged.',
  options: [
    {
      name: '--input',
      description: 'Input directory containing JSON token files.',
      defaultValue: 'input',
    },
    {
      name: '--single',
      description: 'Generate single CSS file instead of split outputs.',
      defaultValue: 'false',
    },
    {
      name: '--output',
      description: 'Output CSS file path (for --single mode).',
      defaultValue: 'output/custom-properties.css',
    },
    {
      name: '--output-primitives',
      description: 'Output path for primitives CSS.',
      defaultValue: 'output/primitives.css',
    },
    {
      name: '--output-tokens',
      description: 'Output path for semantic/component tokens CSS.',
      defaultValue: 'output/tokens.css',
    },
    {
      name: '--registry-output',
      description: 'Output path for token registry JSON.',
      defaultValue: 'docs/_generated/token-registry.json',
    },
    {
      name: '--mode',
      description: 'Preferred mode branch (e.g., dark).',
      defaultValue: '',
    },
    {
      name: '--mode-strict',
      description: 'Fail if preferred mode is missing.',
      defaultValue: 'false',
    },
    {
      name: '--mode-loose',
      description: 'Fallback to available mode if preferred is missing.',
      defaultValue: 'false',
    },
    {
      name: '--force',
      description: 'Force regeneration ignoring cache.',
      defaultValue: 'false',
    },
    {
      name: '--sync-state',
      description: 'Path to sync state JSON file.',
    },
    {
      name: '--help',
      description: 'Show this help message.',
    },
  ],
};

function collectInputJsonFiles(inputDir: string): string[] {
  if (!fs.existsSync(inputDir)) return [];
  return fs
    .readdirSync(inputDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => path.join(inputDir, entry.name))
    .sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
}

function parseBooleanOption(
  rawValue: string | undefined | null,
  fallback: boolean = false,
): boolean {
  const normalized = String(rawValue ?? fallback).trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  throw new Error(`Invalid value: ${rawValue}. Allowed: true, false.`);
}

export async function runTokensSync(args: string[] = []): Promise<void> {
  const parsed = parseArgs(args);

  if (parsed.help) {
    printUsage(CLI_CONFIG);
    process.exit(0);
  }

  const force = parseBooleanOption(String(parsed.force), false);
  const syncStatePath = parsed['sync-state'] ? path.resolve(String(parsed['sync-state'])) : undefined;

  const inputDir = path.resolve(String(parsed.input || path.join(PROJECT_ROOT, 'input')));
  const split = parseBooleanOption(String(parsed.single), false) !== true;
  const outputFile = path.resolve(String(parsed.output || path.join(PROJECT_ROOT, 'output/custom-properties.css')));
  const outputPrimitives = path.resolve(String(parsed['output-primitives'] || path.join(PROJECT_ROOT, 'output/primitives.css')));
  const outputTokens = path.resolve(String(parsed['output-tokens'] || path.join(PROJECT_ROOT, 'output/tokens.css')));
  const registryOutput = path.resolve(String(parsed['registry-output'] || 'docs/_generated/token-registry.json'));
  const mode = String(parsed.mode || '').trim();
  const modeStrict = parseBooleanOption(String(parsed['mode-strict']), false);
  const modeLoose = parseBooleanOption(String(parsed['mode-loose']), false);
  const allowJsonRepair = String(process.env.ALLOW_JSON_REPAIR || '').toLowerCase();
  const allowAliasScan = String(process.env.ALLOW_ALIAS_SCAN || '').toLowerCase();

  const inputFiles = collectInputJsonFiles(inputDir);
  if (inputFiles.length === 0) {
    console.error(`No JSON input files found in ${inputDir}`);
    process.exit(1);
  }

  const outputs = split
    ? [outputPrimitives, outputTokens, registryOutput]
    : [outputFile, registryOutput];

  const fingerprint = computeFingerprint({
    files: [GENERATOR_ENTRY, ...inputFiles],
    values: {
      inputDir,
      split,
      outputFile,
      outputPrimitives,
      outputTokens,
      registryOutput,
      mode,
      modeStrict,
      modeLoose,
      allowJsonRepair,
      allowAliasScan,
    },
  });

  const taskId = `ds-tokens-sync:${inputDir}`;
  const sync = shouldSkipTask({
    taskId,
    fingerprint,
    outputs,
    force,
    statePath: syncStatePath,
  });

  if (sync.skip) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          skipped: true,
          reason: sync.reason,
          outputs,
          inputDir,
          hint: 'Use --force true to regenerate tokens.',
        },
        null,
        2,
      ),
    );
    return;
  }

  const generatorArgs = ['tsx', 'tooling/src/cli/index.ts', '--registry', '--input', inputDir];
  if (split) {
    generatorArgs.push('--split', '--output-primitives', outputPrimitives, '--output-tokens', outputTokens);
  } else {
    generatorArgs.push('--single', '--output', outputFile);
  }
  generatorArgs.push('--registry-output', registryOutput);

  if (mode) {
    generatorArgs.push('--mode', mode);
  }
  if (modeStrict) {
    generatorArgs.push('--mode-strict');
  }
  if (modeLoose) {
    generatorArgs.push('--mode-loose');
  }

  try {
    const { spawnSync } = await import('node:child_process');
    const result = spawnSync('npx', generatorArgs, {
      stdio: 'inherit',
      cwd: PROJECT_ROOT,
      shell: false,
    });

    if ((result.status ?? 1) !== 0) {
      throw new Error(`Token generation failed with exit code ${result.status}`);
    }

    updateTaskState({
      taskId,
      fingerprint,
      outputs,
      metadata: {
        command: 'ds-tokens-sync',
        split,
        inputFiles: inputFiles.length,
      },
      statePath: syncStatePath,
    });

    console.log(
      JSON.stringify(
        {
          ok: true,
          skipped: false,
          outputs,
          inputDir,
          inputFiles: inputFiles.length,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    logger.error('Tokens sync failed:', error);
    process.exit(1);
  }
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  runTokensSync(process.argv.slice(2)).catch((error) => {
    logger.error('Tokens sync runner failed:', error);
    process.exit(1);
  });
}
