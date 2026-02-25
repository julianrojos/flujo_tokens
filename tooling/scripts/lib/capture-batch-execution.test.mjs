import test from "node:test";
import assert from "node:assert/strict";
import { executeCaptureBatchAndRefresh } from "./capture-batch-execution.mjs";

test("capture-batch-execution: executes batch and skips refresh if not asked", () => {
  const report = {};
  executeCaptureBatchAndRefresh({
    report,
    targets: [{ slug: "alert" }],
    projectRoot: "/mock",
    systemId: "sys",
    runCaptureBatchFn: () => ({ captured: [{ slug: "alert" }], failed: [] }),
    runJsonCommandFn: () => ({ data: { ok: true } }),
    refreshIndices: false,
  });

  assert.equal(report.ok, true);
  assert.equal(report.captured.length, 1);
  assert.equal(report.indices_refreshed, undefined);
});

test("capture-batch-execution: refreshes indices and mutates report", () => {
  const report = {};
  executeCaptureBatchAndRefresh({
    report,
    targets: [{ slug: "alert" }],
    projectRoot: "/mock",
    systemId: "sys",
    runCaptureBatchFn: () => ({ captured: [{ slug: "alert" }], failed: [] }),
    runJsonCommandFn: () => ({ data: { ok: true, extra: "data" } }),
    refreshIndices: true,
  });

  assert.equal(report.ok, true);
  assert.equal(report.indices_refreshed, true);
  assert.equal(report.registry_refresh.extra, "data");
});

test("capture-batch-execution: securely redacts figma token", () => {
  let executedArgs = null;
  const report = {};
  executeCaptureBatchAndRefresh({
    report,
    targets: [],
    projectRoot: "/mock",
    systemId: "sys",
    runCaptureBatchFn: ({ runScriptJson }) => {
      runScriptJson({ scriptPath: "/mock/script", scriptArgs: ["--figma-token", "SECRET"] });
      return { captured: [], failed: [{ error: "Failed" }] };
    },
    runJsonCommandFn: (cmd, args, options) => {
      executedArgs = options.displayArgs;
      return { data: { ok: false } };
    },
    refreshIndices: false,
  });

  assert.equal(report.ok, false);
  assert.equal(executedArgs.includes("SECRET"), false);
  assert.equal(executedArgs.includes("***redacted***"), true);
});
