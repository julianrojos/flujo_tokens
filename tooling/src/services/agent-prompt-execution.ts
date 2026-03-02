/**
 * Agent Prompt Execution
 *
 * Handles agent prompt execution for rendering and audit.
 *
 * Note: This is a technical module (not a phase), renamed from agent-execution-phase.ts
 * to reflect its role as a prompt execution utility.
 */

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
