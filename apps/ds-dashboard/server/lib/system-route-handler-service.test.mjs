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
} from "./system-route-handler-service.mjs";

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

  const removed = removeExistingPaths(paths, {
    existsSync: (targetPath) => targetPath.endsWith("core"),
    rmSync: () => {},
  });
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
  assert.match(indexRaw, /No components available\./);
});
