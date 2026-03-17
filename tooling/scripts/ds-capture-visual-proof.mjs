#!/usr/bin/env node

/**
 * @deprecated This script is a thin wrapper for the TypeScript runner.
 * Use `npx tsx tooling/src/runners/capture-visual-proof-runner.ts` directly.
 * This wrapper will be removed in a future version.
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const runnerPath = path.resolve(__dirname, '../src/runners/capture-visual-proof-runner.ts');

const result = spawnSync('npx', ['tsx', runnerPath, ...process.argv.slice(2)], {
  stdio: 'inherit',
  cwd: process.cwd(),
});

process.exit(result.status ?? 1);
