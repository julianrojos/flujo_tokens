import assert from "node:assert/strict";
import test from "node:test";

import { Hono } from "hono";

import { registerJobRoutes } from "./job-routes.mjs";

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
  const queueJobs = new Map();
  return {
    failJson: createFailJson(),
    queueJobs,
    listQueueJobEvents: (job) => job.events || [],
    queueJobSnapshot: (job) => ({ id: job.id, status: job.status }),
    isQueueJobFinalStatus: (status) => status === "success" || status === "error" || status === "cancelled",
    cancelQueueJob: () => ({ ok: true }),
    toQueueTerminalEvent: (job) => ({ type: "end", status: job.status }),
    buildApiErrorPayload: (args) => ({ ok: false, ...args }),
    MAX_RETAINED_EVENTS: 2000,
    ...overrides,
  };
}

function createTestApp(depsOverrides = {}) {
  const app = new Hono();
  const deps = createBaseDeps(depsOverrides);
  registerJobRoutes(app, deps);
  return { app, deps };
}

test("job-routes: /api/jobs/:jobId returns 404 when missing", async () => {
  const { app } = createTestApp();
  const res = await app.request("/api/jobs/missing", { method: "GET" });
  assert.equal(res.status, 404);
  const payload = await res.json();
  assert.equal(payload.code, "queue.job_not_found");
});

test("job-routes: /api/jobs/:jobId returns snapshot and events", async () => {
  const { app, deps } = createTestApp();
  deps.queueJobs.set("job_1", {
    id: "job_1",
    status: "running",
    events: [{ seq: 1, type: "progress" }],
    nextSeq: 2,
  });

  const res = await app.request("/api/jobs/job_1", { method: "GET" });
  assert.equal(res.status, 200);
  const payload = await res.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.job.id, "job_1");
  assert.equal(payload.done, false);
  assert.equal(payload.events.length, 1);
  assert.equal(payload.nextCursor, 1);
});

test("job-routes: /api/jobs/:jobId delete returns conflict when not cancelable", async () => {
  const { app, deps } = createTestApp({
    cancelQueueJob: () => ({ ok: false, message: "cannot cancel" }),
  });
  deps.queueJobs.set("job_2", {
    id: "job_2",
    status: "success",
    events: [],
    nextSeq: 1,
  });

  const res = await app.request("/api/jobs/job_2", { method: "DELETE" });
  assert.equal(res.status, 409);
  const payload = await res.json();
  assert.equal(payload.code, "queue.job_not_cancelable");
});

test("job-routes: /api/jobs/:jobId/stream returns 404 when missing", async () => {
  const { app } = createTestApp();
  const res = await app.request("/api/jobs/unknown/stream", { method: "GET" });
  assert.equal(res.status, 404);
  const payload = await res.json();
  assert.equal(payload.code, "queue.job_not_found");
});
