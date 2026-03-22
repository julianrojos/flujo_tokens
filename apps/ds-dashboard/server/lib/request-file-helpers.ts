/**
 * Request File Helpers
 *
 * Utilities for handling file operations in request handlers.
 * Migrated from apps/ds-dashboard/server/lib/request-file-helpers.mjs
 */
import fs from 'node:fs/promises';
import path from 'node:path';

export interface ReadTextFileResult {
  content: string;
  truncated: boolean;
}

export interface SnippetResult {
  targetLine: number;
  startLine: number;
  endLine: number;
  snippet: string;
}

export interface RequestWithJson {
  req: {
    json: () => Promise<unknown>;
  };
}

/**
 * Convert a value to a boolean string.
 */
export function toBooleanString(value: unknown, fallback: boolean): string {
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === 'false') return normalized;
  }
  return fallback ? 'true' : 'false';
}

/**
 * Convert a value to a number string with bounds checking.
 */
export function toNumberString(value: unknown, fallback: number, max?: number): string {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return String(fallback);
  if (max !== undefined && parsed > max) return String(max);
  return String(parsed);
}

/**
 * Guess content type from file extension.
 */
export function guessContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.svg') return 'image/svg+xml';
  if (ext === '.pdf') return 'application/pdf';
  if (ext === '.gif') return 'image/gif';
  return 'application/octet-stream';
}

/**
 * Resolve a file path within a repository root, guarding against path traversal.
 */
export function resolveRepoFilePath(root: string, requestedPath: string): string | null {
  const raw = String(requestedPath || '').trim();
  if (!raw) return null;
  const resolved = path.resolve(root, raw);
  const rootWithSep = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (resolved !== root && !resolved.startsWith(rootWithSep)) return null;
  return resolved;
}

/**
 * Read a text file with size limit.
 */
export async function readTextFileLimited(absPath: string, maxBytes: number): Promise<ReadTextFileResult> {
  const buffer = await fs.readFile(absPath);
  const truncated = buffer.byteLength > maxBytes;
  const sliced = truncated ? buffer.subarray(0, maxBytes) : buffer;
  return { content: sliced.toString('utf8'), truncated };
}

/**
 * Find the line number containing a query string.
 */
export function findLineForQuery(content: string, query: string): number | null {
  const q = String(query || '').trim();
  if (!q) return null;
  const haystack = content.toLowerCase();
  const needle = q.toLowerCase();
  const idx = haystack.indexOf(needle);
  if (idx === -1) return null;
  const before = content.slice(0, idx);
  return before.split('\n').length;
}

/**
 * Clamp an integer to a range.
 */
function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Build a code snippet around a target line.
 */
export function buildSnippet(
  content: string,
  line: number,
  before: number,
  after: number,
  maxSnippetLines = 15
): SnippetResult {
  const lines = content.split('\n');
  const target = clampInt(line, 1, Math.max(1, lines.length));
  const safeBefore = clampInt(before, 0, maxSnippetLines - 1);
  const safeAfter = clampInt(after, 0, maxSnippetLines - 1 - safeBefore);
  const startLine = clampInt(target - safeBefore, 1, target);
  const endLine = clampInt(target + safeAfter, target, lines.length);
  const snippetLines = lines.slice(startLine - 1, endLine);
  return { targetLine: target, startLine, endLine, snippet: snippetLines.join('\n') };
}

/**
 * Create a snippet builder with a fixed max lines limit.
 */
export function createSnippetBuilder(maxSnippetLines: number) {
  return (content: string, line: number, before: number, after: number): SnippetResult =>
    buildSnippet(content, line, before, after, maxSnippetLines);
}

/**
 * Read and parse JSON body from a request, with error handling.
 */
export async function readJsonBody(c: RequestWithJson): Promise<Record<string, unknown>> {
  try {
    const parsed = await c.req.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
}
