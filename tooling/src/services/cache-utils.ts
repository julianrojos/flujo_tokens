/**
 * Cache utilities for fingerprinting and sync state management.
 * 
 * Provides content-based fingerprinting and persistent sync state tracking
 * to skip unchanged tasks in incremental builds.
 */

import crypto from "node:crypto";
import * as fs from "node:fs";
import path from "node:path";
import { isPlainObject } from "../utils/is-plain-object.js";
import { PROJECT_ROOT, resolveSystemContextSafe } from "../utils/system-context.js";
import type {
  FingerprintOptions,
  SkipTaskOptions,
  SkipTaskResult,
  SyncState,
  SyncStateTask,
  UpdateTaskOptions,
} from "../types/cache-utils.js";

const STATE_VERSION = 1;

/**
 * Default sync state path based on system context.
 */
function getDefaultSyncStatePath(): string {
  try {
    return path.join(resolveSystemContextSafe().paths.generated, ".sync-state.json");
  } catch {
    return path.join(PROJECT_ROOT, "docs", "_generated", ".sync-state.json");
  }
}

/**
 * Create an empty sync state object.
 */
function createEmptyState(): SyncState {
  return {
    version: STATE_VERSION,
    tasks: {},
  };
}

/**
 * Serialize a value to a stable string representation.
 * Objects are sorted by keys to ensure consistent output.
 */
function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  }
  if (isPlainObject(value)) {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort((a, b) => a.localeCompare(b));
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableSerialize(obj[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * Safely read a file, returning null if it doesn't exist or isn't a file.
 */
function safeReadFile(filePath: string): Buffer | null {
  if (!fs.existsSync(filePath)) return null;
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) return null;
  return fs.readFileSync(filePath);
}

/**
 * Ensure all paths are absolute, unique, and sorted.
 */
function ensureAbsolutePaths(paths: string[] = []): string[] {
  return Array.from(
    new Set(
      paths
        .map((filePath) => (filePath ? path.resolve(filePath) : ""))
        .filter((p): p is string => Boolean(p))
    )
  ).sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
}

/**
 * Write JSON to a file atomically using a temp file + rename.
 */
function writeJsonAtomic(filePath: string, payload: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(tempPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
    throw error;
  }
}

/**
 * Compute a SHA-256 fingerprint from file contents and values.
 * 
 * The fingerprint is deterministic and changes if:
 * - Any file content changes
 * - Any value in the values object changes
 * - The set of files or values changes
 */
export function computeFingerprint(options: FingerprintOptions = {}): string {
  const { files = [], values = {} } = options;
  const hash = crypto.createHash("sha256");
  const absoluteFiles = ensureAbsolutePaths(files);

  hash.update("values\n");
  hash.update(stableSerialize(values));
  hash.update("\n");

  for (const filePath of absoluteFiles) {
    hash.update(`file:${filePath}\n`);
    const content = safeReadFile(filePath);
    if (content === null) {
      hash.update("missing\n");
      continue;
    }
    hash.update(`size:${content.length}\n`);
    hash.update(content);
    hash.update("\n");
  }

  return hash.digest("hex");
}

/**
 * Load sync state from disk.
 * Returns an empty state if the file doesn't exist or is invalid.
 */
export function loadSyncState(statePath: string = getDefaultSyncStatePath()): SyncState {
  const resolvedPath = path.resolve(statePath);
  if (!fs.existsSync(resolvedPath)) return createEmptyState();

  try {
    const raw = fs.readFileSync(resolvedPath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!isPlainObject(parsed)) return createEmptyState();
    
    const stateObj = parsed as Record<string, unknown>;
    if (!isPlainObject(stateObj.tasks)) return createEmptyState();
    
    return {
      version: Number(stateObj.version) || STATE_VERSION,
      tasks: stateObj.tasks as Record<string, SyncStateTask>,
    };
  } catch {
    return createEmptyState();
  }
}

/**
 * Save sync state to disk atomically.
 */
export function saveSyncState(state: SyncState, statePath: string = getDefaultSyncStatePath()): void {
  const resolvedPath = path.resolve(statePath);
  const normalized = isPlainObject(state) ? state : createEmptyState();
  writeJsonAtomic(
    resolvedPath,
    isPlainObject((normalized as SyncState).tasks)
      ? normalized
      : createEmptyState()
  );
}

/**
 * Determine if a task should be skipped based on fingerprint and output existence.
 * 
 * Returns a SkipTaskResult indicating whether to skip and the reason.
 */
export function shouldSkipTask(options: SkipTaskOptions = {}): SkipTaskResult {
  const {
    taskId,
    fingerprint,
    outputs = [],
    force = false,
    statePath = getDefaultSyncStatePath(),
  } = options;

  if (!taskId) {
    return {
      skip: false,
      reason: "missing_task_id",
      missingOutputs: [],
    };
  }

  if (force) {
    return {
      skip: false,
      reason: "force",
      missingOutputs: [],
    };
  }

  const state = loadSyncState(statePath);
  const task = state.tasks[taskId];
  if (!task) {
    return {
      skip: false,
      reason: "no_previous_state",
      missingOutputs: outputs.filter((outputPath) => !fs.existsSync(path.resolve(outputPath))),
    };
  }

  if (String(task.fingerprint || "") !== String(fingerprint || "")) {
    return {
      skip: false,
      reason: "fingerprint_changed",
      missingOutputs: outputs.filter((outputPath) => !fs.existsSync(path.resolve(outputPath))),
    };
  }

  const missingOutputs = outputs.filter((outputPath) => !fs.existsSync(path.resolve(outputPath)));
  if (missingOutputs.length > 0) {
    return {
      skip: false,
      reason: "missing_outputs",
      missingOutputs,
    };
  }

  return {
    skip: true,
    reason: "unchanged",
    missingOutputs: [],
  };
}

/**
 * Update the state for a task after successful execution.
 */
export function updateTaskState(options: UpdateTaskOptions = {}): void {
  const {
    taskId,
    fingerprint,
    outputs = [],
    metadata = {},
    statePath = getDefaultSyncStatePath(),
  } = options;

  if (!taskId) {
    throw new Error('taskId is required for updateTaskState');
  }

  const state = loadSyncState(statePath);
  state.tasks[taskId] = {
    fingerprint: String(fingerprint || ""),
    outputs: outputs.map((outputPath) => path.resolve(outputPath)),
    metadata: isPlainObject(metadata) ? (metadata as Record<string, unknown>) : {},
    updatedAt: new Date().toISOString(),
  };
  saveSyncState(state, statePath);
}
