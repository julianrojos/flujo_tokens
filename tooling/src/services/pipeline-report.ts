/**
 * Design System Pipeline Report Service
 *
 * Core logic for generating pipeline reports.
 * This module contains pure functions for building report data.
 * Console output and file writing are handled by the runner.
 *
 * @see ./runners/pipeline-runner.ts for I/O operations
 */

import type {
  PipelinePlan,
  PipelineExecutionState,
  ReportMeta,
  PipelineOptions,
  PipelineStats,
  PipelineResult,
} from './pipeline-types.js';

/**
 * ANSI color codes for terminal output
 */
export const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  fgGreen: '\x1b[32m',
  fgYellow: '\x1b[33m',
  fgCyan: '\x1b[36m',
  fgRed: '\x1b[31m',
} as const;

/**
 * Build JSON report data (pure function)
 */
export function buildReportData(
  plan: PipelinePlan,
  executionState: PipelineExecutionState,
  options: PipelineOptions,
  meta: ReportMeta,
): PipelineResult {
  return {
    timestamp: new Date().toISOString(),
    success: !meta.hasFailures,
    options,
    orphans: plan.orphans,
    failedComponents: meta.failedComponents,
    executionSummary: {
      ...executionState,
      plan: plan.components,
    },
  };
}

/**
 * Calculate execution statistics from plan
 */
export function calculateStats(
  plan: PipelinePlan,
  executionState?: PipelineExecutionState,
  options?: {
    dryRun?: boolean;
    statusOnly?: boolean;
  },
): PipelineStats {
  const stats: PipelineStats = {
    processed: 0,
    errors: 0,
    skippedCached: 0,
    skippedOnlyStep: 0,
  };

  const isDryRun = options?.dryRun || options?.statusOnly;

  for (const [slug, data] of Object.entries(plan.components)) {
    if (data.orphanStatus) {
      stats.skippedCached++;
      continue;
    }

    const neededSteps = data.steps.filter(s => s.needed);

    if (neededSteps.length === 0) {
      const skippedByOnlyStep = data.steps.some(
        s => s.reason && s.reason.includes('--only-step'),
      );
      if (skippedByOnlyStep) {
        stats.skippedOnlyStep++;
      } else {
        stats.skippedCached++;
      }
    } else {
      const execData = executionState?.components?.[slug];
      if (execData) {
        if (execData.success === false) {
          stats.errors++;
        } else {
          stats.processed++;
        }
      } else {
        // Planned but not executed (dry-run / status-only)
        stats.skippedCached++;
      }
    }
  }

  return stats;
}

/**
 * Format orphan components report lines
 */
export function formatOrphanReport(plan: PipelinePlan): string[] {
  const lines: string[] = [];
  const { bright, fgCyan, fgYellow, fgRed, reset } = COLORS;

  const totalOrphans =
    plan.orphans.figma_only.length +
    plan.orphans.doc_only.length +
    plan.orphans.spec_only.length;

  if (totalOrphans === 0) {
    return lines;
  }

  lines.push(`${bright}⚠️ ORPHAN DETECTIONS (${totalOrphans})${reset}`);

  if (plan.orphans.figma_only.length > 0) {
    lines.push(
      `   ${fgCyan}Figma Only (Needs Spec+Doc):${reset} ${plan.orphans.figma_only.join(', ')}`,
    );
    lines.push(`     ↳ Fix with: npm run ds:spec-from-figma -- --component-name <component>`);
  }

  if (plan.orphans.spec_only.length > 0) {
    lines.push(
      `   ${fgYellow}Spec Only (Needs Doc):${reset} ${plan.orphans.spec_only.join(', ')}`,
    );
    lines.push(`     ↳ Fix with: npm run ds:component-doc -- --component-name <Component>`);
  }

  if (plan.orphans.doc_only.length > 0) {
    lines.push(
      `   ${fgRed}Doc Only (Not in Figma/Unmapped):${reset} ${plan.orphans.doc_only.join(', ')}`,
    );
    lines.push(`     ↳ Fix by: Verifying Figma URL mapping or deleting the component markup.`);
  }

  return lines;
}

/**
 * Format component execution plan lines
 */
export function formatComponentPlan(plan: PipelinePlan): string[] {
  const lines: string[] = [];
  const { bright, fgGreen, fgYellow, fgRed, reset } = COLORS;

  for (const [slug, data] of Object.entries(plan.components)) {
    if (data.orphanStatus) {
      lines.push(`   • ${slug.padEnd(20)} ${fgYellow}[ORPHAN: ${data.orphanStatus}]${reset}`);
    } else {
      const neededSteps = data.steps.filter(s => s.needed).map(s => s.id);
      const blockedSteps = data.steps.filter(s => s.blocked).map(s => s.id);

      const statusLabel =
        neededSteps.length === 0
          ? `${fgGreen}[SYNCED]${reset}`
          : `${fgYellow}[PENDING STEPS]${reset}`;

      const blockedStr =
        blockedSteps.length > 0
          ? ` ${fgRed}(Blocked: ${blockedSteps.join(', ')})${reset}`
          : '';

      const stepsStr =
        neededSteps.length > 0 ? neededSteps.join(' -> ') : 'All good';

      lines.push(`   • ${slug.padEnd(20)} ${statusLabel} -> ${stepsStr}${blockedStr}`);
    }
  }

  return lines;
}

/**
 * Format statistics line
 */
export function formatStats(stats: PipelineStats): string {
  const { bright, reset } = COLORS;
  return `${bright}📊 SUMMARY${reset}   processed: ${stats.processed}   errors: ${stats.errors}   skipped (cached): ${stats.skippedCached}   skipped (only-step): ${stats.skippedOnlyStep}`;
}

/**
 * Format failure summary
 */
export function formatFailureSummary(meta: ReportMeta, isDryRun: boolean): string[] {
  const lines: string[] = [];
  const { bright, fgRed, reset } = COLORS;

  if (meta.hasFailures && !isDryRun) {
    lines.push(`${bright}${fgRed}❌ PIPELINE FINISHED WITH ERRORS${reset}`);
    if (meta.failedComponents.length > 0) {
      lines.push(`   Failed components: ${meta.failedComponents.join(', ')}`);
    }
  }

  return lines;
}

/**
 * Format success message
 */
export function formatSuccessMessage(isDryRun: boolean): string {
  const { bright, fgGreen, reset } = COLORS;

  if (isDryRun) {
    return '';
  }

  return `${bright}${fgGreen}✅ PIPELINE COMPLETED SUCCESSFULLY${reset}\n`;
}

/**
 * Format dry run notice
 */
export function formatDryRunNotice(): string {
  const { fgYellow, reset } = COLORS;
  return `${fgYellow}* DRY/STATUS RUN ONLY - NO CHANGES MADE *${reset}\n`;
}
