import assert from "node:assert/strict";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { createDesignSystemRepository } from "../system-repository.js";

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
});
