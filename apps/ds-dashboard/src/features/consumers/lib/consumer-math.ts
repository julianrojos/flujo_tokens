export function toNonNegativeInt(value: number | null | undefined): number {
  const normalized = Number(value ?? 0);
  if (!Number.isFinite(normalized)) return 0;
  return Math.max(0, Math.floor(normalized));
}

export function computeCoveragePercent(consumers: number, totalConsumers: number): number | null {
  if (totalConsumers <= 0) return null;
  return Math.min(100, Math.round((consumers / totalConsumers) * 100));
}

export function countUniqueConsumerIds<T extends { consumerId: string }>(
  consumers: ReadonlyArray<T>,
): number {
  return new Set(consumers.map((consumer) => consumer.consumerId)).size;
}
