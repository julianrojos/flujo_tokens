export function formatSyncedAt(value: string | undefined, fallback = "—"): string {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : fallback;
}
