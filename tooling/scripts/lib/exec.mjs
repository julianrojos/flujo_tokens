import { spawnSync } from "node:child_process";

function formatCommand(command, args) {
  return [command, ...args].join(" ");
}

function buildSpawnSyncResult(command, args = [], options = {}) {
  return spawnSync(command, args, {
    stdio: options.stdio || "inherit",
    cwd: options.cwd || process.cwd(),
    env: options.env || process.env,
    shell: options.shell === true,
    encoding: options.encoding,
  });
}

function findBalancedJsonValueEnd(text, startIndex) {
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
      if (ch === "\"") {
        inString = false;
      }
      continue;
    }

    if (ch === "\"") {
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

export function parseJsonFromText(rawText) {
  const text = String(rawText || "");
  const trimmed = text.trim();
  if (!trimmed) {
    return {
      ok: false,
      error: "Empty output. Expected JSON payload.",
    };
  }

  try {
    return { ok: true, value: JSON.parse(trimmed) };
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
      return { ok: true, value: JSON.parse(candidate) };
    } catch {
      // Keep scanning.
    }
  }

  return {
    ok: false,
    error: "No valid JSON value found in output.",
  };
}

export function runJsonCommand(command, args = [], options = {}) {
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

  const parsed = parseJsonFromText(stdout);
  if (!parsed.ok) {
    throw new Error(
      `Command returned invalid JSON for \`${commandText}\`: ${parsed.error}\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`,
    );
  }

  const status = Number.isInteger(result.status) ? result.status : 1;
  if (status !== 0 && options.allowNonZeroExit !== true) {
    throw new Error(
      `Command failed (${status}) for \`${commandText}\`\nSTDERR:\n${stderr}\nSTDOUT:\n${stdout}`,
    );
  }

  return {
    status,
    stdout,
    stderr,
    data: parsed.value,
  };
}

export function runOrThrow(command, args = [], options = {}) {
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
