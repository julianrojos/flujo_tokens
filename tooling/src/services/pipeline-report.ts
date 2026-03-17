/**
 * Pipeline Report
 *
 * Generate execution report for documentation pipeline.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { resolveSystemContextSafe, type ScriptSystemContext } from '../utils/system-context.js';
import type { PipelinePlan } from './pipeline-plan.js';

export interface ExecutionState {
  components?: Record<string, { success?: boolean }>;
}

export interface ReportMeta {
  hasFailures?: boolean;
  failedComponents?: string[];
}

export interface ReportOptions {
  json?: boolean;
  'dry-run'?: boolean;
  'status-only'?: boolean;
  system?: string;
  dsContext?: ScriptSystemContext;
  [key: string]: unknown;
}

// ANSI color codes for backward compatibility with pipeline-runner.ts
export const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  fgGreen: '\x1b[32m',
  fgYellow: '\x1b[33m',
  fgCyan: '\x1b[36m',
  fgRed: '\x1b[31m',
} as const;

/**
 * Build report data object for JSON export.
 */
export function buildReportData(
  plan: PipelinePlan,
  executionState: ExecutionState,
  options: ReportOptions,
  meta: ReportMeta
): Record<string, unknown> {
  const { hasFailures = false, failedComponents = [] } = meta;
  return {
    timestamp: new Date().toISOString(),
    success: !hasFailures,
    options,
    orphans: plan.orphans,
    failedComponents,
    executionSummary: {
      ...executionState,
      plan: plan.components,
    },
  };
}

/**
 * Format orphan report section.
 */
export function formatOrphanReport(plan: PipelinePlan): string {
  const totalOrphans =
    plan.orphans.figma_only.length + plan.orphans.doc_only.length + plan.orphans.spec_only.length;
  if (totalOrphans === 0) return '';

  const reset = '\x1b[0m';
  const bright = '\x1b[1m';
  const fgGreen = '\x1b[32m';
  const fgYellow = '\x1b[33m';
  const fgCyan = '\x1b[36m';
  const fgRed = '\x1b[31m';

  let output = `${bright}⚠️ ORPHAN DETECTIONS (${totalOrphans})${reset}\n`;
  if (plan.orphans.figma_only.length > 0) {
    output += `   ${fgCyan}Figma Only (Needs Spec+Doc):${reset} ${plan.orphans.figma_only.join(', ')}\n`;
    output += `     ↳ Fix with: npm run ds:spec-from-figma -- --component-name <component>\n`;
  }
  if (plan.orphans.spec_only.length > 0) {
    output += `   ${fgYellow}Spec Only (Needs Doc):${reset} ${plan.orphans.spec_only.join(', ')}\n`;
    output += `     ↳ Fix with: npm run ds:component-doc -- --component-name <Component>\n`;
  }
  if (plan.orphans.doc_only.length > 0) {
    output += `   ${fgRed}Doc Only (Not in Figma/Unmapped):${reset} ${plan.orphans.doc_only.join(', ')}\n`;
    output += `     ↳ Fix by: Verifying Figma URL mapping or deleting the component markup.\n`;
  }
  return output + '\n';
}

/**
 * Format component plan section.
 */
export function formatComponentPlan(plan: PipelinePlan): string {
  const reset = '\x1b[0m';
  const bright = '\x1b[1m';
  const fgGreen = '\x1b[32m';
  const fgYellow = '\x1b[33m';
  const fgRed = '\x1b[31m';

  let output = `${bright}📦 COMPONENT EXECUTION PLAN${reset}\n`;
  for (const [slug, data] of Object.entries(plan.components)) {
    if (data.orphanStatus) {
      output += `   • ${slug.padEnd(20)} ${fgYellow}[ORPHAN: ${data.orphanStatus}]${reset}\n`;
    } else {
      const neededSteps = data.steps.filter((s) => s.needed).map((s) => s.id);
      const blockedSteps = data.steps.filter((s) => s.blocked).map((s) => s.id);
      const statusLabel =
        neededSteps.length === 0 ? `${fgGreen}[SYNCED]${reset}` : `${fgYellow}[PENDING STEPS]${reset}`;
      const blockedStr =
        blockedSteps.length > 0 ? ` ${fgRed}(Blocked: ${blockedSteps.join(', ')})${reset}` : '';
      output += `   • ${slug.padEnd(20)} ${statusLabel} -> ${neededSteps.length > 0 ? neededSteps.join(' -> ') : 'All good'}${blockedStr}\n`;
    }
  }
  return output + '\n';
}

/**
 * Format stats section.
 */
