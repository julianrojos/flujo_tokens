#!/usr/bin/env node

/**
 * Design System Doctor - Wrapper Script
 *
 * This is a compatibility wrapper that re-exports from the new TypeScript runner.
 * The core logic has been migrated to tooling/src/runners/doctor-runner.ts
 *
 * @deprecated Use `tsx tooling/src/runners/doctor-runner.ts` directly instead
 */

import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const runnerPath = path.join(__dirname, '../src/runners/doctor-runner.ts');
const projectRoot = path.join(__dirname, '../../..');

// Validate runner exists before attempting to run
if (!fs.existsSync(runnerPath)) {
  console.error(`Error: Doctor runner not found at ${runnerPath}`);
  process.exit(1);
}

// Quote arguments with spaces to preserve them in shell execution
const args = process.argv.slice(2).map(arg => {
  return arg.includes(' ') ? `"${arg}"` : arg;
}).join(' ');

const command = `tsx "${runnerPath}" ${args}`;

try {
  // execSync with stdio: 'inherit' passes stdout/stderr directly to terminal
  // execSync throws when child process exits with non-zero code
  execSync(command, {
    stdio: 'inherit',
    cwd: projectRoot,
  });
  // If execSync returns, child process exited with 0
  process.exit(0);
} catch (error) {
  // execSync throws Error with status property containing child's exit code
  process.exit(error.status ?? 1);
}
