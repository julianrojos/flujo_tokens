/**
 * Agent Runner
 * 
 * Executes AI agent CLI commands (Codex, Claude, Gemini) with automatic
 * agent detection and fallback strategies.
 */

import { spawnSync, type SpawnSyncOptions } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import { commandExists } from "../utils/command-exists.js";
import { logger } from "../utils/logger.js";

/**
 * Agent type identifier.
 */
export type AgentType = "codex" | "claude" | "gemini" | "";

/**
 * Agent prompt execution options.
 */
export interface AgentPromptOptions {
  /** Prompt text to send to the agent. */
  prompt: string;
  /** Explicit agent to use (or 'auto' for auto-detection). */
  agent?: AgentType | "auto";
  /** Label for prompt fallback file naming. */
  label?: string;
  /** Whether to passthrough stdout/stderr to console. */
  passthrough?: boolean;
}

/**
 * Agent prompt execution result.
 */
export interface AgentPromptResult {
  ok: true;
  agent: string;
  command: string;
  args: string[];
  status: number;
  stdout: string;
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
 * Run command with spawnSync.
 */
function run(command: string, args: string[], options: Partial<SpawnSyncOptions> = {}): ReturnType<typeof spawnSync> {
  return spawnSync(command, args, {
    stdio: options.stdio || "inherit",
    cwd: options.cwd || process.cwd(),
    env: options.env || process.env,
  });
}

/**
 * Read stderr buffer as string.
 */
function readStderr(stderrBuffer: Buffer | null | undefined): string {
  if (!stderrBuffer) return "";
  return String(stderrBuffer).toLowerCase();
}

/**
 * Check if error is likely a CLI shape error (unknown option, etc.).
 */
function isLikelyCliShapeError(result: ReturnType<typeof spawnSync>): boolean {
  const stderr = readStderr(result.stderr);
  return (
    stderr.includes("unknown option") ||
    stderr.includes("unrecognized option") ||
    stderr.includes("invalid option") ||
    stderr.includes("usage:")
  );
}

/**
 * Pick agent based on explicit choice or auto-detection.
 */
function pickAgent(explicitAgent: AgentType | "auto" | undefined): AgentType {
  const fromEnv = process.env.DS_AGENT as AgentType | undefined;
  const requested = ((explicitAgent || fromEnv || "auto") as string).toLowerCase();

  if (requested !== "auto") {
    return requested as AgentType;
  }

  if (commandExists("codex")) return "codex";
  if (commandExists("claude")) return "claude";
  if (commandExists("gemini")) return "gemini";
  return "";
}

/**
 * Generate candidate commands for agent execution.
 */
function candidateCommands(agent: AgentType, prompt: string, cwd: string): CandidateCommand[] {
  if (agent === "codex") {
    return [
      {
        command: "codex",
        args: [
          "exec",
          "--full-auto",
          "--ephemeral",
          "-c",
          "mcp_servers.figma-console.startup_timeout_sec=60",
          "-C",
          cwd,
          prompt,
        ],
      },
    ];
  }

  if (agent === "claude") {
    return [
      { command: "claude", args: ["-p", prompt] },
      { command: "claude", args: ["--print", prompt] },
      { command: "claude", args: ["code", "-p", prompt] },
    ];
  }

  if (agent === "gemini") {
    return [
      { command: "gemini", args: ["-p", prompt] },
      { command: "gemini", args: ["--prompt", prompt] },
      { command: "gemini", args: ["chat", "-p", prompt] },
    ];
  }

  return [];
}

/**
 * Write prompt to fallback file for debugging.
 */
function writePromptFallback(prompt: string, label?: string): string {
  const dir = path.resolve("docs/_generated/agent_prompts");
  try {
    fs.mkdirSync(dir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `${label || "prompt"}-${timestamp}.txt`;
    const filePath = path.join(dir, fileName);
    fs.writeFileSync(filePath, `${prompt}\n`, "utf8");
    return filePath;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`writePromptFallback: failed to write fallback prompt: ${message}`);
    return "";
  }
}

/**
 * Run a prompt via agent CLI.
 */
export function runAgentPrompt(options: AgentPromptOptions): AgentPromptResult {
  const { prompt, agent, label, passthrough = true } = options;
  const cwd = process.cwd();
  const selectedAgent = pickAgent(agent || "auto");
  
  logger.debug(
    `runAgentPrompt: selected agent="${selectedAgent || "none"}" (requested="${String(agent || "auto")}").`,
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

  let lastFailure: { candidate: CandidateCommand; result: ReturnType<typeof spawnSync> } | null = null;

  for (const candidate of installedCandidates) {
    logger.debug(
      `runAgentPrompt: trying "${candidate.command} ${candidate.args.join(" ")}"`,
    );
    const result = run(candidate.command, candidate.args, {
      stdio: "pipe",
      cwd,
    });

    if ((result.status ?? 1) === 0) {
      const stdout = result.stdout ? String(result.stdout) : "";
      const stderr = result.stderr ? String(result.stderr) : "";
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
      `runAgentPrompt: candidate failed with status=${String(result.status ?? "unknown")}.`,
    );

    if (isLikelyCliShapeError(result)) {
      continue;
    }

    const stdout = result.stdout ? String(result.stdout) : "";
    const stderr = result.stderr ? String(result.stderr) : "";
    if (passthrough && stdout) process.stdout.write(stdout);
    if (passthrough && stderr) process.stderr.write(stderr);
    throw new Error(
      `Agent command failed: ${candidate.command} ${candidate.args.join(" ")}`,
    );
  }

  const promptPath = writePromptFallback(prompt, label);
  if (lastFailure?.result?.stderr) {
    process.stderr.write(lastFailure.result.stderr);
  }
  throw new Error(
    `Could not run "${selectedAgent}" in non-interactive mode with known flags. Prompt saved at ${promptPath}`,
  );
}
