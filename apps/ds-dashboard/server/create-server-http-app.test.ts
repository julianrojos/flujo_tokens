import assert from "node:assert/strict";
import test from "node:test";

import { createServerHttpApp } from "./lib/create-server-http-app.ts";

test("create-server-http-app: wires routes and middleware with derived helpers", () => {
  const calls = {
    createFailJson: null as Record<string, unknown> | null,
    createHealthPayloadBuilder: null as Record<string, unknown> | null,
    buildCreateServerRouteDeps: null as Record<string, unknown> | null,
    registerAllRoutes: null as { app: unknown; deps: unknown } | null,
    registerUnhandledErrorMiddleware: null as { app: unknown; deps: unknown } | null,
  };

  const failJson = () => {};
  const buildHealthPayload = () => ({ status: "ok" });
  const routeDeps = { repoRoot: "/repo", someDep: true };

  const result = createServerHttpApp({
    queueMetrics: () => ({ active: 0 }),
    nowIso: () => "2026-01-01T00:00:00.000Z",
    createApiRequestId: () => "req_1",
    buildApiErrorPayload: () => ({ ok: false }),
    writeStructuredLog: () => {},
    routeDeps,
    createFailJsonFn(args) {
      calls.createFailJson = args as Record<string, unknown>;
      return failJson;
    },
    createHealthPayloadBuilderFn(args) {
      calls.createHealthPayloadBuilder = args as Record<string, unknown>;
      return buildHealthPayload;
    },
    buildCreateServerRouteDepsFn(args) {
      calls.buildCreateServerRouteDeps = args as Record<string, unknown>;
      return { wired: true };
    },
    registerAllRoutesFn(app, deps) {
      calls.registerAllRoutes = { app, deps };
    },
    registerUnhandledErrorMiddlewareFn(app, deps) {
      calls.registerUnhandledErrorMiddleware = { app, deps };
    },
  });

  assert.equal(typeof result.app.fetch, "function");
  assert.equal(result.failJson, failJson);
  assert.equal(result.buildHealthPayload, buildHealthPayload);
  assert.equal((calls.createFailJson?.createRequestId as () => string)(), "req_1");
  assert.equal(typeof calls.createFailJson?.buildApiErrorPayloadFn, "function");
  assert.equal(typeof calls.createFailJson?.writeStructuredLogFn, "function");
  assert.equal(typeof calls.createHealthPayloadBuilder?.queueMetrics, "function");
  assert.equal((calls.createHealthPayloadBuilder?.nowIsoFn as () => string)(), "2026-01-01T00:00:00.000Z");
  assert.equal(calls.buildCreateServerRouteDeps?.failJson, failJson);
  assert.equal(calls.buildCreateServerRouteDeps?.buildHealthPayload, buildHealthPayload);
  assert.equal(calls.buildCreateServerRouteDeps?.repoRoot, "/repo");
  assert.equal(calls.buildCreateServerRouteDeps?.someDep, true);
  assert.deepEqual(calls.registerAllRoutes?.deps, { wired: true });
  assert.equal(calls.registerUnhandledErrorMiddleware?.deps.failJson, failJson);
});
