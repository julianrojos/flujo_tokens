#!/usr/bin/env node

/**
 * Token Health - Wrapper Script
 *
 * Compatibility wrapper for the TypeScript runner.
 *
 * @deprecated Use `tsx tooling/src/runners/token-health-runner.ts` directly
 */

import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const runnerPath = path.join(__dirname, '../src/runners/token-health-runner.ts');
const projectRoot = path.join(__dirname, '../..');

if (!fs.existsSync(runnerPath)) {
  console.error(`Error: Runner not found at ${runnerPath}`);
  process.exit(1);
}

const result = spawnSync('npx', ['tsx', runnerPath, ...process.argv.slice(2)], {
  stdio: 'inherit',
  cwd: projectRoot,
});

process.exit(result.status ?? 1);
