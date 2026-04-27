import fs from 'node:fs/promises';
import path from 'node:path';

import type { Context } from 'hono';

import {
  closeDatabase,
  openDatabase,
  resolveDatabaseProvider,
  resolveDashboardDbUrl,
  resolvePostgresConnectionOptions,
  DEFAULT_LOCAL_DATABASE_URL,
  type DatabaseProvider,
} from '../db/pg-db-service.js';
import { isLoopbackRequest } from '../lib/loopback-utils.ts';

export interface DatabaseConfigPayload {
  provider: DatabaseProvider;
  databaseUrlMasked: string;
  databaseUrlConfigured: boolean;
  activeDatabaseUrlMasked: string;
  activeProvider: DatabaseProvider;
  envPath: string;
  restartRequired: boolean;
}

export interface SaveDatabaseConfigResult extends DatabaseConfigPayload {
  saved: boolean;
  restartCommand: string;
}

export interface ValidateDatabaseConfigResult {
  ok: boolean;
  provider: DatabaseProvider;
  databaseUrlMasked: string;
  database: string;
  user: string;
  serverVersion: string;
  vectorExtensionInstalled: boolean;
  preparedStatements: boolean;
  ssl: boolean;
}

export interface DatabaseConfigDeps {
  repoRoot: string;
  env?: NodeJS.ProcessEnv;
  activeDatabaseUrl?: string;
}

type FailJson = (
  c: Context,
  statusCode: number,
  args: Record<string, unknown>,
) => Response;

const PROVIDERS = new Set(['local', 'supabase', 'custom']);
const VALIDATE_DATABASE_TIMEOUT_MS = 10_000;

class DatabaseValidationTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Database validation timed out after ${timeoutMs}ms.`);
    this.name = 'DatabaseValidationTimeoutError';
  }
}

function dashboardEnvPath(repoRoot: string): string {
  return path.join(repoRoot, 'apps', 'ds-dashboard', '.env');
}

function parseDashboardEnv(text: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    const value = rawValue.trim();
    if (value.startsWith('"') && value.endsWith('"')) {
      try {
        env[key] = JSON.parse(value);
      } catch {
        env[key] = value.slice(1, -1);
      }
      continue;
    }
    if (value.startsWith("'") && value.endsWith("'")) {
      env[key] = value.slice(1, -1);
      continue;
    }
    env[key] = value;
  }
  return env;
}

async function readDashboardEnv(repoRoot: string): Promise<NodeJS.ProcessEnv> {
  const envText = await fs.readFile(dashboardEnvPath(repoRoot), 'utf8').catch(
    (error) => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return '';
      throw error;
    },
  );
  return parseDashboardEnv(envText);
}

async function getSavedDatabaseEnv({
  repoRoot,
  env = process.env,
}: DatabaseConfigDeps): Promise<NodeJS.ProcessEnv> {
  return {
    ...env,
    ...(await readDashboardEnv(repoRoot)),
  };
}

function isAuthorizedDatabaseConfigRequest(c: Context): boolean {
  if (isLoopbackRequest(c)) return true;
  const expectedToken = String(
    process.env.DS_DASHBOARD_INTERNAL_TOKEN || '',
  ).trim();
  const receivedToken = String(
    c.req.header('x-ds-dashboard-internal-token') || '',
  ).trim();
  return Boolean(expectedToken && receivedToken === expectedToken);
}

function forbidDatabaseConfigRequest(c: Context, failJson: FailJson): Response {
  return failJson(c, 403, {
    code: 'database_config.forbidden_remote',
    userMessage:
      'Database configuration is accessible only from loopback clients or with the internal token.',
    recoverable: false,
  });
}

function normalizeProvider(value: unknown): DatabaseProvider {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  return PROVIDERS.has(normalized) ? (normalized as DatabaseProvider) : 'local';
}

function normalizeDatabaseUrl(value: unknown): string {
  return String(value || '').trim();
}

function validateDatabaseUrl(
  provider: DatabaseProvider,
  databaseUrl: string,
): string | null {
  if (!databaseUrl) {
    return provider === 'local'
      ? null
      : 'Database URL is required for this provider.';
  }
  try {
    const parsed = new URL(databaseUrl);
    if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
      return 'Database URL must use postgres:// or postgresql://.';
    }
    if (!parsed.hostname) {
      return 'Database URL must include a host.';
    }
    if (provider === 'supabase') {
      const host = parsed.hostname.toLowerCase();
      if (!host.includes('supabase.co') && !host.includes('supabase.com')) {
        return 'Supabase URL must point to a Supabase Postgres host.';
      }
    }
    return null;
  } catch {
    return 'Database URL is not valid.';
  }
}

export function maskDatabaseUrl(databaseUrl: string): string {
  const raw = normalizeDatabaseUrl(databaseUrl);
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    if (parsed.password) parsed.password = '***';
    return parsed.toString();
  } catch {
    return raw.replace(/:\/\/([^:@/]+):([^@/]+)@/, '://$1:***@');
  }
}

function readConfiguredDatabaseUrl(
  env: NodeJS.ProcessEnv,
  provider: DatabaseProvider,
): string {
  if (provider === 'supabase') {
    return normalizeDatabaseUrl(env.SUPABASE_DATABASE_URL || env.DATABASE_URL);
  }
  return normalizeDatabaseUrl(env.DATABASE_URL);
}

function resolveRequestedDatabaseUrl({
  provider,
  databaseUrl,
  env,
}: {
  provider: DatabaseProvider;
  databaseUrl: string;
  env: NodeJS.ProcessEnv;
}): string {
  const explicit = normalizeDatabaseUrl(databaseUrl);
  if (explicit) return explicit;

  const configuredProvider = resolveDatabaseProvider(env);
  const configuredUrl = readConfiguredDatabaseUrl(env, configuredProvider);
  if (configuredUrl && configuredProvider === provider) {
    return configuredUrl;
  }

  return provider === 'local' ? DEFAULT_LOCAL_DATABASE_URL : '';
}

export function getDatabaseConfigPayload({
  repoRoot,
  env = process.env,
  activeDatabaseUrl,
}: DatabaseConfigDeps): DatabaseConfigPayload {
  const provider = resolveDatabaseProvider(env);
  const configuredUrl = readConfiguredDatabaseUrl(env, provider);
  const effectiveUrl = configuredUrl || DEFAULT_LOCAL_DATABASE_URL;
  const activeUrl = normalizeDatabaseUrl(
    activeDatabaseUrl || resolveDashboardDbUrl(env),
  );
  const activeProvider = resolveDatabaseProvider({
    DATABASE_URL: activeUrl,
  } as NodeJS.ProcessEnv);

  return {
    provider,
    databaseUrlMasked: maskDatabaseUrl(effectiveUrl),
    databaseUrlConfigured: Boolean(configuredUrl),
    activeDatabaseUrlMasked: maskDatabaseUrl(activeUrl),
    activeProvider,
    envPath: dashboardEnvPath(repoRoot),
    restartRequired: activeUrl !== effectiveUrl,
  };
}

function serializeEnvValue(value: string): string {
  if (/^[A-Za-z0-9_./:@?=&%+-]+$/.test(value)) return value;
  return JSON.stringify(value);
}

function upsertEnvLines(
  lines: string[],
  values: Record<string, string>,
): string[] {
  const remaining = new Map(Object.entries(values));
  const next = lines.map((line) => {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(line);
    if (!match) return line;
    const key = match[1];
    if (!remaining.has(key)) return line;
    const value = remaining.get(key) || '';
    remaining.delete(key);
    return `${key}=${serializeEnvValue(value)}`;
  });

  if (remaining.size > 0 && next.length > 0 && next[next.length - 1]?.trim()) {
    next.push('');
  }
  for (const [key, value] of remaining.entries()) {
    next.push(`${key}=${serializeEnvValue(value)}`);
  }
  return next;
}

export async function saveDatabaseConfig(
  args: DatabaseConfigDeps & {
    provider: DatabaseProvider;
    databaseUrl: string;
  },
): Promise<SaveDatabaseConfigResult> {
  const env = args.env || process.env;
  const provider = args.provider;
  const databaseUrl = resolveRequestedDatabaseUrl({
    provider,
    databaseUrl: args.databaseUrl,
    env,
  });
  const validationError = validateDatabaseUrl(provider, databaseUrl);
  if (validationError) {
    throw new Error(validationError);
  }
  const envPath = dashboardEnvPath(args.repoRoot);
  const nextPayload = getDatabaseConfigPayload({
    ...args,
    activeDatabaseUrl: args.activeDatabaseUrl || resolveDashboardDbUrl(env),
    env: {
      ...env,
      DB_PROVIDER: provider,
      DATABASE_URL: databaseUrl,
      SUPABASE_DATABASE_URL: provider === 'supabase' ? databaseUrl : '',
    },
  });
  const existing = await fs.readFile(envPath, 'utf8').catch((error) => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return '';
    throw error;
  });
  const lines = existing ? existing.split(/\r?\n/) : [];
  const nextLines = upsertEnvLines(lines, {
    DB_PROVIDER: provider,
    DATABASE_URL: databaseUrl,
    SUPABASE_DATABASE_URL: provider === 'supabase' ? databaseUrl : '',
  });
  await fs.mkdir(path.dirname(envPath), { recursive: true });
  await fs.writeFile(
    envPath,
    `${nextLines.join('\n').replace(/\n+$/, '')}\n`,
    'utf8',
  );

  return {
    ...nextPayload,
    saved: true,
    restartCommand: 'npm --prefix apps/ds-dashboard run dev',
  };
}

export async function runWithTimeout<T>({
  operation,
  timeoutMs,
  onTimeout,
}: {
  operation: Promise<T>;
  timeoutMs: number;
  onTimeout: () => Promise<void>;
}): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  return await Promise.race([
    operation,
    new Promise<T>((_resolve, reject) => {
      timeout = setTimeout(() => {
        void onTimeout().catch(() => {});
        reject(new DatabaseValidationTimeoutError(timeoutMs));
      }, timeoutMs);
    }),
  ]).finally(() => {
    if (timeout) clearTimeout(timeout);
  });
}

export async function validateDatabaseConfig(args: {
  provider: DatabaseProvider;
  databaseUrl: string;
  env?: NodeJS.ProcessEnv;
}): Promise<ValidateDatabaseConfigResult> {
  const databaseUrl = args.databaseUrl || DEFAULT_LOCAL_DATABASE_URL;
  const env = {
    ...(args.env || process.env),
    DB_PROVIDER: args.provider,
    DATABASE_URL: databaseUrl,
    SUPABASE_DATABASE_URL:
      args.provider === 'supabase' ? databaseUrl : undefined,
  } as NodeJS.ProcessEnv;
  const connectionOptions = {
    ...resolvePostgresConnectionOptions(databaseUrl, env),
    max: 1,
    connect_timeout: 8,
    idle_timeout: 5,
  };
  const sql = openDatabase(databaseUrl, connectionOptions);
  let timedOut = false;
  try {
    const rows = await runWithTimeout({
      operation: sql`
        SELECT
          current_database() AS database,
          current_user AS "user",
          version() AS server_version,
          EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') AS vector_extension_installed
      ` as Promise<
        Array<{
          database: string;
          user: string;
          server_version: string;
          vector_extension_installed: boolean;
        }>
      >,
      timeoutMs: VALIDATE_DATABASE_TIMEOUT_MS,
      onTimeout: async () => {
        timedOut = true;
        await closeDatabase(sql);
      },
    });
    const [info] = rows as Array<{
      database: string;
      user: string;
      server_version: string;
      vector_extension_installed: boolean;
    }>;
    return {
      ok: true,
      provider: args.provider,
      databaseUrlMasked: maskDatabaseUrl(databaseUrl),
      database: String(info?.database || ''),
      user: String(info?.user || ''),
      serverVersion: String(info?.server_version || ''),
      vectorExtensionInstalled: Boolean(info?.vector_extension_installed),
      preparedStatements: connectionOptions.prepare !== false,
      ssl: Boolean(connectionOptions.ssl),
    };
  } finally {
    if (!timedOut) {
      await closeDatabase(sql);
    }
  }
}

async function readJsonBody(c: Context): Promise<Record<string, unknown>> {
  const body = await c.req.json().catch(() => ({}));
  return body && typeof body === 'object' && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {};
}

export async function handleGetDatabaseConfigRoute(
  c: Context,
  deps: DatabaseConfigDeps & { failJson: FailJson },
): Promise<Response> {
  if (!isAuthorizedDatabaseConfigRequest(c)) {
    return forbidDatabaseConfigRequest(c, deps.failJson);
  }
  const env = await getSavedDatabaseEnv(deps);
  return c.json({
    ok: true,
    config: getDatabaseConfigPayload({
      ...deps,
      env,
    }),
  });
}

export async function handleValidateDatabaseConfigRoute(
  c: Context,
  deps: DatabaseConfigDeps & { failJson: FailJson },
) {
  if (!isAuthorizedDatabaseConfigRequest(c)) {
    return forbidDatabaseConfigRequest(c, deps.failJson);
  }
  const body = await readJsonBody(c);
  const provider = normalizeProvider(body.provider);
  const env = await getSavedDatabaseEnv(deps);
  const databaseUrl = resolveRequestedDatabaseUrl({
    provider,
    databaseUrl: normalizeDatabaseUrl(body.databaseUrl),
    env,
  });
  const validationError = validateDatabaseUrl(provider, databaseUrl);
  if (validationError) {
    return deps.failJson(c, 400, {
      code: 'database_config.invalid',
      userMessage: validationError,
      recoverable: true,
      context: { provider },
    });
  }

  try {
    const result = await validateDatabaseConfig({
      provider,
      databaseUrl,
      env,
    });
    return c.json({ ok: true, result });
  } catch (error) {
    return deps.failJson(c, 400, {
      code: 'database_config.connection_failed',
      userMessage: error instanceof Error ? error.message : String(error),
      recoverable: true,
      context: {
        provider,
        databaseUrlMasked: maskDatabaseUrl(databaseUrl),
      },
    });
  }
}

export async function handleSaveDatabaseConfigRoute(
  c: Context,
  deps: DatabaseConfigDeps & { failJson: FailJson },
) {
  if (!isAuthorizedDatabaseConfigRequest(c)) {
    return forbidDatabaseConfigRequest(c, deps.failJson);
  }
  const body = await readJsonBody(c);
  const provider = normalizeProvider(body.provider);
  const env = await getSavedDatabaseEnv(deps);
  const databaseUrl = resolveRequestedDatabaseUrl({
    provider,
    databaseUrl: normalizeDatabaseUrl(body.databaseUrl),
    env,
  });
  const validationError = validateDatabaseUrl(provider, databaseUrl);
  if (validationError) {
    return deps.failJson(c, 400, {
      code: 'database_config.invalid',
      userMessage: validationError,
      recoverable: true,
      context: { provider },
    });
  }

  try {
    const result = await saveDatabaseConfig({
      ...deps,
      env,
      provider,
      databaseUrl,
    });
    return c.json({ ok: true, config: result });
  } catch (error) {
    return deps.failJson(c, 500, {
      code: 'database_config.save_failed',
      userMessage: error instanceof Error ? error.message : String(error),
      recoverable: true,
      context: { provider },
    });
  }
}
