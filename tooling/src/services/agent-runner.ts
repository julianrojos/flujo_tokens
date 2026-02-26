/**
 * Agent Runner
 *
 * Executes prompts via agent CLI tools (codex, claude, gemini).
 * Handles agent auto-detection, command construction, and fallback strategies.
 */

import { spawnSync, SpawnSyncReturns } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { PROJECT_ROOT } from '../utils/index.js';
import { commandExists } from '../utils/command-exists.js';
import { logger } from '../utils/logger.js';

/**
 * Agent type identifier.
 */
export type AgentType = 'codex' | 'claude' | 'gemini' | 'auto';

/**
 * Agent prompt execution options.
 */
export interface AgentPromptOptions {
  /** Prompt text to send to the agent. */
  prompt: string;
  /** Explicit agent to use (or 'auto' for auto-detection). */
  agent?: AgentType;
  /** Label for prompt fallback file naming. */
  label?: string;
  /** Whether to passthrough stdout/stderr to console. */
  passthrough?: boolean;
}

/**
 * Agent prompt execution result.
 */
export interface AgentPromptResult {
  /** Whether the command succeeded. */
  ok: boolean;
  /** Agent that was used. */
  agent: string;
  /** Command that was executed. */
  command: string;
  /** Arguments passed to the command. */
  args: string[];
  /** Exit status code. */
  status: number;
  /** Standard output. */
  stdout: string;
  /** Standard error. */
  stderr: string;
}

/**
 * Candidate command configuration.
 */
interface CandidateCommand {
  command: string;
  args: string[];
}

/**
 * Run a command with spawnSync.
 */
function run(
  command: string,
  args: string[],
  options: { stdio?: string | string[]; cwd?: string; env?: NodeJS.ProcessEnv } = {},
): SpawnSyncReturns<Buffer> {
  return spawnSync(command, args, {
    stdio: options.stdio || 'inherit',
    cwd: options.cwd || process.cwd(),
    env: options.env || process.env,
  });
}

/**
 * Read stderr buffer as lowercase string.
 */
function readStderr(stderrBuffer: Buffer | null | undefined): string {
  if (!stderrBuffer) return '';
  return String(stderrBuffer).toLowerCase();
}

/**
 * Check if result indicates a CLI shape/option error.
 */
function isLikelyCliShapeError(result: SpawnSyncReturns<Buffer>): boolean {
  const stderr = readStderr(result.stderr);
  return (
    stderr.includes('unknown option') ||
    stderr.includes('unrecognized option') ||
    stderr.includes('invalid option') ||
    stderr.includes('usage:')
  );
}

/**
 * Pick the best available agent based on explicit request or environment.
 */
function pickAgent(explicitAgent: AgentType | undefined): string {
  const fromEnv = process.env.DS_AGENT;
  const requested = (explicitAgent || fromEnv || 'auto').toLowerCase() as AgentType;

  if (requested !== 'auto') {
    return requested;
  }

  // Auto-detection order: codex → claude → gemini
  if (commandExists('codex')) return 'codex';
  if (commandExists('claude')) return 'claude';
  if (commandExists('gemini')) return 'gemini';
  return '';
}

/**
 * Candidate command variants per agent.
 */
const AGENT_COMMAND_VARIANTS: Record<string, (prompt: string, cwd: string) => CandidateCommand[]> = {
  codex: (prompt, cwd) => [
    {
      command: 'codex',
      args: [
        'exec',
        '--full-auto',
        '--ephemeral',
        '-c',
        'mcp_servers.figma-console.startup_timeout_sec=60',
        '-C',
        cwd,
        prompt,
      ],
    },
  ],
  claude: (prompt) => [
    { command: 'claude', args: ['-p', prompt] },
    { command: 'claude', args: ['--print', prompt] },
    { command: 'claude', args: ['code', '-p', prompt] },
  ],
  gemini: (prompt) => [
    { command: 'gemini', args: ['-p', prompt] },
    { command: 'gemini', args: ['--prompt', prompt] },
    { command: 'gemini', args: ['chat', '-p', prompt] },
  ],
};

/**
 * Generate candidate commands for a given agent and prompt.
 */
