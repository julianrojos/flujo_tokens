import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ensureLocalDatabaseReady,
  resolveDashboardDatabaseUrl,
  shouldSkipDatabasePreflight,
} from "./dev-db.mjs";

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const serverCommand = [
  "--env-file-if-exists=.env",
  "--import",
  "tsx",
  "server/index.ts",
];

let childProcess = null;
let shuttingDown = false;

function shutdown(code = 0, signal = null) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (childProcess && !childProcess.killed) {
    try {
      childProcess.kill(signal || "SIGTERM");
    } catch {
      // ignore
    }
  }
  if (!childProcess) {
    process.exit(code);
  }
}

process.on("SIGINT", () => shutdown(130, "SIGINT"));
process.on("SIGTERM", () => shutdown(143, "SIGTERM"));

async function main() {
  try {
    const databaseUrl = resolveDashboardDatabaseUrl(process.env);
    if (!shouldSkipDatabasePreflight(process.env)) {
      const dbReady = await ensureLocalDatabaseReady({
        databaseUrl,
        logger: console,
      });

      if (!dbReady.ok) {
        const detail =
          dbReady.error instanceof Error
            ? dbReady.error.message
            : dbReady.error
              ? String(dbReady.error)
              : dbReady.probe.message || "unknown error";
        console.error(
          `[dev-api] PostgreSQL is not ready at ${databaseUrl}: ${detail}`,
        );
        process.exit(1);
      }
    }

    childProcess = spawn(process.execPath, serverCommand, {
      cwd: packageRoot,
      stdio: "inherit",
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        TEST_DATABASE_URL: process.env.TEST_DATABASE_URL || databaseUrl,
        NODE_ENV: process.env.NODE_ENV || "development",
        DS_DASHBOARD_SUPERVISED: "1",
      },
    });

    childProcess.on("exit", (code, signal) => {
      if (shuttingDown) {
        process.exit(code ?? (signal ? 1 : 0));
        return;
      }
      if (typeof code === "number") {
        process.exit(code);
        return;
      }
      if (signal) {
        process.exit(signal === "SIGINT" ? 130 : 143);
        return;
      }
      process.exit(1);
    });

    childProcess.on("error", (error) => {
      console.error("[dev-api] Failed to start dashboard API:", error);
      process.exit(1);
    });
  } catch (error) {
    console.error("[dev-api] Fatal error:", error);
    process.exit(1);
  }
}

void main();
