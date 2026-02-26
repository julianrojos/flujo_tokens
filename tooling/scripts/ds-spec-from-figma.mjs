#!/usr/bin/env node

/**
 * Spec from Figma - Wrapper Script
 *
 * This is a compatibility wrapper that re-exports from the new TypeScript runner.
 * The core logic has been migrated to tooling/src/runners/spec-from-figma-runner.ts
 *
 * @deprecated Use `tsx tooling/src/runners/spec-from-figma-runner.ts` directly instead
 */

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const runnerPath = path.join(__dirname, '../src/runners/spec-from-figma-runner.ts');
const projectRoot = path.join(__dirname, '../..');

// Validate runner exists before attempting to run
if (!fs.existsSync(runnerPath)) {
  console.error(`Error: Spec from Figma runner not found at ${runnerPath}`);
  process.exit(1);
}

// Use spawnSync with array of args — no shell quoting needed
const result = spawnSync('npx', ['tsx', runnerPath, ...process.argv.slice(2)], {
  stdio: 'inherit',
  cwd: projectRoot,
});

// Propagate exit code from child process
process.exit(result.status ?? 1);
