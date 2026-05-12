/**
 * Server Config
 *
 * Server configuration with environment variable overrides.
 */

export interface ServerConfig {
  PORT: number;
  HOST: string;
  MAX_OUTPUT_BYTES: number;
  MAX_FILE_BYTES: number;
  MAX_SNIPPET_LINES: number;
  JOB_QUEUE_CONCURRENCY: number;
  JOB_TIMEOUT_MS: number;
  JOB_RETENTION_MS: number;
  MAX_RETAINED_EVENTS: number;
  MAX_RETAINED_JOBS: number;
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

function readHost(env: Record<string, string | undefined>, key: string, fallback: string): string {
  const raw = String(env?.[key] || "").trim();
  return raw || fallback;
}

/**
 * Create server configuration with optional environment overrides.
 */
export function createServerConfig(env: Record<string, string | undefined> = process.env): ServerConfig {
  const port = readPositiveInt(env, 'DS_DASHBOARD_API_PORT', SERVER_PORT);
  // Secure default: loopback-only unless explicitly exposed with
  // DS_DASHBOARD_API_HOST=0.0.0.0 (or another host).
  const host = readHost(env, 'DS_DASHBOARD_API_HOST', '127.0.0.1');
  const jobQueueConcurrency = readPositiveInt(env, 'DS_DASHBOARD_JOB_QUEUE_CONCURRENCY', 1);
  const jobTimeoutMs = readPositiveInt(env, 'DS_DASHBOARD_JOB_TIMEOUT_MS', 45 * 60 * 1000);

  return {
    PORT: port,
    HOST: host,
    MAX_OUTPUT_BYTES: 2 * 1024 * 1024,
    MAX_FILE_BYTES: 450_000,
    MAX_SNIPPET_LINES: 15,
    JOB_QUEUE_CONCURRENCY: jobQueueConcurrency,
    JOB_TIMEOUT_MS: jobTimeoutMs,
    JOB_RETENTION_MS: 30 * 60 * 1000,
    MAX_RETAINED_EVENTS: 2_000,
    MAX_RETAINED_JOBS: 200,
  };
}
