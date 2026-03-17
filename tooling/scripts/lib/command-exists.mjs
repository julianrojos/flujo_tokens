import { spawnSync } from "node:child_process";

const COMMAND_EXISTS_CACHE = new Map();
const COMMAND_EXISTS_CACHE_MAX_AGE_MS = 5_000;

export function commandExists(command) {
  const key = String(command || "").trim();
  if (!key) return false;
  const cached = COMMAND_EXISTS_CACHE.get(key);
  if (cached) {
    const age = Date.now() - cached.checkedAt;
    if (age < COMMAND_EXISTS_CACHE_MAX_AGE_MS) {
      return cached.exists;
    }
    COMMAND_EXISTS_CACHE.delete(key);
  }

  const probe = spawnSync("which", [key], { stdio: "pipe" });
  const exists = (probe.status ?? 1) === 0;
  COMMAND_EXISTS_CACHE.set(key, { exists, checkedAt: Date.now() });
  return exists;
}
