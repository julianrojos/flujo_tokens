import assert from "node:assert/strict";
import test from "node:test";

import { createQueueEngineService } from "../services/queue-engine-service.ts";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForFinal(job: { id: string; status: string }, timeoutMs = 1500): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (job.status === "success" || job.status === "error" || job.status === "cancelled") return;
    await sleep(10);
  }
  throw new Error(`Timed out waiting for job ${job.id} to finish`);
}

function createEngine(overrides: Record<string, unknown> = {}) {
  const operationEvents: Array<Record<string, unknown>> = [];
  const engine = createQueueEngineService({
    jobQueueConcurrency: 1,
    jobTimeoutMs: 250,
    jobRetentionMs: 60_000,
    maxRetainedEvents: 100,
    maxRetainedJobs: 100,
    nowIso: () => new Date().toISOString(),
    onOperationEvent: (entry: Record<string, unknown>) => operationEvents.push(entry),
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

test("queue-engine-service: preserves structured error payload for downstream UX", async () => {
  const { engine } = createEngine();
  const job = engine.enqueueQueueJob({
    label: "structured-error-job",
    systemId: "core",
    operationName: "test:structured-error",
    execute: async () => {
      throw {
        code: "sync.component_proofs_required_failed",
        message: "Required screenshots missing for selected components.",
        context: {
          importMode: "partial",
          importedCount: 2,
          missingMainProofSlugs: ["button"],
          missingVariantProofSlugs: [],
        },
      };
    },
  });

  await waitForFinal(job);
  assert.equal(job.status, "error");
  assert.equal(job.result?.ok, false);
  assert.equal(job.result?.summary, "Required screenshots missing for selected components.");
  assert.equal(job.result?.payload?.code, "sync.component_proofs_required_failed");
  assert.deepEqual(job.result?.payload?.context?.missingMainProofSlugs, ["button"]);
  const endEvent = job.events.find((event) => event.type === "end");
  assert.equal(endEvent?.payload?.code, "sync.component_proofs_required_failed");
});

test("queue-engine-service: ignores non-namespaced structured codes", async () => {
  const { engine } = createEngine();
  const job = engine.enqueueQueueJob({
    label: "unscoped-structured-error-job",
    systemId: "core",
    operationName: "test:unscoped-structured-error",
    execute: async () => {
      throw {
        code: "component_proofs_required_failed",
        message: "Unscoped error code should not be promoted.",
        context: {
          importedCount: 1,
        },
      };
    },
  });

  await waitForFinal(job);
  assert.equal(job.status, "error");
  assert.equal(job.result?.ok, false);
  assert.equal(job.result?.summary, "Unscoped error code should not be promoted.");
  assert.equal(job.result?.payload, undefined);
  const endEvent = job.events.find((event) => event.type === "end");
  assert.equal(endEvent?.payload, undefined);
});

test("queue-engine-service: ignores unsupported namespaced structured codes", async () => {
  const { engine } = createEngine();
  const job = engine.enqueueQueueJob({
    label: "unsupported-namespaced-structured-error-job",
    systemId: "core",
    operationName: "test:unsupported-namespaced-structured-error",
    execute: async () => {
      throw {
        code: "sync.other_job_failure",
        message: "Unsupported namespaced code should not be promoted.",
        context: {
          importedCount: 3,
        },
      };
    },
  });

  await waitForFinal(job);
  assert.equal(job.status, "error");
  assert.equal(job.result?.ok, false);
  assert.equal(job.result?.summary, "Unsupported namespaced code should not be promoted.");
  assert.equal(job.result?.payload, undefined);
  const endEvent = job.events.find((event) => event.type === "end");
  assert.equal(endEvent?.payload, undefined);
});