export function formatStats(plan: PipelinePlan, executionState: ExecutionState): string {
  const reset = '\x1b[0m';
  const bright = '\x1b[1m';

  let stats = { processed: 0, errors: 0, skippedCached: 0, skippedOnlyStep: 0 };
  for (const [slug, data] of Object.entries(plan.components)) {
    if (data.orphanStatus) {
      stats.skippedCached++;
      continue;
    }
    const neededSteps = data.steps.filter((s) => s.needed);
    if (neededSteps.length === 0) {
      const skippedByOnlyStep = data.steps.some(
        (s) => s.reason && s.reason.includes('Filtered by --only-step')
      );
      if (skippedByOnlyStep) {
        stats.skippedOnlyStep++;
      } else {
        stats.skippedCached++;
      }
    } else {
      const execData = executionState?.components?.[slug];
      if (execData) {
        execData.success === false ? (stats.errors += 1) : (stats.processed += 1);
      } else {
        stats.skippedCached++; // planned but not executed (dry-run / status-only)
      }
    }
  }

  return `${bright}📊 SUMMARY${reset}   processed: ${stats.processed}   errors: ${stats.errors}   skipped (cached): ${stats.skippedCached}   skipped (only-step): ${stats.skippedOnlyStep}\n`;
}

/**
 * Format failure summary.
 */
export function formatFailureSummary(meta: ReportMeta): string {
  const { hasFailures = false, failedComponents = [] } = meta;
  const reset = '\x1b[0m';
  const bright = '\x1b[1m';
  const fgRed = '\x1b[31m';

  if (!hasFailures) return '';

  let output = `${bright}${fgRed}❌ PIPELINE FINISHED WITH ERRORS${reset}\n`;
  if (failedComponents.length > 0) {
    output += `   Failed components: ${failedComponents.join(', ')}\n`;
  }
  return output + '\n';
}

/**
 * Format success message.
 */
export function formatSuccessMessage(): string {
  const reset = '\x1b[0m';
  const bright = '\x1b[1m';
  const fgGreen = '\x1b[32m';
  return `${bright}${fgGreen}✅ PIPELINE COMPLETED SUCCESSFULLY${reset}\n\n`;
}

/**
 * Format dry run notice.
 */
export function formatDryRunNotice(): string {
  const reset = '\x1b[0m';
  const bright = '\x1b[1m';
  const fgYellow = '\x1b[33m';
  return `${bright}${fgYellow}* DRY/STATUS RUN ONLY - NO CHANGES MADE *${reset}\n\n`;
}

/**
 * Generate pipeline execution report.
 */
export function generateReport(
  plan: PipelinePlan,
  executionState: ExecutionState = {},
  options: ReportOptions = {},
  meta: ReportMeta = {}
): void {
  const isDryRun = options['dry-run'] || options['status-only'];
  const { hasFailures = false, failedComponents = [] } = meta;

  // ANSI colors for console output (declared at function scope for all blocks)
  const reset = '\x1b[0m';
  const bright = '\x1b[1m';
  const fgGreen = '\x1b[32m';
  const fgYellow = '\x1b[33m';
  const fgCyan = '\x1b[36m';
  const fgRed = '\x1b[31m';

  if (options.json) {
    console.log(JSON.stringify(buildReportData(plan, executionState, options, meta), null, 2));
    return;
  }

  console.log(`\n${bright}=== DS PIPELINE SUMMARY ===${reset}\n`);

  if (isDryRun) {
    console.log(formatDryRunNotice());
  }

  // Orphans report
  const orphanOutput = formatOrphanReport(plan);
  if (orphanOutput) {
    console.log(orphanOutput);
  }

  // Component Execution Plan Summary
  console.log(formatComponentPlan(plan));

  // Stats
  console.log(formatStats(plan, executionState));
  console.log('');

  // Failure or success summary
  if (hasFailures && !isDryRun) {
    console.log(formatFailureSummary(meta));
  } else if (!isDryRun) {
    console.log(formatSuccessMessage());
  }

  // Next actions
  if (!isDryRun && (executionState?.components && Object.keys(executionState.components).length > 0)) {
    const stats = { processed: 0, errors: 0 };
    for (const execData of Object.values(executionState.components)) {
      execData.success === false ? (stats.errors += 1) : (stats.processed += 1);
    }
    if (stats.errors > 0 || stats.processed > 0) {
      console.log(`${bright}📝 NEXT ACTIONS${reset}`);
      if (stats.errors > 0) {
        console.log(`   ${fgRed}• Review errors above and fix failing components${reset}`);
      }
      if (stats.processed > 0) {
        console.log(
          `${fgGreen}• Commit changes: git add docs/ && git commit -m "docs: update components"${reset}`
        );
      }
      console.log('');
    }
  }

  // Write report to disk (unless dry-run)
  if (!isDryRun) {
    try {
      // Use provided dsContext or resolve from options.system
      const ctx = options.dsContext || resolveSystemContextSafe({ system: options.system });
      const reportDir = ctx.paths.generated;
      if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });

      const reportPath = path.join(reportDir, 'pipeline-report.json');
      fs.writeFileSync(reportPath, JSON.stringify(buildReportData(plan, executionState, options, meta), null, 2));
      console.log(`${fgGreen}✅ Report saved to ${reportPath}${reset}`);
    } catch (err) {
      console.warn(`[Report] Warning: Could not write report to disk: ${err}`);
    }
  }
}
