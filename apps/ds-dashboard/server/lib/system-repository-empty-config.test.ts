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
    const repoRoot = createRepoRoot({ systems: [], defaultSystem: "" });
    try {
      const repository = createDesignSystemRepository({ repoRoot });
      const config = repository.getConfig();
      assert.deepEqual(config.systems, []);
      assert.equal(config.defaultSystem, "");
    } finally {
      fsSync.rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it("resolveDashboardSystemContext throws when config has no systems", () => {
    const repoRoot = createRepoRoot({ systems: [], defaultSystem: "" });
    try {
      const repository = createDesignSystemRepository({ repoRoot });
      assert.throws(
        () => repository.resolveDashboardSystemContext("stale-id"),
        /Unknown design system: "stale-id"\. Available: none/,
      );
    } finally {
      fsSync.rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it("resolveDashboardSystemContext falls back to configured default when header is stale", () => {
    const repoRoot = createRepoRoot({
      systems: [
        { id: "core", name: "Core", docsDir: "design-systems/core/docs" },
        { id: "marketing", name: "Marketing", docsDir: "design-systems/marketing/docs" },
      ],
      defaultSystem: "core",
    });
    try {
      const repository = createDesignSystemRepository({ repoRoot });
      const context = repository.resolveDashboardSystemContext("stale-system-id");
      assert.equal(context.systemId, "core");
      assert.equal(context.docsDir, path.join(repoRoot, "design-systems/core/docs"));
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

  it("resolveSafeSystemPathsForDeletion removes canonical output/<id> when outputDir is missing", () => {
    const removed = resolveSafeSystemPathsForDeletion(
      {
        id: "core",
        inputDir: "design-systems/core/input",
        docsDir: "design-systems/core/docs",
      },
      "/repo",
      [],
    );

    assert.deepEqual(removed.sort(), [
      "/repo/design-systems/core/docs",
      "/repo/design-systems/core/input",
      "/repo/design-systems/core/output",
    ]);
  });

  it("resolveSafeSystemPathsForDeletion preserves canonical dirs used by surviving systems", () => {
    const removed = resolveSafeSystemPathsForDeletion(
      {
        id: "old",
        outputDir: "design-systems/core/output",
      },
      "/repo",
      [
        {
          id: "core",
          // Missing outputDir should still protect canonical output/core fallback.
          inputDir: "design-systems/core/input",
          docsDir: "design-systems/core/docs",
        },
      ],
    );

    assert.equal(removed.includes("/repo/design-systems/core/output"), false);
    assert.equal(removed.includes("/repo/design-systems/old/input"), true);
    assert.equal(removed.includes("/repo/design-systems/old/docs"), true);
  });

  it("resolveSafeSystemPathsForDeletion never removes top-level protected roots", () => {
    const removed = resolveSafeSystemPathsForDeletion(
      {
        id: "old",
        inputDir: "input",
        outputDir: "output",
        docsDir: "docs",
      },
      "/repo",
      [],
    );

    assert.equal(removed.includes("/repo/input"), false);
    assert.equal(removed.includes("/repo/output"), false);
    assert.equal(removed.includes("/repo/docs"), false);
  });

  it("resolveSafeSystemPathsForDeletion never removes ancestors of surviving system dirs", () => {
    const removed = resolveSafeSystemPathsForDeletion(
      {
        id: "old",
        docsDir: "design-systems",
      },
      "/repo",
      [
        {
          id: "core",
          docsDir: "design-systems/core/docs",
        },
      ],
    );

    assert.equal(removed.includes("/repo/design-systems"), false);
    assert.equal(removed.includes("/repo/design-systems/old/input"), true);
    assert.equal(removed.includes("/repo/design-systems/old/output"), true);
  });
});
