import assert from "node:assert/strict";
import test from "node:test";

import { createQueueEngineService } from "./queue-engine-service.mjs";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForFinal(job, timeoutMs = 1500) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (job.status === "success" || job.status === "error" || job.status === "cancelled") return;
    await sleep(10);
  }
  throw new Error(`Timed out waiting for job ${job.id} to finish`);
}

function createEngine(overrides = {}) {
  const operationEvents = [];
  const engine = createQueueEngineService({
    jobQueueConcurrency: 1,
    jobTimeoutMs: 250,
    jobRetentionMs: 60_000,
    maxRetainedEvents: 100,
    maxRetainedJobs: 100,
    nowIso: () => new Date().toISOString(),
    onOperationEvent: (entry) => operationEvents.push(entry),
    ...overrides,
  });
  return { engine, operationEvents };
}

test("queue-engine-service: enqueue executes and marks success", async () => {
  const { engine, operationEvents } = createEngine();
  const job = engine.enqueueQueueJob({
    label: "test-job",
    systemId: "core",
    operationName: "test:success",
    execute: async ({ emitChunk }) => {
      emitChunk("stdout", "hello");
      return { ok: true, code: 0, summary: "done", payload: { value: 1 } };
    },
  });

  await waitForFinal(job);
  assert.equal(job.status, "success");
  assert.equal(job.result?.ok, true);
  assert.ok(job.events.some((event) => event.type === "chunk"));
  assert.ok(operationEvents.some((event) => event.eventType === "job.queued"));
  assert.ok(operationEvents.some((event) => event.eventType === "job.finished"));
});

test("queue-engine-service: cancel queued job before execution", async () => {
  const { engine } = createEngine({ jobQueueConcurrency: 0 });
  const job = engine.enqueueQueueJob({
    label: "queued-job",
    systemId: "core",
    operationName: "test:cancel-queued",
    execute: async () => ({ ok: true, code: 0, summary: "should not run" }),
  });

  const result = engine.cancelQueueJob(job.id);
  assert.deepEqual(result, { ok: true });
  assert.equal(job.status, "cancelled");
  assert.equal(job.result?.summary, "Cancelled before execution.");
});

test("queue-engine-service: cancel running job transitions to cancelled terminal state", async () => {
  const { engine } = createEngine({ jobTimeoutMs: 1000 });
  const job = engine.enqueueQueueJob({
    label: "running-job",
    systemId: "core",
    operationName: "test:cancel-running",
    execute: async () => {
      await sleep(50);
      return { ok: true, code: 0, summary: "finished after cancel" };
    },
  });

  await sleep(10);
  const result = engine.cancelQueueJob(job.id);
  assert.deepEqual(result, { ok: true });
  await waitForFinal(job);
  await sleep(80);
  assert.equal(job.status, "cancelled");
  assert.ok(job.result === undefined || job.result?.ok === false);
});

test("queue-engine-service: timeout marks job as error code 124", async () => {
  const { engine } = createEngine({ jobTimeoutMs: 20 });
  const job = engine.enqueueQueueJob({
    label: "timeout-job",
    systemId: "core",
    operationName: "test:timeout",
    execute: async () => {
      await sleep(60);
      return { ok: true, code: 0, summary: "too late" };
    },
  });

  await waitForFinal(job);
  assert.equal(job.status, "error");
  assert.equal(job.result?.code, 124);
  assert.match(String(job.result?.summary || ""), /timed out/i);
});
