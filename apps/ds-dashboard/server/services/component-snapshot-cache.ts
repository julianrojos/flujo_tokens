const COMPONENT_SNAPSHOT_CACHE_TTL_MS = 30 * 60 * 1000;
const COMPONENT_SNAPSHOT_CACHE_MAX_ENTRIES = 300;

export type SnapshotComponentRecord = Record<string, unknown>;

type SnapshotKeyInput = {
  fileKey: string;
  fileVersion: string;
  includeVariants?: boolean;
  nameContains?: string;
  namePattern?: string;
  compact?: boolean;
};

type ComponentSnapshotEntry = {
  cachedAt: number;
  fileKey: string;
  fileVersion: string;
  components: SnapshotComponentRecord[];
};

const componentSnapshotCacheByKey = new Map<string, ComponentSnapshotEntry>();

function toTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function buildSnapshotCacheKey(input: SnapshotKeyInput): string {
  return JSON.stringify({
    fileKey: toTrimmedString(input.fileKey),
    fileVersion: toTrimmedString(input.fileVersion),
    includeVariants: input.includeVariants === true,
    nameContains: toTrimmedString(input.nameContains).toLowerCase(),
    namePattern: toTrimmedString(input.namePattern),
    compact: input.compact !== false,
  });
}

function pruneSnapshotCache(nowMs: number): void {
  for (const [key, entry] of componentSnapshotCacheByKey.entries()) {
    if (nowMs - entry.cachedAt > COMPONENT_SNAPSHOT_CACHE_TTL_MS) {
      componentSnapshotCacheByKey.delete(key);
    }
  }
  while (componentSnapshotCacheByKey.size > COMPONENT_SNAPSHOT_CACHE_MAX_ENTRIES) {
    const oldestKey = componentSnapshotCacheByKey.keys().next().value;
    if (!oldestKey) break;
    componentSnapshotCacheByKey.delete(oldestKey);
  }
}

export function clearComponentSnapshotCache(): void {
  componentSnapshotCacheByKey.clear();
}

export function getCachedComponentSnapshot(
  input: SnapshotKeyInput,
): SnapshotComponentRecord[] | null {
  const nowMs = Date.now();
  pruneSnapshotCache(nowMs);
  const cacheKey = buildSnapshotCacheKey(input);
  const cached = componentSnapshotCacheByKey.get(cacheKey);
  if (!cached) return null;
  if (nowMs - cached.cachedAt > COMPONENT_SNAPSHOT_CACHE_TTL_MS) {
    componentSnapshotCacheByKey.delete(cacheKey);
    return null;
  }
  return cached.components;
}

export function setCachedComponentSnapshot(
  input: SnapshotKeyInput & { components: SnapshotComponentRecord[] },
): void {
  const fileKey = toTrimmedString(input.fileKey);
  const fileVersion = toTrimmedString(input.fileVersion);
  if (!fileKey || !fileVersion) return;
  const nowMs = Date.now();
  pruneSnapshotCache(nowMs);
  const cacheKey = buildSnapshotCacheKey(input);
  componentSnapshotCacheByKey.set(cacheKey, {
    cachedAt: nowMs,
    fileKey,
    fileVersion,
    components: input.components.map((component) => ({ ...component })),
  });
  pruneSnapshotCache(nowMs);
}
