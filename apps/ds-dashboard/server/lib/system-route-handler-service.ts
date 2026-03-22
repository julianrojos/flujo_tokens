/**
 * System Route Handler Service
 *
 * Handles system route operations including filesystem pruning and scaffolding.
 * Migrated from apps/ds-dashboard/server/lib/system-route-handler-service.mjs
 */

import path from "node:path";
import fsSync from "node:fs";

import {
  createEmptyComponentRegistry,
  createEmptyTokenUsageIndex,
  createEmptyTokenRegistry,
} from "./registry-seed-service.mjs";

// ---------------------------------------------------------------------------
// Type Definitions
// ---------------------------------------------------------------------------

/**
 * Synchronous filesystem operations contract.
 * Pick only the methods we use to allow easy mocking in tests.
 */
export type FsSync = Pick<
  typeof fsSync,
  | "existsSync"
  | "mkdirSync"
  | "writeFileSync"
  | "rmSync"
  | "statSync"
  | "readdirSync"
  | "rmdirSync"
>;

/**
 * Design system configuration.
 */
export interface DesignSystem {
  id: string;
  name: string;
  inputDir: string;
  outputDir: string;
  docsDir: string;
  [key: string]: unknown;
}

/**
 * Design systems configuration.
 */
export interface DesignSystemsConfig {
  systems: DesignSystem[];
  defaultSystem: string;
  [key: string]: unknown;
}

/**
 * Result of filesystem scaffold operation.
 */
export interface ScaffoldResult {
  docsDir: string;
  generatedDir: string;
  componentRegistryPath: string;
  tokenRegistryPath: string;
  tokenUsageIndexPath: string;
  createdPaths: string[];
}

/**
 * Result of reset global artifacts operation.
 */
export interface ResetGlobalArtifactsResult {
  componentRegistryPath: string;
  tokenRegistryPath: string;
  tokenUsageIndexPath: string;
  componentsIndexPath: string;
  touchedPaths: string[];
}

// ---------------------------------------------------------------------------
// Directory Pruning Functions
// ---------------------------------------------------------------------------

/**
 * Check if a directory is empty (no files or subdirectories).
 * @param dirPath - Directory path to check
 * @param fs - Synchronous filesystem operations
 * @returns True if directory exists and is empty
 */
export function isEmptyDir(dirPath: string, fs: FsSync): boolean {
  if (!fs.existsSync(dirPath)) return false;
  const stat = fs.statSync(dirPath);
  if (!stat.isDirectory()) return false;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  return entries.length === 0;
}

/**
 * Get the protected root directory for a removed path.
 * Prevents deletion of top-level directories like docs/, input/, output/.
 * @param removedPath - The path that was removed
 * @param repoRoot - Repository root
 * @returns The protected root directory
 */
export function getProtectedRoot(removedPath: string, repoRoot: string): string {
  const relative = path.relative(repoRoot, removedPath);
  const parts = relative.split(path.sep).filter(Boolean);
  if (parts.length === 0) return repoRoot;

  // Protected roots: first-level directories under repo root
  const protectedRoot = path.join(repoRoot, parts[0]);
  return protectedRoot;
}

/**
 * Prune empty ancestor directories after removing paths.
 * Walks up from each removed path's parent, deleting empty directories
 * until reaching a non-empty directory or the protected root.
 * @param removedPaths - List of removed paths
 * @param options - Pruning options
 * @returns List of pruned empty directories
 */
export function pruneEmptyAncestorDirs(
  removedPaths: string[],
  { repoRoot, fsSync: fs }: { repoRoot: string; fsSync: FsSync },
): string[] {
  const prunedDirs: string[] = [];
  const processedParents = new Set<string>();
  const repoRootWithSep = repoRoot.endsWith(path.sep) ? repoRoot : repoRoot + path.sep;

  for (const removedPath of removedPaths) {
    let currentDir = path.dirname(removedPath);

    // Security guard: ensure removedPath is under repoRoot
    const normalizedPath = path.normalize(removedPath);
    if (!normalizedPath.startsWith(repoRootWithSep) && normalizedPath !== repoRoot) {
      // Skip paths outside repo root to prevent directory traversal
      continue;
    }

    const protectedRoot = getProtectedRoot(removedPath, repoRoot);

    while (currentDir !== repoRoot && currentDir !== protectedRoot) {
      // Security guard: ensure currentDir is under repoRoot
      const normalizedCurrent = path.normalize(currentDir);
      if (!normalizedCurrent.startsWith(repoRootWithSep) && normalizedCurrent !== repoRoot) {
        // Stop pruning if we've somehow escaped repo root
        break;
      }

      // Skip if already processed
      if (processedParents.has(currentDir)) {
        currentDir = path.dirname(currentDir);
        continue;
      }
      processedParents.add(currentDir);

      // Stop if directory is not empty
      if (!isEmptyDir(currentDir, fs)) {
        break;
      }

      // Delete empty directory
      try {
        fs.rmdirSync(currentDir);
        prunedDirs.push(currentDir);
        currentDir = path.dirname(currentDir);
      } catch {
        // Stop on error (permissions, etc.)
        break;
      }
    }
  }

  return prunedDirs;
}

