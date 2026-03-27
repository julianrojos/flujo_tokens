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
  checkSystemPathAlignment,
  checkOrphanedSystemDirectories,
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
    { name: '--proof-dir', description: 'Directory for visual proof files' },
    { name: '--manifest', description: 'Path to rules manifest YAML' },
    { name: '--component-name', description: 'Check specific component by name' },
    { name: '--skip-validate', description: 'Skip validate:docs check' },
    { name: '--system', description: 'Target design system (default: iter)' },
    { name: '--help', description: 'Show help' },
  ],
};

export interface DoctorHelpResult {
  ok: true;
  reason: 'help';
}

export type DoctorRunnerResult = ReturnType<typeof buildDoctorReport> | DoctorHelpResult;

/**
 * Main runner function - returns report for testability
 */
export async function runDoctor(args: string[] = []): Promise<DoctorRunnerResult> {
  const parsed = parseArgs(args);

  if (parsed.help) {
    printUsage(CLI_CONFIG);
    return { ok: true, reason: 'help' };
  }

  const requestedSystem = String(parsed.system ?? '').trim();
  let systemCtx: ReturnType<typeof resolveSystemContextSafe>;
  if (requestedSystem) {
    systemCtx = resolveSystemContextSafe({ system: requestedSystem });
  } else {
    try {
      systemCtx = resolveSystemContextSafe();
    } catch {
      // Doctor can run in global docs mode even when no systems are configured.
      systemCtx = {
        id: 'global',
        name: 'Global Docs',
        docsDir: path.join(PROJECT_ROOT, 'docs'),
        paths: {
          input: path.join(PROJECT_ROOT, 'docs', '_generated'),
          output: path.join(PROJECT_ROOT, 'docs', '_generated'),
          generated: path.join(PROJECT_ROOT, 'docs', '_generated'),
          specs: path.join(PROJECT_ROOT, 'docs', '_spec', 'components'),
          docs: path.join(PROJECT_ROOT, 'docs', 'components'),
          registry: path.join(PROJECT_ROOT, 'docs', '_generated', 'component-registry.json'),
          tokenRegistry: path.join(PROJECT_ROOT, 'docs', '_generated', 'token-registry.json'),
          figmaAliasGraph: path.join(
            PROJECT_ROOT,
            'docs',
            '_generated',
            'figma-alias-graph.json',
          ),
        },
      };
    }
  }
  const ctx = resolveDoctorContext(parsed, systemCtx, PROJECT_ROOT);

  const checks: DoctorCheck[] = [
    ...checkPaths(ctx),
    ...checkSystemPathAlignment(PROJECT_ROOT),
    ...checkOrphanedSystemDirectories(PROJECT_ROOT),
  ];

  // Check RULE_MANIFEST (need manifest for downstream checks)
  const { checks: manifestChecks, manifest } = checkRuleManifest(ctx);
  checks.push(...manifestChecks);

  checks.push(
    ...checkTokenRegistry(ctx),
    ...checkComponentRegistry(ctx),
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
      logger.error(`Doctor runner failed: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    });
}
