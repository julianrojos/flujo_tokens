import test from "node:test";
import assert from "node:assert/strict";

import { runSpawnWithCapture } from "./spawn-runner.mjs";

test("spawn-runner: captures parsed JSON stdout", async () => {
  const result = await runSpawnWithCapture({
    command: "node",
    commandArgs: ["-e", "process.stdout.write(JSON.stringify({ ok: true, value: 7 }))"],
    parseJsonStdout: true,
    maxOutputBytes: 1024,
  });

  assert.equal(result.spawnError, null);
  assert.equal(result.exitCode, 0);
  assert.equal(result.jsonParseError, null);
  assert.deepEqual(result.parsedJson, { ok: true, value: 7 });
});

test("spawn-runner: reports JSON parse errors", async () => {
  const result = await runSpawnWithCapture({
    command: "node",
    commandArgs: ["-e", "process.stdout.write('{invalid')"],
    parseJsonStdout: true,
    maxOutputBytes: 1024,
  });

  assert.equal(result.spawnError, null);
  assert.equal(result.exitCode, 0);
  assert.equal(typeof result.jsonParseError, "string");
  assert.equal(result.parsedJson, null);
});

test("spawn-runner: captures stderr and non-zero exits", async () => {
  const result = await runSpawnWithCapture({
    command: "node",
    commandArgs: ["-e", "process.stderr.write('boom'); process.exit(3);"],
    maxOutputBytes: 1024,
  });

  assert.equal(result.spawnError, null);
  assert.equal(result.exitCode, 3);
  assert.match(result.stderr, /boom/);
});

test("spawn-runner: captures stdout when maxOutputBytes is not provided", async () => {
  const result = await runSpawnWithCapture({
    command: "node",
    commandArgs: ["-e", "process.stdout.write('hello-world')"],
  });

  assert.equal(result.spawnError, null);
  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout, "hello-world");
});
