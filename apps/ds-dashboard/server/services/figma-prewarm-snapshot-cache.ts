const PREWARM_COMPONENT_SNAPSHOT_CACHE_TTL_MS = 10 * 60 * 1000;

export type PrewarmSnapshotComponentRecord = Record<string, unknown>;

type PrewarmSnapshotEntry = {
  cachedAt: number;
  components: PrewarmSnapshotComponentRecord[];
};

const prewarmComponentSnapshotByFileKey = new Map<string, PrewarmSnapshotEntry>();

function toTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function prunePrewarmSnapshotCache(nowMs: number): void {
  for (const [fileKey, entry] of prewarmComponentSnapshotByFileKey.entries()) {
    if (nowMs - entry.cachedAt > PREWARM_COMPONENT_SNAPSHOT_CACHE_TTL_MS) {
      prewarmComponentSnapshotByFileKey.delete(fileKey);
    }
  }
}

export function clearPrewarmComponentSnapshotCache(fileKey?: string): void {
  const normalizedFileKey = toTrimmedString(fileKey);
  if (!normalizedFileKey) {
    prewarmComponentSnapshotByFileKey.clear();
    return;
  }
  prewarmComponentSnapshotByFileKey.delete(normalizedFileKey);
}

export function getCachedPrewarmComponentSnapshot(input: {
  fileKey: string;
}): PrewarmSnapshotComponentRecord[] | null {
  const nowMs = Date.now();
  prunePrewarmSnapshotCache(nowMs);
  const fileKey = toTrimmedString(input.fileKey);
  if (!fileKey) return null;
  const cached = prewarmComponentSnapshotByFileKey.get(fileKey);
  if (!cached) return null;
  if (nowMs - cached.cachedAt > PREWARM_COMPONENT_SNAPSHOT_CACHE_TTL_MS) {
    prewarmComponentSnapshotByFileKey.delete(fileKey);
    return null;
  }
  return cached.components.map((component) => ({ ...component }));
}

export function setCachedPrewarmComponentSnapshot(input: {
  fileKey: string;
  components: PrewarmSnapshotComponentRecord[];
}): void {
  const fileKey = toTrimmedString(input.fileKey);
  if (!fileKey) return;
  const nowMs = Date.now();
  prunePrewarmSnapshotCache(nowMs);
  prewarmComponentSnapshotByFileKey.set(fileKey, {
    cachedAt: nowMs,
    components: input.components.map((component) => ({ ...component })),
  });
}
