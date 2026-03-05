import path from "node:path";
import {
  createEmptyComponentRegistry,
  createEmptyTokenRegistry,
} from "./registry-seed-service.mjs";

export function decodeSystemRouteId(rawRouteId) {
  return decodeURIComponent(String(rawRouteId || ""));
}

export function buildNoStoreJsonResponse(payload) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export function collectRemovableSystemPaths({
  targetSystem,
  repoRoot,
  nextSystems,
  resolveSafeSystemPathsForDeletionFn,
}) {
  if (!targetSystem) return [];
  return resolveSafeSystemPathsForDeletionFn(targetSystem, repoRoot, nextSystems);
}

export function removeExistingPaths(paths, fsSync) {
  const removed = [];
  for (const targetPath of paths) {
    if (!fsSync.existsSync(targetPath)) continue;
    fsSync.rmSync(targetPath, { recursive: true, force: true });
    removed.push(targetPath);
  }
  return removed;
}

export function buildCreateDesignSystemSuccessPayload({
  nextSystem,
  nextConfig,
  summarizeDesignSystemsConfigFn,
}) {
  return {
    ok: true,
    system: { id: nextSystem.id, name: nextSystem.name },
    config: summarizeDesignSystemsConfigFn(nextConfig),
  };
}

export function buildUpdateDesignSystemSuccessPayload({
  routeSystemId,
  updated,
  nextConfig,
  summarizeDesignSystemsConfigFn,
}) {
  return {
    ok: true,
    system: { id: routeSystemId, name: updated.name },
    config: summarizeDesignSystemsConfigFn(nextConfig),
  };
}

export function buildDeleteDesignSystemSuccessPayload({
  removedPaths,
  nextConfig,
  summarizeDesignSystemsConfigFn,
}) {
  return {
    ok: true,
    removedPaths,
    config: summarizeDesignSystemsConfigFn(nextConfig),
  };
}

function buildOverviewSeed() {
  return `---
doc_type: overview
doc_status: draft
---

# Components Overview

## Component list

`;
}

function writeJsonIfMissing(filePath, payload, fsSync) {
  if (fsSync.existsSync(filePath)) return false;
  fsSync.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return true;
}

export function ensureSystemFilesystemScaffold({
  nextSystem,
  repoRoot,
  fsSync,
}) {
  const inputDir = path.resolve(repoRoot, String(nextSystem?.inputDir || ""));
  const outputDir = path.resolve(repoRoot, String(nextSystem?.outputDir || ""));
  const docsDir = path.resolve(repoRoot, String(nextSystem?.docsDir || ""));
  const generatedDir = path.join(docsDir, "_generated");
  const specsDir = path.join(docsDir, "_spec", "components");
  const componentsDir = path.join(docsDir, "components");
  const overviewPath = path.join(componentsDir, "overview.md");
  const componentRegistryPath = path.join(generatedDir, "component-registry.json");
  const tokenRegistryPath = path.join(generatedDir, "token-registry.json");

  const createdPaths = [];
  for (const dirPath of [inputDir, outputDir, docsDir, generatedDir, specsDir, componentsDir]) {
    if (fsSync.existsSync(dirPath)) continue;
    fsSync.mkdirSync(dirPath, { recursive: true });
    createdPaths.push(dirPath);
  }

  if (!fsSync.existsSync(overviewPath)) {
    fsSync.writeFileSync(overviewPath, buildOverviewSeed(), "utf8");
    createdPaths.push(overviewPath);
  }

  if (
    writeJsonIfMissing(
      componentRegistryPath,
      createEmptyComponentRegistry(),
      fsSync,
    )
  ) {
    createdPaths.push(componentRegistryPath);
  }

  if (
    writeJsonIfMissing(
      tokenRegistryPath,
      createEmptyTokenRegistry(),
      fsSync,
    )
  ) {
    createdPaths.push(tokenRegistryPath);
  }

  return {
    docsDir,
    generatedDir,
    componentRegistryPath,
    tokenRegistryPath,
    createdPaths,
  };
}
