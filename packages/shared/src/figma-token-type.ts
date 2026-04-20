import { stripDiacritics } from "./strip-diacritics.js";

function normalizeVariableName(rawName: string): string {
  return stripDiacritics(String(rawName || ""))
    .trim()
    .toLowerCase()
    .replace(/[._]+/g, "/")
    .replace(/\s+/g, " ")
    .replace(/\/+/g, "/");
}

export function normalizeTokenTypeFromFigma(args: {
  resolvedType: string;
  variableName?: string;
}): string {
  const type = String(args.resolvedType || "").trim().toUpperCase();
  const normalizedName = normalizeVariableName(String(args.variableName || ""));

  if (type === "COLOR") return "color";
  if (type === "FLOAT") {
    if (/\bfont weight\b/.test(normalizedName)) return "fontWeight";
    return "dimension";
  }
  if (type === "STRING") {
    if (
      /\bfont family\b/.test(normalizedName) ||
      /^family\b/.test(normalizedName) ||
      /\/family\b/.test(normalizedName)
    ) {
      return "fontFamily";
    }
    return "string";
  }
  if (type === "BOOLEAN") return "boolean";
  return "string";
}
