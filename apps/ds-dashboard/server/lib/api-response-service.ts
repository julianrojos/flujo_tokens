/**
 * API Response Service
 *
 * Provides utilities for building API responses, error payloads, and health checks.
 * Migrated from apps/ds-dashboard/server/lib/api-response-service.mjs
 */

export interface StructuredLogPayload {
  level: string;
  ts?: number;
  service?: string;
  event?: string;
  requestId?: string;
  code?: string;
  statusCode?: number;
  recoverable?: boolean;
  path?: string;
  method?: string;
  context?: Record<string, unknown> | null;
  [key: string]: unknown;
}

export interface ApiErrorArgs {
  code?: string;
  userMessage?: string;
  recoverable?: boolean;
  context?: Record<string, unknown>;
  requestId?: string;
  suppressLog?: boolean;
}

export interface FailJsonContext {
  req?: {
    path?: string;
    method?: string;
  };
  json: (payload: unknown, status: number) => unknown;
}

export interface HealthPayload {
  status: string;
  service: string;
  now: string;
  uptime: number;
  queue: Record<string, unknown>;
}

export interface QueueMetrics {
  active: number;
  pending: number;
  [key: string]: number;
}

/**
 * Get current ISO timestamp.
 */
export function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Create a prefixed unique ID.
 */
function createPrefixedId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Create an API request ID.
 */
export function createApiRequestId(): string {
  return createPrefixedId('req');
}

/**
 * Write a structured log line.
 */
export function writeStructuredLog(level: string, payload?: StructuredLogPayload): void {
  const base: StructuredLogPayload = {
    level,
    ts: Date.now(),
    service: 'ds-dashboard-api',
  };
  const line = JSON.stringify({ ...base, ...(payload && typeof payload === 'object' ? payload : {}) });
  if (level === 'error') {
    console.error(line);
    return;
  }
  if (level === 'warn') {
    console.warn(line);
    return;
  }
  console.log(line);
}

export interface BuildApiErrorPayloadOptions {
  code?: string;
  userMessage?: string;
  recoverable?: boolean;
  context?: Record<string, unknown>;
  requestId?: string;
}

/**
 * Build an API error payload.
 */
export function buildApiErrorPayload(
  { code, userMessage, recoverable = false, context, requestId }: BuildApiErrorPayloadOptions,
  createRequestId: () => string = createApiRequestId,
): Record<string, unknown> {
  const safeMessage = String(userMessage || 'Request failed.');
  const safeCode = String(code || 'internal.unknown_error');
  const safeRequestId = String(requestId || createRequestId());
  const payload: Record<string, unknown> = {
    ok: false,
    message: safeMessage,
    requestId: safeRequestId,
    error: {
      code: safeCode,
      userMessage: safeMessage,
      recoverable: recoverable === true,
    } as { code: string; userMessage: string; recoverable: boolean; context?: Record<string, unknown> },
  };
  if (context && typeof context === 'object' && !Array.isArray(context)) {
    (payload.error as { code: string; userMessage: string; recoverable: boolean; context?: Record<string, unknown> }).context = context;
  }
  return payload;
}

export interface FailJsonDeps {
  createRequestId?: () => string;
  buildApiErrorPayloadFn?: (args: BuildApiErrorPayloadOptions) => Record<string, unknown>;
  writeStructuredLogFn?: (level: string, payload: StructuredLogPayload) => void;
}

/**
 * Create a failJson handler for API error responses.
 */
export function createFailJson({
  createRequestId = createApiRequestId,
  buildApiErrorPayloadFn = (args) => buildApiErrorPayload(args, createRequestId),
  writeStructuredLogFn = writeStructuredLog,
}: FailJsonDeps = {}) {
  return function failJson(
    c: FailJsonContext,
    statusCode: number,
    args?: ApiErrorArgs
  ): unknown {
    const requestId = String(args?.requestId || createRequestId());
    const payload = buildApiErrorPayloadFn({
      ...args,
      requestId,
    });
    const rawError = payload.error;
    const error = rawError && typeof rawError === 'object' && !Array.isArray(rawError)
      ? rawError as Partial<{ code: string; recoverable: boolean; context: Record<string, unknown> }>
      : {};
    const errorCode = typeof error.code === 'string' ? error.code : 'internal.unknown_error';
    const errorContext = error.context && typeof error.context === 'object' && !Array.isArray(error.context)
      ? error.context
      : null;

    if (args?.suppressLog !== true) {
      writeStructuredLogFn(statusCode >= 500 ? 'error' : 'warn', {
        level: statusCode >= 500 ? 'error' : 'warn',
        event: 'api.error',
        requestId,
        code: errorCode,
        statusCode,
        recoverable: error.recoverable === true,
        path: c?.req?.path,
        method: c?.req?.method,
        context: errorContext,
      });
    }
    return c.json(payload, statusCode);
  };
}

export interface HealthPayloadBuilderDeps {
  queueMetrics: () => QueueMetrics;
  nowIsoFn?: () => string;
  processUptime?: () => number;
  serviceName?: string;
}

/**
 * Create a health payload builder with injected dependencies.
 */
export function createHealthPayloadBuilder({
  queueMetrics,
  nowIsoFn = nowIso,
  processUptime = () => process.uptime(),
  serviceName = 'ds-dashboard-api',
}: HealthPayloadBuilderDeps): () => HealthPayload {
  return function buildHealthPayload(): HealthPayload {
    return {
      status: 'ok',
      service: serviceName,
      now: nowIsoFn(),
      uptime: processUptime(),
      queue: queueMetrics(),
    };
  };
}
