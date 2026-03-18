/**
 * Create Server HTTP App
 *
 * Creates and configures the Hono app with routes and error middleware.
 * Migrated from apps/ds-dashboard/server/lib/create-server-http-app.mjs
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';

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
  routeDeps: Record<string, unknown>;
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

export function createServerHttpApp(config: CreateServerHttpAppConfig): CreateServerHttpAppResult {
  const {
    queueMetrics,
    nowIso,
    createApiRequestId,
    buildApiErrorPayload,
    writeStructuredLog,
    routeDeps,
    registerAllRoutesFn = registerAllRoutes,
    createFailJsonFn = createFailJson,
    createHealthPayloadBuilderFn = createHealthPayloadBuilder,
    buildCreateServerRouteDepsFn = buildCreateServerRouteDeps,
    registerUnhandledErrorMiddlewareFn = registerUnhandledErrorMiddleware,
  } = config;

  const app = new Hono();
  app.use(
    '*',
    cors({
      origin: '*',
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: [
        'Content-Type',
        'Authorization',
        'x-ds-dashboard-internal-token',
        'x-ds-mcp-reset-confirm',
        'x-ds-mcp-reconcile-confirm',
      ],
      exposeHeaders: ['Content-Type'],
      maxAge: 600,
    }),
  );
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

  const routeDepsBase = routeDeps as Omit<CreateServerRouteDepsConfig, 'buildHealthPayload' | 'failJson'>;
  const routeDepsConfig: CreateServerRouteDepsConfig = {
    ...routeDepsBase,
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
