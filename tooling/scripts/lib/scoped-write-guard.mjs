import fs from "node:fs";
import path from "node:path";

import { captureFileSnapshot, restoreFileSnapshot } from "./file-snapshot.mjs";

function resolveUniquePaths(paths) {
  const seen = new Set();
  const result = [];
  for (const item of paths || []) {
    if (!item) continue;
    const resolved = path.resolve(item);
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    result.push(resolved);
  }
  return result;
}

function normalizeExtensions(extensions) {
  const normalized = new Set();
  for (const extension of extensions || []) {
    if (!extension) continue;
    const raw = String(extension).trim();
    if (!raw) continue;
    normalized.add(raw.startsWith(".") ? raw.toLowerCase() : `.${raw.toLowerCase()}`);
  }
  return normalized;
}

function shouldTrackFile(filePath, extensionSet) {
  if (extensionSet.size === 0) return true;
  return extensionSet.has(path.extname(filePath).toLowerCase());
}

function walkTrackedFiles(dirPath, extensionSet, sink) {
  if (!fs.existsSync(dirPath)) return;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walkTrackedFiles(fullPath, extensionSet, sink);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!shouldTrackFile(fullPath, extensionSet)) continue;
    sink.add(path.resolve(fullPath));
  }
}

function detectChangeType(beforeSnapshot, afterSnapshot) {
  if (!beforeSnapshot.exists && afterSnapshot.exists) return "added";
  if (beforeSnapshot.exists && !afterSnapshot.exists) return "deleted";
  return "modified";
}

export function captureScopedWriteSnapshot({
  directories = [],
  files = [],
  extensions = [],
}) {
  const trackedDirectories = resolveUniquePaths(directories);
  const trackedFiles = resolveUniquePaths(files);
  const extensionSet = normalizeExtensions(extensions);
  const trackedPathSet = new Set(trackedFiles);

  for (const directory of trackedDirectories) {
    walkTrackedFiles(directory, extensionSet, trackedPathSet);
  }

  const entries = new Map();
  for (const trackedPath of trackedPathSet) {
    entries.set(trackedPath, captureFileSnapshot(trackedPath));
  }

  return {
    directories: trackedDirectories,
    files: trackedFiles,
    extensions: [...extensionSet],
    entries,
  };
}

function collectCurrentTrackedPaths(snapshot) {
  const extensionSet = normalizeExtensions(snapshot.extensions || []);
  const trackedPathSet = new Set(resolveUniquePaths(snapshot.files || []));

  for (const directory of resolveUniquePaths(snapshot.directories || [])) {
    walkTrackedFiles(directory, extensionSet, trackedPathSet);
  }

  return trackedPathSet;
}

function buildChangeRecord(filePath, beforeSnapshot) {
  const afterSnapshot = captureFileSnapshot(filePath);
  if (beforeSnapshot.exists === afterSnapshot.exists) {
    if (!beforeSnapshot.exists) return null;
    if (beforeSnapshot.content === afterSnapshot.content) return null;
  }

  return {
    path: filePath,
    changeType: detectChangeType(beforeSnapshot, afterSnapshot),
    beforeSnapshot,
    afterSnapshot,
  };
}

function formatChange(change) {
  return `- ${change.changeType}: ${change.path}`;
}

export function assertScopedWritePolicy({
  snapshot,
  allowedPaths = [],
  label = "scoped write",
}) {
  const allowed = new Set(resolveUniquePaths(allowedPaths));
  const currentTrackedPaths = collectCurrentTrackedPaths(snapshot);
  const allTrackedPaths = new Set([
    ...snapshot.entries.keys(),
    ...currentTrackedPaths,
  ]);

  const violations = [];
  for (const trackedPath of allTrackedPaths) {
    const beforeSnapshot =
      snapshot.entries.get(trackedPath) || { exists: false, content: "" };
    const change = buildChangeRecord(trackedPath, beforeSnapshot);
    if (!change) continue;
    if (allowed.has(trackedPath)) continue;
    violations.push(change);
  }

  if (violations.length === 0) return;

  for (const violation of violations) {
    restoreFileSnapshot(violation.path, violation.beforeSnapshot);
  }

  const details = violations.map((item) => formatChange(item)).join("\n");
  throw new Error(
    `Unexpected file mutations detected during ${label}. ` +
      "Only target files and generated indices are allowed to change.\n" +
      `${details}`,
  );
}
