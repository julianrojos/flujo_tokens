import assert from "node:assert/strict";
import test from "node:test";

import { createServerHttpApp } from "./lib/create-server-http-app.ts";
import { createHealthPayloadBuilder, type HealthPayloadBuilderDeps } from "./lib/api-response-service.js";
import { buildCreateServerRouteDeps, type CreateServerRouteDepsConfig } from "./lib/create-server-route-deps.js";

test("create-server-http-app: wires routes and middleware with derived helpers", async () => {
  const calls: any = {
    createFailJson: null,
    createHealthPayloadBuilder: null,
    buildCreateServerRouteDeps: null,
    buildCreateServerRouteDepsReturn: null,
    registerAllRoutes: null,
    registerUnhandledErrorMiddleware: null,
  };

  const failJson = () => {};
  const buildHealthPayload = () => ({ status: "ok" });
  const routeDeps = { repoRoot: "/repo", someDep: true };

  const result = await createServerHttpApp({
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
    createHealthPayloadBuilderFn: ((args: HealthPayloadBuilderDeps) => {
      calls.createHealthPayloadBuilder = args as unknown;
      return buildHealthPayload;
    }) as typeof createHealthPayloadBuilder,
    buildCreateServerRouteDepsFn: ((args: CreateServerRouteDepsConfig) => {
      calls.buildCreateServerRouteDeps = args as unknown;
      calls.buildCreateServerRouteDepsReturn = { wired: true };
      return { wired: true } as unknown;
    }) as typeof buildCreateServerRouteDeps,
    registerAllRoutesFn(app, deps) {
      calls.registerAllRoutes = { app, deps };
    },
    registerUnhandledErrorMiddlewareFn(app, deps) {
      calls.registerUnhandledErrorMiddleware = { app, deps };
    },
  });

  assert.deepEqual(calls.buildCreateServerRouteDepsReturn, { wired: true });
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

test("create-server-http-app: applies configured CORS allowlist", async () => {
  const result = await createServerHttpApp({
    queueMetrics: () => ({ active: 0 }),
    nowIso: () => "2026-01-01T00:00:00.000Z",
    createApiRequestId: () => "req_1",
    buildApiErrorPayload: () => ({ ok: false }),
    writeStructuredLog: () => {},
    env: {
      DS_DASHBOARD_ALLOWED_ORIGINS: "https://dashboard.example",
    },
    routeDeps: { repoRoot: "/repo" } as never,
    registerAllRoutesFn() {},
    registerUnhandledErrorMiddlewareFn() {},
  });

  const allowedResponse = await result.app.fetch(
    new Request("http://dashboard-api.test/anything", {
      method: "OPTIONS",
      headers: {
        Origin: "https://dashboard.example",
        "Access-Control-Request-Method": "GET",
      },
    }),
  );

  assert.equal(allowedResponse.status, 204);
  assert.equal(
    allowedResponse.headers.get("access-control-allow-origin"),
    "https://dashboard.example",
  );
  assert.match(
    allowedResponse.headers.get("access-control-allow-headers") || "",
    /x-ds-system/i,
  );
  assert.equal(allowedResponse.headers.get("vary"), "Origin");
  assert.match(
    allowedResponse.headers.get("access-control-allow-methods") || "",
    /GET/,
  );

  const allowedGetResponse = await result.app.fetch(
    new Request("http://dashboard-api.test/api/design-systems", {
      method: "GET",
      headers: {
        Origin: "https://dashboard.example",
      },
    }),
  );

  assert.equal(
    allowedGetResponse.headers.get("access-control-allow-origin"),
    "https://dashboard.example",
  );

  const privateNetworkResponse = await result.app.fetch(
    new Request("http://dashboard-api.test/anything", {
      method: "OPTIONS",
      headers: {
        Origin: "https://dashboard.example",
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Private-Network": "true",
      },
    }),
  );

  assert.equal(privateNetworkResponse.status, 204);
  assert.equal(
    privateNetworkResponse.headers.get("access-control-allow-private-network"),
    "true",
  );

  const blockedResponse = await result.app.fetch(
    new Request("http://dashboard-api.test/anything", {
      method: "OPTIONS",
      headers: {
        Origin: "https://evil.example",
        "Access-Control-Request-Method": "GET",
      },
    }),
  );

  assert.equal(blockedResponse.status, 204);
  assert.equal(
    blockedResponse.headers.get("access-control-allow-origin"),
    null,
  );
});

test("create-server-http-app: rejects malformed wildcard origin patterns", async () => {
  const result = await createServerHttpApp({
    queueMetrics: () => ({ active: 0 }),
    nowIso: () => "2026-01-01T00:00:00.000Z",
    createApiRequestId: () => "req_1",
    buildApiErrorPayload: () => ({ ok: false }),
    writeStructuredLog: () => {},
    env: {
      DS_DASHBOARD_ALLOWED_ORIGINS: "https://*..example",
    },
    routeDeps: { repoRoot: "/repo" } as never,
    registerAllRoutesFn() {},
    registerUnhandledErrorMiddlewareFn() {},
  });

  const response = await result.app.fetch(
    new Request("http://dashboard-api.test/anything", {
      method: "OPTIONS",
      headers: {
        Origin: "https://dashboard.example",
        "Access-Control-Request-Method": "GET",
      },
    }),
  );

  assert.equal(response.headers.get("access-control-allow-origin"), null);
});
