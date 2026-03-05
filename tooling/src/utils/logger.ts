import type { LogLevel } from "./logger-types.js";

const LEVELS = new Map<LogLevel, number>([
  ["debug", 10],
  ["info", 20],
  ["warn", 30],
  ["error", 40],
  ["silent", 99],
]);

/**
 * Normalize a raw log level string to a valid LogLevel.
 */
function normalizeLevel(rawLevel: unknown): LogLevel {
  const normalized = String(rawLevel || "")
    .trim()
    .toLowerCase() as LogLevel;
  return LEVELS.has(normalized) ? normalized : "info";
}

/**
 * Get the current log level from environment variable.
 */
function currentLevel(): LogLevel {
  return normalizeLevel(process.env.LOG_LEVEL || "info");
}

/**
 * Check if a message should be logged at the given level.
 */
function shouldLog(level: LogLevel): boolean {
  const target = LEVELS.get(level) ?? LEVELS.get("info") ?? 20;
  const active = LEVELS.get(currentLevel()) ?? LEVELS.get("info") ?? 20;
  return target >= active;
}

/**
 * Write a log message to stdout or stderr.
 */
function write(level: LogLevel, message: string): void {
  if (!shouldLog(level)) return;
  const line = `[${level.toUpperCase()}] ${String(message || "")}\n`;
  if (level === "error" || level === "warn") {
    process.stderr.write(line);
    return;
  }
  process.stdout.write(line);
}

export const logger = {
  debug(message: string): void {
    write("debug", message);
  },
  info(message: string): void {
    write("info", message);
  },
  warn(message: string): void {
    write("warn", message);
  },
  error(message: string): void {
    write("error", message);
  },
};

// Note: LogLevel type is exported from index.ts to centralize re-exports
// Import via: import { LogLevel } from "./index.js"
