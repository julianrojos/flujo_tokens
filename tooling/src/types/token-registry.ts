/**
 * Type definitions for token registry module.
 */

/**
 * Token registry entry.
 */
export interface TokenRegistryEntry {
  path?: string;
  slashPath?: string;
  [key: string]: unknown;
}

/**
 * Indexed token registry.
 */
export interface IndexedTokenRegistry {
  entries?: TokenRegistryEntry[];
  byPath?: Record<string, TokenRegistryEntry>;
  bySlashPath?: Record<string, TokenRegistryEntry>;
  [key: string]: unknown;
}

/**
 * Token registry index (mapped by path/slashPath).
 */
export type TokenRegistryIndex = Record<string, TokenRegistryEntry>;
