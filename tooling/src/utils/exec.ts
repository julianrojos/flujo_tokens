import { spawnSync, SpawnSyncOptions } from "node:child_process";
import * as path from "node:path";

function formatCommand(command: string, args: readonly string[]): string {
  return [command, ...args].join(" ");
}

function buildSpawnSyncResult(
  command: string,
  args: readonly string[] = [],
  options: Partial<SpawnSyncOptions> = {}
): ReturnType<typeof spawnSync> {
  return spawnSync(command, args, {
    stdio: options.stdio || "inherit",
    cwd: options.cwd || process.cwd(),
    env: options.env || process.env,
    shell: options.shell === true,
    encoding: options.encoding,
  });
}

function findBalancedJsonValueEnd(text: string, startIndex: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = startIndex; index < text.length; index += 1) {
    const ch = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{" || ch === "[") {
      depth += 1;
      continue;
    }
    if (ch === "}" || ch === "]") {
      depth -= 1;
      if (depth === 0) return index;
      continue;
    }
  }

  return -1;
}

export interface JsonParseResult<T = unknown> {
  ok: boolean;
  value?: T;
  error?: string;
}

export function parseJsonFromText<T = unknown>(rawText: string): JsonParseResult<T> {
  const text = String(rawText || "");
  const trimmed = text.trim();
  
  if (!trimmed) {
    return {
      ok: false,
      error: "Empty output. Expected JSON payload.",
    };
  }

  try {
    return { ok: true, value: JSON.parse(trimmed) as T };
  } catch {
    // Continue with tolerant extraction.
  }

  for (let index = 0; index < text.length; index += 1) {
    const ch = text[index];
    if (ch !== "{" && ch !== "[") continue;
    const endIndex = findBalancedJsonValueEnd(text, index);
    if (endIndex < index) continue;
    const candidate = text.slice(index, endIndex + 1);
    try {
      return { ok: true, value: JSON.parse(candidate) as T };
    } catch {
      // Keep scanning.
    }
  }

  return {
    ok: false,
    error: "No valid JSON value found in output.",
  };
}

export interface RunJsonCommandOptions extends Partial<SpawnSyncOptions> {
  displayArgs?: readonly string[];
  allowNonZeroExit?: boolean;
}

export interface RunJsonCommandResult<T = unknown> {
  status: number;
  stdout: string;
  stderr: string;
  data: T;
}

export function shouldUseTsxLoader(scriptPath: string): boolean {
  const extension = path.extname(String(scriptPath || "")).toLowerCase();
  return extension === ".ts" || extension === ".tsx" || extension === ".mts" || extension === ".cts";
}

export function buildNodeScriptCommandArgs(
  scriptPath: string,
  scriptArgs: readonly string[] = [],
): string[] {
  const normalizedScriptPath = String(scriptPath || "").trim();
  const baseArgs = shouldUseTsxLoader(normalizedScriptPath)
    ? ["--import", "tsx", normalizedScriptPath]
    : [normalizedScriptPath];
  return [...baseArgs, ...scriptArgs];
}

export function buildNodeScriptDisplayArgs(
  repoRoot: string,
  scriptPath: string,
  scriptArgs: readonly string[] = [],
): string[] {
  const normalizedScriptPath = String(scriptPath || "").trim();
  const displayPath = repoRoot
    ? path.relative(repoRoot, normalizedScriptPath) || normalizedScriptPath
    : normalizedScriptPath;
  const baseArgs = shouldUseTsxLoader(normalizedScriptPath)
    ? ["--import", "tsx", displayPath]
    : [displayPath];
  return [...baseArgs, ...scriptArgs];
}

export function runJsonCommand<T = unknown>(
  command: string,
  args: readonly string[] = [],
  options: RunJsonCommandOptions = {}
): RunJsonCommandResult<T> {
  const result = buildSpawnSyncResult(command, args, {
    ...options,
    stdio: "pipe",
    encoding: "utf8",
  });
  
  const displayArgs = Array.isArray(options.displayArgs) ? options.displayArgs : args;
  const commandText = formatCommand(command, displayArgs);
  const stdout = String(result.stdout || "");
  const stderr = String(result.stderr || "");

  if (result.error) {
    throw new Error(`Failed to run \`${commandText}\`: ${result.error.message}`);
  }

  const parsed = parseJsonFromText<T>(stdout);
  if (!parsed.ok) {
    throw new Error(
      `Command returned invalid JSON for \`${commandText}\`: ${parsed.error}\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`,
    );
  }

  const status = Number.isInteger(result.status) ? result.status! : 1;
  if (status !== 0 && options.allowNonZeroExit !== true) {
    throw new Error(
      `Command failed (${status}) for \`${commandText}\`\nSTDERR:\n${stderr}\nSTDOUT:\n${stdout}`,
    );
  }

  return {
    status,
    stdout,
    stderr,
    data: parsed.value!,
  };
}

export function runOrThrow(
  command: string,
  args: readonly string[] = [],
  options: Partial<SpawnSyncOptions> = {}
): ReturnType<typeof spawnSync> {
  if (typeof command !== "string" || !command.trim()) {
    throw new Error("Invalid command: expected a non-empty string.");
  }
  if (!Array.isArray(args)) {
    throw new Error("Invalid command arguments: expected an array of strings.");
  }
  for (const arg of args) {
    if (typeof arg !== "string") {
      throw new Error(
        `Invalid command argument for \`${command}\`: ${String(arg)}`,
      );
    }
  }

  const result = buildSpawnSyncResult(command, args, options);

  if (result.error) {
    throw new Error(
      `Failed to run \`${formatCommand(command, args)}\`: ${result.error.message}`,
    );
  }

  if ((result.status ?? 1) !== 0) {
    throw new Error(
      `Command failed (${result.status}): ${formatCommand(command, args)}`,
    );
  }

  return result;
}
