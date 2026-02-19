import { spawnSync } from "node:child_process";

function formatCommand(command, args) {
  return [command, ...args].join(" ");
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

  const result = spawnSync(command, args, {
    stdio: options.stdio || "inherit",
    cwd: options.cwd || process.cwd(),
    env: options.env || process.env,
  });

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
