#!/usr/bin/env node

/**
 * Design System Pipeline Runner
 *
 * CLI entry point for the pipeline orchestrator.
 * Orchestrates execution functions and outputs reports.
 */

import fs from 'node:fs';
import path from 'node:path';

import { parseArgs, printUsage } from '../utils/parse-args.js';
import { resolveSystemContextSafe, PROJECT_ROOT } from '../utils/system-context.js';
import { logger } from '../utils/logger.js';
import { runDoctor } from './doctor-runner.js';
import { createPlan } from '../services/pipeline-plan.js';
import {
  buildReportData,
  formatOrphanReport,
  formatComponentPlan,
  formatStats,
  formatFailureSummary,
  formatSuccessMessage,
  formatDryRunNotice,
  COLORS,
} from '../services/pipeline-report.js';
import {
  runGlobalCommand,
  executeComponentTasks,
  writeReportFile,
} from '../services/pipeline-execution.js';
import type { DoctorReport } from '../services/doctor-types.js';

import type {
  PipelineOptions,
  PipelineExecutionState,
  ComponentExecutionMetrics,
} from '../services/pipeline-types.js';

function isDoctorReport(report: unknown): report is DoctorReport {
  return report != null && typeof report === 'object' && 'checks' in report;
}

function isPipelineReport(report: unknown): report is PipelineReport {
  return report != null && typeof report === 'object' && 'ok' in report;
}

const CLI_CONFIG = {
  command: 'ds:pipeline [options]',
  description: 'Orchestrate the full Design System documentation pipeline.',
  options: [
    { name: '--component', description: 'Target specific component slug (e.g. alert)' },
    { name: '--all', description: 'Process all components' },
    {
      name: '--from-step',
      description:
        'Start from specific step. Canonical: spec|markdown.',
    },
    {
      name: '--only-step',
      description:
        'Execute only a specific step. Canonical: spec|markdown.',
    },
    { name: '--dry-run', description: 'Plan but do not execute' },
    { name: '--status-only', description: 'Only show plan and orphan status' },
    { name: '--strict', description: 'Fail on first error' },
    { name: '--system', description: 'Target design system (default: iter)' },
    { name: '--json', description: 'Output silent JSON' },
    { name: '--help', description: 'Show help' },
  ],
};

/**
 * Run preflight checks using ds:doctor.
 * 
 * Invokes the doctor command to ensure the environment is healthy before
 * running the pipeline. Validates core paths and registries.
 *
 * @param options - Pipeline options including the target system and JSON output flag.
 * @returns A promise resolving to true if preflight passes, false otherwise.
 */
async function runPreflight(options: PipelineOptions): Promise<boolean> {
  const { json, system } = options;
  const isPlanningOnly = options['dry-run'] || options['status-only'];
  const FATAL_PREFLIGHT_CHECKS = new Set(
    isPlanningOnly
      ? ['PATH_DOCS', 'PATH_SPECS']
      : ['PATH_DOCS', 'PATH_SPECS', 'TOKEN_REGISTRY', 'COMPONENT_REGISTRY'],
  );

  const registryExists = fs.existsSync(
    path.join(PROJECT_ROOT, 'docs', '_generated', 'component-registry.json'),
  );

  if (!options['status-only'] || !registryExists) {
    if (!json) {
      console.log('\n\x1b[35m=== RUNNING PREFLIGHT (ds:doctor) ===\x1b[0m');
    }

    // Build args for doctor
    const doctorArgs: string[] = [];
    if (system) {
      doctorArgs.push('--system', system);
    }
    doctorArgs.push('--json');

    // Run doctor - it returns the report directly now
    // Any exception from runDoctor() is treated as preflight failure
    let doctorReport: DoctorReport | null = null;
    try {
      const doctorResult = await runDoctor(doctorArgs);
      if (!isDoctorReport(doctorResult)) {
        if (!json) {
          console.error('\x1b[31m❌ Preflight failed: ds:doctor returned no checks.\x1b[0m');
        } else {
          console.log(JSON.stringify({ ok: false, reason: 'preflight', error: 'ds:doctor returned no checks' }, null, 2));
        }
        return false;
      }
      doctorReport = doctorResult;
    } catch (error) {
      // runDoctor() throws on unexpected errors - treat as preflight failure
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (!json) {
        console.error('\x1b[31m❌ Preflight failed: unable to run ds:doctor.\x1b[0m');
        console.error(errorMessage);
      } else {
        console.log(JSON.stringify({ ok: false, reason: 'preflight', error: errorMessage }, null, 2));
      }
      return false;
    }

    const doctorChecks = doctorReport?.checks ?? [];
    const fatalFailures = doctorChecks.filter(
      (c) => FATAL_PREFLIGHT_CHECKS.has(c.id) && c.status === 'fail',
    );

    if (fatalFailures.length > 0) {
      if (!json) {
        console.error('\x1b[31m❌ Preflight failed on core checks:\x1b[0m');
        for (const c of fatalFailures) {
          console.error(`   • ${c.id}: ${c.message}`);
        }
      } else {
        console.log(JSON.stringify({ ok: false, reason: 'preflight', errors: fatalFailures }, null, 2));
      }
      return false;
    } else if (!json) {
      const skipped = doctorChecks
        .filter((c) => !FATAL_PREFLIGHT_CHECKS.has(c.id) && c.status === 'fail')
        .map((c) => c.id);
      console.log(
        `✅ Preflight passed${skipped.length > 0 ? ` (non-fatal skipped: ${skipped.join(', ')})` : ''}`,
      );
    }

    return true;
  }

  return true;
}

