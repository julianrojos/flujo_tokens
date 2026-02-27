/**
 * Runtime Utilities
 *
 * Line offset calculation and file collection utilities.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Compare two strings alphabetically with base sensitivity.
 */
export function compareAlpha(a: string, b: string): number {
  return a.localeCompare(b, 'en', { sensitivity: 'base' });
}

/**
 * Build array of line start offsets for a text string.
 */
export function buildLineStarts(text: string): number[] {
  const starts = [0];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '\n') starts.push(i + 1);
  }
  return starts;
}

/**
 * Get line number from offset using binary search.
 */
export function lineFromOffset(lineStarts: number[], offset: number): number {
  let left = 0;
  let right = lineStarts.length - 1;
  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const start = lineStarts[mid];
    const nextStart = mid + 1 < lineStarts.length ? lineStarts[mid + 1] : Number.MAX_SAFE_INTEGER;
    if (offset >= start && offset < nextStart) return mid + 1;
    if (offset < start) right = mid - 1;
    else left = mid + 1;
  }
  return 1;
}

/**
 * Collect all markdown files from a directory tree.
 */
export function collectMarkdownFiles(docsRoot: string, explicitFilePath: string | null): string[] {
  if (explicitFilePath) return [path.resolve(explicitFilePath)];
  if (!fs.existsSync(docsRoot)) return [];
  const files: string[] = [];
  const queue: string[] = [path.resolve(docsRoot)];

  while (queue.length > 0) {
    const currentDir = queue.shift()!;
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        queue.push(absolutePath);
        continue;
      }
      if (entry.isFile() && entry.name.endsWith('.md')) {
        files.push(absolutePath);
      }
    }
  }

  return files.sort(compareAlpha);
}

/**
 * Collect all spec YAML files from a directory.
 */
export function collectSpecFiles(specRoot: string): string[] {
  if (!fs.existsSync(specRoot)) return [];
  return fs
    .readdirSync(specRoot, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.endsWith('.yml') &&
        entry.name !== '_template.yml'
    )
    .map((entry) => path.join(specRoot, entry.name))
    .sort(compareAlpha);
}
