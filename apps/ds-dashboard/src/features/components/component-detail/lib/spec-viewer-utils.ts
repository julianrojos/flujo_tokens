/**
 * Normalize a variant name for tolerant matching (trim + lowercase).
 * @param name - Original variant name.
 * @returns Normalized name for stable comparison.
 */
export function normalizeVariantName(name: string): string {
  return name.trim().toLowerCase();
}
