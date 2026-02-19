import { spawnSync } from "node:child_process";

export function commandExists(command) {
  const probe = spawnSync("which", [command], { stdio: "pipe" });
  return (probe.status ?? 1) === 0;
}
