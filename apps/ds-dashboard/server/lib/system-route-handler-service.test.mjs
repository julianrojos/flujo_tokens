import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCreateDesignSystemSuccessPayload,
  buildDeleteDesignSystemSuccessPayload,
  buildNoStoreJsonResponse,
  buildUpdateDesignSystemSuccessPayload,
  collectRemovableSystemPaths,
  decodeSystemRouteId,
  ensureSystemFilesystemScaffold,
  resetGlobalArtifactsForNoSystems,
  removeExistingPaths,
  isEmptyDir,
  getProtectedRoot,
  pruneEmptyAncestorDirs,
} from "./system-route-handler-service.mjs";

/**
 * @typedef {import('./system-route-handler-service.mjs').FsSync} FsSync
 */

test("system-route-handler-service: decodeSystemRouteId decodes route values", () => {
  assert.equal(decodeSystemRouteId("core%20ds"), "core ds");
  assert.equal(decodeSystemRouteId(undefined), "");
});

test("system-route-handler-service: buildNoStoreJsonResponse sets no-store headers", async () => {
  const response = buildNoStoreJsonResponse({ ok: true });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(await response.json(), { ok: true });
});

test("system-route-handler-service: collect/remove paths are deterministic", () => {
  const paths = collectRemovableSystemPaths({
    targetSystem: { id: "core" },
    repoRoot: "/repo",
    nextSystems: [{ id: "commerce" }],
    resolveSafeSystemPathsForDeletionFn: () => ["/repo/docs/core", "/repo/output/core"],
  });
  assert.deepEqual(paths, ["/repo/docs/core", "/repo/output/core"]);

  const removed = removeExistingPaths(paths, /** @type {FsSync} */ ({
    existsSync: (targetPath) => targetPath.endsWith("core"),
    rmSync: () => {},
  }));
  assert.deepEqual(removed, ["/repo/docs/core", "/repo/output/core"]);
});

test("system-route-handler-service: success payload builders keep API shape", () => {
  const summarizeDesignSystemsConfigFn = (config) => ({ defaultSystem: config.defaultSystem });
  const nextConfig = { defaultSystem: "core" };

  const createPayload = buildCreateDesignSystemSuccessPayload({
    nextSystem: { id: "core", name: "Core" },
    nextConfig,
    summarizeDesignSystemsConfigFn,
  });
  assert.equal(createPayload.ok, true);
  assert.equal(createPayload.system.id, "core");

  const updatePayload = buildUpdateDesignSystemSuccessPayload({
    routeSystemId: "core",
    updated: { name: "Core DS" },
    nextConfig,
    summarizeDesignSystemsConfigFn,
  });
  assert.equal(updatePayload.system.name, "Core DS");

  const deletePayload = buildDeleteDesignSystemSuccessPayload({
    removedPaths: ["/repo/docs/core"],
    nextConfig,
    summarizeDesignSystemsConfigFn,
  });
  assert.deepEqual(deletePayload.removedPaths, ["/repo/docs/core"]);
});

test("system-route-handler-service: ensureSystemFilesystemScaffold creates expected bootstrap artifacts", () => {
  const existing = new Set();
  const writes = new Map();
  const mkdirs = [];

  const fsSync = {
    existsSync: (targetPath) => existing.has(targetPath),
    mkdirSync: (targetPath) => {
      mkdirs.push(targetPath);
      existing.add(targetPath);
    },
    writeFileSync: (targetPath, content) => {
      writes.set(targetPath, String(content));
      existing.add(targetPath);
    },
  };

  const result = ensureSystemFilesystemScaffold({
    nextSystem: {
      id: "simple-design-system",
      inputDir: "input/simple-design-system",
      outputDir: "output/simple-design-system",
      docsDir: "docs/simple-design-system",
    },
    repoRoot: "/repo",
    fsSync,
  });

  assert.equal(result.docsDir, "/repo/docs/simple-design-system");
  assert.equal(result.generatedDir, "/repo/docs/simple-design-system/_generated");
  assert.equal(
    result.componentRegistryPath,
    "/repo/docs/simple-design-system/_generated/component-registry.json",
  );
  assert.equal(
    result.tokenRegistryPath,
    "/repo/docs/simple-design-system/_generated/token-registry.json",
  );
  assert.equal(
    result.tokenUsageIndexPath,
    "/repo/docs/simple-design-system/_generated/token-usage-index.json",
  );
  assert.ok(mkdirs.includes("/repo/docs/simple-design-system/components"));

  const componentRegistryRaw = writes.get(result.componentRegistryPath);
  const tokenRegistryRaw = writes.get(result.tokenRegistryPath);
  const tokenUsageIndexRaw = writes.get(result.tokenUsageIndexPath);
  assert.ok(componentRegistryRaw);
  assert.ok(tokenRegistryRaw);
  assert.ok(tokenUsageIndexRaw);

  const componentRegistry = JSON.parse(componentRegistryRaw);
  const tokenRegistry = JSON.parse(tokenRegistryRaw);
  const tokenUsageIndex = JSON.parse(tokenUsageIndexRaw);
  assert.deepEqual(componentRegistry.components, []);
  assert.equal(componentRegistry.summary.total_components, 0);
  assert.deepEqual(tokenRegistry.entries, []);
  assert.equal(tokenUsageIndex.ok, true);
  assert.equal(tokenUsageIndex.summary.tokens_total, 0);
});

