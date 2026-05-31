import { execFile, spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ensureLocalDatabaseReady, resolveDashboardDatabaseUrl } from "./dev-db.mjs";
import { classifyApiPort, resolveApiRuntimeConfig } from "./dev-supervisor.mjs";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(packageRoot, "..", "..");
const processes = [];
let shuttingDown = false;
const PREVIEW_HOST = "127.0.0.1";
const DEFAULT_PREVIEW_PORT = 4173;

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function mergeCommaSeparatedValues(...values) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    for (const entry of String(value || "").split(",")) {
      const normalized = entry.trim();
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      result.push(normalized);
    }
  }
  return result.join(", ");
}

async function resolvePreviewPort(
  startPort = DEFAULT_PREVIEW_PORT,
  host = PREVIEW_HOST,
  maxAttempts = 20,
) {
  for (let offset = 0; offset < maxAttempts; offset += 1) {
    const port = startPort + offset;
    if (await isPortAvailable(port, host)) {
      return port;
    }
  }
  throw new Error(
    `No free preview port found starting at ${startPort} (checked ${maxAttempts} ports).`,
  );
}

function killTree(signal) {
  for (const child of processes) {
    if (!child || child.exitCode !== null || child.killed) continue;
    try {
      child.kill(signal);
    } catch {
      // ignore
    }
  }
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  killTree("SIGTERM");

  setTimeout(() => {
    killTree("SIGKILL");
    process.exit(code);
  }, 1_500);
}

function startManagedProcess(command, args, extraEnv = {}) {
  const child = spawn(command, args, {
    cwd: packageRoot,
    stdio: "inherit",
    shell: false,
    env: {
      ...process.env,
      ...extraEnv,
    },
  });
  processes.push(child);
  child.on("exit", (code) => {
    if (shuttingDown) return;
    shutdown(typeof code === "number" ? code : 1);
  });
  return child;
}

function isPortAvailable(port, host) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once("error", () => {
      resolve(false);
    });
    probe.once("listening", () => {
      probe.close(() => resolve(true));
    });
    probe.listen(port, host);
  });
}

async function waitForServer(url, timeoutMs = 10_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      if (response.ok) return true;
    } catch {
      // ignore while waiting for startup
    }
    await sleep(250);
  }
  return false;
}

function runNpmScript(scriptName, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn("npm", ["run", scriptName], {
      cwd: packageRoot,
      stdio: "inherit",
      shell: false,
      env: {
        ...process.env,
        ...extraEnv,
      },
    });
    child.on("exit", (code) => {
      if (typeof code === "number" && code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `${scriptName} failed with exit code ${typeof code === "number" ? code : "unknown"}.`,
        ),
      );
    });
  });
}