/**
 * Pipeline report structure
 */
export interface PipelineReport {
  ok: boolean;
  reason?: string;
  plan?: ReturnType<typeof createPlan>;
  executionState?: PipelineExecutionState;
  options?: PipelineOptions;
  meta?: { hasFailures: boolean; failedComponents: string[] };
}

/**
 * Main runner function - returns report for testability
 */
export async function runPipeline(args: string[] = []): Promise<PipelineReport> {
  const parsed = parseArgs(args);

  if (parsed.help) {
    printUsage(CLI_CONFIG);
    return { ok: true, reason: 'help' };
  }

  const options: PipelineOptions = {
    component: parsed.component ? String(parsed.component) : undefined,
    all: parsed.all === 'true' || !!parsed.all,
    'from-step': parsed['from-step'] ? String(parsed['from-step']) : undefined,
    'only-step': parsed['only-step'] ? String(parsed['only-step']) : undefined,
    'dry-run': parsed['dry-run'] === 'true' || !!parsed['dry-run'],
    'status-only': parsed['status-only'] === 'true' || !!parsed['status-only'],
    strict: parsed.strict === 'true' || !!parsed.strict,
    system: parsed.system ? String(parsed.system) : undefined,
    json: parsed.json === 'true' || !!parsed.json,
  };

  const { json } = options;

  if (!json) {
    console.log('\n\x1b[1m🚀 STARTING DS-PIPELINE ORCHESTRATOR\x1b[0m');
  }

  // Run preflight checks
  const preflightOk = await runPreflight(options);
  if (!preflightOk) {
    return { ok: false, reason: 'preflight' };
  }

  // Create plan
  if (!json) {
    console.log('\n\x1b[35m=== PHASE 1: PLANNING ===\x1b[0m');
  }

  const plan = createPlan({
    'from-step': options['from-step'],
    'only-step': options['only-step'],
    component: options.component,
    allowMissingRegistry: Boolean(options['dry-run'] || options['status-only']),
  });

  // Status-only mode
  if (options['status-only']) {
    printReport(plan, { global: { tokensSync: null, finalGate: null }, components: {} }, options, { hasFailures: false, failedComponents: [] });
    return { ok: true, plan, executionState: { global: { tokensSync: null, finalGate: null }, components: {} }, options, meta: { hasFailures: false, failedComponents: [] } };
  }

  // Execution phase
  if (!json) {
    console.log('\n\x1b[35m=== PHASE 2: EXECUTION ===\x1b[0m');
  }

  const executionState: PipelineExecutionState = {
    global: {
      tokensSync: null,
      finalGate: null,
    },
    components: {},
  };

  const sysArgs = options.system ? ['--', '--system', options.system] : [];

  // Stage A: Sync Token Registry
  const tokensOk = runGlobalCommand(
    'Stage A: Syncing Token Registry',
    'npm',
    ['run', 'generate:registry', ...sysArgs],
    { silent: json, dryRun: options['dry-run'] },
  );
  executionState.global.tokensSync = tokensOk ? 'Success' : 'Failed';

  if (!tokensOk && !options['dry-run']) {
    console.error('❌ Failed to sync token registry. Aborting.');
    return { ok: false, reason: 'tokens', plan, executionState, options };
  }

  // Process components
  for (const [slug, compPlan] of Object.entries(plan.components)) {
    if (!json) {
      console.log(`\n\x1b[35m--- Processing Component: ${slug} ---\x1b[0m`);
    }

    if (compPlan.orphanStatus === 'doc_only' || compPlan.orphanStatus === 'figma_only') {
      if (!json) {
        console.log(
          `⚠️ Component '${slug}' is an orchestrator orphan (${compPlan.orphanStatus}). Skipping execution.`,
        );
      }
      continue;
    }

    const metrics = executeComponentTasks(compPlan, options);
    executionState.components[slug] = metrics;

    if (!metrics.success && options.strict && !options['dry-run']) {
      if (!json) {
        console.error(
          `\n\x1b[31m❌ Strict mode: Aborting and stopping pipeline due to failure in '${slug}'.\x1b[0m`,
        );
      }
      break;
    }
  }

  // Final validation
  if (!json) {
    console.log(`\n\x1b[35m--- Global Validations ---\x1b[0m`);
  }

  const valOk = runGlobalCommand(
    'Stage F: Validating Final Docs',
    'npm',
    ['run', 'validate:docs', ...sysArgs],
    { silent: json, dryRun: options['dry-run'] },
  );
  executionState.global.finalGate = valOk ? 'Success' : 'Validation Failed';

  // Collect failures
  const failedComponents = Object.entries(executionState.components)
    .filter(([, m]) => m.success === false)
    .map(([slug]) => slug);

  const hasFailures = failedComponents.length > 0 || !valOk;

  // Generate report
  printReport(plan, executionState, options, { hasFailures, failedComponents });

  if (hasFailures && !options['dry-run']) {
    return { ok: false, reason: 'execution', plan, executionState, options, meta: { hasFailures, failedComponents } };
  }

  return { ok: true, plan, executionState, options, meta: { hasFailures, failedComponents } };
}

