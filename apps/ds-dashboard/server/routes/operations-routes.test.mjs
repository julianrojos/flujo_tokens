import assert from "node:assert/strict";
import test from "node:test";

import { Hono } from "hono";

import { registerOperationsRoutes } from "./operations-routes.mjs";

function createFailJson() {
  return (c, statusCode, args) =>
    c.json(
      {
        ok: false,
        code: args.code,
        message: args.userMessage,
      },
      statusCode,
    );
}

function createBaseDeps(overrides = {}) {
  return {
    failJson: createFailJson(),
    toFiniteTimestamp: (value) => {
      const ts = Date.parse(String(value || ""));
      return Number.isFinite(ts) ? ts : NaN;
    },
    OPS_HISTORY_MAX_LIMIT: 1000,
    OPS_HISTORY_DEFAULT_LIMIT: 50,
    OPS_REGRESSION_MAX_LIMIT: 1000,
    OPS_REGRESSION_DEFAULT_LIMIT: 100,
    OPS_REGRESSION_DEFAULT_MIN_SAMPLES: 3,
    designSystemRepository: {
      getConfig: () => ({
        defaultSystem: "core",
        systems: [
          { id: "core", name: "Core" },
          { id: "commerce", name: "Commerce" },
        ],
      }),
    },
    readOperationHistory: () => ({
      events: [{ id: "evt_1", operation: "run:generate", status: "ok" }],
      scannedRows: 1,
      scannedFiles: 1,
    }),
    buildOperationRegressionsReport: () => ({
      generatedAt: "2026-02-24T12:00:00.000Z",
      regressions: [{ operation: "run:generate", p95CurrentMs: 1200, p95BaselineMs: 900 }],
      summary: { totalOperations: 1, regressions: 1 },
    }),
    createApiRequestId: () => "req_test",
    readJsonBody: async () => ({}),
    normalizeSystemId: (value) => String(value || "").trim().toLowerCase(),
    findOperationEventById: () => ({
      event: { id: "evt_1", operation: "run:generate", system: "core" },
      scannedRows: 1,
    }),
    enqueueReplayJobFromOperation: () => ({ id: "job_replay_1" }),
    queueJobAcceptedPayload: (job) => ({ ok: true, jobId: job.id }),
    ...overrides,
  };
}

function createTestApp(overrides = {}) {
  const app = new Hono();
  registerOperationsRoutes(app, createBaseDeps(overrides));
  return app;
}

test("operations-routes: history validates date format", async () => {
  const app = createTestApp();
  const res = await app.request("/api/operations/history?from=not-a-date");
  assert.equal(res.status, 400);
  const payload = await res.json();
  assert.equal(payload.code, "validation.invalid_date_format");
});

test("operations-routes: history returns events and filters", async () => {
  const app = createTestApp();
  const res = await app.request(
    "/api/operations/history?system=core&operation=run:generate&status=ok&limit=10",
  );
  assert.equal(res.status, 200);
  const payload = await res.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.events.length, 1);
  assert.equal(payload.filters.systemId, "core");
  assert.equal(payload.filters.limit, 10);
});

test("operations-routes: regressions rejects unknown system", async () => {
  const app = createTestApp();
  const res = await app.request("/api/operations/regressions?system=missing");
  assert.equal(res.status, 400);
  const payload = await res.json();
  assert.equal(payload.code, "system.invalid_or_missing");
});

test("operations-routes: replay returns not_found when event is missing", async () => {
  const app = createTestApp({
    findOperationEventById: () => ({ event: null, scannedRows: 0 }),
  });
  const res = await app.request("/api/operations/replay/evt_missing", { method: "POST" });
  assert.equal(res.status, 404);
  const payload = await res.json();
  assert.equal(payload.code, "operations.event_not_found");
});

test("operations-routes: replay enqueues job and returns replay context", async () => {
  const app = createTestApp({
    readJsonBody: async () => ({ systemId: "core" }),
  });
  const res = await app.request("/api/operations/replay/evt_1", { method: "POST" });
  assert.equal(res.status, 202);
  const payload = await res.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.jobId, "job_replay_1");
  assert.equal(payload.replay.sourceEventId, "evt_1");
  assert.equal(payload.replay.targetSystem, "core");
});
