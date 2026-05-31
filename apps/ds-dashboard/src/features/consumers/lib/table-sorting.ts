export type SortDirection = "asc" | "desc";

export function compareNullableNumbers(
  left: number | null,
  right: number | null,
  dir: SortDirection,
): number {
  const leftValue = left ?? Number.NEGATIVE_INFINITY;
  const rightValue = right ?? Number.NEGATIVE_INFINITY;
  const comparison = leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
  return dir === "asc" ? comparison : comparison * -1;
}

export function compareStrings(left: string, right: string, dir: SortDirection): number {
  const comparison = left.localeCompare(right);
  return dir === "asc" ? comparison : comparison * -1;
}

export function compareWeightedValues<T extends string>(
  left: T,
  right: T,
  dir: SortDirection,
  weights: Record<T, number>,
): number {
  return compareNullableNumbers(weights[left] ?? null, weights[right] ?? null, dir);
}
