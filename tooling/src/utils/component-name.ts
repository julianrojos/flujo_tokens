import path from "node:path";

import { stripDiacritics } from "./strip-diacritics.js";

/**
 * Split a component name into individual words.
 * Handles camelCase, PascalCase, snake-case, kebab-case, and dot notation.
 * Also normalizes diacritics (accents) to ASCII base characters.
 */
function splitComponentWords(raw: unknown): string[] {
  const input =
    typeof raw === "string"
      ? raw.trim()
      : typeof raw === "number" && Number.isFinite(raw)
        ? String(raw)
        : "";
  if (!input) return [];

  // First normalize diacritics (áéíóú -> aeioou, ñ -> n, etc.)
  const normalized = stripDiacritics(input);

  return normalized
    .replace(/\.[^.]+$/, "") // Remove file extension
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2") // camelCase → camel Case
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2") // XMLParser → XML Parser
    .replace(/[_\-/]+/g, " ") // snake/kebab/slash → space
    .replace(/[^a-zA-Z0-9 ]+/g, " ") // Remove special chars
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

/**
 * Convert a component name to snake_case format.
 * Example: "Button" → "button", "AlertBanner" → "alert_banner"
 */
export function componentNameToSnakeCase(raw: unknown): string {
  const words = splitComponentWords(raw);
  if (words.length === 0) return "";
  return words.map((word) => word.toLowerCase()).join("_");
}

/**
 * Convert a component name to display name (PascalCase).
 * Preserves existing capitalization to handle acronyms correctly.
 * Example: "button" → "Button", "alert_banner" → "AlertBanner", "XMLParser" → "XMLParser"
 */
export function componentNameToDisplayName(raw: unknown): string {
  const words = splitComponentWords(raw);
  if (words.length === 0) return "";
  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");
}

/**
 * Normalize a component name to both display name and file slug.
 */
export interface NormalizedComponentName {
  displayName: string;
  fileSlug: string;
}

export function normalizeComponentName(raw: unknown): NormalizedComponentName {
  return {
    displayName: componentNameToDisplayName(raw),
    fileSlug: componentNameToSnakeCase(raw),
  };
}

/**
 * Extract and normalize component name from a file path.
 */
export function componentNameFromFilePath(filePath: string): NormalizedComponentName {
  const base = path.basename(String(filePath || ""), path.extname(String(filePath || "")));
  return normalizeComponentName(base);
}

/**
 * Check if a string is a valid snake_case file slug.
 */
export function isSnakeCaseFileSlug(raw: unknown): boolean {
  return /^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(String(raw || "").trim());
}
