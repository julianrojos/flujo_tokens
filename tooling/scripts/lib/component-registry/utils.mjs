import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { isPlainObject } from "../is-plain-object.mjs";
import { PROJECT_ROOT } from "../system-context.mjs";

export const NODE_ID_RE = /^[A-Za-z0-9]+:[A-Za-z0-9]+$/;

export function stableSerialize(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  }

  if (isPlainObject(value)) {
    const keys = Object.keys(value).sort((a, b) => a.localeCompare(b));
    const body = keys
      .map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`)
      .join(",");
    return `{${body}}`;
  }

  return JSON.stringify(value);
}

export function stableHash(value) {
  const hash = crypto.createHash("sha256");
  hash.update(stableSerialize(value));
  return hash.digest("hex");
}

export function writeJsonAtomic(filePath, payload) {
  const resolved = path.resolve(filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const tempPath = `${resolved}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  fs.renameSync(tempPath, resolved);
}

export function toProjectRelativePath(filePath) {
  const absolute = path.resolve(filePath);
  const relative = path.relative(PROJECT_ROOT, absolute);
  if (!relative || relative.startsWith("..")) {
    throw new Error(`Path is outside project root: ${absolute}`);
  }
  return relative.split(path.sep).join("/");
}

export function fileExists(filePath) {
  if (!fs.existsSync(filePath)) return false;
  return fs.statSync(filePath).isFile();
}

export function normalizeDisplayLabel(raw) {
  const source = String(raw || "")
    .replace(/\.[^.]+$/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/[_\-/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!source) return "";

  return source
    .split(" ")
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1).toLowerCase())
    .join(" ");
}

export function normalizeSortKey(raw) {
  return String(raw || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function isValidHttpUrl(value) {
  return /^https?:\/\/\S+$/i.test(String(value || "").trim());
}

export function isValidNodeId(value) {
  return NODE_ID_RE.test(String(value || "").trim());
}
