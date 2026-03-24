import { spawn } from "node:child_process";
import net from "node:net";

const processes = [];
let shuttingDown = false;
const DEFAULT_API_HOST = "127.0.0.1";
const DEFAULT_API_PORT = 8787;

function parsePort(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 65_535 ? parsed : fallback;
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
  const child = spawn("npm", ["run", name], {
    stdio: "inherit",
    shell: false,
    env: {
      ...process.env,
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
    const portStatus = await classifyApiPort(runtimeConfig);

    if (portStatus.kind === "already-running") {
      console.log(
        `[dev-with-api] Dashboard API is already running at ${runtimeConfig.apiBaseUrl}.`,
      );
      startScript("dev:vite", runtimeConfig);
      return;
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
