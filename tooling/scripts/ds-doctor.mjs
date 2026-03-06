#!/usr/bin/env node

/**
 * Design System Doctor - Wrapper Script
 *
 * This is a compatibility wrapper that re-exports from the new TypeScript runner.
 * The core logic has been migrated to tooling/src/runners/doctor-runner.ts
 *
 * @deprecated Use `tsx tooling/src/runners/doctor-runner.ts` directly instead
 */

import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const runnerPath = path.join(__dirname, '../src/runners/doctor-runner.ts');
const projectRoot = path.join(__dirname, '../..');

// Validate runner exists before attempting to run
if (!fs.existsSync(runnerPath)) {
  console.error(`Error: Doctor runner not found at ${runnerPath}`);
  process.exit(1);
}

// Use spawnSync with array of args — no shell quoting needed
const result = spawnSync('npx', ['tsx', runnerPath, ...process.argv.slice(2)], {
  stdio: 'inherit',
  cwd: projectRoot,
});

// Propagate exit code from child process
process.exit(result.status ?? 1);
