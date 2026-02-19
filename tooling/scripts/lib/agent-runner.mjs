import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { commandExists } from "./command-exists.mjs";

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    stdio: options.stdio || "inherit",
    cwd: options.cwd || process.cwd(),
    env: options.env || process.env,
  });
}

function readStderr(stderrBuffer) {
  if (!stderrBuffer) return "";
  return String(stderrBuffer).toLowerCase();
}

function isLikelyCliShapeError(result) {
  const stderr = readStderr(result.stderr);
  return (
    stderr.includes("unknown option") ||
    stderr.includes("unrecognized option") ||
    stderr.includes("invalid option") ||
    stderr.includes("usage:")
  );
}

function pickAgent(explicitAgent) {
  const fromEnv = process.env.DS_AGENT;
  const requested = (explicitAgent || fromEnv || "auto").toLowerCase();

  if (requested !== "auto") {
    return requested;
  }

  if (commandExists("codex")) return "codex";
  if (commandExists("claude")) return "claude";
  if (commandExists("gemini")) return "gemini";
  return "";
}

function candidateCommands(agent, prompt, cwd) {
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

function writePromptFallback(prompt, label) {
  const dir = path.resolve("docs/_generated/agent_prompts");
  fs.mkdirSync(dir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `${label || "prompt"}-${timestamp}.txt`;
  const filePath = path.join(dir, fileName);
  fs.writeFileSync(filePath, `${prompt}\n`, "utf8");
  return filePath;
}

export function runAgentPrompt({ prompt, agent, label }) {
  const cwd = process.cwd();
  const selectedAgent = pickAgent(agent);
  if (!selectedAgent) {
    const promptPath = writePromptFallback(prompt, label);
    throw new Error(
      `No compatible agent CLI found (codex/claude/gemini). Prompt saved at ${promptPath}`
    );
  }

  const candidates = candidateCommands(selectedAgent, prompt, cwd);
  if (!candidates.length) {
    const promptPath = writePromptFallback(prompt, label);
    throw new Error(
      `Unsupported agent "${selectedAgent}". Prompt saved at ${promptPath}`
    );
  }

  const installedCandidates = candidates.filter((candidate) =>
    commandExists(candidate.command)
  );
  if (!installedCandidates.length) {
    const promptPath = writePromptFallback(prompt, label);
    throw new Error(
      `Agent "${selectedAgent}" is not installed. Prompt saved at ${promptPath}`
    );
  }

  let lastFailure = null;

  for (const candidate of installedCandidates) {
    const result = run(candidate.command, candidate.args, {
      stdio: "pipe",
      cwd,
    });

    if ((result.status ?? 1) === 0) {
      if (result.stdout) process.stdout.write(result.stdout);
      if (result.stderr) process.stderr.write(result.stderr);
      return {
        ok: true,
        agent: selectedAgent,
        command: candidate.command,
        args: candidate.args,
      };
    }

    lastFailure = { candidate, result };

    if (isLikelyCliShapeError(result)) {
      continue;
    }

    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    throw new Error(
      `Agent command failed: ${candidate.command} ${candidate.args.join(" ")}`
    );
  }

  const promptPath = writePromptFallback(prompt, label);
  if (lastFailure?.result?.stderr) {
    process.stderr.write(lastFailure.result.stderr);
  }
  throw new Error(
    `Could not run "${selectedAgent}" in non-interactive mode with known flags. Prompt saved at ${promptPath}`
  );
}
