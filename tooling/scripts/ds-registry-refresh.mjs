#!/usr/bin/env node

/**
 * Registry Refresh - Wrapper Script
 *
 * Compatibility wrapper for the TypeScript runner.
 *
 * @deprecated Use `tsx tooling/src/runners/registry-refresh-runner.ts` directly
 */

import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { supportsNodeImportFlag } from './lib/node-compat.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const runnerPath = path.join(__dirname, '../src/runners/registry-refresh-runner.ts');
const projectRoot = path.join(__dirname, '../..');

if (!fs.existsSync(runnerPath)) {
  console.error(`Error: Runner not found at ${runnerPath}`);
  process.exit(1);
}

const args = process.argv.slice(2);
const command = supportsNodeImportFlag()
  ? [process.execPath, ['--import', 'tsx/esm', runnerPath, ...args]]
  : ['npx', ['tsx', runnerPath, ...args]];

const result = spawnSync(command[0], command[1], {
  stdio: 'inherit',
  cwd: projectRoot,
});

process.exit(result.status ?? 1);