/**
 * Print pipeline report
 */
function printReport(
  plan: ReturnType<typeof createPlan>,
  executionState: PipelineExecutionState,
  options: PipelineOptions,
  meta: { hasFailures: boolean; failedComponents: string[] },
): void {
  const { json } = options;
  const isDryRun = options['dry-run'] || options['status-only'];

  if (json) {
    const reportData = buildReportData(plan, executionState, {
      json,
      'dry-run': options['dry-run'],
      'status-only': options['status-only'],
      system: options.system,
    }, meta);
    console.log(JSON.stringify(reportData ?? {}, null, 2));
    return;
  }

  const { reset, bright } = COLORS;

  console.log(`\n${bright}=== DS PIPELINE SUMMARY ===${reset}\n`);

  if (isDryRun) {
    console.log(formatDryRunNotice());
  }

  // Orphans report
  const orphanOutput = formatOrphanReport(plan);
  if (orphanOutput) {
    console.log(orphanOutput);
  }

  // Component plan
  console.log(formatComponentPlan(plan));

  // Statistics
  console.log(formatStats(plan, executionState));
  console.log('');

  // Failure/success summary
  if (meta.hasFailures) {
    console.log(formatFailureSummary(meta));
  } else if (!isDryRun) {
    // Only show success message if not in dry-run/status-only mode
    console.log(formatSuccessMessage());
  }

  // Write report file
  if (!isDryRun) {
    const reportDir = resolveSystemContextSafe({ system: options.system }).paths.generated;
    const reportData = buildReportData(plan, executionState, {
      json,
      'dry-run': options['dry-run'],
      'status-only': options['status-only'],
      system: options.system,
    }, meta);
    const reportPath = writeReportFile(reportData, {
      dryRun: options['dry-run'],
      statusOnly: options['status-only'],
      reportDir,
    });
    if (reportPath) {
      console.log(`${COLORS.fgGreen}✅ Report saved to ${reportPath}${COLORS.reset}`);
    }
  }
}

/**
 * CLI entry point
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  runPipeline(process.argv.slice(2))
    .then((report) => {
      if (report.reason === 'help') {
        return;
      }

      process.exitCode = report.ok ? 0 : 1;
    })
    .catch((error) => {
      logger.error(`Pipeline runner failed: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    });
}
