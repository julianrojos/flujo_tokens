import fs from "node:fs";
import path from "node:path";
import { DOCS_ROOT } from "./paths.mjs";

export const DEFAULT_TOKEN_REGISTRY_PATH = `${DOCS_ROOT}/_generated/token-registry.json`;

export function loadTokenRegistry(registryPath = DEFAULT_TOKEN_REGISTRY_PATH) {
  const absolutePath = path.resolve(registryPath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Token registry not found: ${absolutePath}`);
  }

  const raw = fs.readFileSync(absolutePath, "utf8");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid token registry JSON at ${absolutePath}: ${message}`);
  }

  if (Array.isArray(parsed)) {
    const index = Object.create(null);
    for (const entry of parsed) {
      if (!entry || typeof entry !== "object") continue;
      const pathKey = typeof entry.path === "string" ? entry.path.trim() : "";
      const slashKey = typeof entry.slashPath === "string" ? entry.slashPath.trim() : "";
      if (pathKey && index[pathKey] === undefined) index[pathKey] = entry;
      if (slashKey && index[slashKey] === undefined) index[slashKey] = entry;
    }
    return index;
  }

  if (parsed == null || typeof parsed !== "object") {
    throw new Error(`Token registry must be an object or array at top level: ${absolutePath}`);
  }

  return parsed;
}

export function getRegistryEntry(registry, key) {
  if (!registry || typeof registry !== "object") return undefined;
  return registry[key];
}

export function hasRegistryEntry(registry, key) {
  return getRegistryEntry(registry, key) !== undefined;
}
