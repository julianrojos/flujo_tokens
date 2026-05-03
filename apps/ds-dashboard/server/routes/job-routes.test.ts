import assert from "node:assert/strict";
import test from "node:test";

import { Hono } from "hono";

import { registerJobRoutes } from "./job-routes.ts";

function createFailJson() {
  return (c: any, statusCode: number, args: Record<string, unknown>) =>
    c.json(
      {
        ok: false,
        code: args.code,
        message: args.userMessage,
      },
      statusCode,
    );
}

function createBaseDeps(overrides: Record<string, unknown> = {}) {
  const queueJobs = new Map();
  return {
    failJson: createFailJson(),
    queueJobs,
    listQueueJobEvents: (job: { events?: Array<{ seq: number }> }) => job.events || [],
    queueJobSnapshot: (job: { id: string; status: string }) => ({ id: job.id, status: job.status }),
    isQueueJobFinalStatus: (status: string) => status === "success" || status === "error" || status === "cancelled",
    cancelQueueJob: () => ({ ok: true }),
    toQueueTerminalEvent: (job: { status: string }) => ({ type: "end", status: job.status }),
    buildApiErrorPayload: (args: Record<string, unknown>) => ({ ok: false, ...args }),
    MAX_RETAINED_EVENTS: 2000,
    ...overrides,
  };
}

function createTestApp(depsOverrides: Record<string, unknown> = {}) {
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

test("job-routes: /api/jobs/:jobId falls back to persisted design system sync job", async () => {
  const persistedRow = {
    job_id: "sync_job_1",
    system_id: "core",
    operation_name: "sync:design-system",
    label: "sync design system (figma→db)",
    status: "success",
    request_id: "req_1",
    started_at: new Date("2026-05-03T10:00:00.000Z"),
    finished_at: new Date("2026-05-03T10:01:00.000Z"),
    result_json: {
      ok: true,
      code: 0,
      summary: "Sync completed.",
      payload: {
        ok: true,
        status: "completed",
        steps: {
          components: { status: "completed", summary: "Components synced.", warnings: [], counts: { captured: 1 } },
          variables: { status: "completed", summary: "Variables synced.", warnings: [], counts: { tokens: 3 } },
        },
        warnings: [],
      },
    },
    created_at: new Date("2026-05-03T10:00:00.000Z"),
    updated_at: new Date("2026-05-03T10:01:00.000Z"),
  };
  const db = async () => [persistedRow];
  const { app } = createTestApp({ db });

  const res = await app.request("/api/jobs/sync_job_1", { method: "GET" });
  assert.equal(res.status, 200);
  const payload = await res.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.job.id, "sync_job_1");
  assert.equal(payload.job.status, "success");
  assert.equal(payload.job.result.summary, "Sync completed.");
  assert.equal(payload.done, true);
});

test("job-routes: /api/jobs/:jobId returns 404 when persisted sync job lookup fails", async () => {
  const db = async () => {
    throw new Error("relation \"design_system_sync_jobs\" does not exist");
  };
  const { app } = createTestApp({ db });

  const res = await app.request("/api/jobs/sync_job_missing_table", { method: "GET" });
  assert.equal(res.status, 404);
  const payload = await res.json();
  assert.equal(payload.code, "queue.job_not_found");
});

test("job-routes: /api/jobs/:jobId returns 500 for other persisted sync job lookup failures", async () => {
  const db = async () => {
    throw new Error("permission denied for relation design_system_sync_jobs");
  };
  const { app } = createTestApp({ db });

  const res = await app.request("/api/jobs/sync_job_lookup_error", { method: "GET" });
  assert.equal(res.status, 500);
  const payload = await res.json();
  assert.equal(payload.code, "internal.job_lookup_failed");
});

test("job-routes: /api/jobs/:jobId returns running persisted design system sync job", async () => {
  const persistedRow = {
    job_id: "sync_job_2",
    system_id: "core",
    operation_name: "sync:design-system",
    label: "sync design system (figma→db)",
    status: "running",
    request_id: "req_2",
    started_at: new Date("2026-05-03T10:00:00.000Z"),
    finished_at: null,
    result_json: null,
    created_at: new Date("2026-05-03T10:00:00.000Z"),
    updated_at: new Date("2026-05-03T10:00:30.000Z"),
  };
  const db = async () => [persistedRow];
  const { app } = createTestApp({ db });

  const res = await app.request("/api/jobs/sync_job_2", { method: "GET" });
  assert.equal(res.status, 200);
  const payload = await res.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.job.id, "sync_job_2");
  assert.equal(payload.job.status, "running");
  assert.equal(payload.done, false);
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
