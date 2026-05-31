const FIGMA_FILE_VERSION_CACHE_TTL_MS = 10_000;

const figmaFileVersionCacheByKey = new Map<
  string,
  {
    fileVersion: string;
    cachedAt: number;
  }
>();

function toTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function buildFigmaFileVersionCacheKey(input: {
  fileKey: string;
}): string {
  return JSON.stringify({
    fileKey: toTrimmedString(input.fileKey),
  });
}

function pruneFigmaFileVersionCache(nowMs: number): void {
  for (const [cacheKey, entry] of figmaFileVersionCacheByKey.entries()) {
    if (nowMs - entry.cachedAt > FIGMA_FILE_VERSION_CACHE_TTL_MS) {
      figmaFileVersionCacheByKey.delete(cacheKey);
    }
  }
}

export function clearFigmaFileVersionCache(): void {
  figmaFileVersionCacheByKey.clear();
}

export function getFreshCachedFigmaFileVersion(input: {
  fileKey: string;
}): string | null {
  const nowMs = Date.now();
  pruneFigmaFileVersionCache(nowMs);
  const cacheKey = buildFigmaFileVersionCacheKey(input);
  const cached = figmaFileVersionCacheByKey.get(cacheKey);
  if (!cached) return null;
  if (nowMs - cached.cachedAt > FIGMA_FILE_VERSION_CACHE_TTL_MS) {
    figmaFileVersionCacheByKey.delete(cacheKey);
    return null;
  }
  return toTrimmedString(cached.fileVersion) || null;
}

export function setFigmaFileVersionCache(input: {
  fileKey: string;
  fileVersion: string;
}): void {
  const fileVersion = toTrimmedString(input.fileVersion);
  if (!fileVersion) return;
  const cacheKey = buildFigmaFileVersionCacheKey(input);
  figmaFileVersionCacheByKey.set(cacheKey, {
    fileVersion,
    cachedAt: Date.now(),
  });
}
