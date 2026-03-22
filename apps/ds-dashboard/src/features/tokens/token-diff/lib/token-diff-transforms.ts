/**
 * Token diff transforms - pure functions for token diff processing.
 * No React hooks, no JSX — pure transformations only.
 */

import type { TokenGraphViz } from "@/types/token-graph";
import type { TokenUsageIndex, TokenUsageOccurrence } from "@/types/token-usage-index";

export type ChangeKind = "added" | "removed" | "modified";

export type SelectedChange = {
  kind: ChangeKind;
  key: string;
  identity: string;
  changeClass: "breaking" | "non-breaking";
  tokenPath: string;
  tokenCssVar?: string;
};

/**
 * Parse token path from identity string (e.g., "path:color/blue" → "color/blue")
 */
export function parseTokenPathFromIdentity(identity: string): string | null {
  const raw = String(identity || "").trim();
  const match = raw.match(/^path:(.+)$/);
  return match ? match[1] : null;
}

/**
 * Get token node ID for path (e.g., "color/blue" → "path:color/blue")
 */
export function tokenNodeIdForPath(tokenPath: string): string {
  return `path:${tokenPath}`;
}

/**
 * Format impact count for display
 */
export function formatImpactCount(value: number | null): string {
  if (value === null) return "—";
  return String(value);
}

/**
 * Build unresolved impact hits for a token
 */
export function buildUnresolvedImpact(
  unresolved: TokenUsageIndex["unresolved"],
  tokenPath: string,
  cssVar?: string
): Array<{
  kind: string;
  source: string;
  owner: string;
  keyPath: string;
  tokenPath: string;
  reason: string;
  suggested?: string | null;
}> {
  const rows = Array.isArray(unresolved) ? unresolved : [];
  const hits: Array<{
    kind: string;
    source: string;
    owner: string;
    keyPath: string;
    tokenPath: string;
    reason: string;
    suggested?: string | null;
  }> = [];

  for (const item of rows) {
    const ref = String(item.tokenPath || "").trim();
    if (!ref) continue;
    if (ref === tokenPath || (cssVar && ref === cssVar)) {
      hits.push({
        kind: String(item.kind || ""),
        source: String(item.source || ""),
        owner: String(item.owner || ""),
        keyPath: String(item.keyPath || ""),
        tokenPath: ref,
        reason: String(item.reason || ""),
        suggested: item.suggested ?? null,
      });
    }
  }

  hits.sort((a, b) => {
    const left = `${a.kind}|${a.source}|${a.owner}|${a.keyPath}`;
    const right = `${b.kind}|${b.source}|${b.owner}|${b.keyPath}`;
    return left.localeCompare(right, "en", { sensitivity: "base" });
  });

  return hits;
}

/**
 * Build graph impact (dependents and dependencies) for a token
 */
export function buildGraphImpact(graph: TokenGraphViz | null, tokenPath: string) {
  if (!graph) return { dependents: [] as string[], dependencies: [] as string[] };
  const nodeId = tokenNodeIdForPath(tokenPath);
  const dependents: string[] = [];
  const dependencies: string[] = [];

  for (const edge of graph.edges || []) {
    if (edge.target === nodeId) dependents.push(edge.source);
    if (edge.source === nodeId) dependencies.push(edge.target);
  }

  const normalize = (id: string) => String(id || "").replace(/^path:/, "");

  return {
    dependents: dependents.map(normalize).sort((a, b) => a.localeCompare(b)),
    dependencies: dependencies.map(normalize).sort((a, b) => a.localeCompare(b)),
  };
}

/**
 * Summarize owners from occurrences, limited to top N
 */
export function summarizeOwners(occurrences: TokenUsageOccurrence[], limit: number) {
  const counts = new Map<string, number>();
  for (const occ of occurrences) {
    const owner = String(occ.owner || "").trim();
    if (!owner) continue;
    counts.set(owner, (counts.get(owner) || 0) + 1);
  }
  const rows = Array.from(counts.entries())
    .map(([owner, count]) => ({ owner, count }))
    .sort((a, b) => b.count - a.count || a.owner.localeCompare(b.owner));
  return rows.slice(0, limit);
}

/**
 * Get badge variant for a change
 */
export function badgeForChange(
  kind: ChangeKind,
  changeClass: "breaking" | "non-breaking"
): "success" | "warning" | "neutral" {
  if (changeClass === "breaking") return "warning" as const;
  if (kind === "added") return "success" as const;
  if (kind === "removed") return "warning" as const;
  return "neutral" as const;
}

/**
 * Get row background tone for a change
 */
export function rowTone(
  kind: ChangeKind,
  changeClass: "breaking" | "non-breaking"
): string {
  if (kind === "removed") return "bg-status-error-bg/5";
  if (kind === "added") return "bg-status-success-bg/5";
  if (changeClass === "breaking") return "bg-status-warning-bg/10";
  return "";
}

/**
 * Check if a resolvedValue change is risky (has usage)
 */
export function isRiskyResolvedValueChange(
  change: { fields_changed?: string[] },
  usageCount: number | null
): boolean {
  if (!usageCount || usageCount <= 0) return false;
  const fields = change.fields_changed || [];
  return fields.includes("resolvedValue");
}
