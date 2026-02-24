import assert from "node:assert/strict";
import test from "node:test";

import { createQueueJobFactoryService } from "./queue-job-factory-service.mjs";

function createFactory(overrides = {}) {
  const enqueued = [];
  const runCalls = [];
  const systems = new Map([
    [
      "core",
      {
        repoRoot: "/repo",
        systemId: "core",
        healthSnapshotScriptPath: "tooling/scripts/ds-health-snapshot.mjs",
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
    async computeNamingDebtReport() {
      return {
        generatedAt: "2026-02-24T00:00:00.000Z",
        summary: { totalViolations: 0, overallScore: 100 },
      };
    },
    replayableNpmScripts: new Set(["ds:registry:refresh"]),
    supportedReplayOperations: new Set(["refresh:naming-debt", "script:ds-health-snapshot.mjs", "script:ds:registry:refresh"]),
    ...overrides,
  });

  return { service, enqueued, runCalls };
}

test("queue-job-factory: queueNpmScript enqueues npm command with system arg", () => {
  const { service, enqueued } = createFactory();
  const job = service.queueNpmScript({
    repoRoot: "/repo",
    script: "ds:registry:refresh",
    systemId: "core",
    requestId: "req_1",
  });

  assert.deepEqual(job, { id: "job_1" });
  assert.equal(enqueued.length, 1);
  assert.equal(enqueued[0].operationName, "script:ds:registry:refresh");
  assert.match(enqueued[0].label, /npm run ds:registry:refresh/);
});

test("queue-job-factory: queueNodeJsonCommand configures JSON parsing", () => {
  const { service, enqueued } = createFactory();
  service.queueNodeJsonCommand({
    repoRoot: "/repo",
    commandLabel: "node script.mjs",
    scriptPath: "tooling/scripts/script.mjs",
    scriptArgs: ["--flag", "1"],
    systemId: "core",
    allowNonZeroJson: true,
  });

  assert.equal(enqueued.length, 1);
  assert.equal(enqueued[0].operationName, "script:script.mjs");
});

test("queue-job-factory: replay handles run: operations", () => {
  const { service, enqueued } = createFactory({
    supportedReplayOperations: new Set(["run:ds:pipeline"]),
  });

  service.enqueueReplayJobFromOperation({
    operation: "run:ds:pipeline",
    systemId: "core",
    requestId: "req_2",
    sourceEventId: "event_1",
  });

  assert.equal(enqueued.length, 1);
  assert.equal(enqueued[0].operationName, "run:ds:pipeline");
  assert.match(enqueued[0].label, /npm run ds:pipeline/);
});

test("queue-job-factory: replay rejects unsupported operations", () => {
  const { service } = createFactory({
    supportedReplayOperations: new Set(["refresh:naming-debt"]),
  });

  assert.throws(
    () =>
      service.enqueueReplayJobFromOperation({
        operation: "script:unknown",
        systemId: "core",
      }),
    /requires parameters and cannot be replayed automatically/,
  );
});
