import type { TokenCatalogEntry } from "@/types/token-catalog";
import {
  normalizeResolvedValueKey,
  resolveColorSwatch,
} from "@/lib/token-value-normalize";

export interface SharedValueTokenLeaf {
  path: string;
  resolvedValue: string;
  collection: string;
  type: string;
  cssVar: string;
}

export interface SharedValueCluster {
  key: string;
  label: string;
  count: number;
  tokens: SharedValueTokenLeaf[];
  fill: string;
  isColor: boolean;
}

const PALETTE = [
  "var(--app-accent)",
  "#7c3aed",
  "#0ea5e9",
  "#f97316",
  "#22c55e",
  "#ef4444",
  "#14b8a6",
  "#eab308",
  "#8b5cf6",
  "#64748b",
];

export function isColorResolvedValue(value: string): boolean {
  return resolveColorSwatch(value) !== null;
}

export function resolveClusterFill(cluster: { key: string; label: string }, index: number): string {
  if (isColorResolvedValue(cluster.label)) {
    return resolveColorSwatch(cluster.label) || cluster.label;
  }
  return PALETTE[index % PALETTE.length] || "var(--app-accent)";
}

export function buildSharedValueClusters(entries: TokenCatalogEntry[]): SharedValueCluster[] {
  const byValue = new Map<string, SharedValueTokenLeaf[]>();
  const labelByKey = new Map<string, string>();

  for (const entry of entries || []) {
    const rawValue = String(entry.resolvedValue || "").trim();
    if (!rawValue) continue;
    // Skip unresolved alias references — they don't represent meaningful shared values
    if (rawValue.startsWith("var(")) continue;
    const key = normalizeResolvedValueKey(rawValue);
    if (!key) continue;

    const current = byValue.get(key) || [];
    current.push({
      path: String(entry.path || "").trim(),
      resolvedValue: rawValue,
      collection: String(entry.collection || "").trim(),
      type: String(entry.type || "").trim(),
      cssVar: String(entry.cssVar || "").trim(),
    });
    byValue.set(key, current);

    if (!labelByKey.has(key)) {
      labelByKey.set(key, rawValue);
    }
  }

  // Sort first so palette indices reflect display order, not Map insertion order
  const sorted = Array.from(byValue.entries())
    .map(([key, tokens]) => ({
      key,
      label: labelByKey.get(key) || key,
      count: tokens.length,
      tokens: tokens.slice().sort((a, b) => a.path.localeCompare(b.path, "en", { sensitivity: "base" })),
      isColor: isColorResolvedValue(labelByKey.get(key) || key),
    }))
    .filter((cluster) => cluster.count >= 2)
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.label.localeCompare(b.label, "en", { sensitivity: "base" });
    });

  // Assign fill after sort so palette indices match visual display order
  return sorted.map((cluster, index) => ({
    ...cluster,
    fill: resolveClusterFill(cluster, index),
  }));
}

export function summarizeSharedValues(clusters: SharedValueCluster[]): {
  uniqueValues: number;
  sharedTokens: number;
  duplicateExcess: number;
  topCount: number;
} {
  const uniqueValues = clusters.length;
  const sharedTokens = clusters.reduce((sum, cluster) => sum + cluster.count, 0);
  const duplicateExcess = clusters.reduce((sum, cluster) => sum + Math.max(0, cluster.count - 1), 0);
  const topCount = clusters[0]?.count ?? 0;

  return {
    uniqueValues,
    sharedTokens,
    duplicateExcess,
    topCount,
  };
}
