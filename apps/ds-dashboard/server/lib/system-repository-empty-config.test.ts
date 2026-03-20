import assert from "node:assert/strict";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  createDesignSystemRepository,
  resolveSafeSystemPathsForDeletion,
} from "../system-repository.js";

function createRepoRoot(config: unknown) {
  const repoRoot = fsSync.mkdtempSync(path.join(os.tmpdir(), "ds-dashboard-repo-"));
  const configDir = path.join(repoRoot, "tooling", "config");
  fsSync.mkdirSync(configDir, { recursive: true });
  fsSync.writeFileSync(
    path.join(configDir, "design-systems.json"),
    `${JSON.stringify(config, null, 2)}\n`,
    "utf8",
  );
  return repoRoot;
}

describe("system-repository empty config support", () => {
  it("loads empty systems config without throwing", () => {
    const repoRoot = createRepoRoot({ systems: [], defaultSystem: "legacy" });
    try {
      const repository = createDesignSystemRepository({ repoRoot });
      const config = repository.getConfig();
      assert.deepEqual(config.systems, []);
      assert.equal(config.defaultSystem, "");
    } finally {
      fsSync.rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it("resolveDashboardSystemContext falls back to local docs when config has no systems", () => {
    const repoRoot = createRepoRoot({ systems: [], defaultSystem: "" });
    try {
      const repository = createDesignSystemRepository({ repoRoot });
      const context = repository.resolveDashboardSystemContext("legacy-id");
      assert.equal(context.systemId, "local");
      assert.equal(context.docsDir, path.join(repoRoot, "docs"));
      assert.equal(context.rawConfig.defaultSystem, "");
    } finally {
      fsSync.rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it("resolveDashboardSystemContext falls back to configured default when header is stale", () => {
    const repoRoot = createRepoRoot({
      systems: [
        { id: "core", name: "Core", docsDir: "docs/core" },
        { id: "marketing", name: "Marketing", docsDir: "docs/marketing" },
      ],
      defaultSystem: "core",
    });
    try {
      const repository = createDesignSystemRepository({ repoRoot });
      const context = repository.resolveDashboardSystemContext("stale-system-id");
      assert.equal(context.systemId, "core");
      assert.equal(context.docsDir, path.join(repoRoot, "docs/core"));
    } finally {
      fsSync.rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it("persists empty systems config and normalizes default", () => {
    const repoRoot = createRepoRoot({
      systems: [{ id: "core", name: "Core" }],
      defaultSystem: "core",
    });
    try {
      const repository = createDesignSystemRepository({ repoRoot });
      const saved = repository.saveConfig({
        systems: [],
        defaultSystem: "core",
      });
      assert.deepEqual(saved.systems, []);
      assert.equal(saved.defaultSystem, "");
    } finally {
      fsSync.rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it("resolveSafeSystemPathsForDeletion removes output/<id> when outputDir is missing", () => {
    const removed = resolveSafeSystemPathsForDeletion(
      {
        id: "core",
        inputDir: "input/core",
        docsDir: "docs/core",
      },
      "/repo",
      [],
    );

    assert.deepEqual(removed.sort(), [
      "/repo/docs/core",
      "/repo/input/core",
      "/repo/output/core",
    ]);
  });

  it("resolveSafeSystemPathsForDeletion preserves fallback dirs used by surviving systems", () => {
    const removed = resolveSafeSystemPathsForDeletion(
      {
        id: "legacy",
        outputDir: "output/core",
      },
      "/repo",
      [
        {
          id: "core",
          // Legacy config without outputDir should still protect output/core fallback.
          inputDir: "input/core",
          docsDir: "docs/core",
        },
      ],
    );

    assert.equal(removed.includes("/repo/output/core"), false);
    assert.equal(removed.includes("/repo/input/legacy"), true);
    assert.equal(removed.includes("/repo/docs/legacy"), true);
  });
});
