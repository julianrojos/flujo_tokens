/**
 * Render Audit Phase
 *
 * Handles audit of render report structure.
 * Executes audit agent and validates audit report.
 */

import * as path from 'node:path';

import {
  extractJsonObjects,
  normalizeRenderAuditReport,
  type RenderReport,
  type RenderExpectations,
  type RenderAuditReport,
  type RenderAuditValidationResult,
} from './render-report-parser.js';
import { executeAgentPrompt, type AgentExecutionResult } from './agent-execution-phase.js';

export interface BuildRenderAuditPromptOptions {
  figmaUrl?: string;
  targetSectionId: string;
  targetSectionName: string;
  expectedSectionName: string;
  expectedCardCount: number;
  expectedTableCount: number;
}

export interface ExecuteRenderAuditOptions {
  auditPrompt: string;
  agent: 'codex' | 'claude' | 'gemini' | 'auto';
  fileBase: string;
}

export interface RenderAuditResult {
  ok: boolean;
  auditReport: RenderAuditReport;
  outputPath: string;
  rawOutput: string;
}

export interface RenderAuditPhaseResult {
  ok: boolean;
  auditReport: RenderAuditReport;
  outputPath: string;
  rawOutput: string;
  errors?: string[];
}

/**
 * Build audit prompt for render validation.
 */
export function buildRenderAuditPrompt(options: BuildRenderAuditPromptOptions): string {
  const {
    figmaUrl,
    targetSectionId,
    targetSectionName,
    expectedSectionName,
    expectedCardCount,
    expectedTableCount,
  } = options;

  return [
    'Context',
    '- Validate that the Figma documentation section was rendered by the themed markdown renderer (not a fallback renderer).',
    '',
    'Sources',
    figmaUrl ? `- Figma URL (if connection needed): ${figmaUrl}` : '',
    `- Target section id: ${targetSectionId}`,
    `- Target section name from render report: ${targetSectionName}`,
    `- Expected section name: ${expectedSectionName}`,
    `- Expected H2 card count: ${expectedCardCount}`,
    `- Expected table count: ${expectedTableCount}`,
    '',
    'Constraints',
    '- Read-only audit: do not modify any node.',
    '- Use figma_execute to inspect only descendants of the target section id.',
    '- has_doc_canvas: true only if a direct child FRAME named "Doc Canvas" exists.',
    '- card_count: number of descendant FRAME nodes with names starting with "Card/".',
    '- table_container_count: number of descendant FRAME nodes named exactly "Table".',
    '- header_row_count: number of descendant FRAME nodes named exactly "Header Row".',
    '- body_row_count: number of descendant FRAME nodes named exactly "Body Row".',
    "- pass must be true only when the structure is consistent with the expected themed renderer output.",
    '- Return exactly one JSON object and no prose.',
    '',
    'Expected Output',
    '- JSON keys: ok, pass, target_section_id, target_section_name, has_doc_canvas, card_count, table_container_count, header_row_count, body_row_count, reasons.',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Execute render audit agent.
 */
export function executeRenderAudit(options: ExecuteRenderAuditOptions): AgentExecutionResult {
  const { auditPrompt, agent, fileBase } = options;
  return executeAgentPrompt({
    prompt: auditPrompt,
    agent,
    label: `active-md-to-figma-audit-${fileBase}`,
  });
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
export function validateRenderAuditResult(options: {
  auditReport: RenderAuditReport;
  renderReport: RenderReport;
  expectations: RenderExpectations;
}): RenderAuditValidationResult {
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

/**
 * Execute full render audit phase.
 */
export function executeRenderAuditPhase(options: {
  figmaUrl?: string;
  targetSectionId: string;
  targetSectionName: string;
  expectedSectionName: string;
  expectedCardCount: number;
  expectedTableCount: number;
  agent: 'codex' | 'claude' | 'gemini' | 'auto';
  fileBase: string;
  generatedDir: string;
  renderReport: RenderReport;
  expectations: RenderExpectations;
}): RenderAuditPhaseResult {
  const {
    figmaUrl,
    targetSectionId,
    targetSectionName,
    expectedSectionName,
    expectedCardCount,
    expectedTableCount,
    agent,
    fileBase,
    generatedDir,
    renderReport,
    expectations,
  } = options;

  // Build audit prompt
  const auditPrompt = buildRenderAuditPrompt({
    figmaUrl,
    targetSectionId,
    targetSectionName,
    expectedSectionName,
    expectedCardCount,
    expectedTableCount,
  });

  // Execute audit agent
  const auditResponse = executeRenderAudit({
    auditPrompt,
    agent,
    fileBase,
  });

  // Parse audit report
  const auditReport = parseRenderAuditFromOutput(auditResponse.stdout);
  const outputPath = path.resolve(generatedDir, `${fileBase}.render-audit-output.txt`);
  
  if (!auditReport) {
    throw new Error(
      'Unable to parse render structure audit report JSON from agent output.\n' +
      'Expected keys: has_doc_canvas, card_count, table_container_count, header_row_count, body_row_count.\n' +
      `Saved raw audit output: ${outputPath}`,
    );
  }

  // Validate audit report
  const auditValidation = validateRenderAuditResult({
    auditReport,
    renderReport,
    expectations,
  });

  if (!auditValidation.ok) {
    return {
      ok: false,
      auditReport,
      outputPath,
      rawOutput: auditResponse.stdout,
      errors: auditValidation.issues,
    };
  }

  return {
    ok: true,
    auditReport,
    outputPath,
    rawOutput: auditResponse.stdout,
  };
}
