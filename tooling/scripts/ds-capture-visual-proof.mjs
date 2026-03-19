#!/usr/bin/env node

/**
 * Capture visual proof - Thin Wrapper
 *
 * Delegates to TypeScript runner via tsx.
 */

import { spawn } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const runnerPath = join(__dirname, '..', 'src', 'runners', 'capture-visual-proof-runner.ts');

// Forward all arguments to the TypeScript runner
const args = process.argv.slice(2);
const runnerArgs = args.includes('--help') ? ['--help'] : args;

// Keep wrapper-level --help behavior, but with a single execution path.
const child = spawn(process.execPath, ['--import', 'tsx', runnerPath, ...runnerArgs], {
  stdio: 'inherit',
});

child.on('error', (error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[ds:capture-visual-proof] Failed to spawn runner: ${message}\n`);
  process.exit(1);
});

child.on('close', (code, signal) => {
  if (typeof code === 'number') {
    process.exit(code);
  }
  process.stderr.write(
    `[ds:capture-visual-proof] Runner terminated by signal: ${String(signal || 'unknown')}\n`,
  );
  process.exit(1);
});
