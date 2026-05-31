import { execFile } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_DATABASE_URL =
  'postgres://ds:local@localhost:5432/ds_dashboard';

function normalizeDatabaseProvider(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  if (
    normalized === 'local' ||
    normalized === 'supabase' ||
    normalized === 'custom'
  ) {
    return normalized;
  }
  return '';
}

function parsePort(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 65_535
    ? parsed
    : fallback;
}

function normalizeDatabaseHost(host) {
  const raw = String(host || '').trim();
  if (raw.startsWith('[') && raw.endsWith(']')) {
    return raw.slice(1, -1);
  }
  return raw;
}

export function parseDatabaseUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
      return null;
    }
    return {
      url: raw,
      host: normalizeDatabaseHost(parsed.hostname) || '127.0.0.1',
      port: parsePort(parsed.port, 5432),
    };
  } catch {
    return null;
  }
}

export function resolveDashboardDatabaseUrl(env = process.env) {
  const provider = normalizeDatabaseProvider(env.DB_PROVIDER);
  const supabaseDbUrl = String(env.SUPABASE_DATABASE_URL || '').trim();
  if (provider === 'supabase' && supabaseDbUrl) return supabaseDbUrl;

  const dbUrl = String(env.DATABASE_URL || '').trim();
  if (dbUrl) return dbUrl;

  const testDbUrl = String(env.TEST_DATABASE_URL || '').trim();
  if (testDbUrl) return testDbUrl;

  if (provider === 'supabase') {
    throw new Error(
      'SUPABASE_DATABASE_URL or DATABASE_URL is required when DB_PROVIDER=supabase.',
    );
  }

  return DEFAULT_DATABASE_URL;
}

export function shouldSkipDatabasePreflight(env = process.env) {
  const supervised = String(env.DS_DASHBOARD_SUPERVISED || '').trim();
  return supervised === '1' || supervised.toLowerCase() === 'true';
}

export function isLocalDatabaseUrl(databaseUrl) {
  const parsed = parseDatabaseUrl(databaseUrl);
  if (!parsed) return false;
  return (
    (parsed.host === 'localhost' ||
      parsed.host === '127.0.0.1' ||
      parsed.host === '::1') &&
    parsed.port === 5432
  );
}

export function isDatabasePortReachable(host, port, timeoutMs = 1_500) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const finish = (result) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () =>
      finish({
        ok: true,
        code: null,
        message: null,
      }),
    );
    socket.once('timeout', () =>
      finish({
        ok: false,
        code: 'TIMEOUT',
        message: `Connection timeout after ${timeoutMs}ms`,
      }),
    );
    socket.once('error', (error) =>
      finish({
        ok: false,
        code: error?.code || 'UNKNOWN',
        message: error instanceof Error ? error.message : String(error || ''),
      }),
    );
  });
}

function hostsForProbe(host) {
  const normalized = normalizeDatabaseHost(host) || '127.0.0.1';
  if (normalized === 'localhost') {
    return ['127.0.0.1', '::1', 'localhost'];
  }
  if (normalized === '::1') {
    return ['::1', '127.0.0.1'];
  }
  if (normalized === '127.0.0.1') {
    return ['127.0.0.1', '::1'];
  }
  return [normalized];
}

export async function preflightDatabaseUrl(databaseUrl) {
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
  let lastProbe = null;
  for (const host of hostsForProbe(parsed.host)) {
    const probe = await isDatabasePortReachable(host, parsed.port);
    if (probe.ok) {
      return {
        ...probe,
        host,
        port: parsed.port,
      };
    }
    lastProbe = { ...probe, host, port: parsed.port };
  }
  return (
    lastProbe || {
      ok: false,
      code: 'UNKNOWN',
      message: 'Unable to reach database host',
      host: parsed.host,
      port: parsed.port,
    }
  );
}

function repoRootFromModuleUrl(moduleUrl) {
  return path.resolve(path.dirname(fileURLToPath(moduleUrl)), '../../..');
}

function runNpmScript(repoRoot, scriptName) {
  return new Promise((resolve, reject) => {
    const child = execFile(
      'npm',
      ['--prefix', repoRoot, 'run', scriptName],
      {
        // Keep the repo root explicit so nested callers resolve the workspace
        // script through the same directory even when their inherited cwd differs.
        cwd: repoRoot,
        env: process.env,
      },
      (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      },
    );
    child?.stdout?.pipe(process.stdout);
    child?.stderr?.pipe(process.stderr);
  });
}

async function waitForDatabase(host, port, timeoutMs = 30_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const probe = await isDatabasePortReachable(host, port, 500);
    if (probe.ok) return true;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

/**
 * Ensure the local dashboard PostgreSQL database is reachable.
 * If the default local database is unavailable, start it via `npm run db:up`
 * and wait for the port to become reachable.
 */
export async function ensureLocalDatabaseReady({
  databaseUrl,
  repoRoot = repoRootFromModuleUrl(import.meta.url),
  logger = console,
  autoStart = true,
} = {}) {
  const targetUrl = databaseUrl || resolveDashboardDatabaseUrl(process.env);
  const probe = await preflightDatabaseUrl(targetUrl);
  if (probe.ok) {
    return { ok: true, started: false, probe };
  }

  if (!autoStart || !isLocalDatabaseUrl(targetUrl)) {
    return { ok: false, started: false, probe };
  }

  logger.log?.('[dev-db] Starting local PostgreSQL with `npm run db:up`...');
  try {
    await runNpmScript(repoRoot, 'db:up');
  } catch (error) {
    return {
      ok: false,
      started: true,
      probe,
      error,
    };
  }

  const parsed = parseDatabaseUrl(targetUrl);
  if (!parsed) {
    return {
      ok: false,
      started: true,
      probe,
      error: new Error(
        'Unable to parse the local database URL after auto-start.',
      ),
    };
  }

  const ready = await waitForDatabase(parsed.host, parsed.port);
  return {
    ok: ready,
    started: true,
    probe: ready
      ? {
          ok: true,
          code: null,
          message: null,
          host: parsed.host,
          port: parsed.port,
        }
      : probe,
    error: ready
      ? null
      : new Error(
          `PostgreSQL did not become reachable at ${parsed.host}:${parsed.port} after running db:up.`,
        ),
  };
}