function candidateCommands(agent: string, prompt: string, cwd: string): CandidateCommand[] {
  const generator = AGENT_COMMAND_VARIANTS[agent];
  return generator ? generator(prompt, cwd) : [];
}

/**
 * Write prompt to fallback file for debugging.
 */
export function writePromptFallback(prompt: string, label?: string): string {
  const dir = path.resolve(PROJECT_ROOT, 'docs/_generated/agent_prompts');
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (error) {
    logger.warn(
      `Could not create prompt fallback directory (${dir}): ${error instanceof Error ? error.message : String(error)}`,
    );
    return '';
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `${label || 'prompt'}-${timestamp}.txt`;
  const filePath = path.join(dir, fileName);
  fs.writeFileSync(filePath, `${prompt}\n`, 'utf8');
  return filePath;
}

/**
 * Run a prompt via agent CLI.
 *
 * @param options - Prompt execution options.
 * @returns Result of the agent execution.
 * @throws Error if no agent is available or command fails.
 */
export function runAgentPrompt(options: AgentPromptOptions): AgentPromptResult {
  const { prompt, agent, label, passthrough = true } = options;
  const cwd = process.cwd();
  const selectedAgent = pickAgent(agent);

  logger.debug(
    `runAgentPrompt: selected agent="${selectedAgent || 'none'}" (requested="${String(agent || 'auto')}").`,
  );

  if (!selectedAgent) {
    const promptPath = writePromptFallback(prompt, label);
    throw new Error(
      `No compatible agent CLI found (codex/claude/gemini). Prompt saved at ${promptPath}`,
    );
  }

  const candidates = candidateCommands(selectedAgent, prompt, cwd);
  if (!candidates.length) {
    const promptPath = writePromptFallback(prompt, label);
    throw new Error(
      `Unsupported agent "${selectedAgent}". Prompt saved at ${promptPath}`,
    );
  }

  const installedCandidates = candidates.filter((candidate) =>
    commandExists(candidate.command),
  );

  logger.debug(
    `runAgentPrompt: ${installedCandidates.length}/${candidates.length} candidate command variants available for "${selectedAgent}".`,
  );

  if (!installedCandidates.length) {
    const promptPath = writePromptFallback(prompt, label);
    throw new Error(
      `Agent "${selectedAgent}" is not installed. Prompt saved at ${promptPath}`,
    );
  }

  let lastFailure: { candidate: CandidateCommand; result: SpawnSyncReturns<Buffer> } | null = null;

  for (const candidate of installedCandidates) {
    logger.debug(
      `runAgentPrompt: trying "${candidate.command} ${candidate.args.join(' ')}"`,
    );

    const result = run(candidate.command, candidate.args, {
      stdio: 'pipe',
      cwd,
    });

    if ((result.status ?? 1) === 0) {
      const stdout = result.stdout ? String(result.stdout) : '';
      const stderr = result.stderr ? String(result.stderr) : '';

      if (passthrough && stdout) process.stdout.write(stdout);
      if (passthrough && stderr) process.stderr.write(stderr);

      return {
        ok: true,
        agent: selectedAgent,
        command: candidate.command,
        args: candidate.args,
        status: Number(result.status ?? 0),
        stdout,
        stderr,
      };
    }

    lastFailure = { candidate, result };
    logger.debug(
      `runAgentPrompt: candidate failed with status=${String(result.status ?? 'unknown')}.`,
    );

    // If it's a CLI shape error, try next candidate
    if (isLikelyCliShapeError(result)) {
      continue;
    }

    // For other errors, output and throw
    const stdout = result.stdout ? String(result.stdout) : '';
    const stderr = result.stderr ? String(result.stderr) : '';

    if (passthrough && stdout) process.stdout.write(stdout);
    if (passthrough && stderr) process.stderr.write(stderr);

    throw new Error(
      `Agent command failed: ${candidate.command} ${candidate.args.join(' ')}`,
    );
  }

  // All candidates failed
  const promptPath = writePromptFallback(prompt, label);

  if (lastFailure?.result?.stderr) {
    process.stderr.write(lastFailure.result.stderr);
  }

  throw new Error(
    `Could not run "${selectedAgent}" in non-interactive mode with known flags. Prompt saved at ${promptPath}`,
  );
}