function execFileAsync(file, args) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { encoding: "utf8" }, (error, stdout, stderr) => {
      if (error) {
        reject({ error, stdout, stderr });
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

async function listListeningPids(port) {
  try {
    const { stdout } = await execFileAsync("lsof", [
      "-t",
      `-iTCP:${port}`,
      "-sTCP:LISTEN",
    ]);
    return String(stdout || "")
      .split(/\s+/)
      .map((row) => row.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function terminatePids(pids, signal, waitMs = 0) {
  for (const pid of pids) {
    const numericPid = Number.parseInt(String(pid), 10);
    if (!Number.isFinite(numericPid) || numericPid <= 0) continue;
    try {
      process.kill(numericPid, signal);
    } catch {
      // Ignore dead or inaccessible processes.
    }
  }
  if (waitMs > 0) {
    await sleep(waitMs);
  }
}

async function restartExistingApi(runtimeConfig) {
  const pids = await listListeningPids(runtimeConfig.port);
  if (pids.length === 0) {
    console.log(
      `[split-preview] Dashboard API is already running at ${runtimeConfig.apiBaseUrl}, but no PID could be resolved. Reusing the running API.`,
    );
    return false;
  }

  console.log(
    `[split-preview] Restarting existing dashboard API on port ${runtimeConfig.port} (PIDs: ${pids.join(", ")}).`,
  );
  await terminatePids(pids, "SIGTERM", 600);
  const remaining = await listListeningPids(runtimeConfig.port);
  if (remaining.length > 0) {
    await terminatePids(remaining, "SIGKILL", 250);
  }
  return true;
}

export function backendAllowedOrigins(previewOrigin, previewPort) {
  return mergeCommaSeparatedValues(
    process.env.DS_DASHBOARD_ALLOWED_ORIGINS,
    previewOrigin,
    `http://localhost:${previewPort}`,
  );
}

async function main() {
  try {
    const runtimeConfig = resolveApiRuntimeConfig(process.env);
    const databaseUrl = resolveDashboardDatabaseUrl(process.env);
    const previewPort = await resolvePreviewPort();
    const previewUrl = `http://${PREVIEW_HOST}:${previewPort}`;

    const portStatus = await classifyApiPort(runtimeConfig);
    if (portStatus.kind === "occupied") {
      console.error(
        `[split-preview] Port ${runtimeConfig.port} is already in use. Stop the existing API or set DS_DASHBOARD_API_PORT to another free port before running preview:split.`,
      );
      process.exit(1);
    }

    const dbReady = await ensureLocalDatabaseReady({
      databaseUrl,
      logger: console,
    });
    if (!dbReady.ok) {
      if (dbReady.error) {
        console.error(
          `[split-preview] Could not prepare the local PostgreSQL database: ${
            dbReady.error instanceof Error
              ? dbReady.error.message
              : String(dbReady.error)
          }`,
        );
      }
      const { probe } = dbReady;
      console.error(
        `[split-preview] PostgreSQL is not reachable at ${databaseUrl} (${probe.code || "UNKNOWN"}). Start it with npm run db:up, or set DATABASE_URL to a reachable database before running preview:split.`,
      );
      process.exit(1);
    }

    console.log(
      `[split-preview] Building frontend against ${runtimeConfig.apiBaseUrl}...`,
    );
    await runNpmScript("build", {
      VITE_API_URL: runtimeConfig.apiBaseUrl,
    });

    const restartedApi = await restartExistingApi(runtimeConfig);
    if (restartedApi) {
      const readyAfterStop = await waitForServer(runtimeConfig.apiHealthUrl, 2_000);
      if (readyAfterStop) {
        console.log(
          `[split-preview] Existing dashboard API on ${runtimeConfig.apiBaseUrl} did not stop in time. Stop it manually or set DS_DASHBOARD_API_PORT to a free port before running preview:split.`,
        );
        process.exit(1);
      }
    } else {
      console.log(
        `[split-preview] No running dashboard API detected on ${runtimeConfig.apiBaseUrl}; starting a fresh instance.`,
      );
    }

    const backendEnv = {
      DATABASE_URL: databaseUrl,
      TEST_DATABASE_URL: process.env.TEST_DATABASE_URL || databaseUrl,
      NODE_ENV: "production",
      DS_DASHBOARD_SUPERVISED: "1",
      DS_DASHBOARD_API_URL: runtimeConfig.apiBaseUrl,
      DS_DASHBOARD_API_PORT: String(runtimeConfig.port),
      DS_DASHBOARD_API_HOST: runtimeConfig.host,
      DS_DASHBOARD_ALLOWED_ORIGINS: backendAllowedOrigins(previewUrl, previewPort),
    };

    startManagedProcess(
      process.execPath,
      ["--env-file-if-exists=.env", "--import", "tsx", "server/index.ts"],
      backendEnv,
    );

    const ready = await waitForServer(runtimeConfig.apiHealthUrl, 10_000);
    if (!ready) {
      console.error(
        `[split-preview] API server not ready at ${runtimeConfig.apiHealthUrl}`,
      );
      shutdown(1);
      return;
    }

    const viteBin = path.resolve(repoRoot, "node_modules", "vite", "bin", "vite.js");
    if (!fs.existsSync(viteBin)) {
      throw new Error(
        `vite binary not found at ${viteBin}. Run npm install from the repository root before starting preview:split.`,
      );
    }

    startManagedProcess(process.execPath, [
      viteBin,
      "preview",
      "--host",
      PREVIEW_HOST,
      "--port",
      String(previewPort),
    ]);

    console.log(
      `[split-preview] Frontend preview is running at ${previewUrl} and the API at ${runtimeConfig.apiBaseUrl}.`,
    );
  } catch (error) {
    console.error("[split-preview] Fatal error:", error);
    shutdown(1);
  }
}

process.on("SIGINT", () => shutdown(130));
process.on("SIGTERM", () => shutdown(143));

const isMainModule =
  process.argv[1] &&
  new URL(`file://${process.argv[1]}`).href === import.meta.url;

if (isMainModule) {
  void main();
}