test("system-route-handler-service: resetGlobalArtifactsForNoSystems writes empty global artifacts", () => {
  const existing = new Set();
  const writes = new Map();
  const mkdirs = [];

  const fsSync = {
    existsSync: (targetPath) => existing.has(targetPath),
    mkdirSync: (targetPath) => {
      mkdirs.push(targetPath);
      existing.add(targetPath);
    },
    writeFileSync: (targetPath, content) => {
      writes.set(targetPath, String(content));
      existing.add(targetPath);
    },
  };

  const result = resetGlobalArtifactsForNoSystems({
    repoRoot: "/repo",
    fsSync,
  });

  assert.ok(mkdirs.includes("/repo/docs"));
  assert.ok(mkdirs.includes("/repo/docs/_generated"));
  assert.equal(
    result.componentRegistryPath,
    "/repo/docs/_generated/component-registry.json",
  );
  assert.equal(
    result.componentsIndexPath,
    "/repo/docs/COMPONENTS_INDEX.md",
  );
  assert.equal(
    result.tokenUsageIndexPath,
    "/repo/docs/_generated/token-usage-index.json",
  );

  const registry = JSON.parse(writes.get(result.componentRegistryPath));
  assert.equal(registry.summary.total_components, 0);
  const tokenUsageIndex = JSON.parse(writes.get(result.tokenUsageIndexPath));
  assert.equal(tokenUsageIndex.ok, true);
  assert.equal(tokenUsageIndex.summary.tokens_total, 0);

  const indexRaw = writes.get(result.componentsIndexPath);
  assert.match(indexRaw, /Total components: 0/);
});

// ─── Tests for empty directory pruning ────────────────────────────────────────

test("system-route-handler-service: isEmptyDir returns true for empty directories", () => {
  const fsSync = {
    existsSync: () => true,
    statSync: () => ({ isDirectory: () => true }),
    readdirSync: () => [],
  };
  assert.equal(isEmptyDir("/repo/docs/empty", fsSync), true);
});

test("system-route-handler-service: isEmptyDir returns false for non-empty directories", () => {
  const fsSync = {
    existsSync: () => true,
    statSync: () => ({ isDirectory: () => true }),
    readdirSync: () => [{ name: "file.md" }],
  };
  assert.equal(isEmptyDir("/repo/docs/non-empty", fsSync), false);
});

test("system-route-handler-service: isEmptyDir returns false for non-existent paths", () => {
  const fsSync = {
    existsSync: () => false,
  };
  assert.equal(isEmptyDir("/repo/docs/missing", fsSync), false);
});

test("system-route-handler-service: getProtectedRoot returns first-level directory", () => {
  assert.equal(
    getProtectedRoot("/repo/docs/acme-ds", "/repo"),
    "/repo/docs",
  );
  assert.equal(
    getProtectedRoot("/repo/output/acme", "/repo"),
    "/repo/output",
  );
});

test("system-route-handler-service: prune eliminates empty parent directory", () => {
  const removedPaths = ["/repo/docs/acme-ds/_spec/components/button.yml"];
  const emptyDirs = new Set([
    "/repo/docs/acme-ds/_spec/components",
    "/repo/docs/acme-ds/_spec",
    "/repo/docs/acme-ds",
  ]);
  const fsSync = {
    existsSync: (p) => emptyDirs.has(p) || p === "/repo/docs",
    statSync: () => ({ isDirectory: () => true }),
    readdirSync: (p) => (emptyDirs.has(p) ? [] : [{ name: "other" }]),
    rmdirSync: (p) => {
      emptyDirs.delete(p);
    },
  };

  const pruned = pruneEmptyAncestorDirs(removedPaths, { repoRoot: "/repo", fsSync });

  assert.deepEqual(pruned, [
    "/repo/docs/acme-ds/_spec/components",
    "/repo/docs/acme-ds/_spec",
    "/repo/docs/acme-ds",
  ]);
});

