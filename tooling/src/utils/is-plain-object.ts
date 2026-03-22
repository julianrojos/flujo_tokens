/**
 * Type guard to check if a value is a plain object (not array, not null).
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
