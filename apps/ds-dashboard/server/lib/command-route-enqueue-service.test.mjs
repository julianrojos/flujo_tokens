import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCaptureFigmaScreenshotQueueArgs,
  buildHealthSnapshotQueueArgs,
  buildRefreshScriptQueueArgs,
  buildRunScriptQueueConfig,
  buildSyncFigmaTokensQueueArgs,
  parseScriptNameFromRoute,
} from "./command-route-enqueue-service.mjs";

function createSysCtx() {
  return {
    repoRoot: "/repo",
    systemId: "core",
    healthSnapshotScriptPath: "tooling/scripts/ds-health-snapshot.mjs",
    tokensFromFigmaScriptPath: "tooling/scripts/ds-tokens-from-figma.mjs",
    captureFromFigmaUrlScriptPath: "tooling/scripts/ds-capture-from-figma-url.mjs",
  };
}

test("command-route-enqueue-service: parseScriptNameFromRoute validates empties", () => {
  const ok = parseScriptNameFromRoute("ds:pipeline", "req_1");
  assert.equal(ok.ok, true);
  assert.equal(ok.scriptName, "ds:pipeline");

  const invalid = parseScriptNameFromRoute("   ", "req_1");
  assert.equal(invalid.ok, false);
  assert.equal(invalid.statusCode, 400);
  assert.equal(invalid.errorArgs.code, "validation.missing_script_name");
});

test("command-route-enqueue-service: buildRefreshScriptQueueArgs preserves routing context", () => {
  const queueArgs = buildRefreshScriptQueueArgs({
    sysCtx: createSysCtx(),
    requestId: "req_1",
    script: "ds:registry:refresh",
  });
  assert.equal(queueArgs.repoRoot, "/repo");
  assert.equal(queueArgs.systemId, "core");
  assert.equal(queueArgs.script, "ds:registry:refresh");
});

test("command-route-enqueue-service: buildRunScriptQueueConfig returns queue args and run command", () => {
  const config = buildRunScriptQueueConfig({
    scriptName: "ds:pipeline",
    body: { all: true },
    sysCtx: createSysCtx(),
    requestId: "req_1",
    buildRunScriptCommandArgsFn: () => ({ args: ["run", "ds:pipeline", "--", "--system", "core"] }),
    sha256TextFn: (value) => `hash:${value.length}`,
  });

  assert.equal(config.commandLabel, "npm run ds:pipeline -- --system core");
  assert.equal(config.queueArgs.operationName, "run:ds:pipeline");
  assert.equal(config.runCommand.command, "npm");
  assert.deepEqual(config.runCommand.commandArgs, ["run", "ds:pipeline", "--", "--system", "core"]);
  assert.match(config.queueArgs.inputHash, /^hash:/);
});

test("command-route-enqueue-service: build node queue args for health/sync/capture", () => {
  const sysCtx = createSysCtx();
  const requestId = "req_1";
  const parsed = {
    commandLabel: "node tooling/scripts/ds-health-snapshot.mjs --before-ref HEAD~1",
    scriptArgs: ["--before-ref", "HEAD~1"],
    commandDisplayArgs: ["--url", "https://figma.com/file/abc", "--figma-token", "***redacted***"],
    commandArgs: ["--url", "https://figma.com/file/abc", "--figma-token", "secret"],
  };

  const health = buildHealthSnapshotQueueArgs({ sysCtx, requestId, parsed });
  assert.equal(health.scriptPath, sysCtx.healthSnapshotScriptPath);

  const sync = buildSyncFigmaTokensQueueArgs({ sysCtx, requestId, parsed });
  assert.equal(sync.allowNonZeroJson, true);
  assert.match(sync.commandLabel, /ds-tokens-from-figma\.mjs/);
  assert.match(sync.commandLabel, /\*\*\*redacted\*\*\*/);
  assert.ok(sync.scriptArgs.includes("secret"));

  const capture = buildCaptureFigmaScreenshotQueueArgs({ sysCtx, requestId, parsed });
  assert.equal(capture.allowNonZeroJson, true);
  assert.match(capture.commandLabel, /ds-capture-from-figma-url\.mjs/);
});
