import type { TokenEntry } from "@/types/token-registry";

import { normalizeToHex6 } from "./color-utils";
import type { SemanticColorCategory, SemanticColorOption } from "./types";

interface TokenIndexes {
  byCssVar: Map<string, TokenEntry>;
}

const VAR_REF_RE = /^var\(\s*(--[a-z0-9-]+)\s*(?:,\s*(.+)\s*)?\)$/i;
const MAX_RESOLUTION_DEPTH = 12;

function buildIndexes(entries: TokenEntry[]): TokenIndexes {
  const byCssVar = new Map<string, TokenEntry>();
  for (const entry of entries) {
    const cssVar = String(entry.cssVar || "").trim();
    if (!cssVar) continue;
    if (!byCssVar.has(cssVar)) byCssVar.set(cssVar, entry);
  }
  return { byCssVar };
}

function parseVarReference(rawValue: string): { cssVar: string; fallback: string } | null {
  const match = String(rawValue || "").trim().match(VAR_REF_RE);
  if (!match) return null;
  return {
    cssVar: String(match[1] || "").trim(),
    fallback: String(match[2] || "").trim(),
  };
}

function resolveEntryToHex(
  entry: TokenEntry,
  indexes: TokenIndexes,
  depth = 0,
  visited = new Set<string>(),
): string | null {
  if (depth > MAX_RESOLUTION_DEPTH) return null;

  const raw = String(entry.resolvedValue || "").trim();
  const direct = normalizeToHex6(raw);
  if (direct) return direct;

  const varRef = parseVarReference(raw);
  if (!varRef) return null;

  const { cssVar, fallback } = varRef;
  const marker = cssVar.toLowerCase();
  if (visited.has(marker)) return normalizeToHex6(fallback);
  visited.add(marker);

  const target = indexes.byCssVar.get(cssVar);
  if (target) {
    const resolved = resolveEntryToHex(target, indexes, depth + 1, visited);
    if (resolved) return resolved;
  }

  return normalizeToHex6(fallback);
}

function classifySemanticColor(entry: TokenEntry): SemanticColorCategory | null {
  const haystack = `${entry.path} ${entry.slashPath}`.toLowerCase();

  const hasBackgroundKeyword =
    haystack.includes("background") ||
    haystack.includes("surface") ||
    haystack.includes("container");
  const hasForegroundKeyword =
    haystack.includes("text") ||
    haystack.includes("icon") ||
    haystack.includes("foreground") ||
    haystack.includes("label");

  if (hasBackgroundKeyword && hasForegroundKeyword) return "both";
  if (hasBackgroundKeyword) return "background";
  if (hasForegroundKeyword) return "foreground";
  return null;
}

function labelFor(entry: TokenEntry): string {
  const slash = String(entry.slashPath || "").trim();
  if (slash) return slash;
  return String(entry.path || "").trim();
}

function compareOptions(a: SemanticColorOption, b: SemanticColorOption): number {
  return a.label.localeCompare(b.label, "en", { sensitivity: "base" });
}

export function buildSemanticColorOptions(entries: TokenEntry[]): {
  all: SemanticColorOption[];
  background: SemanticColorOption[];
  foreground: SemanticColorOption[];
} {
  const indexes = buildIndexes(entries);
  const semanticColorEntries = entries.filter(
    (entry) =>
      String(entry.type || "").toLowerCase() === "color" &&
      String(entry.collection || "").toLowerCase() === "semantic",
  );

  const all: SemanticColorOption[] = [];
  for (const entry of semanticColorEntries) {
    const category = classifySemanticColor(entry);
    if (!category) continue;
    const hexValue = resolveEntryToHex(entry, indexes);
    if (!hexValue) continue;

    all.push({
      tokenPath: entry.path,
      tokenSlashPath: entry.slashPath,
      cssVar: entry.cssVar,
      label: labelFor(entry),
      hexValue,
      category,
    });
  }

  all.sort(compareOptions);

  const background = all
    .filter((option) => option.category === "background" || option.category === "both")
    .sort(compareOptions);
  const foreground = all
    .filter((option) => option.category === "foreground" || option.category === "both")
    .sort(compareOptions);

  return { all, background, foreground };
}
