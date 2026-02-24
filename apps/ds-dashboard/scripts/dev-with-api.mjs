import { spawn } from "node:child_process";

const processes = [];
let shuttingDown = false;
const API_BASE_URL =
  process.env.DS_DASHBOARD_API_URL || "http://127.0.0.1:8787";
const API_HEALTH_URL = `${API_BASE_URL.replace(/\/$/, "")}/api/health`;

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

function startScript(name) {
  const child = spawn("npm", ["run", name], {
    stdio: "inherit",
    shell: false,
    env: {
      ...process.env,
      NODE_ENV: process.env.NODE_ENV || "development",
      DS_DASHBOARD_API_URL: API_BASE_URL,
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
  startScript("dev:api");
  const ready = await waitForServer(API_HEALTH_URL, 10_000);
  if (!ready) {
    console.error(`[dev-with-api] API server not ready at ${API_HEALTH_URL}`);
    shutdown(1);
    return;
  }
  startScript("dev:vite");
}

void main();
