import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { __agentRunnerTestUtils } from "./agent-runner.js";

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
