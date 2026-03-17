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

function hasPathSeparator(value: string): boolean {
  return value.includes("/") || value.includes("\\");
}

function commandPathExists(command: string): boolean {
  const candidate = String(command || "").trim();
  if (!candidate) return false;
  if (path.isAbsolute(candidate) || hasPathSeparator(candidate)) {
    try {
      return fs.existsSync(candidate);
    } catch {
      return false;
    }
  }
  return commandExists(candidate);
}

const AGENT_COMMAND_ALIASES: Record<AgentType, string[]> = {
  codex: ["codex"],
  claude: ["claude", "claude-code"],
  gemini: ["gemini", "gemini-cli"],
  "": [],
};

const AGENT_ENV_PATHS: Record<AgentType, string[]> = {
  codex: ["CODEX_BIN", "DS_CODEX_PATH"],
  claude: ["CLAUDE_BIN", "DS_CLAUDE_PATH"],
  gemini: ["GEMINI_BIN", "DS_GEMINI_PATH"],
  "": [],
};

const CODEX_EXTENSION_FALLBACK_ENV = "DS_ENABLE_CODEX_EXTENSION_FALLBACK";

interface ResolveEnvAgentCommandDeps {
  env?: NodeJS.ProcessEnv;
  commandPathExistsFn?: (command: string) => boolean;
}

interface CodexFallbackLookupDeps extends ResolveEnvAgentCommandDeps {
  homeDir?: string;
  platform?: NodeJS.Platform;
  arch?: string;
  extensionRoots?: string[];
  readDirFn?: (root: string) => Array<{ name: string; isDirectory: () => boolean }>;
  logInfoFn?: (message: string) => void;
}

function resolveEnvAgentCommand(agent: AgentType, deps: ResolveEnvAgentCommandDeps = {}): string {
  const env = deps.env || process.env;
  const commandPathExistsFn = deps.commandPathExistsFn || commandPathExists;
  for (const envKey of AGENT_ENV_PATHS[agent] || []) {
    const fromEnv = String(env[envKey] || "").trim();
    if (fromEnv && commandPathExistsFn(fromEnv)) return fromEnv;
  }
  return "";
}

function envFlagEnabled(value: unknown): boolean {
  const normalized = String(value ?? "").trim().toLowerCase();
  return (
    normalized === "1" ||
    normalized === "true" ||
    normalized === "yes" ||
    normalized === "on"
  );
}

function codexExtensionTargets(platformName: NodeJS.Platform, archName: string): string[] {
  if (platformName === "darwin") {
    return archName === "arm64"
      ? ["macos-aarch64", "darwin-arm64"]
      : ["macos-x64", "darwin-x64"];
  }
  if (platformName === "linux") {
    return archName === "arm64"
      ? ["linux-aarch64", "linux-arm64"]
      : ["linux-x64"];
  }
  if (platformName === "win32") {
    return archName === "arm64"
      ? ["windows-arm64", "win32-arm64"]
      : ["windows-x64", "win32-x64"];
  }
  return [];
}

function codexBinaryNames(platformName: NodeJS.Platform): string[] {
  return platformName === "win32" ? ["codex.exe", "codex"] : ["codex"];
}

function findCodexFallbackCommand(deps: CodexFallbackLookupDeps = {}): string {
  const env = deps.env || process.env;
  const commandPathExistsFn = deps.commandPathExistsFn || commandPathExists;
  const readDirFn =
    deps.readDirFn ||
    ((root: string) => fs.readdirSync(root, { withFileTypes: true }));
  const logInfoFn = deps.logInfoFn || ((message: string) => logger.info(message));

  const fromEnv = resolveEnvAgentCommand("codex", { env, commandPathExistsFn });
  if (fromEnv) return fromEnv;

  if (!envFlagEnabled(env[CODEX_EXTENSION_FALLBACK_ENV])) {
    return "";
  }

  const home = String(deps.homeDir || env.HOME || "").trim();
  if (!home) return "";

  const extensionRoots = deps.extensionRoots || [
    path.join(home, ".antigravity", "extensions"),
    path.join(home, ".vscode", "extensions"),
    path.join(home, ".cursor", "extensions"),
  ];
  const platformName = deps.platform || process.platform;
  const archName = deps.arch || process.arch;
  const platformTargets = codexExtensionTargets(platformName, archName);
  const binaryNames = codexBinaryNames(platformName);

  for (const extensionRoot of extensionRoots) {
    try {
      const entries = readDirFn(extensionRoot);
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (!entry.name.startsWith("openai.chatgpt-")) continue;
        for (const target of platformTargets) {
          for (const binary of binaryNames) {
            const candidate = path.join(
              extensionRoot,
              entry.name,
              "bin",
              target,
              binary,
            );
            if (commandPathExistsFn(candidate)) {
              logInfoFn(
                `agent-runner: using Codex extension fallback (${CODEX_EXTENSION_FALLBACK_ENV}=1): ${candidate}`,
              );
              return candidate;
            }
          }
        }
      }
    } catch {
      // ignore fallback lookup errors per extension root
    }
  }

  return "";
}

export const __agentRunnerTestUtils = Object.freeze({
  envFlagEnabled,
  codexExtensionTargets,
  findCodexFallbackCommand,
});

function resolveAgentCommand(agent: AgentType): string {
  if (!agent) return "";
  for (const alias of AGENT_COMMAND_ALIASES[agent] || []) {
    if (commandExists(alias)) return alias;
  }
  const envCommand = resolveEnvAgentCommand(agent);
  if (envCommand) return envCommand;
  if (agent === "codex") {
    const fallback = findCodexFallbackCommand();
    if (fallback) return fallback;
  }
  return "";
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
  const stderr = readStderr(result.stderr as Buffer | null | undefined);
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

  if (resolveAgentCommand("codex")) return "codex";
  if (resolveAgentCommand("claude")) return "claude";
  if (resolveAgentCommand("gemini")) return "gemini";
  return "";
}

/**
 * Generate candidate commands for agent execution.
 */
function candidateCommands(
  agent: AgentType,
  prompt: string,
  cwd: string,
  preferredCommand: string,
): CandidateCommand[] {
  if (agent === "codex") {
    const command = preferredCommand || "codex";
    return [
      {
        command,
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
    const command = preferredCommand || "claude";
    return [
      { command, args: ["-p", prompt] },
      { command, args: ["--print", prompt] },
      { command, args: ["code", "-p", prompt] },
    ];
  }

  if (agent === "gemini") {
    const command = preferredCommand || "gemini";
    return [
      { command, args: ["-p", prompt] },
      { command, args: ["--prompt", prompt] },
      { command, args: ["chat", "-p", prompt] },
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
  const selectedAgentCommand = selectedAgent ? resolveAgentCommand(selectedAgent) : "";
  
  logger.debug(
    `runAgentPrompt: selected agent="${selectedAgent || "none"}" (requested="${String(agent || "auto")}").`,
  );
  
  if (!selectedAgent || !selectedAgentCommand) {
    const promptPath = writePromptFallback(prompt, label);
    throw new Error(
      `No compatible agent CLI found (codex/claude/gemini). Prompt saved at ${promptPath}`,
    );
  }

  const candidates = candidateCommands(
    selectedAgent,
    prompt,
    cwd,
    selectedAgentCommand,
  );
  if (!candidates.length) {
    const promptPath = writePromptFallback(prompt, label);
    throw new Error(
      `Unsupported agent "${selectedAgent}". Prompt saved at ${promptPath}`,
    );
  }

  const installedCandidates = candidates.filter((candidate) =>
    commandPathExists(candidate.command),
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
