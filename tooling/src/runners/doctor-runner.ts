#!/usr/bin/env node

/**
 * Design System Doctor Runner
 *
 * CLI entry point for the doctor health check.
 * Orchestrates check functions and outputs JSON report.
 */

import path from 'node:path';

import { parseArgs, printUsage } from '../utils/parse-args.js';
import { resolveSystemContextSafe, PROJECT_ROOT } from '../utils/system-context.js';
import { logger } from '../utils/logger.js';
import { buildDoctorReport } from '../services/doctor.js';
import type { DoctorCheck, ManifestDocument } from '../services/doctor-types.js';
import {
  resolveDoctorContext,
  checkPaths,
  checkRuleManifest,
  checkTokenRegistry,
  checkComponentRegistry,
  checkAgents,
  checkSkillVersioning,
  checkComponentByName,
  checkValidateDocs,
} from '../services/doctor-checks.js';

const CLI_CONFIG = {
  command: 'ds:doctor [options]',
  description: 'Run Design System health checks and validation.',
  options: [
    { name: '--docs-root', description: 'Root directory for component docs' },
    { name: '--spec-root', description: 'Root directory for component specs' },
    { name: '--registry', description: 'Path to token registry JSON' },
    { name: '--component-registry', description: 'Path to component registry JSON' },
    { name: '--render-dir', description: 'Directory for Figma render payloads' },
    { name: '--proof-dir', description: 'Directory for visual proof files' },
    { name: '--manifest', description: 'Path to rules manifest YAML' },
    { name: '--component-name', description: 'Check specific component by name' },
    { name: '--skip-validate', description: 'Skip validate:docs check' },
    { name: '--system', description: 'Target design system (default: iter)' },
    { name: '--help', description: 'Show help' },
  ],
};

/**
 * Main runner function - returns report for testability
 */
export async function runDoctor(args: string[] = []): Promise<ReturnType<typeof buildDoctorReport>> {
  const parsed = parseArgs(args);

  if (parsed.help) {
    printUsage(CLI_CONFIG);
    process.exit(0);
  }

  const systemCtx = resolveSystemContextSafe({ system: String(parsed.system ?? '') });
  const ctx = resolveDoctorContext(parsed, systemCtx, PROJECT_ROOT);

  const checks: DoctorCheck[] = [
    ...checkPaths(ctx),
  ];

  // Check RULE_MANIFEST (need manifest for downstream checks)
  const { checks: manifestChecks, manifest } = checkRuleManifest(ctx);
  checks.push(...manifestChecks);

  checks.push(
    ...checkTokenRegistry(ctx),
    ...checkComponentRegistry(ctx),
    ...checkAgents(),
    ...checkSkillVersioning(ctx, manifest),
    ...checkComponentByName(ctx),
    ...checkValidateDocs(ctx),
  );

  return buildDoctorReport(checks);
}

/**
 * CLI entry point
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  runDoctor(process.argv.slice(2))
    .then((report) => {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      process.exit(report.ok ? 0 : 1);
    })
    .catch((error) => {
      logger.error(`Doctor runner failed: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    });
}
