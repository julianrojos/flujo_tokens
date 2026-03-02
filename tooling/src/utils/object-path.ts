/**
 * Object Path Utilities
 *
 * Utilities for accessing nested object properties by path.
 */

/**
 * Get value from object by dot-separated path.
 */
export function getPathValue(
  source: unknown,
  pathExpression: string,
  fallbackValue: unknown = null,
): unknown {
  const root = source && typeof source === 'object' ? source : null;
  if (!root) return fallbackValue;
  
  const pathParts = String(pathExpression || '')
    .split('.')
    .map((part) => part.trim())
    .filter(Boolean);
  
  let current: unknown = root;
  for (const part of pathParts) {
    if (
      !current ||
      typeof current !== 'object' ||
      !Object.prototype.hasOwnProperty.call(current, part)
    ) {
      return fallbackValue;
    }
    current = (current as Record<string, unknown>)[part];
  }
  
  return current == null ? fallbackValue : current;
}
