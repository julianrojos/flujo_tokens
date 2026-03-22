#!/usr/bin/env node
/**
 * QA Audit Script (wrapper)
 *
 * @deprecated Use TypeScript runner directly:
 *   npx tsx tooling/src/runners/qa-audit-runner.ts
 *
 * This wrapper exists for backward compatibility and will be removed
 * when the CLI is unified.
 */

import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../../..');

const runnerPath = path.join(__dirname, '../src/runners/qa-audit-runner.ts');

const result = spawnSync('npx', ['tsx', runnerPath, ...process.argv.slice(2)], {
  stdio: 'inherit',
  cwd: PROJECT_ROOT,
});

process.exit(result.status ?? 1);
