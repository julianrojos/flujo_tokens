#!/usr/bin/env node

/**
 * Design System Pipeline Runner
 *
 * I/O operations and CLI entry point for the pipeline orchestrator.
 * This module handles filesystem operations, external command execution,
 * and orchestrates the pure logic from ./services/pipeline.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

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

import type {
  PipelineOptions,
  PipelineExecutionState,
  GlobalExecutionState,
  ComponentExecutionMetrics,
  PipelineStepId,
} from '../services/pipeline-types.js';

const CLI_CONFIG = {
  command: 'ds:pipeline [options]',
  description: 'Orchestrate the full Design System documentation pipeline.',
  options: [
    { name: '--component', description: 'Target specific component slug (e.g. alert)' },
    { name: '--all', description: 'Process all components' },
    {
      name: '--from-step',
      description:
        'Start from specific step. Canonical: spec|markdown|render|proof. Legacy aliases: figma=render, visual-proof=proof',
    },
    {
      name: '--only-step',
      description:
        'Execute only a specific step. Canonical: spec|markdown|render|proof. Legacy aliases: figma=render, visual-proof=proof',
    },
    { name: '--render-figma', description: 'Render docs back to Figma' },
    { name: '--dry-run', description: 'Plan but do not execute' },
    { name: '--status-only', description: 'Only show plan and orphan status' },
    { name: '--strict', description: 'Fail on first error' },
    { name: '--system', description: 'Target design system (default: iter)' },
    { name: '--json', description: 'Output silent JSON' },
    { name: '--help', description: 'Show help' },
  ],
};

/**
 * Run preflight checks using ds:doctor
 */
