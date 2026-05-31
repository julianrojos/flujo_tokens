export function parseSyncedAt(value: string | null | undefined, fallback: number): number;
export function parseSyncedAt(value: string | null | undefined, fallback: null): number | null;
export function parseSyncedAt(value: string | null | undefined, fallback: number | null): number | null {
  if (!value) return fallback;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
