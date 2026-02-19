import { spawnSync } from "node:child_process";

const COMMAND_EXISTS_CACHE = new Map();

export function commandExists(command) {
  const key = String(command || "").trim();
  if (!key) return false;
  if (COMMAND_EXISTS_CACHE.has(key)) {
    return COMMAND_EXISTS_CACHE.get(key);
  }

  const probe = spawnSync("which", [key], { stdio: "pipe" });
  const exists = (probe.status ?? 1) === 0;
  COMMAND_EXISTS_CACHE.set(key, exists);
  return exists;
}
