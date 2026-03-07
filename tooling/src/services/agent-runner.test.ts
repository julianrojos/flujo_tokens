import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { __agentRunnerTestUtils } from "./agent-runner.js";

describe("agent-runner codex extension fallback", () => {
  it("does not resolve extension fallback when DS_ENABLE_CODEX_EXTENSION_FALLBACK is disabled", () => {
    const result = __agentRunnerTestUtils.findCodexFallbackCommand({
      env: {
        HOME: "/home/tester",
        DS_ENABLE_CODEX_EXTENSION_FALLBACK: "0",
      },
      platform: "darwin",
      arch: "arm64",
      extensionRoots: ["/home/tester/.vscode/extensions"],
      readDirFn: () => [{ name: "openai.chatgpt-1.2.3", isDirectory: () => true }],
      commandPathExistsFn: () => true,
      logInfoFn: () => {},
    });

    assert.equal(result, "");
  });

  it("resolves a codex fallback path when fallback flag is enabled", () => {
    const checked: string[] = [];
    const result = __agentRunnerTestUtils.findCodexFallbackCommand({
      env: {
        HOME: "/home/tester",
        DS_ENABLE_CODEX_EXTENSION_FALLBACK: "1",
      },
      platform: "darwin",
      arch: "arm64",
      extensionRoots: ["/home/tester/.vscode/extensions"],
      readDirFn: () => [{ name: "openai.chatgpt-1.2.3", isDirectory: () => true }],
      commandPathExistsFn: (candidate) => {
        checked.push(candidate);
        return candidate.endsWith("/bin/macos-aarch64/codex");
      },
      logInfoFn: () => {},
    });

    assert.equal(result, "/home/tester/.vscode/extensions/openai.chatgpt-1.2.3/bin/macos-aarch64/codex");
    assert.ok(
      checked.some((candidate) => candidate.endsWith("/bin/macos-aarch64/codex")),
      "expected lookup to include macOS arm64 codex candidate",
    );
  });

  it("maps platform/arch targets deterministically", () => {
    assert.deepEqual(
      __agentRunnerTestUtils.codexExtensionTargets("darwin", "arm64"),
      ["macos-aarch64", "darwin-arm64"],
    );
    assert.deepEqual(
      __agentRunnerTestUtils.codexExtensionTargets("linux", "x64"),
      ["linux-x64"],
    );
    assert.deepEqual(
      __agentRunnerTestUtils.codexExtensionTargets("win32", "x64"),
      ["windows-x64", "win32-x64"],
    );
  });
});
