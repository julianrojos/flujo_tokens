#!/usr/bin/env node

/**
 * Capture from Figma URL - Thin Wrapper
 *
 * @deprecated TRANSITIONAL: This wrapper delegates to the TypeScript runner.
 * Future: Direct CLI execution via `tsx capture-from-figma-url-runner.ts`
 *
 * Delegates to TypeScript runner via npx tsx.
 */

import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const runnerPath = path.resolve(__dirname, '../src/runners/capture-from-figma-url-runner.ts');

const result = spawnSync('npx', ['tsx', runnerPath, ...process.argv.slice(2)], {
  stdio: 'inherit',
  cwd: process.cwd(),
});

process.exit(result.status ?? 1);
