import { isPlainObject } from "./is-plain-object.js";
import { isTbdMarker } from "./tbd.js";

export interface TokenRegistryEntry {
  path?: string;
  slashPath?: string;
  cssVar?: string;
  collection?: string;
  type?: string;
  resolvedValue?: string;
  [key: string]: unknown;
}

export interface TokenMappingNode extends Record<string, unknown> {}

/**
 * Normalize a string for comparison (lowercase, alphanumeric only).
 */
export function normalizeCompareKey(raw: unknown): string {
  return String(raw || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Extract unique entries from a registry index.
 * Deduplicates by path, slashPath, cssVar, and collection combination.
 */
export function extractUniqueRegistryEntries(
  registryIndex: Record<string, unknown>
): TokenRegistryEntry[] {
  const unique: TokenRegistryEntry[] = [];
  const seen = new Set<string>();

  for (const entry of Object.values(registryIndex || {})) {
    if (!entry || typeof entry !== "object") continue;
    const typedEntry = entry as TokenRegistryEntry;
    const marker = [
      String(typedEntry.path || ""),
      String(typedEntry.slashPath || ""),
      String(typedEntry.cssVar || ""),
      String(typedEntry.collection || ""),
    ].join("|");
    if (seen.has(marker)) continue;
    seen.add(marker);
    unique.push(typedEntry);
  }

  return unique;
}

/**
 * Find token candidates that belong to a specific component.
 * Matches entries where the path contains the component name.
 */
export function pickComponentTokenCandidates(
  registryEntries: TokenRegistryEntry[],
  componentName: unknown
): TokenRegistryEntry[] {
  const componentKey = normalizeCompareKey(componentName);
  if (!componentKey) return [];

  const matches: TokenRegistryEntry[] = [];
  for (const entry of registryEntries) {
    if (!entry.path || !String(entry.path).includes(".")) continue;
    if (String(entry.collection || "").toLowerCase() !== "components") continue;
    const parts = String(entry.path).split(".");
    if (parts.length < 3) continue;
    if (normalizeCompareKey(parts[1]) !== componentKey) continue;
    matches.push(entry);
  }
  return matches;
}

/**
 * Build a menu of token suggestions for a component.
 * Prefers component-specific tokens, falls back to semantic/primitives.
 */
export function buildTokenMenuLines(
  registryEntries: TokenRegistryEntry[],
  componentName: unknown,
  limit = 24
): string[] {
  const preferred = pickComponentTokenCandidates(registryEntries, componentName);
  const fallback = registryEntries.filter((entry) => {
    const collection = String(entry.collection || "").toLowerCase();
    return collection === "semantic" || collection === "primitives";
  });
  const source = preferred.length > 0 ? preferred : fallback;
  const selected = source.slice(0, Math.max(0, limit));
  
  return selected.map((entry) => {
    const tokenPath = String(entry.slashPath || entry.path || "").trim();
    const tokenType = String(entry.type || "unknown").trim();
    const resolved = String(entry.resolvedValue || "").trim();
    return resolved
      ? `${tokenPath} (${tokenType}: ${resolved})`
      : `${tokenPath} (${tokenType})`;
  });
}

/**
 * Extract keywords from a string for token matching.
 * Excludes common stop words.
 */
function extractKeywords(raw: string): string[] {
  const stopWords = new Set([
    "default",
    "state",
    "type",
    "variant",
    "token",
    "tokens",
    "value",
    "values",
  ]);
  return String(raw || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((part) => part && !stopWords.has(part));
}

/**
 * Score a token candidate based on keyword matches.
 */
function scoreTokenCandidate(entry: TokenRegistryEntry, keywords: string[]): number {
  const haystack =
    `${String(entry.path || "")} ${String(entry.slashPath || "")}`.toLowerCase();
  let score = 0;

  for (const keyword of keywords) {
    if (!keyword) continue;
    if (haystack.includes(keyword)) score += 1;
  }

  return score;
}

/**
 * Pick the best token path from candidates based on keyword scoring.
 * Returns empty string if no strong match is found.
 */
export function pickBestTokenPath(
  candidates: TokenRegistryEntry[],
  keyPath: string,
  condition: string
): string {
  const keywords = extractKeywords(`${keyPath} ${condition}`);
  if (keywords.length === 0) return "";

  let best: TokenRegistryEntry | null = null;
  let bestScore = 0;
  let bestScoreCount = 0;
  
  for (const candidate of candidates) {
    const score = scoreTokenCandidate(candidate, keywords);
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
      bestScoreCount = score > 0 ? 1 : 0;
      continue;
    }
    if (score === bestScore && best && score > 0) {
      bestScoreCount += 1;
      const currentLen = String(candidate.path || "").length;
      const bestLen = String(best.path || "").length;
      if (currentLen < bestLen) best = candidate;
    }
  }

  const isStrongMatch = bestScore >= 2;
  const isUniqueSingleKeywordMatch = bestScore === 1 && bestScoreCount === 1;
  if (!best || (!isStrongMatch && !isUniqueSingleKeywordMatch)) return "";
  return String(best.slashPath || best.path || "").trim();
}

/**
 * Pre-fill TBD markers in a spec node with token suggestions.
 * Returns the count of filled markers.
 */
export function prefillTokenMapping(
  node: unknown,
  componentTokenCandidates: TokenRegistryEntry[],
  keyPath = ""
): number {
  if (!isPlainObject(node)) return 0;
  let filledCount = 0;

  const entries = Object.entries(node as Record<string, unknown>);
  const isConditionMap =
    entries.length > 0 &&
    entries.every(([, value]) => typeof value === "string");

  if (isConditionMap) {
    const typedNode = node as Record<string, string>;
    for (const [condition, value] of entries) {
      if (!isTbdMarker(value)) continue;
      const suggestion = pickBestTokenPath(
        componentTokenCandidates,
        keyPath,
        condition,
      );
      if (!suggestion) continue;
      typedNode[condition] = suggestion;
      filledCount += 1;
    }
    return filledCount;
  }

  for (const [key, value] of entries) {
    const nextPath = keyPath ? `${keyPath}.${key}` : key;

    if (typeof value === "string") {
      if (!isTbdMarker(value)) continue;
      const suggestion = pickBestTokenPath(
        componentTokenCandidates,
        nextPath,
        key,
      );
      if (!suggestion) continue;
      (node as Record<string, unknown>)[key] = suggestion;
      filledCount += 1;
      continue;
    }

    if (isPlainObject(value)) {
      filledCount += prefillTokenMapping(
        value as Record<string, unknown>,
        componentTokenCandidates,
        nextPath,
      );
    }
  }

  return filledCount;
}