async function runPreflight(options: PipelineOptions): Promise<boolean> {
  const { json, system } = options;
  const FATAL_PREFLIGHT_CHECKS = new Set([
    'PATH_DOCS',
    'PATH_SPECS',
    'TOKEN_REGISTRY',
    'COMPONENT_REGISTRY',
  ]);

  const registryExists = fs.existsSync(
    path.join(PROJECT_ROOT, 'docs', '_generated', 'component-registry.json'),
  );

  if (!options['status-only'] || !registryExists) {
    if (!json) {
      console.log('\n\x1b[35m=== RUNNING PREFLIGHT (ds:doctor) ===\x1b[0m');
    }

    // Capture doctor output by temporarily redirecting stdout
    const originalStdoutWrite = process.stdout.write;
    const originalStderrWrite = process.stderr.write;
    let stdout = '';
    let stderr = '';

    process.stdout.write = function (chunk: any, ...args: any[]) {
      stdout += chunk?.toString() || '';
      return true;
    };
    process.stderr.write = function (chunk: any, ...args: any[]) {
      stderr += chunk?.toString() || '';
      return true;
    };

    try {
      // Build args for doctor
      const doctorArgs: string[] = [];
      if (system) {
        doctorArgs.push('--system', system);
      }
      doctorArgs.push('--json');

      // Run doctor directly (not via spawn)
      try {
        await runDoctor(doctorArgs);
      } catch (error) {
        // Doctor exits with code 1 on failures - that's expected
        // We'll parse the JSON output to check results
      }

      // Restore stdout/stderr
      process.stdout.write = originalStdoutWrite;
      process.stderr.write = originalStderrWrite;

      // Parse JSON output
      let doctorChecks: any[] = [];
      if (stdout) {
        try {
          const doctorReport = JSON.parse(stdout);
          doctorChecks = Array.isArray(doctorReport.checks) ? doctorReport.checks : [];
        } catch {
          // Ignore parse errors
        }
      }

      const fatalFailures = doctorChecks.filter(
        (c) => FATAL_PREFLIGHT_CHECKS.has(c.id) && c.status === 'fail',
      );

      if (fatalFailures.length > 0) {
        if (!json) {
          console.error('\x1b[31m❌ Preflight failed on core checks:\x1b[0m');
          for (const c of fatalFailures) {
            console.error(`   • ${c.id}: ${c.message}`);
          }
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
    } catch (error) {
      // Restore stdout/stderr on error
      process.stdout.write = originalStdoutWrite;
      process.stderr.write = originalStderrWrite;

      if (!json) {
        console.error(
          '\x1b[31m❌ Preflight failed: unable to run ds:doctor.\x1b[0m',
        );
        console.error(error instanceof Error ? error.message : String(error));
      }
      return false;
    }
  }

  return true;
}

/**
 * Run a global command (e.g., npm run generate:registry)
 */
function runGlobalCommand(
  message: string,
  cmd: string,
  args: string[],
  options: {
    silent?: boolean;
    dryRun?: boolean;
  } = {},
): boolean {
  const { silent = false, dryRun = false } = options;

  if (!silent) {
    console.log(`\x1b[36m[SYS] ${message}\x1b[0m`);
  }

  if (dryRun) {
    if (!silent) {
      console.log(`   (Dry Run: Skipping ${cmd} ${args.join(' ')})`);
    }
    return true;
  }

  const res = spawnSync(cmd, args, {
    stdio: silent ? 'pipe' : 'inherit',
    shell: false,
    cwd: PROJECT_ROOT,
  });

  return res.status === 0;
}

/**
 * Execute tasks for a single component
 */
function executeComponentTasks(
  componentPlan: any,
  options: PipelineOptions,
): ComponentExecutionMetrics {
  const { slug, steps } = componentPlan;
  const { dryRun, json, strict } = options;

  const metrics: ComponentExecutionMetrics = {
    success: true,
    executedSteps: [],
    failedSteps: [],
  };

  const sysArgs = options.system ? ['--', '--system', options.system] : [];

  for (const step of steps) {
    if (!step.needed || step.blocked) {
      continue;
    }

    if (!json) {
      console.log(`\n\x1b[35m--- ${slug}: Executing step ${step.id} ---\x1b[0m`);
    }

    let cmd: string;
    let stepArgs: string[];

    switch (step.id) {
      case 'spec':
        // Spec generation would go here
        continue;
      case 'markdown':
        cmd = 'npm';
        stepArgs = ['run', 'ds:component-doc', ...sysArgs, '--', '--component-name', slug];
        break;
      case 'render':
        cmd = 'npm';
        stepArgs = ['run', 'ds:active-md-to-figma', ...sysArgs, '--', '--component-name', slug];
        break;
      case 'proof':
        cmd = 'npm';
        stepArgs = ['run', 'ds:capture-visual-proof', ...sysArgs, '--', '--component-name', slug];
        break;
      default:
        continue;
    }

    const result = spawnSync(cmd, stepArgs, {
      stdio: json ? 'pipe' : 'inherit',
      shell: false,
      cwd: PROJECT_ROOT,
    });

    if (result.status === 0) {
      metrics.executedSteps.push(step.id as PipelineStepId);
    } else {
      metrics.failedSteps.push(step.id as PipelineStepId);
      metrics.success = false;

      if (strict && !dryRun) {
        if (!json) {
          console.error(
            `\n\x1b[31m❌ Strict mode: Aborting due to failure in '${slug}' at step '${step.id}'.\x1b[0m`,
          );
        }
        break;
      }
    }
  }

  return metrics;
}

/**
 * Write report to file
 */
function writeReportFile(
  reportData: any,
  options: PipelineOptions,
): string | null {
  const isDryRun = options['dry-run'] || options['status-only'];

  if (isDryRun) {
    return null;
  }

  try {
    const ctx = resolveSystemContextSafe({ system: options.system });
    const reportDir = ctx.paths.generated;

    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }

    const reportPath = path.join(reportDir, 'pipeline-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(reportData, null, 2), 'utf8');

    return reportPath;
  } catch (err) {
    console.error(
      `${COLORS.fgRed}Failed to write JSON report: ${(err as Error).message}${COLORS.reset}`,
    );
    return null;
  }
}

/**
 * Main runner function
 */
export async function runPipeline(args: string[] = []): Promise<void> {
  const parsed = parseArgs(args);

  if (parsed.help) {
    printUsage(CLI_CONFIG);
    process.exit(0);
  }

  const options: PipelineOptions = {
    component: parsed.component,
    all: parsed.all === 'true' || !!parsed.all,
    'from-step': parsed['from-step'],
    'only-step': parsed['only-step'],
    'render-figma': parsed['render-figma'] === 'true' || !!parsed['render-figma'],
    'dry-run': parsed['dry-run'] === 'true' || !!parsed['dry-run'],
    'status-only': parsed['status-only'] === 'true' || !!parsed['status-only'],
    strict: parsed.strict === 'true' || !!parsed.strict,
    system: parsed.system,
    json: parsed.json === 'true' || !!parsed.json,
  };

  const { json } = options;

  if (!json) {
    console.log('\n\x1b[1m🚀 STARTING DS-PIPELINE ORCHESTRATOR\x1b[0m');
  }

  // Run preflight checks
  const preflightOk = await runPreflight(options);
  if (!preflightOk) {
    process.exit(1);
  }

  // Create plan
  if (!json) {
    console.log('\n\x1b[35m=== PHASE 1: PLANNING ===\x1b[0m');
  }

  const plan = createPlan(options);

  // Status-only mode
  if (options['status-only']) {
    printReport(plan, {}, options, { hasFailures: false, failedComponents: [] });
    process.exit(0);
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
    process.exit(1);
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
    process.exit(1);
  }
}

/**
 * Print pipeline report
 */
function printReport(
  plan: any,
  executionState: PipelineExecutionState,
  options: PipelineOptions,
  meta: { hasFailures: boolean; failedComponents: string[] },
): void {
  const { json } = options;
  const isDryRun = options['dry-run'] || options['status-only'];

  if (json) {
    const reportData = buildReportData(plan, executionState, options, meta);
    console.log(JSON.stringify(reportData, null, 2));
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
    const reportData = buildReportData(plan, executionState, options, meta);
    const reportPath = writeReportFile(reportData, options);
    if (reportPath) {
      console.log(`${COLORS.fgGreen}✅ Report saved to ${reportPath}${COLORS.reset}`);
    }
  }
}

/**
 * CLI entry point
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  runPipeline(process.argv.slice(2)).catch((error) => {
    logger.error('Pipeline runner failed:', error);
    process.exit(1);
  });
}
