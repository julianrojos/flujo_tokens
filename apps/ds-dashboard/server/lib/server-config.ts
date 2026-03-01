/**
 * Server Config
 *
 * Server configuration with environment variable overrides.
 * Migrated from apps/ds-dashboard/server/lib/server-config.mjs
 */

export interface ServerConfig {
  PORT: number;
  MAX_OUTPUT_BYTES: number;
  MAX_FILE_BYTES: number;
  MAX_SNIPPET_LINES: number;
  JOB_QUEUE_CONCURRENCY: number;
  JOB_TIMEOUT_MS: number;
  JOB_RETENTION_MS: number;
  MAX_RETAINED_EVENTS: number;
  MAX_RETAINED_JOBS: number;
  OPS_LOG_MAX_FILE_BYTES: number;
  OPS_LOG_RETENTION_DAYS: number;
  OPS_HISTORY_DEFAULT_LIMIT: number;
  OPS_HISTORY_MAX_LIMIT: number;
  OPS_REGRESSION_DEFAULT_LIMIT: number;
  OPS_REGRESSION_MAX_LIMIT: number;
  OPS_REGRESSION_DEFAULT_MIN_SAMPLES: number;
  OPS_LOG_FILE_RE: RegExp;
  REPLAYABLE_NPM_SCRIPTS: Set<string>;
  SUPPORTED_REPLAY_OPERATIONS: Set<string>;
}

/**
 * Read a positive integer from environment, falling back to default if invalid.
 */
function readPositiveInt(env: Record<string, string | undefined>, key: string, fallback: number): number {
  const raw = env?.[key];
  const parsed = Number.parseInt(String(raw ?? fallback), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const SERVER_PORT = Number(process.env.DS_DASHBOARD_API_PORT || 8787);

/**
 * Create server configuration with optional environment overrides.
 */
export function createServerConfig(env: Record<string, string | undefined> = process.env): ServerConfig {
  const port = readPositiveInt(env, 'DS_DASHBOARD_API_PORT', SERVER_PORT);
  const jobTimeoutMs = readPositiveInt(env, 'DS_DASHBOARD_JOB_TIMEOUT_MS', 600000);
  const opsLogMaxFileBytes = readPositiveInt(env, 'DS_DASHBOARD_OPS_LOG_MAX_FILE_BYTES', 1_048_576);
  const opsLogRetentionDays = readPositiveInt(env, 'DS_DASHBOARD_OPS_LOG_RETENTION_DAYS', 30);

  const replayableNpmScripts = new Set([
    'ds:registry:refresh',
    'ds:token-usage-index',
    'ds:token-graph',
    'ds:token-health',
    'ds:registry:report',
  ]);

  return {
    PORT: port,
    MAX_OUTPUT_BYTES: 2 * 1024 * 1024,
    MAX_FILE_BYTES: 450_000,
    MAX_SNIPPET_LINES: 15,
    JOB_QUEUE_CONCURRENCY: 1,
    JOB_TIMEOUT_MS: jobTimeoutMs,
    JOB_RETENTION_MS: 30 * 60 * 1000,
    MAX_RETAINED_EVENTS: 2_000,
    MAX_RETAINED_JOBS: 200,
    OPS_LOG_MAX_FILE_BYTES: opsLogMaxFileBytes,
    OPS_LOG_RETENTION_DAYS: opsLogRetentionDays,
    OPS_HISTORY_DEFAULT_LIMIT: 100,
    OPS_HISTORY_MAX_LIMIT: 500,
    OPS_REGRESSION_DEFAULT_LIMIT: 300,
    OPS_REGRESSION_MAX_LIMIT: 500,
    OPS_REGRESSION_DEFAULT_MIN_SAMPLES: 4,
    OPS_LOG_FILE_RE: /^operations-(\d{4}-\d{2}-\d{2})(?:\.(\d+))?\.ndjson$/,
    REPLAYABLE_NPM_SCRIPTS: replayableNpmScripts,
    SUPPORTED_REPLAY_OPERATIONS: new Set([
      'refresh:naming-debt',
      'script:ds-health-snapshot.mjs',
      ...Array.from(replayableNpmScripts).map((script) => `script:${script}`),
    ]),
  };
}
