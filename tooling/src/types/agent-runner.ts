/**
 * Type definitions for agent runner module.
 */

/**
 * Agent type identifier.
 */
export type AgentType = "codex" | "claude" | "gemini" | "";

/**
 * Options for running agent prompt.
 */
export interface RunAgentPromptOptions {
  /**
   * Prompt text to execute.
   */
  prompt: string;
  /**
   * Agent type (codex/claude/gemini/auto).
   */
  agent?: AgentType | "auto";
  /**
   * Label for fallback prompt file.
   */
  label?: string;
  /**
   * Passthrough stdout/stderr to console.
   */
  passthrough?: boolean;
}

/**
 * Result of running agent prompt.
 */
export interface RunAgentPromptResult {
  ok: true;
  agent: AgentType;
  command: string;
  args: string[];
  status: number;
  stdout: string;
  stderr: string;
}

/**
 * Candidate command for agent execution.
 */
export interface AgentCommandCandidate {
  command: string;
  args: string[];
}
