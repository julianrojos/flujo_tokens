import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { __agentRunnerTestUtils } from "./agent-runner.js";

describe("agent-runner envFlagEnabled", () => {
  it("returns true for truthy values", () => {
    assert.equal(__agentRunnerTestUtils.envFlagEnabled("1"), true);
    assert.equal(__agentRunnerTestUtils.envFlagEnabled("true"), true);
    assert.equal(__agentRunnerTestUtils.envFlagEnabled("yes"), true);
    assert.equal(__agentRunnerTestUtils.envFlagEnabled("on"), true);
  });

  it("returns false for falsy values", () => {
    assert.equal(__agentRunnerTestUtils.envFlagEnabled("0"), false);
    assert.equal(__agentRunnerTestUtils.envFlagEnabled("false"), false);
    assert.equal(__agentRunnerTestUtils.envFlagEnabled("no"), false);
    assert.equal(__agentRunnerTestUtils.envFlagEnabled("off"), false);
    assert.equal(__agentRunnerTestUtils.envFlagEnabled(""), false);
    assert.equal(__agentRunnerTestUtils.envFlagEnabled(undefined), false);
  });
});

describe("agent-runner resolveEnvAgentCommand", () => {
  it("resolves codex command from CODEX_BIN when path exists", () => {
    const result = __agentRunnerTestUtils.resolveEnvAgentCommand("codex", {
      env: {
        CODEX_BIN: "/opt/codex/bin/codex",
      } as NodeJS.ProcessEnv,
      commandPathExistsFn: (candidate) => candidate === "/opt/codex/bin/codex",
    });

    assert.equal(result, "/opt/codex/bin/codex");
  });

  it("falls back to DS_CODEX_PATH when CODEX_BIN is missing", () => {
    const result = __agentRunnerTestUtils.resolveEnvAgentCommand("codex", {
      env: {
        DS_CODEX_PATH: "/usr/local/bin/codex",
      } as NodeJS.ProcessEnv,
      commandPathExistsFn: (candidate) => candidate === "/usr/local/bin/codex",
    });

    assert.equal(result, "/usr/local/bin/codex");
  });
});
