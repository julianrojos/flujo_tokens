import fs from "node:fs";
import path from "node:path";
import { PROJECT_ROOT } from "./system-context.mjs";

export const DEFAULT_TOKEN_REGISTRY_PATH = path.resolve(
  PROJECT_ROOT,
  "docs",
  "_generated",
  "token-registry.json",
);

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

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

  // Indexed format: { entries: [...], byPath: {...}, bySlashPath: {...} }
  if (isRecord(parsed) && Array.isArray(parsed.entries)) {
    if (!isRecord(parsed.byPath)) {
      throw new Error(
        `Invalid token registry format at ${absolutePath}: missing object field "byPath".\n` +
          "Regenerate it with: npm run generate:registry",
      );
    }
    if (parsed.bySlashPath !== undefined && !isRecord(parsed.bySlashPath)) {
      throw new Error(
        `Invalid token registry format at ${absolutePath}: field "bySlashPath" must be an object when present.\n` +
          "Regenerate it with: npm run generate:registry",
      );
    }
    const index = Object.create(null);
    for (const key of Object.keys(parsed.byPath)) index[key] = parsed.byPath[key];
    for (const key of Object.keys(parsed.bySlashPath || {})) {
      if (index[key] === undefined) index[key] = parsed.bySlashPath[key];
    }
    return index;
  }

  if (Array.isArray(parsed)) {
    throw new Error(
      `Legacy token registry format detected at ${absolutePath}: expected { entries, byPath, bySlashPath }.\n` +
        "Regenerate it with: npm run generate:registry",
    );
  }

  throw new Error(
    `Invalid token registry format at ${absolutePath}: expected { entries, byPath, bySlashPath }.\n` +
      "Regenerate it with: npm run generate:registry",
  );
}
