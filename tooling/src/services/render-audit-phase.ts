/**
 * Render Audit Phase
 *
 * Orchestrates audit of render report structure.
 * Thin orchestrator that delegates to prompt builder, executor, and parser.
 */

import * as path from 'node:path';

import { executeAgentPrompt, type AgentExecutionResult } from './agent-prompt-execution.js';
import { buildRenderAuditPrompt } from './render-audit-prompt.js';
import {
  parseRenderAuditFromOutput,
  validateRenderAuditResult,
} from './render-audit-parser.js';
import type {
  RenderReport,
  RenderExpectations,
  RenderAuditReport,
} from './render-report-parser.js';
import type { ActiveMdToFigmaRuntimeContext } from '../types/active-md-to-figma.js';
import type { RenderPipelineState, RenderAuditPhaseOutput } from './render-pipeline-state.js';
import type { PhaseResult } from './render-phase.js';

export interface RenderAuditOptions {
  renderReport: RenderReport;
  expectations: RenderExpectations;
}

export interface RenderAuditPhaseResult {
  ok: boolean;
  auditReport: RenderAuditReport;
  outputPath: string;
  rawOutput: string;
  errors?: string[];
}

/**
 * Execute render audit agent.
 */
function executeRenderAudit(
  context: ActiveMdToFigmaRuntimeContext,
  auditPrompt: string,
): AgentExecutionResult {
  return executeAgentPrompt({
    prompt: auditPrompt,
    agent: 'auto', // Default agent for audit
    label: `active-md-to-figma-audit-${context.fileBase}`,
  });
}

/**
 * Execute full render audit phase.
 *
 * Uses runtime context for file paths and configuration.
 */
export function executeRenderAuditPhase(
  context: ActiveMdToFigmaRuntimeContext,
  options: RenderAuditOptions,
): RenderAuditPhaseResult {
  const { renderReport, expectations } = options;

  // Build audit prompt
  const auditPrompt = buildRenderAuditPrompt({
    figmaUrl: context.figmaUrl,
    targetSectionId: String(renderReport.targetSectionId),
    targetSectionName: String(renderReport.targetSectionName),
    expectedSectionName: expectations.expectedSectionName,
    expectedCardCount: expectations.expectedCardCount,
    expectedTableCount: expectations.expectedTableCount,
  });

  // Execute audit agent
  const auditResponse = executeRenderAudit(context, auditPrompt);

  // Parse audit report
  const auditReport = parseRenderAuditFromOutput(auditResponse.stdout);
  const outputPath = path.resolve(context.generatedDir, `${context.fileBase}.render-audit-output.txt`);

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

// ============================================================================
// Phase Wrapper - For functional orchestrator
// ============================================================================

/**
 * Render audit phase function.
 *
 * Reads renderReport and renderExpectations from state,
 * executes audit agent, validates output.
 */
export async function renderAuditPhase(
  context: ActiveMdToFigmaRuntimeContext,
  state: RenderPipelineState,
): Promise<PhaseResult<RenderAuditPhaseOutput>> {
  // Require render report and expectations from previous phases
  if (!state.renderReport) {
    return {
      ok: false,
      error: 'Render audit phase requires renderReport from previous phase',
    };
  }
  if (!state.renderExpectations) {
    return {
      ok: false,
      error: 'Render audit phase requires renderExpectations from previous phase',
    };
  }

  const result = executeRenderAuditPhase(context, {
    renderReport: state.renderReport,
    expectations: state.renderExpectations,
  });

  if (!result.ok) {
    return {
      ok: false,
      error:
        'Render structure audit failed. Themed renderer output is inconsistent; fallback-like render blocked.\n' +
        (result.errors?.map((issue) => `- ${issue}`).join('\n') || 'Unknown audit errors') +
        '\n' +
        `Saved raw audit output: ${result.outputPath}`,
    };
  }

  return {
    ok: true,
    output: {
      auditResult: result,
    },
  };
}
