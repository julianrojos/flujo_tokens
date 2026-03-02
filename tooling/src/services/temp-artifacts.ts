/**
 * Temp Artifact Manager
 *
 * Manages temporary artifacts with automatic cleanup on process exit.
 * Tracks created files and removes them when no longer needed.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type {
  CleanupResult,
  PurgeOptions,
  PurgeResult,
  TempArtifactManagerOptions,
} from "../types/temp-artifacts.js";

/**
 * Module-level state for process hooks.
 * Ensures hooks are attached only once across all instances.
 */
let processHooksAttached = false;
const allTrackedFiles = new Set<string>();

/**
 * Cleanup function for process exit.
 */
function cleanupOnExit(): void {
  for (const filePath of allTrackedFiles) {
    if (!fs.existsSync(filePath)) continue;
    const stats = fs.statSync(filePath);
    if (!stats.isFile()) continue;
    try {
      fs.unlinkSync(filePath);
    } catch {
      // Ignore cleanup errors
    }
  }
  allTrackedFiles.clear();
}

/**
 * Attach process hooks for automatic cleanup on exit.
 * Idempotent: only attaches once per process.
 */
function attachProcessHooks(): void {
  if (processHooksAttached) return;
  processHooksAttached = true;
  process.once("exit", cleanupOnExit);
}

/**
 * Resolve file path to absolute path.
 */
function resolveFilePath(filePath: string): string {
  const normalized = String(filePath || "").trim();
  if (!normalized) return "";
  return path.resolve(normalized);
}

/**
 * TempArtifactManager class for managing temporary artifacts.
 */
export class TempArtifactManager {
  private keep: boolean;
  private instanceFiles: Set<string>;

  constructor(options: TempArtifactManagerOptions = {}) {
    this.keep = Boolean(options.keep);
    this.instanceFiles = new Set<string>();
  }

  /**
   * Attach process hooks for automatic cleanup on exit.
   * Idempotent: hooks are attached only once per process.
   */
  attachProcessHooks(): void {
    attachProcessHooks();
  }

  /**
   * Track a file for later cleanup.
   * Returns the resolved file path.
   */
  track(filePath: string): string {
    const resolved = resolveFilePath(filePath);
    if (!resolved) return "";
    this.instanceFiles.add(resolved);
    allTrackedFiles.add(resolved);
    return resolved;
  }

  /**
   * Write content to a tracked file, creating directories as needed.
   * Returns the resolved file path.
   */
  writeTrackedFile(filePath: string, content: string, encoding: BufferEncoding = "utf8"): string {
    const resolved = resolveFilePath(filePath);
    if (!resolved) {
      throw new Error("Cannot write tracked temp artifact: missing file path.");
    }

    // Create directories and write file BEFORE tracking
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, String(content || ""), encoding);

    // Track only after successful write
    this.instanceFiles.add(resolved);
    allTrackedFiles.add(resolved);
    return resolved;
  }

  /**
   * Remove a tracked file.
   * Returns true if the file was removed, false otherwise.
   */
  remove(filePath: string): boolean {
    const resolved = resolveFilePath(filePath);
    if (!resolved) return false;
    if (!fs.existsSync(resolved)) return false;
    const stats = fs.statSync(resolved);
    if (!stats.isFile()) return false;
    fs.unlinkSync(resolved);
    this.instanceFiles.delete(resolved);
    allTrackedFiles.delete(resolved);
    return true;
  }

  /**
   * Purge files matching a pattern in a directory.
   */
  purgeMatching(options: PurgeOptions): PurgeResult {
    const { dir, matcher } = options;
    const resolvedDir = path.resolve(String(dir || ""));
    if (!resolvedDir || !fs.existsSync(resolvedDir)) {
      return { removed: [] };
    }

    const entries = fs.readdirSync(resolvedDir, { withFileTypes: true });
    const removed: string[] = [];

    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const absolutePath = path.join(resolvedDir, entry.name);
      if (!matcher(entry.name, absolutePath)) continue;
      fs.unlinkSync(absolutePath);
      this.instanceFiles.delete(absolutePath);
      allTrackedFiles.delete(absolutePath);
      removed.push(absolutePath);
    }

    return { removed };
  }

  /**
   * Cleanup all tracked files (unless keep option is true).
   */
  cleanup(): CleanupResult {
    if (this.keep) {
      return { removed: [], kept: Array.from(this.instanceFiles) };
    }

    const removed: string[] = [];
    for (const filePath of this.instanceFiles) {
      if (!fs.existsSync(filePath)) continue;
      const stats = fs.statSync(filePath);
      if (!stats.isFile()) continue;
      fs.unlinkSync(filePath);
      removed.push(filePath);
    }

    this.instanceFiles.clear();
    return { removed, kept: [] };
  }
}

/**
 * Reset module state for testing.
 * Only use in test teardown.
 */
export function __resetProcessHooksForTest(): void {
  processHooksAttached = false;
  allTrackedFiles.clear();
}
