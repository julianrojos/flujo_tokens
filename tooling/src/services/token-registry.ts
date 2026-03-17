/**
 * Token Registry Loader
 * 
 * Loads and indexes token registry from JSON file.
 * Supports both new indexed format and legacy array format.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { resolveSystemContextSafe } from "../utils/system-context.js";
import type {
  IndexedTokenRegistry,
  TokenRegistryEntry,
  TokenRegistryIndex,
} from "../types/token-registry.js";

/**
 * Default token registry path from system context.
 */
const _defaultCtx = resolveSystemContextSafe();
export const DEFAULT_TOKEN_REGISTRY_PATH = _defaultCtx.paths.tokenRegistry;

/**
 * Load token registry from JSON file.
 * 
 * Supports two formats:
 * 1. New indexed format: { entries: [...], byPath: {...}, bySlashPath: {...} }
 * 2. Legacy array format: [{ path, slashPath, ... }, ...]
 * 
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

  // New indexed format: { entries: [...], byPath: {...}, bySlashPath: {...} }
  if (
    parsed &&
    typeof parsed === "object" &&
    !Array.isArray(parsed) &&
    Array.isArray((parsed as IndexedTokenRegistry).entries)
  ) {
    const registry = parsed as IndexedTokenRegistry;
    const index: TokenRegistryIndex = Object.create(null);
    
    for (const key of Object.keys(registry.byPath || {})) {
      index[key] = registry.byPath![key];
    }
    for (const key of Object.keys(registry.bySlashPath || {})) {
      if (index[key] === undefined) {
        index[key] = registry.bySlashPath![key];
      }
    }
    return index;
  }

  // Legacy array format (backward compat)
  if (Array.isArray(parsed)) {
    const index: TokenRegistryIndex = Object.create(null);
    for (const entry of parsed) {
      if (!entry || typeof entry !== "object") continue;
      const entryObj = entry as TokenRegistryEntry;
      const pathKey = typeof entryObj.path === "string" ? entryObj.path.trim() : "";
      const slashKey = typeof entryObj.slashPath === "string" ? entryObj.slashPath.trim() : "";
      if (pathKey && index[pathKey] === undefined) index[pathKey] = entryObj;
      if (slashKey && index[slashKey] === undefined) index[slashKey] = entryObj;
    }
    return index;
  }

  if (parsed == null || typeof parsed !== "object") {
    throw new Error(`Token registry must be an object or array at top level: ${absolutePath}`);
  }

  return parsed as TokenRegistryIndex;
}