// ---------------------------------------------------------------------------
// Route Helper Functions
// ---------------------------------------------------------------------------

/**
 * Decode system route ID from URL parameter.
 * @param rawRouteId - Raw route ID from URL
 * @returns Decoded system ID
 */
export function decodeSystemRouteId(rawRouteId: string | undefined): string {
  return decodeURIComponent(String(rawRouteId || ""));
}

/**
 * Build a JSON response with no-store cache control.
 * @param payload - Response payload
 * @returns Response object
 */
export function buildNoStoreJsonResponse(payload: Record<string, unknown>): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

/**
 * Collect removable system paths for deletion.
 * @param options - Collection options
 * @returns List of paths to remove
 */
export function collectRemovableSystemPaths({
  targetSystem,
  repoRoot,
  nextSystems,
  resolveSafeSystemPathsForDeletionFn,
}: {
  targetSystem: DesignSystem | null | undefined;
  repoRoot: string;
  nextSystems: DesignSystem[];
  resolveSafeSystemPathsForDeletionFn: (
    system: DesignSystem,
    repoRoot: string,
    nextSystems: DesignSystem[],
  ) => string[];
}): string[] {
  if (!targetSystem) return [];
  return resolveSafeSystemPathsForDeletionFn(targetSystem, repoRoot, nextSystems);
}

/**
 * Remove existing filesystem paths.
 * @param paths - List of paths to remove
 * @param fs - Synchronous filesystem operations
 * @returns List of removed paths
 */
export function removeExistingPaths(paths: string[], fs: FsSync): string[] {
  const removed: string[] = [];
  for (const targetPath of paths) {
    if (!fs.existsSync(targetPath)) continue;
    fs.rmSync(targetPath, { recursive: true, force: true });
    removed.push(targetPath);
  }
  return removed;
}

// ---------------------------------------------------------------------------
// Success Payload Builders
// ---------------------------------------------------------------------------

/**
 * Build success payload for create design system operation.
 * @param options - Payload options
 * @returns Success payload
 */
export function buildCreateDesignSystemSuccessPayload({
  nextSystem,
  nextConfig,
  summarizeDesignSystemsConfigFn,
}: {
  nextSystem: DesignSystem;
  nextConfig: DesignSystemsConfig;
  summarizeDesignSystemsConfigFn: (config: DesignSystemsConfig) => Record<string, unknown>;
}): Record<string, unknown> {
  return {
    ok: true,
    system: { id: nextSystem.id, name: nextSystem.name },
    config: summarizeDesignSystemsConfigFn(nextConfig),
  };
}

/**
 * Build success payload for update design system operation.
 * @param options - Payload options
 * @returns Success payload
 */
export function buildUpdateDesignSystemSuccessPayload({
  routeSystemId,
  updated,
  nextConfig,
  summarizeDesignSystemsConfigFn,
}: {
  routeSystemId: string;
  updated: DesignSystem;
  nextConfig: DesignSystemsConfig;
  summarizeDesignSystemsConfigFn: (config: DesignSystemsConfig) => Record<string, unknown>;
}): Record<string, unknown> {
  return {
    ok: true,
    system: { id: routeSystemId, name: updated.name },
    config: summarizeDesignSystemsConfigFn(nextConfig),
  };
}

/**
 * Build success payload for delete design system operation.
 * @param options - Payload options
 * @returns Success payload
 */
export function buildDeleteDesignSystemSuccessPayload({
  removedPaths,
  prunedEmptyDirs = [],
  nextConfig,
  summarizeDesignSystemsConfigFn,
}: {
  removedPaths: string[];
  prunedEmptyDirs?: string[];
  nextConfig: DesignSystemsConfig;
  summarizeDesignSystemsConfigFn: (config: DesignSystemsConfig) => Record<string, unknown>;
}): Record<string, unknown> {
  return {
    ok: true,
    removedPaths,
    prunedEmptyDirs,
    config: summarizeDesignSystemsConfigFn(nextConfig),
  };
}

// ---------------------------------------------------------------------------
// Filesystem Scaffold Functions
// ---------------------------------------------------------------------------

/**
 * Build overview.md seed content.
 * @returns Markdown content string
 */
function buildOverviewSeed(): string {
  return `---
doc_type: overview
doc_status: draft
---

# Components Overview

## Component list

`;
}

/**
 * Build COMPONENTS_INDEX.md seed content.
 * @returns Markdown content string
 */
function buildEmptyComponentsIndexSeed(): string {
  return `---
doc_type: workflow
doc_status: ready
---

# Design System Components Index

Source registry: \`docs/_generated/component-registry.json\`
Registry fingerprint: \`n/a\`

This file is generated from the component registry projection and should not be edited manually.

## Summary

- Total components: 0
- Ready: 0
- Needs review: 0
- Draft: 0
- Missing: 0
- With visual proof: 0
- Average coverage: 0%

## Components

No components available.
`;
}