test("system-route-handler-service: prune does not eliminate non-empty parent", () => {
  const removedPaths = ["/repo/docs/acme-ds/_spec/components/button.yml"];
  const fsSync = {
    existsSync: () => true,
    statSync: () => ({ isDirectory: () => true }),
    readdirSync: (p) => {
      // _spec directory has other files, so it's not empty
      if (p === "/repo/docs/acme-ds/_spec") {
        return [{ name: "other-component.yml" }];
      }
      return [];
    },
    rmdirSync: () => {},
  };

  const pruned = pruneEmptyAncestorDirs(removedPaths, { repoRoot: "/repo", fsSync });

  // Should only prune up to _spec, not including it
  assert.deepEqual(pruned, [
    "/repo/docs/acme-ds/_spec/components",
  ]);
});

test("system-route-handler-service: prune does not delete protected root (docs/)", () => {
  const removedPaths = ["/repo/docs/acme-ds/file.md"];
  const emptyDirs = new Set([
    "/repo/docs/acme-ds",
  ]);
  const deletedDirs = [];
  const fsSync = {
    existsSync: (p) => emptyDirs.has(p) || p === "/repo/docs",
    statSync: () => ({ isDirectory: () => true }),
    readdirSync: (p) => {
      // docs/ directory is NOT empty (has other content)
      if (p === "/repo/docs") {
        return [{ name: "other-system" }];
      }
      return emptyDirs.has(p) ? [] : [{ name: "other" }];
    },
    rmdirSync: (p) => {
      emptyDirs.delete(p);
      deletedDirs.push(p);
    },
  };

  const pruned = pruneEmptyAncestorDirs(removedPaths, { repoRoot: "/repo", fsSync });

  // Should prune acme-ds but NOT docs/
  assert.deepEqual(pruned, ["/repo/docs/acme-ds"]);
  assert.equal(deletedDirs.includes("/repo/docs"), false, "docs/ should not be deleted");
});

test("system-route-handler-service: prune deduplicates same parent", () => {
  const removedPaths = [
    "/repo/docs/acme-ds/a/file.md",
    "/repo/docs/acme-ds/b/file.md",
  ];
  const emptyDirs = new Set([
    "/repo/docs/acme-ds/a",
    "/repo/docs/acme-ds/b",
    "/repo/docs/acme-ds",
  ]);
  const readdirCalls = [];
  const fsSync = {
    existsSync: (p) => emptyDirs.has(p) || p === "/repo/docs",
    statSync: () => ({ isDirectory: () => true }),
    readdirSync: (p) => {
      readdirCalls.push(p);
      return emptyDirs.has(p) ? [] : [{ name: "other" }];
    },
    rmdirSync: (p) => {
      emptyDirs.delete(p);
    },
  };

  pruneEmptyAncestorDirs(removedPaths, { repoRoot: "/repo", fsSync });

  // Each directory should only be checked once due to deduplication
  const uniqueCalls = [...new Set(readdirCalls)];
  assert.equal(uniqueCalls.length, readdirCalls.length, "readdirSync should be called once per directory");
});

test("system-route-handler-service: prune skips paths outside repo root (security guard)", () => {
  const removedPaths = [
    "/repo/docs/acme/file.md",
    "/etc/passwd",  // Path outside repo root
    "/tmp/attack",  // Another external path
  ];
  const prunedDirs = [];
  const fsSync = {
    existsSync: () => true,
    statSync: () => ({ isDirectory: () => true }),
    readdirSync: () => [],
    rmdirSync: (p) => {
      prunedDirs.push(p);
    },
  };

  const pruned = pruneEmptyAncestorDirs(removedPaths, { repoRoot: "/repo", fsSync });

  // Should only prune paths under /repo, not external paths
  assert.deepEqual(pruned, ["/repo/docs/acme"]);
  assert.equal(pruned.includes("/etc/passwd"), false, "Should not prune paths outside repo root");
  assert.equal(pruned.includes("/tmp/attack"), false, "Should not prune paths outside repo root");
});

test("system-route-handler-service: buildDeleteDesignSystemSuccessPayload includes prunedEmptyDirs", () => {
  const summarizeDesignSystemsConfigFn = (config) => ({ defaultSystem: config.defaultSystem });
  const nextConfig = { defaultSystem: "core" };

  const payload = buildDeleteDesignSystemSuccessPayload({
    removedPaths: ["/repo/docs/core"],
    prunedEmptyDirs: ["/repo/docs/core/_spec"],
    nextConfig,
    summarizeDesignSystemsConfigFn,
  });

  assert.deepEqual(payload.prunedEmptyDirs, ["/repo/docs/core/_spec"]);
});
