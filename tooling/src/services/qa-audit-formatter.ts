/**
 * QA Audit Formatter
 *
 * Formats audit results for console output.
 */

import type { QaAuditResult, AuditFinding } from '../types/qa-audit.js';

/**
 * Format audit results for console output.
 */
export function formatAuditReport(result: QaAuditResult): string {
  const lines: string[] = [];

  lines.push('');
  lines.push('╔══════════════════════════════════════════════════════════╗');
  lines.push('║           DESIGN SYSTEM QA AUDIT REPORT                 ║');
  lines.push('╚══════════════════════════════════════════════════════════╝');
  lines.push('');
  lines.push(`Timestamp: ${result.timestamp}`);
  lines.push('');
  lines.push('┌──────────────────────────────────────────────────────────┐');
  lines.push('│ SUMMARY                                                  │');
  lines.push('└──────────────────────────────────────────────────────────┘');
  lines.push(`  Total findings: ${result.summary.totalFindings}`);
  lines.push(`  Errors:   ${result.summary.errors}`);
  lines.push(`  Warnings: ${result.summary.warnings}`);
  lines.push(`  Info:     ${result.summary.info}`);
  lines.push('');

  if (result.findings.length === 0) {
    lines.push('✅ No issues found!');
    return lines.join('\n');
  }

  // Group findings by category
  const byCategory: Record<string, AuditFinding[]> = {};
  for (const finding of result.findings) {
    if (!byCategory[finding.category]) {
      byCategory[finding.category] = [];
    }
    byCategory[finding.category].push(finding);
  }

  // Output by category
  const categoryOrder = ['coverage', 'freshness', 'completeness', 'integrity'];
  const categoryTitles: Record<string, string> = {
    coverage: 'COVERAGE',
    freshness: 'FRESHNESS',
    completeness: 'COMPLETENESS',
    integrity: 'INTEGRITY',
  };

  for (const category of categoryOrder) {
    const categoryFindings = byCategory[category] || [];
    if (categoryFindings.length === 0) continue;

    lines.push(`┌──────────────────────────────────────────────────────────┐`);
    lines.push(`│ ${categoryTitles[category]}`.padEnd(59) + '│');
    lines.push(`└──────────────────────────────────────────────────────────┘`);

    for (const finding of categoryFindings) {
      const severityIcon = {
        error: '❌',
        warning: '⚠️',
        info: 'ℹ️',
      }[finding.severity];

      lines.push('');
      lines.push(`  ${severityIcon} [${finding.id}] ${finding.title}`);
      lines.push(`     Location: ${finding.location}`);
      lines.push(`     ${finding.message}`);
      if (finding.suggestion) {
        lines.push(`     → ${finding.suggestion}`);
      }
    }

    lines.push('');
  }

  return lines.join('\n');
}
