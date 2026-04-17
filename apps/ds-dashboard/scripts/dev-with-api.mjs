import { execFile, spawn } from "node:child_process";
import net from "node:net";

const processes = [];
let shuttingDown = false;
const DEFAULT_API_HOST = "127.0.0.1";
const DEFAULT_API_PORT = 8787;
const DEFAULT_RESTART_EXISTING_API = true;
const DEFAULT_DATABASE_URL = "postgres://ds:local@localhost:5432/ds_dashboard";

function parsePort(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 65_535 ? parsed : fallback;
}

function parseDatabaseUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
      return null;
    }
    return {
      url: raw,
      host: parsed.hostname || "127.0.0.1",
      port: parsePort(parsed.port, 5432),
    };
  } catch {
    return null;
  }
}

export function resolveApiRuntimeConfig(env = process.env) {
  const explicitUrl = String(env.DS_DASHBOARD_API_URL || "").trim();
  if (explicitUrl) {
    try {
      const parsed = new URL(explicitUrl);
      const protocol = parsed.protocol || "http:";
      const host = parsed.hostname || DEFAULT_API_HOST;
      const port = parsePort(parsed.port, protocol === "https:" ? 443 : 80);
      const apiBaseUrl = `${protocol}//${host}:${port}`;
      return {
        apiBaseUrl,
        apiHealthUrl: `${apiBaseUrl}/api/health`,
        host,
        port,
        explicitUrl: true,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(
        `[dev-with-api] Invalid DS_DASHBOARD_API_URL="${explicitUrl}" (${message}). Falling back to host/port settings.`,
      );
    }
  }

  const host = String(env.DS_DASHBOARD_API_HOST || "").trim() || DEFAULT_API_HOST;
  const port = parsePort(env.DS_DASHBOARD_API_PORT, DEFAULT_API_PORT);
  const apiBaseUrl = `http://${host}:${port}`;
  return {
    apiBaseUrl,
    apiHealthUrl: `${apiBaseUrl}/api/health`,
    host,
    port,
    explicitUrl: false,
  };
}

function resolveDashboardDatabaseUrl(env = process.env) {
  const testDbUrl = String(env.TEST_DATABASE_URL || "").trim();
  if (testDbUrl) return testDbUrl;

  const dbUrl = String(env.DATABASE_URL || "").trim();
  if (dbUrl) return dbUrl;

  return DEFAULT_DATABASE_URL;
}

function isDatabasePortReachable(host, port, timeoutMs = 1_500) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const finish = (result) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () =>
      finish({
        ok: true,
        code: null,
        message: null,
      }),
    );
    socket.once("timeout", () =>
      finish({
        ok: false,
        code: "TIMEOUT",
        message: `Connection timeout after ${timeoutMs}ms`,
      }),
    );
    socket.once("error", (error) =>
      finish({
        ok: false,
        code: error?.code || "UNKNOWN",
        message: error instanceof Error ? error.message : String(error || ""),
      }),
    );
  });
}

async function preflightDatabaseUrl(databaseUrl) {
  const parsed = parseDatabaseUrl(databaseUrl);
  if (!parsed) {
    return {
      ok: true,
      code: null,
      message: null,
      host: null,
      port: null,
    };
  }
  const probe = await isDatabasePortReachable(parsed.host, parsed.port);
  return {
    ...probe,
    host: parsed.host,
    port: parsed.port,
  };
}

