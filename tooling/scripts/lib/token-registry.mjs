import fs from "node:fs";
import path from "node:path";
import { DOCS_ROOT } from "./paths.mjs";

export const DEFAULT_TOKEN_REGISTRY_PATH = path.join(DOCS_ROOT, "_generated", "token-registry.json");

export function loadTokenRegistry(registryPath = DEFAULT_TOKEN_REGISTRY_PATH) {
  const absolutePath = path.resolve(registryPath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Token registry not found: ${absolutePath}`);
  }

  let raw;
  try {
    raw = fs.readFileSync(absolutePath, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read token registry at ${absolutePath}: ${message}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid token registry JSON at ${absolutePath}: ${message}`);
  }

  // New indexed format: { entries: [...], byPath: {...}, bySlashPath: {...} }
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && Array.isArray(parsed.entries)) {
    const index = Object.create(null);
    for (const key of Object.keys(parsed.byPath || {})) index[key] = parsed.byPath[key];
    for (const key of Object.keys(parsed.bySlashPath || {})) {
      if (index[key] === undefined) index[key] = parsed.bySlashPath[key];
    }
    return index;
  }

  // Legacy array format (backward compat)
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
