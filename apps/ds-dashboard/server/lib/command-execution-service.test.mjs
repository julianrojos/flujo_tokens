import assert from "node:assert/strict";
import test from "node:test";

import { createCommandExecutionService } from "./command-execution-service.mjs";

function createService(overrides = {}) {
  return createCommandExecutionService({
    runSpawnWithCapture: async () => ({
      spawnError: null,
      exitCode: 0,
      stdout: "",
      stderr: "",
      jsonParseError: null,
      parsedJson: null,
    }),
    maxOutputBytes: 1024,
    summarizePayloadFailure: (payload, code) =>
      String(payload?.message || payload?.error || `code:${code}`),
    ...overrides,
  });
}

test("command-execution-service: spawn errors return failed payload", async () => {
  const service = createService({
    runSpawnWithCapture: async () => ({
      spawnError: "ENOENT",
      exitCode: null,
      stdout: "",
      stderr: "",
    }),
  });

  const result = await service.runQueuedSpawnCommand({
    cwd: "/repo",
    command: "node",
    commandArgs: ["-v"],
    emitChunk() {},
    commandLabel: "node -v",
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 1);
  assert.match(result.summary, /ENOENT/);
});

test("command-execution-service: plain command success returns output", async () => {
  const service = createService({
    runSpawnWithCapture: async () => ({
      spawnError: null,
      exitCode: 0,
      stdout: "done",
      stderr: "",
    }),
  });

  const result = await service.runQueuedSpawnCommand({
    cwd: "/repo",
    command: "npm",
    commandArgs: ["run", "x"],
    emitChunk() {},
    commandLabel: "npm run x",
  });

  assert.equal(result.ok, true);
  assert.equal(result.code, 0);
  assert.equal(result.payload.output, "done");
});

test("command-execution-service: parseJson success respects payload.ok", async () => {
  const service = createService({
    runSpawnWithCapture: async () => ({
      spawnError: null,
      exitCode: 0,
      stdout: '{"ok":false,"message":"bad"}',
      stderr: "",
      jsonParseError: null,
      parsedJson: { ok: false, message: "bad" },
    }),
  });

  const result = await service.runQueuedSpawnCommand({
    cwd: "/repo",
    command: "node",
    commandArgs: ["script.mjs"],
    parseJsonStdout: true,
    emitChunk() {},
    commandLabel: "node script.mjs",
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 1);
  assert.equal(result.summary, "bad");
});

test("command-execution-service: parseJson parse errors are surfaced", async () => {
  const service = createService({
    runSpawnWithCapture: async () => ({
      spawnError: null,
      exitCode: 0,
      stdout: "{invalid",
      stderr: "",
      jsonParseError: "Unexpected token",
      parsedJson: null,
    }),
  });

  const result = await service.runQueuedSpawnCommand({
    cwd: "/repo",
    command: "node",
    commandArgs: ["script.mjs"],
    parseJsonStdout: true,
    emitChunk() {},
    commandLabel: "node script.mjs",
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 0);
  assert.match(result.summary, /invalid JSON/i);
});

test("command-execution-service: allowNonZeroJson converts non-zero to structured failure", async () => {
  const service = createService({
    runSpawnWithCapture: async () => ({
      spawnError: null,
      exitCode: 2,
      stdout: '{"message":"failed nicely"}',
      stderr: "stderr",
      jsonParseError: null,
      parsedJson: { message: "failed nicely" },
    }),
  });

  const result = await service.runQueuedSpawnCommand({
    cwd: "/repo",
    command: "node",
    commandArgs: ["script.mjs"],
    parseJsonStdout: true,
    allowNonZeroJson: true,
    emitChunk() {},
    commandLabel: "node script.mjs",
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 2);
  assert.equal(result.summary, "failed nicely");
  assert.equal(result.payload.exit_code, 2);
});
