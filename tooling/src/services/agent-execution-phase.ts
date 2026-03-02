/**
 * Agent Execution Phase
 *
 * Handles agent prompt execution for rendering and audit.
 * Delegates parsing and validation to render-report-parser.
 */

import {
  extractJsonObjects,
  normalizeRenderReport,
  parseRenderReportFromOutput,
  validateRenderReport,
  validatePrimaryRenderReport,
} from './render-report-parser.js';
import type {
  RenderReport,
  RenderReportValidationResult,
  RenderExpectations,
} from '../types/render-report.js';
import { runAgentPrompt, type AgentPromptResult } from './agent-runner.js';

export interface AgentExecutionOptions {
  prompt: string;
  agent: 'codex' | 'claude' | 'gemini' | 'auto';
  label: string;
  passthrough?: boolean;
}

export interface AgentExecutionResult {
  stdout: string;
  stderr: string;
  raw: AgentPromptResult;
}

/**
 * Execute agent prompt and return output.
 */
export function executeAgentPrompt(options: AgentExecutionOptions): AgentExecutionResult {
  const { prompt, agent, label, passthrough = false } = options;
  const raw = runAgentPrompt({
    prompt,
    agent,
    label,
    passthrough,
  });
  return {
    stdout: raw.stdout,
    stderr: raw.stderr,
    raw,
  };
}

// Re-export types and functions for backwards compatibility
export {
  extractJsonObjects,
  normalizeRenderReport,
  parseRenderReportFromOutput,
  validateRenderReport,
  validatePrimaryRenderReport,
  type RenderReport,
  type RenderReportValidationResult,
  type RenderExpectations,
};