/**
 * Write JSON file if it doesn't exist.
 * @param filePath - File path
 * @param payload - JSON payload
 * @param fs - Synchronous filesystem operations
 * @returns True if file was created, false if it already existed
 */
function writeJsonIfMissing(filePath: string, payload: Record<string, unknown>, fs: FsSync): boolean {
  if (fs.existsSync(filePath)) return false;
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return true;
}

/**
 * Ensure filesystem scaffold for a design system.
 * Creates required directories and seed files.
 * @param options - Scaffold options
 * @returns Scaffold result with created paths
 */
export function ensureSystemFilesystemScaffold({
  nextSystem,
  repoRoot,
  fsSync: fs,
}: {
  nextSystem: DesignSystem;
  repoRoot: string;
  fsSync: FsSync;
}): ScaffoldResult {
  const inputDir = path.resolve(repoRoot, String(nextSystem?.inputDir || ""));
  const outputDir = path.resolve(repoRoot, String(nextSystem?.outputDir || ""));
  const docsDir = path.resolve(repoRoot, String(nextSystem?.docsDir || ""));
  const generatedDir = path.join(docsDir, "_generated");
  const specsDir = path.join(docsDir, "_spec", "components");
  const componentsDir = path.join(docsDir, "components");
  const overviewPath = path.join(componentsDir, "overview.md");
  const componentRegistryPath = path.join(generatedDir, "component-registry.json");
  const tokenRegistryPath = path.join(generatedDir, "token-registry.json");
  const tokenUsageIndexPath = path.join(generatedDir, "token-usage-index.json");

  const createdPaths: string[] = [];
  for (const dirPath of [inputDir, outputDir, docsDir, generatedDir, specsDir, componentsDir]) {
    if (fs.existsSync(dirPath)) continue;
    fs.mkdirSync(dirPath, { recursive: true });
    createdPaths.push(dirPath);
  }

  if (!fs.existsSync(overviewPath)) {
    fs.writeFileSync(overviewPath, buildOverviewSeed(), "utf8");
    createdPaths.push(overviewPath);
  }

  if (writeJsonIfMissing(componentRegistryPath, createEmptyComponentRegistry(), fs)) {
    createdPaths.push(componentRegistryPath);
  }

  if (writeJsonIfMissing(tokenRegistryPath, createEmptyTokenRegistry(), fs)) {
    createdPaths.push(tokenRegistryPath);
  }

  if (writeJsonIfMissing(tokenUsageIndexPath, createEmptyTokenUsageIndex(), fs)) {
    createdPaths.push(tokenUsageIndexPath);
  }

  return {
    docsDir,
    generatedDir,
    componentRegistryPath,
    tokenRegistryPath,
    tokenUsageIndexPath,
    createdPaths,
  };
}

/**
 * Reset global artifacts when no systems remain.
 * Creates empty registry files and index.
 * @param options - Reset options
 * @returns Result with touched paths
 */
export function resetGlobalArtifactsForNoSystems({
  repoRoot,
  fsSync: fs,
}: {
  repoRoot: string;
  fsSync: FsSync;
}): ResetGlobalArtifactsResult {
  const docsDir = path.resolve(repoRoot, "docs");
  const generatedDir = path.join(docsDir, "_generated");
  const componentRegistryPath = path.join(generatedDir, "component-registry.json");
  const tokenRegistryPath = path.join(generatedDir, "token-registry.json");
  const tokenUsageIndexPath = path.join(generatedDir, "token-usage-index.json");
  const componentsIndexPath = path.join(docsDir, "COMPONENTS_INDEX.md");

  const touchedPaths: string[] = [];
  for (const dirPath of [docsDir, generatedDir]) {
    if (fs.existsSync(dirPath)) continue;
    fs.mkdirSync(dirPath, { recursive: true });
    touchedPaths.push(dirPath);
  }

  fs.writeFileSync(
    componentRegistryPath,
    `${JSON.stringify(createEmptyComponentRegistry(), null, 2)}\n`,
    "utf8",
  );
  touchedPaths.push(componentRegistryPath);

  fs.writeFileSync(
    tokenRegistryPath,
    `${JSON.stringify(createEmptyTokenRegistry(), null, 2)}\n`,
    "utf8",
  );
  touchedPaths.push(tokenRegistryPath);

  fs.writeFileSync(
    tokenUsageIndexPath,
    `${JSON.stringify(createEmptyTokenUsageIndex(), null, 2)}\n`,
    "utf8",
  );
  touchedPaths.push(tokenUsageIndexPath);

  fs.writeFileSync(componentsIndexPath, buildEmptyComponentsIndexSeed(), "utf8");
  touchedPaths.push(componentsIndexPath);

  return {
    componentRegistryPath,
    tokenRegistryPath,
    tokenUsageIndexPath,
    componentsIndexPath,
    touchedPaths,
  };
}
