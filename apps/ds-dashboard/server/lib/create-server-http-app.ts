/**
 * Create Server HTTP App
 *
 * Creates and configures the Hono app with routes and error middleware.
 */

import { Hono } from 'hono';

import { registerAllRoutes } from '../routes/register-all-routes.ts';
import { createFailJson, createHealthPayloadBuilder, type QueueMetrics } from './api-response-service.ts';
import { buildCreateServerRouteDeps, type CreateServerRouteDepsConfig } from './create-server-route-deps.ts';
import { registerUnhandledErrorMiddleware } from './error-middleware.ts';
import type { ErrorMiddlewareDeps } from './error-middleware.ts';

export interface CreateServerHttpAppConfig {
  queueMetrics: () => unknown;
  nowIso: () => string;
  createApiRequestId: () => string;
  buildApiErrorPayload: (...args: unknown[]) => Record<string, unknown>;
  writeStructuredLog: (level: string, payload: Record<string, unknown>) => void;
  env?: NodeJS.ProcessEnv;
  routeDeps: Omit<CreateServerRouteDepsConfig, 'buildHealthPayload' | 'failJson'>;
  registerAllRoutesFn?: typeof registerAllRoutes;
  createFailJsonFn?: typeof createFailJson;
  createHealthPayloadBuilderFn?: typeof createHealthPayloadBuilder;
  buildCreateServerRouteDepsFn?: typeof buildCreateServerRouteDeps;
  registerUnhandledErrorMiddlewareFn?: typeof registerUnhandledErrorMiddleware;
}

export interface CreateServerHttpAppResult {
  app: Hono;
  failJson: ReturnType<typeof createFailJson>;
  buildHealthPayload: ReturnType<typeof createHealthPayloadBuilder>;
}

function parseOriginPatterns(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

function matchesOriginPattern(origin: URL, pattern: string): boolean {
  const normalizedPattern = pattern.trim().toLowerCase();
  if (!normalizedPattern) return false;

  if (origin.origin.toLowerCase() === normalizedPattern) {
    return true;
  }

  const wildcardWithSchemeMatch = normalizedPattern.match(/^(https?):\/\/\*\.(.+)$/);
  if (wildcardWithSchemeMatch) {
    const [, scheme, suffix] = wildcardWithSchemeMatch;
    if (!isValidWildcardSuffix(suffix)) return false;
    return (
      origin.protocol === `${scheme}:` &&
      (origin.hostname === suffix || origin.hostname.endsWith(`.${suffix}`))
    );
  }

  const wildcardAnySchemeMatch = normalizedPattern.match(/^\*\.(.+)$/);
  if (wildcardAnySchemeMatch) {
    const [, suffix] = wildcardAnySchemeMatch;
    if (!isValidWildcardSuffix(suffix)) return false;
    return origin.hostname === suffix || origin.hostname.endsWith(`.${suffix}`);
  }

  return false;
}

function isValidWildcardSuffix(suffix: string): boolean {
  return /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(suffix.trim());
}

function createCorsOriginMatcher(env: NodeJS.ProcessEnv): (originHeader: string | undefined) => string | null {
  const configuredPatterns = parseOriginPatterns(env.DS_DASHBOARD_ALLOWED_ORIGINS);

  if (configuredPatterns.length === 0) {
    if (String(env.NODE_ENV || '').trim().toLowerCase() === 'production') {
      return () => null;
    }
    return () => '*';
  }

  return (originHeader: string | undefined) => {
    if (!originHeader) return null;

    const rawOrigin = originHeader.trim();
    if (!rawOrigin) return null;

    let parsedOrigin: URL;
    try {
      parsedOrigin = new URL(rawOrigin);
    } catch {
      return null;
    }

    if (parsedOrigin.protocol !== 'http:' && parsedOrigin.protocol !== 'https:') {
      return null;
    }

    return configuredPatterns.some((pattern) => matchesOriginPattern(parsedOrigin, pattern))
      ? parsedOrigin.origin
      : null;
  };
}

export function createServerHttpApp(config: CreateServerHttpAppConfig): CreateServerHttpAppResult {
  const {
    queueMetrics,
    nowIso,
    createApiRequestId,
    buildApiErrorPayload,
    writeStructuredLog,
    env = process.env,
    routeDeps,
    registerAllRoutesFn = registerAllRoutes,
    createFailJsonFn = createFailJson,
    createHealthPayloadBuilderFn = createHealthPayloadBuilder,
    buildCreateServerRouteDepsFn = buildCreateServerRouteDeps,
    registerUnhandledErrorMiddlewareFn = registerUnhandledErrorMiddleware,
  } = config;

  const app = new Hono();
  const resolveCorsOrigin = createCorsOriginMatcher(env);
  app.use('*', async (c, next) => {
    const origin = resolveCorsOrigin(c.req.header('Origin'));
    const wantsPrivateNetworkAccess =
      String(c.req.header('Access-Control-Request-Private-Network') || '')
        .trim()
        .toLowerCase() === 'true';
    const applyCorsHeaders = () => {
      if (!origin) return;
      c.header('Access-Control-Allow-Origin', origin);
      c.header('Vary', wantsPrivateNetworkAccess ? 'Origin, Access-Control-Request-Private-Network' : 'Origin');
      c.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
      c.header(
        'Access-Control-Allow-Headers',
        'Content-Type,Authorization,x-ds-system,x-ds-dashboard-internal-token,x-ds-mcp-reset-confirm,x-ds-mcp-reconcile-confirm',
      );
      c.header('Access-Control-Expose-Headers', 'Content-Type');
      c.header('Access-Control-Max-Age', '600');
      if (wantsPrivateNetworkAccess) {
        c.header('Access-Control-Allow-Private-Network', 'true');
      }
    };

    if (c.req.method === 'OPTIONS') {
      applyCorsHeaders();
      return c.body(null, 204);
    }

    await next();
    applyCorsHeaders();
  });
  const failJson = createFailJsonFn({
    createRequestId: createApiRequestId,
    buildApiErrorPayloadFn: buildApiErrorPayload,
    writeStructuredLogFn: writeStructuredLog,
  });

  const buildHealthPayload = createHealthPayloadBuilderFn({
    queueMetrics: queueMetrics as () => QueueMetrics,
    nowIsoFn: nowIso,
  });

  const failJsonForRoutes = failJson as unknown as CreateServerRouteDepsConfig['failJson'];

  const routeDepsConfig: CreateServerRouteDepsConfig = {
    ...routeDeps,
    buildHealthPayload,
    failJson: failJsonForRoutes,
  };

  registerAllRoutesFn(
    app,
    buildCreateServerRouteDepsFn(routeDepsConfig),
  );

  registerUnhandledErrorMiddlewareFn(app, {
    createApiRequestId,
    writeStructuredLog,
    failJson: failJson as ErrorMiddlewareDeps['failJson'],
  });

  return {
    app,
    failJson,
    buildHealthPayload,
  };
}
