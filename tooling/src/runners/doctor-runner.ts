#!/usr/bin/env node

/**
 * Design System Doctor Runner
 *
 * CLI entry point for the doctor health check.
 * Orchestrates check functions and outputs JSON report.
 */

import { parseArgs, printUsage } from '../utils/parse-args.js';
import {
  loadDesignSystemsConfigAsync,
  resolveSystemContextSafe,
  PROJECT_ROOT,
} from '../utils/system-context.js';
import { logger } from '../utils/logger.js';
import { resolveRunnerSystemContext } from '../utils/runner-system-context.js';
import { buildDoctorReport } from '../services/doctor.js';
import type {
  DoctorCheck,
  ManifestDocument,
} from '../services/doctor-types.js';
import {
  resolveDoctorContext,
  checkPaths,
  checkSystemPathAlignment,
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
    {
      name: '--component-registry',
      description: 'PostgreSQL connection URL for component registry checks',
    },
    { name: '--proof-dir', description: 'Directory for visual proof files' },
    { name: '--manifest', description: 'Path to rules manifest YAML' },
    {
      name: '--component-name',
      description: 'Check specific component by name',
    },
    { name: '--skip-validate', description: 'Skip validate:docs check' },
    { name: '--system <id>', description: 'Target design system context' },
    { name: '--help', description: 'Show help' },
  ],
};

export interface DoctorHelpResult {
  ok: true;
  reason: 'help';
}

export type DoctorRunnerResult =
  | ReturnType<typeof buildDoctorReport>
  | DoctorHelpResult;

/**
 * Main runner function - returns report for testability
 */
export async function runDoctor(
  args: string[] = [],
): Promise<DoctorRunnerResult> {
  const parsed = parseArgs(args);

  if (parsed.help) {
    printUsage(CLI_CONFIG);
    return { ok: true, reason: 'help' };
  }

  await loadDesignSystemsConfigAsync();

  let systemCtx: ReturnType<typeof resolveSystemContextSafe>;
  try {
    systemCtx = resolveRunnerSystemContext({ parsedArgs: parsed });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Design system context is required.\n` +
        `Reason: ${reason}\n` +
        `Next step: run \`npm run ds:doctor -- --system <id>\` with a valid system id.\n` +
        `If this is a fresh environment, create/import a design system first and retry.`,
    );
  }
  const ctx = resolveDoctorContext(parsed, systemCtx, PROJECT_ROOT);

  const checks: DoctorCheck[] = [
    ...checkPaths(ctx),
    ...checkSystemPathAlignment(PROJECT_ROOT),
  ];

  // Check RULE_MANIFEST (need manifest for downstream checks)
  const { checks: manifestChecks, manifest } = checkRuleManifest(ctx);
  checks.push(...manifestChecks);

  checks.push(
    ...checkTokenRegistry(ctx),
    ...(await checkComponentRegistry(ctx)),
    ...checkAgents(),
    ...checkSkillVersioning(ctx, manifest ?? null),
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
      if ('reason' in report && report.reason === 'help') {
        return;
      }

      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      process.exitCode = report.ok ? 0 : 1;
    })
    .catch((error) => {
      logger.error(
        `Doctor runner failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      process.exit(1);
    });
}