export function isPortAvailable(port, host) {
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

async function isDashboardHealthResponse(response) {
  if (!response || !response.ok) return false;
  try {
    const payload = await response.json();
    return payload?.status === "ok" && payload?.service === "ds-dashboard-api";
  } catch {
    return false;
  }
}

export async function classifyApiPort({
  host,
  port,
  apiHealthUrl,
  isPortAvailableFn = isPortAvailable,
  fetchFn = fetch,
}) {
  const available = await isPortAvailableFn(port, host);
  if (available) return { kind: "free" };

  try {
    const response = await fetchFn(apiHealthUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(1_500),
    });
    if (await isDashboardHealthResponse(response)) {
      return { kind: "already-running" };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.debug(`[dev-with-api] Health probe failed for ${apiHealthUrl}: ${message}`);
  }

  return { kind: "occupied" };
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

function startScript(name, runtimeConfig) {
  const databaseUrl = resolveDashboardDatabaseUrl(process.env);
  const child = spawn("npm", ["run", name], {
    stdio: "inherit",
    shell: false,
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      TEST_DATABASE_URL: process.env.TEST_DATABASE_URL || databaseUrl,
      NODE_ENV: process.env.NODE_ENV || "development",
      DS_DASHBOARD_API_URL: runtimeConfig.apiBaseUrl,
      DS_DASHBOARD_API_PORT: String(runtimeConfig.port),
      DS_DASHBOARD_API_HOST: runtimeConfig.host,
      ...(name === "dev:api" ? { DS_DASHBOARD_SUPERVISED: "1" } : {}),
    },
  });
  processes.push(child);
  child.on("exit", (code) => {
    if (shuttingDown) return;
    if (typeof code === "number" && code === 0) {
      shutdown(0);
      return;
    }
    shutdown(typeof code === "number" ? code : 1);
  });
  return child;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function shouldRestartExistingApi(env = process.env) {
  const raw = String(env.DS_DASHBOARD_RESTART_API ?? "").trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "no" || raw === "off") return false;
  if (raw === "1" || raw === "true" || raw === "yes" || raw === "on") return true;
  return DEFAULT_RESTART_EXISTING_API;
}

function execFileAsync(file, args) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { encoding: "utf8" }, (error, stdout, stderr) => {
      if (error) {
        reject(error);
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

async function restartExistingDashboardApiIfNeeded(runtimeConfig) {
  if (!shouldRestartExistingApi(process.env)) return true;
  const pids = await listListeningPids(runtimeConfig.port);
  if (pids.length === 0) return true;

  console.log(
    `[dev-with-api] Restarting existing dashboard API on port ${runtimeConfig.port} (PIDs: ${pids.join(", ")}).`,
  );
  await terminatePids(pids, "SIGTERM", 600);
  const remaining = await listListeningPids(runtimeConfig.port);
  if (remaining.length > 0) {
    await terminatePids(remaining, "SIGKILL", 250);
  }
  const stillOccupied = !(await isPortAvailable(runtimeConfig.port, runtimeConfig.host));
  if (stillOccupied) {
    console.error(
      `[dev-with-api] Could not restart API on port ${runtimeConfig.port}. Stop the process manually or set DS_DASHBOARD_API_PORT to another port.`,
    );
    return false;
  }
  return true;
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

process.on("SIGINT", () => shutdown(130));
process.on("SIGTERM", () => shutdown(143));

async function main() {
  try {
    const runtimeConfig = resolveApiRuntimeConfig(process.env);
    const databaseUrl = resolveDashboardDatabaseUrl(process.env);
    if (!String(process.env.DATABASE_URL || "").trim()) {
      console.log(
        `[dev-with-api] DATABASE_URL was not set; using local default ${databaseUrl}.`,
      );
    }
    const databaseProbe = await preflightDatabaseUrl(databaseUrl);
    if (!databaseProbe.ok) {
      if (databaseProbe.code === "EPERM") {
        console.error(
          `[dev-with-api] PostgreSQL connection blocked by local permissions (EPERM) at ${databaseProbe.host}:${databaseProbe.port}. Allow local network/socket access for this terminal session or run the command in a regular system terminal.`,
        );
        process.exit(1);
      }
      console.error(
        `[dev-with-api] PostgreSQL is not reachable at ${databaseUrl} (${databaseProbe.code || "UNKNOWN"}). Start it with npm run db:up, or set DATABASE_URL to a reachable database before running npm run dashboard:dev.`,
      );
      process.exit(1);
    }
    const portStatus = await classifyApiPort(runtimeConfig);
    const restartExistingApi = shouldRestartExistingApi(process.env);

    if (portStatus.kind === "already-running") {
      if (!restartExistingApi) {
        console.log(
          `[dev-with-api] Dashboard API is already running at ${runtimeConfig.apiBaseUrl}. Reusing it for Vite.`,
        );
        startScript("dev:vite", runtimeConfig);
        return;
      }
      const restarted = await restartExistingDashboardApiIfNeeded(runtimeConfig);
      if (!restarted) {
        process.exit(1);
      }
    }

    if (portStatus.kind === "occupied") {
      console.error(
        `[dev-with-api] Port ${runtimeConfig.port} is in use by another process. Stop it or set DS_DASHBOARD_API_PORT to a free port and retry (for example ${runtimeConfig.port + 1}).`,
      );
      process.exit(1);
    }

    startScript("dev:api", runtimeConfig);
    const ready = await waitForServer(runtimeConfig.apiHealthUrl, 10_000);
    if (!ready) {
      console.error(`[dev-with-api] API server not ready at ${runtimeConfig.apiHealthUrl}`);
      shutdown(1);
      return;
    }
    startScript("dev:vite", runtimeConfig);
  } catch (error) {
    console.error("[dev-with-api] Fatal error:", error);
    shutdown(1);
  }
}

const isMainModule =
  process.argv[1] &&
  new URL(`file://${process.argv[1]}`).href === import.meta.url;

if (isMainModule) {
  void main();
}
