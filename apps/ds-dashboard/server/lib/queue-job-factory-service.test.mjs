import assert from "node:assert/strict";
import test from "node:test";

import { createQueueJobFactoryService } from "../services/queue-job-factory-service.ts";

function createFactory(overrides = {}) {
  const enqueued = [];
  const runCalls = [];
  const systems = new Map([
    [
      "core",
      {
        repoRoot: "/repo",
        systemId: "core",
        wcagPairs: { pairs: [{ foreground: "text.primary", background: "bg.canvas", level: "AA", textSize: "normal" }] },
      },
    ],
  ]);

  const service = createQueueJobFactoryService({
    getSystemContext(systemId) {
      const row = systems.get(systemId);
      if (!row) throw new Error("unknown system");
      return row;
    },
    enqueueQueueJob(payload) {
      enqueued.push(payload);
      return { id: `job_${enqueued.length}` };
    },
    async runQueuedSpawnCommand(args) {
      runCalls.push(args);
      return { ok: true, code: 0, summary: "ok", payload: { ok: true } };
    },
    sha256Text(value) {
      return `hash:${String(value).length}`;
    },
    ...overrides,
  });

  return { service, enqueued, runCalls };
}

test("queue-job-factory: queueNpmScript enqueues npm command with system arg", () => {
  const { service, enqueued } = createFactory();
  const job = service.queueNpmScript({
    repoRoot: "/repo",
    script: "ds:token-usage-index",
    systemId: "core",
    requestId: "req_1",
  });

  assert.deepEqual(job, { id: "job_1" });
  assert.equal(enqueued.length, 1);
  assert.equal(enqueued[0].operationName, "script:ds:token-usage-index");
  assert.match(enqueued[0].label, /npm run ds:token-usage-index/);
});

test("queue-job-factory: queueNodeJsonCommand adds tsx loader for TypeScript runners", async () => {
  const { service, enqueued, runCalls } = createFactory();
  service.queueNodeJsonCommand({
    repoRoot: "/repo",
    commandLabel: "node --import tsx tooling/src/runners/capture.mjs",
    scriptPath: "tooling/src/runners/capture-visual-proof-runner.ts",
    scriptArgs: ["--flag", "1"],
    commandEnv: { FIGMA_TOKEN: "secret" },
    systemId: "core",
    allowNonZeroJson: true,
  });

  assert.equal(enqueued.length, 1);
  await enqueued[0].execute({ emitChunk() {}, setProcess() {} });
  assert.deepEqual(runCalls[0].commandArgs.slice(0, 3), [
    "--import",
    "tsx",
    "tooling/src/runners/capture-visual-proof-runner.ts",
  ]);
  assert.deepEqual(runCalls[0].commandEnv, { FIGMA_TOKEN: "secret" });
});

test("queue-job-factory: queueNodeJsonCommand configures JSON parsing", async () => {
  const { service, enqueued, runCalls } = createFactory();
  service.queueNodeJsonCommand({
    repoRoot: "/repo",
    commandLabel: "node script.mjs",
    scriptPath: "tooling/scripts/script.mjs",
    scriptArgs: ["--flag", "1"],
    commandEnv: { FIGMA_TOKEN: "secret" },
    systemId: "core",
    allowNonZeroJson: true,
  });

  assert.equal(enqueued.length, 1);
  assert.equal(enqueued[0].operationName, "script:script.mjs");
  await enqueued[0].execute({ emitChunk() {}, setProcess() {} });
  assert.equal(runCalls.length, 1);
  assert.deepEqual(runCalls[0].commandEnv, { FIGMA_TOKEN: "secret" });
});

test("queue-job-factory: queueNodeJsonCommand runs onSuccess post-processing hook", async () => {
  let hookPayload = null;
  const { service, enqueued } = createFactory({
    async runQueuedSpawnCommand() {
      return { ok: true, code: 0, summary: "ok", payload: { ok: true, captured: [] } };
    },
  });

  service.queueNodeJsonCommand({
    repoRoot: "/repo",
    commandLabel: "node capture.mjs",
    scriptPath: "tooling/scripts/capture.mjs",
    scriptArgs: [],
    systemId: "core",
    onSuccess: async ({ payload }) => {
      hookPayload = payload;
    },
  });

  const result = await enqueued[0].execute({ emitChunk() {}, setProcess() {} });
  assert.equal(result.ok, true);
  assert.deepEqual(hookPayload, { ok: true, captured: [] });
});

test("queue-job-factory: queueNodeJsonCommand fails when onSuccess hook throws", async () => {
  const emitted = [];
  const { service, enqueued } = createFactory({
    async runQueuedSpawnCommand() {
      return { ok: true, code: 0, summary: "ok", payload: { ok: true } };
    },
  });

  service.queueNodeJsonCommand({
    repoRoot: "/repo",
    commandLabel: "node capture.mjs",
    scriptPath: "tooling/scripts/capture.mjs",
    scriptArgs: [],
    systemId: "core",
    onSuccess: async () => {
      throw new Error("db write failed");
    },
  });

  const result = await enqueued[0].execute({
    emitChunk(kind, text) {
      emitted.push({ kind, text });
    },
    setProcess() {},
  });

  assert.equal(result.ok, false);
  assert.match(String(result.summary || ""), /Post-processing failed/i);
  assert.ok(emitted.some((entry) => entry.kind === "error" && /db write failed/i.test(String(entry.text))));
});
