import type { TokenCatalogEntry } from "@/types/token-catalog";

/**
 * Normalize token/variable identifiers for resilient matching between token paths and Figma variable names.
 * Important: dashes are preserved because they can be meaningful inside a single segment.
 */
export function normalizeUsageKeyForMatch(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^_+/, "")
    .replace(/^semanticos[./]/, "")
    .replace(/^primitivos[./]/, "")
    .replace(/^theme[./]/, "")
    .replace(/^tokens?[./]/, "")
    .replace(/^--+/, "")
    .replace(/[._]+/g, "/")
    .replace(/\/+/g, "/")
    .replace(/^\/+|\/+$/g, "");
}

/**
 * Build candidate targets used to match a token against external usage reports.
 */
export function buildTokenUsageTargets(token: TokenCatalogEntry | null): Set<string> {
  if (!token) return new Set<string>();
  return new Set([
    normalizeUsageKeyForMatch(token.path),
    normalizeUsageKeyForMatch(token.slashPath),
    normalizeUsageKeyForMatch(token.cssVar),
    String(token.slashPath || "").trim(),
    String(token.path || "").trim(),
    String(token.cssVar || "").trim(),
  ]);
}

/**
 * Check whether a variable report row can be associated with the current token targets.
 * Note: `variableKey` match is best-effort until token registry exposes Figma variable keys.
 */
export function variableReportMatchesTokenTargets(
  report: { variableName?: string; variableKey?: string },
  targets: Set<string>,
): boolean {
  const byNormalizedName = normalizeUsageKeyForMatch(String(report.variableName || ""));
  if (byNormalizedName && targets.has(byNormalizedName)) {
    return true;
  }
  const byExactName = String(report.variableName || "").trim();
  if (byExactName && targets.has(byExactName)) {
    return true;
  }
  const byExactKey = String(report.variableKey || "").trim();
  if (byExactKey && targets.has(byExactKey)) {
    return true;
  }
  return false;
}
