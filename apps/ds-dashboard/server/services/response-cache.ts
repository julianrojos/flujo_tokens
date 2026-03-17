export interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

/**
 * Truncate array to max length, removing oldest items
 * @param arr - Array to truncate
 * @param max - Maximum array length (must be > 0)
 * @returns Truncated array
 */
export function truncateArray<T>(arr: T[], max: number): T[] {
  if (max <= 0) return [];
  if (arr.length <= max) return [...arr];
  return arr.slice(-max);
}

/**
 * Truncate string to max length
 * @param str - String to truncate
 * @param max - Maximum string length (must be > 0)
 * @returns Truncated string
 */
export function truncateString(str: string, max: number): string {
  if (max <= 0) return '';
  if (str.length <= max) return str;
  return str.slice(0, max);
}

/**
 * ResponseCache - In-memory cache with TTL
 * 
 * @example
 * const cache = new ResponseCache();
 * cache.set('file1', 'variables', { data: 'test' }, 1000);
 * const result = cache.get('file1', 'variables');
 */
export class ResponseCache {
  private cache: Map<string, Map<string, CacheEntry<unknown>>> = new Map();

  /**
   * Get cached data
   * @param fileKey - Figma file key
   * @param cacheKey - Type of cache entry
   * @returns Cached data or null
   */
  get<T>(fileKey: string, cacheKey: string): T | null {
    const fileCache = this.cache.get(fileKey);
    if (!fileCache) return null;

    const entry = fileCache.get(cacheKey);
    if (!entry) return null;

    // Check expiration
    if (Date.now() > entry.expiresAt) {
      fileCache.delete(cacheKey);
      if (fileCache.size === 0) {
        this.cache.delete(fileKey);
      }
      return null;
    }

    return entry.data as T;
  }

  /**
   * Set cache entry
   * @param fileKey - Figma file key
   * @param cacheKey - Type of cache entry
   * @param data - Data to cache
   * @param ttlMs - Time to live in milliseconds
   */
  set<T>(fileKey: string, cacheKey: string, data: T, ttlMs: number): void {
    if (!this.cache.has(fileKey)) {
      this.cache.set(fileKey, new Map());
    }

    const fileCache = this.cache.get(fileKey)!;
    fileCache.set(cacheKey, {
      data,
      expiresAt: Date.now() + ttlMs
    });
  }

  /**
   * Invalidate cache for a file
   * @param fileKey - Figma file key
   */
  invalidateFile(fileKey: string): void {
    this.cache.delete(fileKey);
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get active file keys
   * @returns Array of file keys with non-expired entries
   */
  getActiveFileKeys(): string[] {
    const now = Date.now();
    const active: string[] = [];

    for (const [fileKey, fileCache] of this.cache.entries()) {
      for (const entry of fileCache.values()) {
        if (now <= entry.expiresAt) {
          active.push(fileKey);
          break;
        }
      }
    }

    return active;
  }
}

// Singleton instance
let responseCacheInstance: ResponseCache | null = null;
export function getSharedResponseCache(): ResponseCache {
  if (!responseCacheInstance) {
    responseCacheInstance = new ResponseCache();
  }
  return responseCacheInstance;
}
