import {
  CAPTURE_KEYS,
  EDITORIAL_KEYS,
  IDENTITY_KEYS,
} from './spec-capture-keys.js';

function hasOwn(target: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(target, key);
}

/**
 * Merge a fresh capture with an existing spec while preserving editorial data.
 */
export function mergeSpecPreservingEditorial(
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...incoming };

  // Preserve editorial keys whenever they already exist on disk.
  for (const key of EDITORIAL_KEYS) {
    if (hasOwn(existing, key)) {
      result[key] = existing[key];
    }
  }

  // Identity keys are capture-authoritative; fall back to existing when absent in incoming.
  for (const key of IDENTITY_KEYS) {
    if (!hasOwn(incoming, key) && hasOwn(existing, key)) {
      result[key] = existing[key];
    }
  }

  // Preserve unknown keys to stay forward-compatible with future schema additions.
  const knownKeys = new Set<string>([
    ...CAPTURE_KEYS,
    ...EDITORIAL_KEYS,
    ...IDENTITY_KEYS,
  ]);
  for (const [key, value] of Object.entries(existing)) {
    if (!knownKeys.has(key) && !hasOwn(result, key)) {
      result[key] = value;
    }
  }

  return result;
}
