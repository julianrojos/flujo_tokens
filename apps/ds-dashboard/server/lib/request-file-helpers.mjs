import fs from "node:fs/promises";
import path from "node:path";

export function toBooleanString(value, fallback) {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "false") return normalized;
  }
  return fallback ? "true" : "false";
}

export function toNumberString(value, fallback, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return String(fallback);
  if (max !== undefined && parsed > max) return String(max);
  return String(parsed);
}

export function guessContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".gif") return "image/gif";
  return "application/octet-stream";
}

export function resolveRepoFilePath(root, requestedPath) {
  const raw = String(requestedPath || "").trim();
  if (!raw) return null;
  const resolved = path.resolve(root, raw);
  const rootWithSep = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (resolved !== root && !resolved.startsWith(rootWithSep)) return null;
  return resolved;
}

export async function readTextFileLimited(absPath, maxBytes) {
  const buffer = await fs.readFile(absPath);
  const truncated = buffer.byteLength > maxBytes;
  const sliced = truncated ? buffer.subarray(0, maxBytes) : buffer;
  return { content: sliced.toString("utf8"), truncated };
}

export function findLineForQuery(content, query) {
  const q = String(query || "").trim();
  if (!q) return null;
  const haystack = content.toLowerCase();
  const needle = q.toLowerCase();
  const idx = haystack.indexOf(needle);
  if (idx === -1) return null;
  const before = content.slice(0, idx);
  return before.split("\n").length;
}

function clampInt(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function buildSnippet(content, line, before, after, maxSnippetLines = 15) {
  const lines = content.split("\n");
  const target = clampInt(line, 1, Math.max(1, lines.length));
  const safeBefore = clampInt(before, 0, maxSnippetLines - 1);
  const safeAfter = clampInt(after, 0, maxSnippetLines - 1 - safeBefore);
  const startLine = clampInt(target - safeBefore, 1, target);
  const endLine = clampInt(target + safeAfter, target, lines.length);
  const snippetLines = lines.slice(startLine - 1, endLine);
  return { targetLine: target, startLine, endLine, snippet: snippetLines.join("\n") };
}

export function createSnippetBuilder(maxSnippetLines) {
  return (content, line, before, after) =>
    buildSnippet(content, line, before, after, maxSnippetLines);
}

export async function readJsonBody(c) {
  try {
    const parsed = await c.req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed;
  } catch {
    return {};
  }
}
