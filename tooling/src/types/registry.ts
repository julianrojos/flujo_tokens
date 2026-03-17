/**
 * Registry type definitions
 *
 * Shared types for component registry operations across tooling.
 */

/**
 * Component registry entry structure
 */
export interface RegistryEntry {
  path?: string;
  slashPath?: string;
  [key: string]: unknown;
}

/**
 * Registry lookup structure for efficient access
 */
export interface RegistryLookup {
  entries: RegistryEntry[];
  byPath: Map<string, RegistryEntry>;
  bySlash: Map<string, RegistryEntry>;
}
