import { spawnSync } from "node:child_process";

interface CommandExistsCacheEntry {
  exists: boolean;
  checkedAt: number;
}

const COMMAND_EXISTS_CACHE = new Map<string, CommandExistsCacheEntry>();
const COMMAND_EXISTS_CACHE_MAX_AGE_MS = 5_000;

/**
 * Check if a command exists in the system PATH.
 * Uses 'which' on Unix-like systems and 'where' on Windows.
 * Results are cached for 5 seconds to avoid repeated spawnSync calls.
 */
export function commandExists(command: string): boolean {
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

  // Use platform-specific command: 'which' on Unix, 'where' on Windows
  const isWindows = process.platform === "win32";
  const probe = spawnSync(isWindows ? "where" : "which", [key], { stdio: "pipe" });
  const exists = (probe.status ?? 1) === 0;
  COMMAND_EXISTS_CACHE.set(key, { exists, checkedAt: Date.now() });
  return exists;
}
