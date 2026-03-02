/**
 * Render Agent Phase
 *
 * Executes render agent and validates output.
 * Reads from pipeline state, produces render report and expectations.
 */

import * as path from 'node:path';

import { executeAgentPrompt } from './agent-prompt-execution.js';
import { readRenderExpectations } from './render-expectations.js';
import {
  parseRenderReportFromOutput,
  validateRenderReport,
  validatePrimaryRenderReport,
  type RenderReport,
  type RenderReportValidationResult,
  type RenderExpectations,
} from './render-report-parser.js';
import type { ActiveMdToFigmaRuntimeContext } from '../types/active-md-to-figma.js';
import type { RenderPipelineState, RenderAgentPhaseOutput } from './render-pipeline-state.js';
import type { PhaseResult } from './render-phase.js';
import { RenderArtifactManager } from './render-artifacts.js';
import { logger } from '../utils/logger.js';

/**
 * Options for render agent phase.
 */
export interface RenderAgentPhaseOptions {
  artifactManager: RenderArtifactManager;
  agent: 'codex' | 'claude' | 'gemini' | 'auto';
}

/**
 * Build render prompt for agent execution.
 */
function buildRenderPrompt(options: {
  figmaUrl?: string;
  markdownPath: string;
  executePath: string;
  offsetX: number;
}): string {
  const { figmaUrl, markdownPath, executePath, offsetX } = options;

  return [
    'Context',
    '- Render markdown documentation into a Figma section using generated script artifacts.',
    '',
    'Sources',
    figmaUrl ? `- Figma URL (if connection needed): ${figmaUrl}` : '',
    `- Markdown source: ${markdownPath}`,
    `- Generated figma_execute script: ${path.resolve(executePath)}`,
    '',
    'Constraints',
    '- Read the generated figma_execute script from disk.',
    '- Execute that exact script with figma_execute (no reimplementation, no manual fallback rendering).',
    `- Keep section idempotent and place it ${String(offsetX)}px to the right of the component section.`,
    '- Do not alter unrelated components/sections.',
    '- Report unsupported markdown blocks if any.',
    '- Return exactly one JSON object and no prose.',
    '',
    'Expected Output',
    '- JSON keys: target_section_id, target_section_name, offset_x_applied, theme_name, unsupported_blocks_count, component_set_id, component_section_id, rendered_count.',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Factory to create render agent phase with options.
 *
 * Returns a phase function with standard (context, state) signature.
 */
export function createRenderAgentPhase(
  options: RenderAgentPhaseOptions,
): (
  context: ActiveMdToFigmaRuntimeContext,
  state: RenderPipelineState,
) => Promise<PhaseResult<RenderAgentPhaseOutput>> {
  return async function renderAgentPhase(
    context: ActiveMdToFigmaRuntimeContext,
    state: RenderPipelineState,
  ): Promise<PhaseResult<RenderAgentPhaseOutput>> {
    const { artifactManager, agent } = options;

    // Require pipeline to have executed
    if (!state.pipeline) {
      return {
        ok: false,
        error: 'Render agent phase requires pipeline to have executed first',
      };
    }

    const { paths } = state.pipeline;

    // Read render expectations from payload
    let renderExpectations: RenderExpectations;
    try {
      renderExpectations = readRenderExpectations({
        payloadPath: paths.payloadPath,
        componentName: context.componentName,
      });
    } catch (error) {
      return {
        ok: false,
        error: `Failed to read render expectations: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    // Build render prompt
    const prompt = buildRenderPrompt({
      figmaUrl: context.figmaUrl,
      markdownPath: context.markdownPath,
      executePath: paths.executePath,
      offsetX: context.offsetX,
    });

    // Execute render agent
    const agentResponse = executeAgentPrompt({
      prompt,
      agent,
      label: `active-md-to-figma-${context.fileBase}`,
    });

    // Parse render report
    const renderReport = parseRenderReportFromOutput(agentResponse.stdout);
    if (!renderReport) {
      artifactManager.writeRenderAgentOutput(agentResponse.stdout);
      return {
        ok: false,
        error:
          'Unable to parse render report JSON from agent output.\n' +
          `Expected keys: target_section_id, target_section_name, offset_x_applied, theme_name.\n` +
          `Saved raw agent output: ${artifactManager.getArtifactPaths().renderAgentOutputPath}`,
      };
    }

    // Validate render report
    const reportValidation: RenderReportValidationResult = validateRenderReport({
      report: renderReport,
      expectedThemeName: context.expectedThemeName,
      expectedOffsetX: context.offsetX,
      force: context.force,
    });

    if (!reportValidation.ok) {
      artifactManager.writeRenderAgentOutput(agentResponse.stdout);
      return {
        ok: false,
        error:
          'Render report validation failed.\n' +
          reportValidation.errors.map((issue) => `- ${issue}`).join('\n') +
          '\n' +
          `Saved raw agent output: ${artifactManager.getArtifactPaths().renderAgentOutputPath}`,
      };
    }

    // Log warnings from validation
    for (const warning of reportValidation.warnings) {
      logger.warn(warning);
    }

    // Validate primary render report against expectations
    const primaryReportValidation = validatePrimaryRenderReport({
      renderReport,
      expectations: renderExpectations,
    });
    if (!primaryReportValidation.ok) {
      artifactManager.writeRenderAgentOutput(agentResponse.stdout);
      return {
        ok: false,
        error:
          'Render report failed strict primary validation.\n' +
          primaryReportValidation.issues.map((issue) => `- ${issue}`).join('\n') +
          '\n' +
          `Saved raw agent output: ${artifactManager.getArtifactPaths().renderAgentOutputPath}`,
      };
    }

    return {
      ok: true,
      output: {
        renderExpectations,
        renderReport,
      },
    };
  };
}
