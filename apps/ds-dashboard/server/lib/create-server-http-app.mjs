import { Hono } from "hono";

import { registerAllRoutes } from "../routes/register-all-routes.mjs";
import {
  createFailJson,
  createHealthPayloadBuilder,
} from "./api-response-service.ts";
import { buildCreateServerRouteDeps } from "./create-server-route-deps.mjs";
import { registerUnhandledErrorMiddleware } from "./error-middleware.mjs";

export function createServerHttpApp(config) {
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
  const failJson = createFailJsonFn({
    createRequestId: createApiRequestId,
    buildApiErrorPayloadFn: buildApiErrorPayload,
    writeStructuredLogFn: writeStructuredLog,
  });

  const buildHealthPayload = createHealthPayloadBuilderFn({
    queueMetrics,
    nowIsoFn: nowIso,
  });

  registerAllRoutesFn(
    app,
    buildCreateServerRouteDepsFn({
      ...routeDeps,
      buildHealthPayload,
      failJson,
    }),
  );

  registerUnhandledErrorMiddlewareFn(app, {
    createApiRequestId,
    writeStructuredLog,
    failJson,
  });

  return {
    app,
    failJson,
    buildHealthPayload,
  };
}
