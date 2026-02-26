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
  private trackedFiles: Set<string>;
  private _hooksAttached: boolean;

  constructor(options: TempArtifactManagerOptions = {}) {
    this.keep = Boolean(options.keep);
    this.trackedFiles = new Set<string>();
    this._hooksAttached = false;
  }

  /**
   * Attach process hooks for automatic cleanup on exit.
   */
  attachProcessHooks(): void {
    if (this._hooksAttached) return;
    this._hooksAttached = true;
    process.once("exit", () => {
      this.cleanup();
    });
  }

  /**
   * Track a file for later cleanup.
   * Returns the resolved file path.
   */
  track(filePath: string): string {
    const resolved = resolveFilePath(filePath);
    if (!resolved) return "";
    this.trackedFiles.add(resolved);
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
    this.trackedFiles.add(resolved);
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
    this.trackedFiles.delete(resolved);
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
      this.trackedFiles.delete(absolutePath);
      removed.push(absolutePath);
    }

    return { removed };
  }

  /**
   * Cleanup all tracked files (unless keep option is true).
   */
  cleanup(): CleanupResult {
    if (this.keep) {
      return { removed: [], kept: Array.from(this.trackedFiles) };
    }

    const removed: string[] = [];
    for (const filePath of this.trackedFiles) {
      if (!fs.existsSync(filePath)) continue;
      const stats = fs.statSync(filePath);
      if (!stats.isFile()) continue;
      fs.unlinkSync(filePath);
      removed.push(filePath);
    }

    this.trackedFiles.clear();
    return { removed, kept: [] };
  }
}
