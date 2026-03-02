/**
 * Render Audit Parser
 *
 * Parses and validates render audit reports from agent output.
 */

import {
  extractJsonObjects,
  normalizeRenderAuditReport,
  type RenderReport,
  type RenderExpectations,
  type RenderAuditReport,
  type RenderAuditValidationResult,
} from './render-report-parser.js';

export interface ParseRenderAuditFromOutputResult {
  auditReport: RenderAuditReport | null;
  rawText: string;
}

export interface ValidateRenderAuditOptions {
  auditReport: RenderAuditReport;
  renderReport: RenderReport;
  expectations: RenderExpectations;
}

/**
 * Parse audit report from agent output.
 */
export function parseRenderAuditFromOutput(rawText: string): RenderAuditReport | null {
  const candidates = extractJsonObjects(rawText);
  if (candidates.length === 0) return null;

  const withAuditKeys = candidates.filter((candidate) =>
    Object.prototype.hasOwnProperty.call(candidate, 'has_doc_canvas') ||
    Object.prototype.hasOwnProperty.call(candidate, 'hasDocCanvas') ||
    Object.prototype.hasOwnProperty.call(candidate, 'card_count') ||
    Object.prototype.hasOwnProperty.call(candidate, 'cardCount'),
  );
  const selected =
    withAuditKeys.length > 0
      ? withAuditKeys[withAuditKeys.length - 1]
      : candidates[candidates.length - 1];
  return normalizeRenderAuditReport(selected);
}

/**
 * Validate render audit report.
 */
export function validateRenderAuditResult(options: ValidateRenderAuditOptions): RenderAuditValidationResult {
  const { auditReport, renderReport, expectations } = options;
  const issues: string[] = [];

  if (!auditReport.pass) {
    issues.push('Audit report did not pass structural validation.');
  }
  if (!auditReport.hasDocCanvas) {
    issues.push('Missing direct "Doc Canvas" frame in rendered section.');
  }
  if (auditReport.cardCount == null || auditReport.cardCount < expectations.expectedCardCount) {
    issues.push(
      `Card count below expected H2 sections (expected >= ${expectations.expectedCardCount}, got ${auditReport.cardCount}).`,
    );
  }
  if (
    expectations.expectedSectionName &&
    auditReport.targetSectionName &&
    String(auditReport.targetSectionName) !== String(expectations.expectedSectionName)
  ) {
    issues.push(
      `Section name mismatch (expected "${expectations.expectedSectionName}", got "${auditReport.targetSectionName}").`,
    );
  }
  if (expectations.expectedTableCount > 0) {
    if (
      auditReport.tableContainerCount == null ||
      auditReport.tableContainerCount < expectations.expectedTableCount
    ) {
      issues.push(
        `Table container count below expected tables (expected >= ${expectations.expectedTableCount}, got ${auditReport.tableContainerCount}).`,
      );
    }
    if (
      auditReport.headerRowCount == null ||
      auditReport.headerRowCount < expectations.expectedTableCount
    ) {
      issues.push(
        `Header row count below expected tables (expected >= ${expectations.expectedTableCount}, got ${auditReport.headerRowCount}).`,
      );
    }
  }

  return {
    ok: issues.length === 0,
    issues,
  };
}
