import test from "node:test";
import assert from "node:assert/strict";

import { orchestrateTokenSync } from "./capture-token-orchestrator.mjs";

test("capture-token-orchestrator: skips on dry run", async () => {
  const result = await orchestrateTokenSync({
    dryRun: true,
    projectRoot: "/mock",
    systemId: "sys",
    fileKey: "key",
    figmaToken: "token"
  });

  assert.equal(result.tokenBootstrap.reason, "skipped-dry-run");
  assert.equal(result.tokenCompile.reason, "skipped-dry-run");
});

test("capture-token-orchestrator: executes and returns results when not dry run", async () => {
  let calls = [];
  const result = await orchestrateTokenSync({
    dryRun: false,
    projectRoot: "/mock",
    systemId: "sys",
    fileKey: "key",
    figmaToken: "token",
    getSystemConfigFn: () => ({ id: "sys" }),
    bootstrapInputJsonFromFigmaVariablesFn: async () => {
      calls.push("bootstrap");
      return { attempted: true, created: true, reason: "ok" };
    },
    ensureCollectionsConfiguredFn: () => calls.push("ensure"),
    runTokensCompileIfNeededFn: () => {
      calls.push("compile");
      return { attempted: true, compiled: true, reason: "ok" };
    }
  });

  assert.deepEqual(calls, ["bootstrap", "ensure", "compile"]);
  assert.equal(result.tokenBootstrap.created, true);
  assert.equal(result.tokenCompile.compiled, true);
});
