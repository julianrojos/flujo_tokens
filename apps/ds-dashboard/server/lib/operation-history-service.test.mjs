import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createOperationHistoryService } from "./operation-history-service.mjs";

function createService({ repoRoot, systems }) {
  const systemMap = new Map(systems.map((row) => [row.id, row]));
  return createOperationHistoryService({
    repoRoot,
    designSystemRepository: {
      resolveSystemContext(systemId) {
        const row = systemMap.get(systemId);
        if (!row) throw new Error("unknown");
        return { paths: { output: row.outputPath } };
      },
      getConfig() {
        return { systems: systems.map((row) => ({ id: row.id })) };
      },
    },
    normalizeSystemId(value) {
      return String(value || "").trim().toLowerCase();
    },
    writeStructuredLog() {},
    nowIso() {
      return "2026-02-24T00:00:00.000Z";
    },
    createOperationEventId() {
      return "op_test";
    },
    opsLogMaxFileBytes: 1_000_000,
    opsLogRetentionDays: 30,
    opsHistoryMaxLimit: 500,
    opsLogFileRegex: /^operations-(\d{4}-\d{2}-\d{2})(?:\.(\d+))?\.ndjson$/,
  });
}

test("operation-history-service: toFiniteTimestamp parses and rejects values", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ops-service-"));
  const service = createService({
    repoRoot: tempRoot,
    systems: [{ id: "core", outputPath: path.join(tempRoot, "output", "core") }],
  });
  assert.ok(Number.isFinite(service.toFiniteTimestamp("2026-02-24T00:00:00.000Z")));
  assert.ok(Number.isNaN(service.toFiniteTimestamp("")));
  assert.ok(Number.isNaN(service.toFiniteTimestamp("not-a-date")));
});

test("operation-history-service: readOperationHistory filters and limits rows", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ops-service-"));
  const opsDir = path.join(tempRoot, "output", "core", ".ops");
  await fs.mkdir(opsDir, { recursive: true });
  const filePath = path.join(opsDir, "operations-2026-02-24.ndjson");
  const lines = [
    {
      id: "op_1",
      timestamp: "2026-02-24T10:00:00.000Z",
      eventType: "job.finished",
      operation: "script:ds:registry:refresh",
      system: "core",
      status: "success",
      durationMs: 100,
      result: { ok: true, code: 0, summary: "ok" },
    },
    {
      id: "op_2",
      timestamp: "2026-02-24T11:00:00.000Z",
      eventType: "job.finished",
      operation: "script:ds:token-health",
      system: "core",
      status: "error",
      durationMs: 200,
      result: { ok: false, code: 1, summary: "failed" },
    },
  ];
  await fs.writeFile(filePath, `${lines.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");

  const service = createService({
    repoRoot: tempRoot,
    systems: [{ id: "core", outputPath: path.join(tempRoot, "output", "core") }],
  });

  const history = service.readOperationHistory({
    systemId: "core",
    operation: "token-health",
    status: "error",
    limit: 10,
  });

  assert.equal(history.events.length, 1);
  assert.equal(history.events[0].id, "op_2");
  assert.equal(history.scannedFiles, 1);
  assert.equal(history.scannedRows, 2);
});

test("operation-history-service: findOperationEventById returns latest match", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ops-service-"));
  const opsDir = path.join(tempRoot, "output", "core", ".ops");
  await fs.mkdir(opsDir, { recursive: true });
  const filePath = path.join(opsDir, "operations-2026-02-24.ndjson");
  const rows = [
    {
      id: "op_a",
      timestamp: "2026-02-24T09:00:00.000Z",
      eventType: "job.finished",
      operation: "script:alpha",
      system: "core",
      status: "success",
      durationMs: 50,
      result: { ok: true, code: 0, summary: "ok" },
    },
    {
      id: "op_b",
      timestamp: "2026-02-24T09:30:00.000Z",
      eventType: "job.finished",
      operation: "script:beta",
      system: "core",
      status: "error",
      durationMs: 80,
      result: { ok: false, code: 1, summary: "failed" },
    },
  ];
  await fs.writeFile(filePath, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");

  const service = createService({
    repoRoot: tempRoot,
    systems: [{ id: "core", outputPath: path.join(tempRoot, "output", "core") }],
  });

  const found = service.findOperationEventById({ eventId: "op_b", systemId: "core" });
  assert.equal(found.event?.id, "op_b");
  assert.equal(found.scannedFiles, 1);
  assert.ok(found.scannedRows >= 1);
});

test("operation-history-service: buildOperationRegressionsReport detects duration regression", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ops-service-"));
  const opsDir = path.join(tempRoot, "output", "core", ".ops");
  await fs.mkdir(opsDir, { recursive: true });
  const filePath = path.join(opsDir, "operations-2026-02-24.ndjson");

  const durations = [1200, 1100, 1000, 150, 140, 130, 120, 110];
  const base = Date.parse("2026-02-24T12:00:00.000Z");
  const rows = durations.map((durationMs, idx) => ({
    id: `op_${idx}`,
    timestamp: new Date(base - idx * 60_000).toISOString(),
    eventType: "job.finished",
    operation: "script:ds:token-health",
    system: "core",
    status: "success",
    durationMs,
    result: { ok: true, code: 0, summary: "ok" },
  }));
  await fs.writeFile(filePath, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");

  const service = createService({
    repoRoot: tempRoot,
    systems: [{ id: "core", outputPath: path.join(tempRoot, "output", "core") }],
  });

  const report = service.buildOperationRegressionsReport({
    systemId: "core",
    limit: 100,
    minSamples: 2,
  });

  assert.equal(report.generatedAt, "2026-02-24T00:00:00.000Z");
  assert.equal(report.regressions.length, 1);
  assert.equal(report.regressions[0].operation, "script:ds:token-health");
  assert.ok(report.regressions[0].signals.some((signal) => signal.kind === "duration"));
});
