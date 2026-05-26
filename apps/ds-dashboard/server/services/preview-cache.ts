type PreviewCacheEntry<T> = {
  systemId: string;
  cachedAt: number;
  value: T;
};

export interface PreviewCacheOptions {
  ttlMs: number;
  maxEntries: number;
  now?: () => number;
}

export function createPreviewCache<T>({ ttlMs, maxEntries, now = Date.now }: PreviewCacheOptions) {
  const cache = new Map<string, PreviewCacheEntry<T>>();

  function pruneByAge(nowMs: number): void {
    for (const [key, entry] of cache.entries()) {
      if (nowMs - entry.cachedAt > ttlMs) {
        cache.delete(key);
      }
    }
  }

  function pruneBySize(): void {
    while (cache.size > maxEntries) {
      const oldestKey = cache.keys().next().value;
      if (!oldestKey) break;
      cache.delete(oldestKey);
    }
  }

  function get(key: string): T | null {
    const nowMs = now();
    pruneByAge(nowMs);
    const cached = cache.get(key);
    if (!cached) return null;
    cache.delete(key);
    cache.set(key, {
      ...cached,
      cachedAt: nowMs,
    });
    return cached.value;
  }

  function set(key: string, systemId: string, value: T): void {
    const nowMs = now();
    pruneByAge(nowMs);
    cache.set(key, {
      systemId: String(systemId || "").trim(),
      cachedAt: nowMs,
      value,
    });
    pruneBySize();
  }

  function clearForSystem(systemId: string): void {
    const normalizedSystemId = String(systemId || "").trim();
    if (!normalizedSystemId) return;
    for (const [key, entry] of cache.entries()) {
      if (entry.systemId === normalizedSystemId) {
        cache.delete(key);
      }
    }
  }

  return {
    get,
    set,
    clearForSystem,
  };
}
