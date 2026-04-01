/**
 * Token Registry Loader
 *
 * Loads and indexes token registry from JSON file.
 * Expects indexed format: { entries: [...], byPath: {...}, bySlashPath: {...} }
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { PROJECT_ROOT } from "../utils/system-context.js";
import type {
  IndexedTokenRegistry,
  TokenRegistryEntry,
  TokenRegistryIndex,
} from "../types/token-registry.js";

/**
 * Default token registry path from system context.
 */
export const DEFAULT_TOKEN_REGISTRY_PATH = path.resolve(
  PROJECT_ROOT,
  "docs",
  "_generated",
  "token-registry.json",
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Load token registry from JSON file.
 *
 * Expects indexed format: { entries: [...], byPath: {...}, bySlashPath: {...} }
 * Returns an indexed object mapped by path and slashPath keys.
 */
export function loadTokenRegistry(registryPath: string = DEFAULT_TOKEN_REGISTRY_PATH): TokenRegistryIndex {
  const absolutePath = path.resolve(registryPath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Token registry not found: ${absolutePath}`);
  }

  let raw: string;
  try {
    raw = fs.readFileSync(absolutePath, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read token registry at ${absolutePath}: ${message}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid token registry JSON at ${absolutePath}: ${message}`);
  }

  // Indexed format: { entries: [...], byPath: {...}, bySlashPath: {...} }
  if (isRecord(parsed) && Array.isArray((parsed as IndexedTokenRegistry).entries)) {
    const registry = parsed as IndexedTokenRegistry;
    if (!isRecord(registry.byPath)) {
      throw new Error(
        `Invalid token registry format at ${absolutePath}: missing object field "byPath".\n` +
          'Regenerate it with: npm run generate:registry',
      );
    }
    if (registry.bySlashPath !== undefined && !isRecord(registry.bySlashPath)) {
      throw new Error(
        `Invalid token registry format at ${absolutePath}: field "bySlashPath" must be an object when present.\n` +
          'Regenerate it with: npm run generate:registry',
      );
    }
    const index: TokenRegistryIndex = Object.create(null);

    for (const key of Object.keys(registry.byPath)) {
      index[key] = registry.byPath![key];
    }
    for (const key of Object.keys(registry.bySlashPath || {})) {
      if (index[key] === undefined) {
        index[key] = registry.bySlashPath![key];
      }
    }
    return index;
  }

  if (Array.isArray(parsed)) {
    throw new Error(
      `Legacy token registry format detected at ${absolutePath}: expected { entries, byPath, bySlashPath }.\n` +
        'Regenerate it with: npm run generate:registry',
    );
  }

  throw new Error(
    `Invalid token registry format at ${absolutePath}: expected { entries, byPath, bySlashPath }.\n` +
      'Regenerate it with: npm run generate:registry',
  );
}
