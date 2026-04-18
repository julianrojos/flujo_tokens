/**
 * Pipeline Execution
 *
 * I/O operations for pipeline execution: global command execution and report writing.
 * Separated from orchestration logic for testability.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { PROJECT_ROOT } from '../utils/system-context.js';
import type {
  PipelineOptions,
  ComponentExecutionMetrics,
  PipelineStepId,
} from './pipeline-types.js';
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
 * Evaluate tasks for a single component.
 *
 * The CLI-driven per-step execution path is retired. We now only mark
 * unsupported steps as failed so callers can report actionable status.
 *
 * @param componentPlan - Execution plan for a single component containing ordered steps.
 * @param options - Pipeline options (used for output mode).
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
  const { json, strict } = options;

  const metrics: ComponentExecutionMetrics = {
    success: true,
    executedSteps: [],
    failedSteps: [],
  };

  for (const step of steps) {
    if (!step.needed || step.blocked) {
      continue;
    }

    if (!json) {
      console.log(`\n\x1b[35m--- ${slug}: Executing step ${step.id} ---\x1b[0m`);
    }

    switch (step.id) {
      case 'spec':
        // Spec generation would go here
        continue;
      case 'markdown':
        // Markdown generation via component-doc has been retired.
        metrics.failedSteps.push(step.id as PipelineStepId);
        metrics.success = false;
        if (!json) {
          console.warn(
            `   Markdown step is no longer executed here; update the docs entry in the dashboard instead.`,
          );
        }
        if (strict) {
          break;
        }
        continue;
      default:
        continue;
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
