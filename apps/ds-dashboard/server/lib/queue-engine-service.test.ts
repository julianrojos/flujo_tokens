import assert from "node:assert/strict";
import test from "node:test";

import { createQueueEngineService } from "../services/queue-engine-service.ts";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

async function waitForFinal(job: { id: string; status: string }, timeoutMs = 1500): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (job.status === "success" || job.status === "error" || job.status === "cancelled") return;
    await sleep(10);
  }
  throw new Error(`Timed out waiting for job ${job.id} to finish`);
}

async function waitForValue(values: string[], expected: string, timeoutMs = 500): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (values.includes(expected)) return;
    await sleep(10);
  }
  throw new Error(`Timed out waiting for ${expected}`);
}

async function waitForActiveCount(
  engine: { queueMetrics: () => { active: number } },
  expected: number,
  timeoutMs = 1000,
): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (engine.queueMetrics().active === expected) return;
    await sleep(10);
  }
  throw new Error(`Timed out waiting for active count ${expected}`);
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

test("queue-engine-service: high priority jobs run before normal queued jobs", async () => {
  const { engine } = createEngine({ jobQueueConcurrency: 1, jobTimeoutMs: 1000 });
  const gate = deferred<void>();
  const started: string[] = [];

  const first = engine.enqueueQueueJob({
    label: "blocking-job",
    systemId: "system-a",
    operationName: "test:blocking",
    execute: async () => {
      started.push("first");
      await gate.promise;
      return { ok: true, code: 0, summary: "first done" };
    },
  });

  engine.enqueueQueueJob({
    label: "normal-job",
    systemId: "system-b",
    operationName: "test:normal",
    execute: async () => {
      started.push("normal");
      return { ok: true, code: 0, summary: "normal done" };
    },
  });

  engine.enqueueQueueJob({
    label: "high-job",
    systemId: "system-c",
    operationName: "test:high",
    priority: "high",
    execute: async () => {
      started.push("high");
      return { ok: true, code: 0, summary: "high done" };
    },
  });

  await sleep(20);
  assert.equal(first.status, "running");
  gate.resolve(undefined);
  await waitForFinal(first);
  await sleep(20);
  assert.equal(started[0], "first");
  assert.equal(started[1], "high");
  assert.equal(started[2], "normal");
});

test("queue-engine-service: serializes jobs from the same system while allowing others to run", async () => {
  const { engine } = createEngine({ jobQueueConcurrency: 2, jobTimeoutMs: 1000 });
  const sameSystemGate = deferred<void>();
  const started: string[] = [];

  const first = engine.enqueueQueueJob({
    label: "same-system-1",
    systemId: "shared-system",
    operationName: "test:same-system-1",
    execute: async () => {
      started.push("one");
      await sameSystemGate.promise;
      return { ok: true, code: 0, summary: "one done" };
    },
  });

  const second = engine.enqueueQueueJob({
    label: "same-system-2",
    systemId: "shared-system",
    operationName: "test:same-system-2",
    execute: async () => {
      started.push("two");
      return { ok: true, code: 0, summary: "two done" };
    },
  });

  const third = engine.enqueueQueueJob({
    label: "other-system",
    systemId: "other-system",
    operationName: "test:other-system",
    execute: async () => {
      started.push("three");
      await sleep(100);
      return { ok: true, code: 0, summary: "three done" };
    },
  });

  await sleep(20);
  assert.equal(first.status, "running");
  assert.equal(second.status, "queued");
  assert.equal(third.status, "running");

  sameSystemGate.resolve(undefined);
  await waitForFinal(first);
  await waitForValue(started, "two");
  assert.equal(third.status, "running");

  await waitForFinal(second);
  await waitForFinal(third);
  assert.equal(started[0], "one");
  assert.equal(started[1], "three");
  assert.equal(started[2], "two");
});

test("queue-engine-service: components and tokens operations serialize within the same system", async () => {
  const { engine } = createEngine({ jobQueueConcurrency: 2, jobTimeoutMs: 1000 });
  const captureGate = deferred<void>();
  const started: string[] = [];

  const captureJob = engine.enqueueQueueJob({
    label: "capture",
    systemId: "sys-1",
    operationName: "sync:design-system:components",
    execute: async () => {
      started.push("capture");
      await captureGate.promise;
      return { ok: true, code: 0, summary: "capture done" };
    },
  });

  const tokensJob = engine.enqueueQueueJob({
    label: "tokens",
    systemId: "sys-1",
    operationName: "sync:design-system:tokens",
    priority: "high",
    execute: async () => {
      started.push("tokens");
      return { ok: true, code: 0, summary: "tokens done" };
    },
  });

  await sleep(20);
  assert.equal(captureJob.status, "running");
  assert.equal(tokensJob.status, "queued");
  assert.deepEqual(started, ["capture"]);

  captureGate.resolve(undefined);
  await waitForFinal(captureJob);
  await waitForValue(started, "tokens");
  await waitForFinal(tokensJob);
  assert.deepEqual(started, ["capture", "tokens"]);
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

test("queue-engine-service: cancelled running job does not preserve execute result payload", async () => {
  const { engine } = createEngine({ jobTimeoutMs: 1000 });
  const job = engine.enqueueQueueJob({
    label: "running-job-payload",
    systemId: "core",
    operationName: "test:cancel-running-payload",
    execute: async () => {
      await sleep(50);
      return {
        ok: true,
        code: 7,
        summary: "finished after cancel",
        payload: { preserved: true },
      };
    },
  });

  await sleep(10);
  const result = engine.cancelQueueJob(job.id);
  assert.deepEqual(result, { ok: true });
  await waitForFinal(job);
  await sleep(80);

  assert.equal(job.status, "cancelled");
  assert.equal(job.finishedAt !== undefined, true);
  assert.equal(job.result?.ok, false);
  assert.equal(job.result?.code, 1);
  assert.equal(job.result?.summary, "Cancelled.");
  assert.equal(job.result?.payload, undefined);
});

test("queue-engine-service: cancelled hung job is killed by the watchdog and releases the queue", async () => {
  const { engine } = createEngine({ jobTimeoutMs: 40 });
  const killSignals: string[] = [];
  const completion = deferred<{ ok: boolean; code?: number; summary?: string }>();

  const job = engine.enqueueQueueJob({
    label: "hung-job",
    systemId: "core",
    operationName: "test:cancel-hung",
    execute: async ({ setProcess }) => {
      setProcess({
        killed: false,
        kill: (signal = "SIGTERM") => {
          killSignals.push(signal);
          if (signal === "SIGKILL") {
            completion.resolve({
              ok: false,
              code: 1,
              summary: "Killed after cancel.",
            });
          }
        },
      });
      return completion.promise;
    },
  });

  await sleep(10);
  const result = engine.cancelQueueJob(job.id);
  assert.deepEqual(result, { ok: true });
  assert.equal(job.status, "cancelled");
  assert.ok(job.finishedAt);
  assert.equal(job.result?.summary, "Cancelled.");

  await waitForActiveCount(engine, 0, 500);
  await sleep(10);

  assert.ok(killSignals.includes("SIGTERM"));
  assert.ok(killSignals.includes("SIGKILL"));
  assert.equal(engine.queueMetrics().active, 0);
  assert.equal(job.status, "cancelled");
  assert.ok(job.finishedAt);
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
