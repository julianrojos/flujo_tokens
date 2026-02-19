import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { SYNC_STATE_PATH } from "./paths.mjs";

const STATE_VERSION = 1;

function createEmptyState() {
  return {
    version: STATE_VERSION,
    tasks: {},
  };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stableSerialize(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  }
  if (isPlainObject(value)) {
    const keys = Object.keys(value).sort((a, b) => a.localeCompare(b));
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function safeReadFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) return null;
  return fs.readFileSync(filePath);
}

function ensureAbsolutePaths(paths = []) {
  return Array.from(
    new Set(
      paths
        .map((filePath) => (filePath ? path.resolve(filePath) : ""))
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
}

function writeJsonAtomic(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  fs.renameSync(tempPath, filePath);
}

export function computeFingerprint({ files = [], values = {} } = {}) {
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

export function loadSyncState(statePath = SYNC_STATE_PATH) {
  const resolvedPath = path.resolve(statePath);
  if (!fs.existsSync(resolvedPath)) return createEmptyState();

  try {
    const raw = fs.readFileSync(resolvedPath, "utf8");
    const parsed = JSON.parse(raw);
    if (!isPlainObject(parsed) || !isPlainObject(parsed.tasks)) return createEmptyState();
    return {
      version: Number(parsed.version) || STATE_VERSION,
      tasks: parsed.tasks,
    };
  } catch {
    return createEmptyState();
  }
}

export function saveSyncState(state, statePath = SYNC_STATE_PATH) {
  const resolvedPath = path.resolve(statePath);
  const normalized = isPlainObject(state) ? state : createEmptyState();
  writeJsonAtomic(
    resolvedPath,
    isPlainObject(normalized.tasks)
      ? normalized
      : createEmptyState()
  );
}

export function shouldSkipTask({
  taskId,
  fingerprint,
  outputs = [],
  force = false,
  statePath = SYNC_STATE_PATH,
} = {}) {
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

export function updateTaskState({
  taskId,
  fingerprint,
  outputs = [],
  metadata = {},
  statePath = SYNC_STATE_PATH,
} = {}) {
  if (!taskId) return;

  const state = loadSyncState(statePath);
  state.tasks[taskId] = {
    fingerprint: String(fingerprint || ""),
    outputs: outputs.map((outputPath) => path.resolve(outputPath)),
    metadata: isPlainObject(metadata) ? metadata : {},
    updatedAt: new Date().toISOString(),
  };
  saveSyncState(state, statePath);
}
