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

  if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Token registry must be an object at top level: ${absolutePath}`);
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
