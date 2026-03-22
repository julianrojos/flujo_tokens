import crypto from "node:crypto";
import * as fs from "node:fs";
import path from "node:path";

import { isPlainObject } from "./is-plain-object.js";

const STATE_VERSION = 1;

export interface SyncState {
  version: number;
  tasks: Record<string, SyncTaskState>;
}

export interface SyncTaskState {
  fingerprint: string;
  outputs: string[];
  metadata: Record<string, unknown>;
  updatedAt: string;
}

export interface ComputeFingerprintOptions {
  files?: string[];
  values?: Record<string, unknown>;
}

export interface ShouldSkipTaskOptions {
  taskId?: string;
  fingerprint?: string;
  outputs?: string[];
  force?: boolean;
  statePath?: string;
}

export interface ShouldSkipTaskResult {
  skip: boolean;
  reason: string;
  missingOutputs: string[];
}

export interface UpdateTaskStateOptions {
  taskId?: string;
  fingerprint?: string;
  outputs?: string[];
  metadata?: Record<string, unknown>;
  statePath?: string;
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
 * Serialize a value to a stable string for hashing.
 * Objects are sorted by keys to ensure consistent output.
 */
function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  }
  if (isPlainObject(value)) {
    const keys = Object.keys(value).sort((a, b) => a.localeCompare(b));
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(",")}}`;
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
 * Convert paths to absolute, sorted, deduplicated array.
 */
function ensureAbsolutePaths(paths: string[] = []): string[] {
  return Array.from(
    new Set(
      paths
        .map((filePath) => (filePath ? path.resolve(filePath) : ""))
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
}

/**
 * Write JSON to a file atomically using a temp file + rename.
 */
function writeJsonAtomic(filePath: string, payload: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  fs.renameSync(tempPath, filePath);
}

/**
 * Compute a SHA256 fingerprint based on file contents and arbitrary values.
 * Used for cache invalidation when inputs change.
 */
export function computeFingerprint(options: ComputeFingerprintOptions = {}): string {
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
 * Load sync state from a JSON file.
 * Returns an empty state if the file doesn't exist or is invalid.
 */
export function loadSyncState(statePath: string): SyncState {
  const resolvedPath = path.resolve(statePath);
  if (!fs.existsSync(resolvedPath)) return createEmptyState();

  try {
    const raw = fs.readFileSync(resolvedPath, "utf8");
    const parsed = JSON.parse(raw);
    if (!isPlainObject(parsed) || !isPlainObject(parsed.tasks)) {
      return createEmptyState();
    }
    return {
      version: Number(parsed.version) || STATE_VERSION,
      tasks: parsed.tasks as Record<string, SyncTaskState>,
    };
  } catch {
    return createEmptyState();
  }
}

/**
 * Save sync state to a JSON file atomically.
 */
export function saveSyncState(state: SyncState, statePath: string): void {
  const resolvedPath = path.resolve(statePath);
  const normalized = isPlainObject(state) ? state : createEmptyState();
  writeJsonAtomic(
    resolvedPath,
    isPlainObject(normalized.tasks)
      ? normalized
      : createEmptyState()
  );
}

/**
 * Determine if a task should be skipped based on fingerprint and output existence.
 * Returns a result object with skip decision and reason.
 */
export function shouldSkipTask(options: ShouldSkipTaskOptions = {}): ShouldSkipTaskResult {
  const {
    taskId,
    fingerprint,
    outputs = [],
    force = false,
    statePath,
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

  const resolvedStatePath = statePath || getDefaultStatePath();
  const state = loadSyncState(resolvedStatePath);
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
 * Update task state in the sync state file.
 */
export function updateTaskState(options: UpdateTaskStateOptions = {}): void {
  const {
    taskId,
    fingerprint,
    outputs = [],
    metadata = {},
    statePath,
  } = options;

  if (!taskId) return;

  const resolvedStatePath = statePath || getDefaultStatePath();
  const state = loadSyncState(resolvedStatePath);
  
  state.tasks[taskId] = {
    fingerprint: String(fingerprint || ""),
    outputs: outputs.map((outputPath) => path.resolve(outputPath)),
    metadata: isPlainObject(metadata) ? metadata : {},
    updatedAt: new Date().toISOString(),
  };
  
  saveSyncState(state, resolvedStatePath);
}

/**
 * Get the default sync state path.
 * Uses current working directory resolved at call time.
 * Can be overridden via statePath option in functions.
 */
function getDefaultStatePath(): string {
  return path.resolve(process.cwd(), ".sync-state.json");
}
