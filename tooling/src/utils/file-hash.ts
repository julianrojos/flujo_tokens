/**
 * File Hash Utilities
 *
 * SHA256 file hashing with LRU cache for performance.
 * Extracted from figma.ts to enable reuse across tooling modules.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

// ============================================================================
// Constants
// ============================================================================

/** Maximum number of entries in the file hash cache */
const FILE_HASH_CACHE_MAX_ENTRIES = 1_000;

/** LRU cache for file hashes: path → { digest, size, mtimeMs } */
const FILE_HASH_CACHE = new Map<string, { digest: string; size: number; mtimeMs: number }>();

// ============================================================================
// Public API
// ============================================================================

/**
 * Compute SHA256 hash of file with LRU caching.
 *
 * Cache invalidation is based on file size and mtimeMs.
 * When cache is full, evicts the oldest entry (LRU policy).
 *
 * @param filePath - Absolute or relative path to file
 * @returns 64-character hexadecimal SHA256 digest
 */
export function sha256FileCached(filePath: string): string {
  const resolved = path.resolve(filePath);
  const stat = fs.statSync(resolved);
  const size = Number(stat.size || 0);
  const mtimeMs = Number(stat.mtimeMs || 0);

  const cached = FILE_HASH_CACHE.get(resolved);
  if (
    cached &&
    cached.size === size &&
    cached.mtimeMs === mtimeMs &&
    typeof cached.digest === 'string'
  ) {
    return cached.digest;
  }

  // Evict oldest entry if cache is full
  if (
    !FILE_HASH_CACHE.has(resolved) &&
    FILE_HASH_CACHE.size >= FILE_HASH_CACHE_MAX_ENTRIES
  ) {
    const firstKey = FILE_HASH_CACHE.keys().next().value;
    if (typeof firstKey === 'string') FILE_HASH_CACHE.delete(firstKey);
  }

  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(resolved));
  const digest = hash.digest('hex');
  FILE_HASH_CACHE.set(resolved, { digest, size, mtimeMs });
  return digest;
}

/**
 * Clear the file hash cache.
 *
 * Useful for testing or forcing re-computation of all hashes.
 */
export function clearFileHashCache(): void {
  FILE_HASH_CACHE.clear();
}

/**
 * Get the current size of the file hash cache.
 *
 * @returns Number of entries currently in cache
 */
export function getFileHashCacheSize(): number {
  return FILE_HASH_CACHE.size;
}
