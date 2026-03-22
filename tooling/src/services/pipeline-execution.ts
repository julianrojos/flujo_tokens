/**
 * Pipeline Execution
 *
 * I/O operations for pipeline execution: command spawning, task execution, report writing.
 * Separated from orchestration logic for testability.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { PROJECT_ROOT } from '../utils/system-context.js';
import type { PipelineOptions, PipelineExecutionState, ComponentExecutionMetrics, PipelineStepId } from './pipeline-types.js';
import { COLORS } from './pipeline-report.js';

// ============================================================================
// Type Definitions
// ============================================================================

export interface RunCommandOptions {
  silent?: boolean;
  dryRun?: boolean;
}

export interface WriteReportOptions {
  dryRun?: boolean;
  statusOnly?: boolean;
  reportDir: string;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Run a global command (e.g., npm run generate:registry)
 */
export function runGlobalCommand(
  message: string,
  cmd: string,
  args: string[],
  options: RunCommandOptions = {},
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
 * Execute tasks for a single component.
 * 
 * Iterates through the given component's execution plan steps and spawns child
 * processes based on each step's instructions. Tracks success metrics for the run.
 *
 * @param componentPlan - Execution plan for a single component containing ordered steps.
 * @param options - Pipeline options including context, dry-run flags, and strict mode.
 * @returns Execution metrics containing successes and failure paths.
 */
export function executeComponentTasks(
  componentPlan: {
    slug: string;
    steps: Array<{
      id: string;
      needed: boolean;
      blocked: boolean;
    }>;
  },
  options: PipelineOptions,
): ComponentExecutionMetrics {
  const { slug, steps } = componentPlan;
  const { json, strict, system } = options;
  const dryRun = options['dry-run'] ?? false;

  const metrics: ComponentExecutionMetrics = {
    success: true,
    executedSteps: [],
    failedSteps: [],
  };

  const sysArgs = system ? ['--', '--system', system] : [];

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
export function writeReportFile(
  reportData: Record<string, unknown>,
  options: WriteReportOptions,
): string | null {
  const isDryRun = options.dryRun || options.statusOnly;

  if (isDryRun) {
    return null;
  }

  try {
    if (!fs.existsSync(options.reportDir)) {
      fs.mkdirSync(options.reportDir, { recursive: true });
    }

    const reportPath = path.join(options.reportDir, 'pipeline-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(reportData, null, 2), 'utf8');

    return reportPath;
  } catch (err) {
    console.error(
      `${COLORS.fgRed}Failed to write JSON report: ${(err as Error).message}${COLORS.reset}`,
    );
    return null;
  }
}
