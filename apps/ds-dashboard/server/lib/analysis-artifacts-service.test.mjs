import test from "node:test";
import assert from "node:assert/strict";

import {
  computeNamingDebtReport,
  normalizeImpactWcagPairs,
  runNodeJsonCommandOnce,
  validateGitRef,
} from "./analysis-artifacts-service.mjs";

test("analysis-artifacts-service: validateGitRef accepts safe refs and rejects invalid ones", () => {
  assert.equal(validateGitRef("HEAD~1"), "HEAD~1");
  assert.equal(validateGitRef("feature/my-branch"), "feature/my-branch");
  assert.equal(validateGitRef("invalid ref"), null);
  assert.equal(validateGitRef("refs:bad"), null);
});

test("analysis-artifacts-service: normalizeImpactWcagPairs sanitizes payload", () => {
  const pairs = normalizeImpactWcagPairs({
    pairs: [
      { foreground: "a", background: "b", level: "aaa", textSize: "large" },
      { foreground: "x", background: "y", level: "AA", textSize: "normal" },
      { foreground: "", background: "y" },
    ],
  });

  assert.deepEqual(pairs, [
    { foreground: "a", background: "b", level: "AAA", textSize: "large" },
    { foreground: "x", background: "y", level: "AA", textSize: "normal" },
  ]);
});

test("analysis-artifacts-service: computeNamingDebtReport reads artifacts and delegates analysis", async () => {
  const files = new Map([
    ["/tmp/registry.json", '{"entries":[1]}' ],
    ["/tmp/usage.json", '{"usage":[2]}' ],
    ["/tmp/graph.json", '{"nodes":[3]}' ],
    ["/tmp/config.json", '{"threshold":1}' ],
  ]);

  const report = await computeNamingDebtReport(
    {
      tokenRegistryPath: "/tmp/registry.json",
      tokenUsageIndexPath: "/tmp/usage.json",
      tokenGraphVizPath: "/tmp/graph.json",
      namingDebtConfigPath: "/tmp/config.json",
    },
    {
      readFileFn: async (filePath) => {
        if (!files.has(filePath)) throw new Error("missing");
        return files.get(filePath);
      },
      analyzeNamingDebtFn: ({ tokenRegistry, tokenUsageIndex, tokenGraph, config }) => ({
        tokenRegistry,
        tokenUsageIndex,
        tokenGraph,
        config,
      }),
    },
  );

  assert.deepEqual(report, {
    tokenRegistry: { entries: [1] },
    tokenUsageIndex: { usage: [2] },
    tokenGraph: { nodes: [3] },
    config: { threshold: 1 },
  });
});

test("analysis-artifacts-service: runNodeJsonCommandOnce returns parsed payload on success", async () => {
  const result = await runNodeJsonCommandOnce(
    {
      cwd: "/repo",
      command: "node",
      commandArgs: ["script.mjs"],
      commandLabel: "node script.mjs",
    },
    {
      runSpawnWithCaptureFn: async () => ({
        spawnError: "",
        exitCode: 0,
        stdout: '{"ok":true}',
        stderr: "",
        jsonParseError: "",
        parsedJson: { ok: true },
      }),
    },
  );

  assert.equal(result.ok, true);
  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.payload, { ok: true });
});

test("analysis-artifacts-service: runNodeJsonCommandOnce surfaces spawn errors", async () => {
  const result = await runNodeJsonCommandOnce(
    {
      cwd: "/repo",
      command: "node",
      commandArgs: ["script.mjs"],
      commandLabel: "node script.mjs",
    },
    {
      runSpawnWithCaptureFn: async () => ({
        spawnError: "ENOENT",
        exitCode: 1,
        stdout: "",
        stderr: "",
        jsonParseError: "",
        parsedJson: null,
      }),
    },
  );

  assert.equal(result.ok, false);
  assert.equal(result.statusCode, 500);
  assert.equal(result.payload.message, "ENOENT");
});
