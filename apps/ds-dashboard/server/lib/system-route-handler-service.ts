/**
 * System Route Handler Service
 *
 * Handles system route operations including filesystem pruning and scaffolding.
 */

import path from "node:path";
import fsSync from "node:fs";
import { resolveSystemPaths } from "../db/design-system-repository.js";

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
  | "rmSync"
  | "statSync"
  | "readdirSync"
  | "rmdirSync"
>;

export interface RemoveExistingPathsOptions {
  repoRoot?: string;
  protectedTopLevelDirs?: string[];
}

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
  createdPaths: string[];
}

/**
 * Result of reset global artifacts operation.
 * Tracks only the directories created/touched during reset.
 */
export interface ResetGlobalArtifactsResult {
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
  return removeExistingPathsWithOptions(paths, fs, undefined);
}

/**
 * Remove existing filesystem paths with optional safety guards.
 * @param paths - List of paths to remove
 * @param fs - Synchronous filesystem operations
 * @param options - Optional safety options
 * @returns List of removed paths
 */
export function removeExistingPathsWithOptions(
  paths: string[],
  fs: FsSync,
  options?: RemoveExistingPathsOptions,
): string[] {
  const repoRoot = options?.repoRoot ? path.resolve(options.repoRoot) : "";
  const protectedTopLevelDirs = new Set(
    (options?.protectedTopLevelDirs || ["docs", "input", "output"])
      .map((value) => String(value || "").trim())
      .filter(Boolean),
  );

  const isProtectedPath = (targetPath: string): boolean => {
    if (!repoRoot) return false;
    const absolute = path.resolve(targetPath);
    if (absolute === repoRoot) return true;
    const relative = path.relative(repoRoot, absolute);
    if (!relative || relative === ".") return true;
    if (relative.startsWith("..") || path.isAbsolute(relative)) return true;
    const segments = relative.split(path.sep).filter(Boolean);
    if (segments.length !== 1) return false;
    return protectedTopLevelDirs.has(segments[0]);
  };

  const removed: string[] = [];
  for (const targetPath of paths) {
    if (isProtectedPath(targetPath)) continue;
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
  existingConsumersCount,
  existingConsumersCheckFailed,
}: {
  nextSystem: DesignSystem;
  nextConfig: DesignSystemsConfig;
  summarizeDesignSystemsConfigFn: (config: DesignSystemsConfig) => Record<string, unknown>;
  existingConsumersCount?: number;
  existingConsumersCheckFailed?: boolean;
}): Record<string, unknown> {
  return {
    ok: true,
    system: { id: nextSystem.id, name: nextSystem.name },
    config: summarizeDesignSystemsConfigFn(nextConfig),
    ...(existingConsumersCount !== undefined && { existingConsumersCount }),
    ...(existingConsumersCheckFailed !== undefined && { existingConsumersCheckFailed }),
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
  deletedConsumersCount,
  deletedConsumerNames,
  consumerCleanupSkipped,
}: {
  removedPaths: string[];
  prunedEmptyDirs?: string[];
  nextConfig: DesignSystemsConfig;
  summarizeDesignSystemsConfigFn: (config: DesignSystemsConfig) => Record<string, unknown>;
  deletedConsumersCount?: number;
  deletedConsumerNames?: string[];
  consumerCleanupSkipped?: boolean;
}): Record<string, unknown> {
  return {
    ok: true,
    removedPaths,
    prunedEmptyDirs,
    config: summarizeDesignSystemsConfigFn(nextConfig),
    ...(deletedConsumersCount !== undefined && { deletedConsumersCount }),
    ...(deletedConsumerNames !== undefined && { deletedConsumerNames }),
    ...(consumerCleanupSkipped !== undefined && { consumerCleanupSkipped }),
  };
}

// ---------------------------------------------------------------------------
// Filesystem Scaffold Functions
// ---------------------------------------------------------------------------

/**
 * Ensure filesystem scaffold for a design system.
 * Creates required directories for a new system.
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
  const paths = resolveSystemPaths(nextSystem.id, repoRoot);
  const inputDir = paths.inputDir;
  const outputDir = paths.outputDir;
  const docsDir = paths.docsDir;
  const generatedDir = path.join(docsDir, "_generated");
  const specsDir = path.join(docsDir, "_spec", "components");
  const componentsDir = path.join(docsDir, "components");

  const createdPaths: string[] = [];
  for (const dirPath of [inputDir, outputDir, docsDir, generatedDir, specsDir, componentsDir]) {
    if (fs.existsSync(dirPath)) continue;
    fs.mkdirSync(dirPath, { recursive: true });
    createdPaths.push(dirPath);
  }

  return {
    docsDir,
    generatedDir,
    createdPaths,
  };
}

/**
 * Reset global artifacts when no systems remain.
 * Ensures the global docs directory exists for non-system project documentation.
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

  const touchedPaths: string[] = [];
  for (const dirPath of [docsDir]) {
    if (fs.existsSync(dirPath)) continue;
    fs.mkdirSync(dirPath, { recursive: true });
    touchedPaths.push(dirPath);
  }

  return {
    touchedPaths,
  };
}
