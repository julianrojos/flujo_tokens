export function formatSyncedAt(value: string | undefined, fallback = "—"): string {
  const trimmed = value?.trim();
  if (!trimmed) return fallback;
  const date = new Date(trimmed);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : fallback;
}
