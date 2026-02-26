/**
 * Registry Loader Utility
 *
 * Reusable pattern for loading token registry with graceful error handling.
 */

import { loadTokenRegistry } from '../services/token-utils.js';

/**
 * Load token registry or throw a user-friendly error.
 *
 * @param registryPath - Path to the token registry JSON file.
 * @returns The loaded token registry.
 * @throws Error with actionable message if registry cannot be loaded.
 */
export function loadRegistryOrThrow(registryPath: string): unknown {
  try {
    return loadTokenRegistry(registryPath);
  } catch (error) {
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}. Run \`npm run generate:registry\` first.`,
    );
  }
}
