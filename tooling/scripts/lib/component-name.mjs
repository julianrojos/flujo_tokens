import path from "node:path";
import { stripDiacritics } from "./strip-diacritics.mjs";

function splitComponentWords(raw) {
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
    .replace(/\.[^.]+$/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/[_\-/]+/g, " ")
    .replace(/[^a-zA-Z0-9 ]+/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

export function componentNameToSnakeCase(raw) {
  const words = splitComponentWords(raw);
  if (words.length === 0) return "";
  return words.map((word) => word.toLowerCase()).join("_");
}

export function componentNameToDisplayName(raw) {
  const words = splitComponentWords(raw);
  if (words.length === 0) return "";
  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("");
}

export function normalizeComponentName(raw) {
  return {
    displayName: componentNameToDisplayName(raw),
    fileSlug: componentNameToSnakeCase(raw),
  };
}

export function componentNameFromFilePath(filePath) {
  const base = path.basename(String(filePath || ""), path.extname(String(filePath || "")));
  return normalizeComponentName(base);
}

export function isSnakeCaseFileSlug(raw) {
  return /^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(String(raw || "").trim());
}
