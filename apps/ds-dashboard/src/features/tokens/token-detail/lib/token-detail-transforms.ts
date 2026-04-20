/**
 * Pure utility functions for token-detail feature.
 * No React hooks, no JSX — pure transformations only.
 */

import type { TokenCatalogEntry, TokenCatalog } from "@/types/token-catalog";

/**
 * Extract hex color from token value if present
 */
export function resolveColorSwatch(value: string): string | null {
  const raw = String(value || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(raw) || /^#[0-9a-fA-F]{8}$/.test(raw)) {
    return raw;
  }
  return null;
}

/**
 * Resolve the target token for an alias reference
 */
export function resolveAliasTarget(registry: TokenCatalog | null, aliasOf: string | null): TokenCatalogEntry | null {
  const ref = String(aliasOf || "").trim();
  if (!registry || !ref) return null;
  const directMatch = registry.byPath?.[ref] ?? registry.bySlashPath?.[ref] ?? null;
  if (directMatch) return directMatch;

  const canonicalCandidates = new Set<string>();
  canonicalCandidates.add(ref);
  if (ref.startsWith("_")) canonicalCandidates.add(ref.slice(1));
  canonicalCandidates.add(ref.replace(/^_([^./]+)([./])/, "$1$2"));

  for (const candidate of canonicalCandidates) {
    const match = registry.byPath?.[candidate] ?? registry.bySlashPath?.[candidate] ?? null;
    if (match) return match;
  }
  return null;
}

/**
 * Parse dimension preview value (e.g., "16px", "1rem")
 */
export function parseDimensionPreview(value: string) {
  const match = String(value || "")
    .trim()
    .match(/^(-?\d+(?:\.\d+)?)(px|rem|em)$/i);
  if (!match) return null;
  const amount = Number.parseFloat(match[1]);
  if (!Number.isFinite(amount)) return null;
  const unit = match[2].toLowerCase();
  const absolutePx = unit === "px" ? amount : amount * 16;
  return {
    amount,
    unit,
    width: Math.max(6, Math.min(absolutePx, 160)),
  };
}

/**
 * Derive the visual token type shown in the detail page from the resolved value.
 * This prefers the actual rendered value over the stored catalog type when they diverge.
 */
export function deriveTokenDisplayType(args: {
  token: TokenCatalogEntry | null;
  resolvedValue?: string;
}): string {
  const tokenType = String(args.token?.type || "").trim().toLowerCase();
  const resolvedValue = String(args.resolvedValue ?? args.token?.resolvedValue ?? "").trim();
  if (resolveColorSwatch(resolvedValue)) return "color";
  if (parseDimensionPreview(resolvedValue)) return "dimension";
  if (tokenType) return tokenType;
  return "string";
}

/**
 * Check if a token matches a reference value
 */
export function tokenMatchesRef(token: TokenCatalogEntry, value: string): boolean {
  const ref = String(value || "").trim();
  if (!ref) return false;
  return ref === token.path || ref === token.slashPath || ref === token.cssVar;
}

/**
 * Build the alias chain for a token (following aliasOf references)
 */
export function buildAliasChain(registry: TokenCatalog | null, token: TokenCatalogEntry | null) {
  if (!registry || !token) {
    return { chain: [] as TokenCatalogEntry[], brokenRef: null as string | null, hasCycle: false };
  }
  const chain: TokenCatalogEntry[] = [token];
  const visited = new Set<string>([token.path]);
  let current = token;
  let brokenRef: string | null = null;
  let hasCycle = false;

  while (current.aliasOf) {
    const next = resolveAliasTarget(registry, current.aliasOf);
    if (!next) {
      brokenRef = current.aliasOf;
      break;
    }
    chain.push(next);
    if (visited.has(next.path)) {
      hasCycle = true;
      break;
    }
    visited.add(next.path);
    current = next;
  }

  return { chain, brokenRef, hasCycle };
}

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

/**
 * Labels for token usage kinds
 */
export const KIND_LABELS: Record<string, string> = {
  "css-alias": "CSS alias",
  "figma-alias": "Figma alias",
  "figma-applied": "Figma parent usage",
  "figma-consumer-applied": "Figma consumer usage",
};
