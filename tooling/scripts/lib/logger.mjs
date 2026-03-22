const LEVELS = new Map([
  ["debug", 10],
  ["info", 20],
  ["warn", 30],
  ["error", 40],
  ["silent", 99],
]);

function normalizeLevel(rawLevel) {
  const normalized = String(rawLevel || "")
    .trim()
    .toLowerCase();
  return LEVELS.has(normalized) ? normalized : "info";
}

function currentLevel() {
  return normalizeLevel(process.env.LOG_LEVEL || "info");
}

function shouldLog(level) {
  const target = LEVELS.get(level) ?? LEVELS.get("info");
  const active = LEVELS.get(currentLevel()) ?? LEVELS.get("info");
  return target >= active;
}

function write(level, message) {
  if (!shouldLog(level)) return;
  const line = `[${level.toUpperCase()}] ${String(message || "")}\n`;
  if (level === "error" || level === "warn") {
    process.stderr.write(line);
    return;
  }
  process.stdout.write(line);
}

export const logger = {
  debug(message) {
    write("debug", message);
  },
  info(message) {
    write("info", message);
  },
  warn(message) {
    write("warn", message);
  },
  error(message) {
    write("error", message);
  },
};
