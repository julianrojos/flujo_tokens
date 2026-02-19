import { spawnSync } from "node:child_process";

function formatCommand(command, args) {
  return [command, ...args].join(" ");
}

export function runOrThrow(command, args = [], options = {}) {
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
