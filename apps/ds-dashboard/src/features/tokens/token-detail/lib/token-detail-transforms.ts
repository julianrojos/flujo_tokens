/**
 * Pure utility functions for token-detail feature.
 * No React hooks, no JSX — pure transformations only.
 */

import type { PipelineStage } from "@/types/component-registry";
import type { TokenEntry, TokenRegistry } from "@/types/token-registry";
import type { TokenUsageOccurrence } from "@/types/token-usage-index";

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
 * Extract line number from token usage detail string
 */
export function extractLineNumber(detail: string): number | null {
  const match = String(detail || "").match(/\bline:(\d+)\b/i);
  if (!match) return null;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Resolve the target token for an alias reference
 */
export function resolveAliasTarget(registry: TokenRegistry | null, aliasOf: string | undefined): TokenEntry | null {
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
 * Compact a file path for display (e.g., ".../src/components/Button.tsx")
 */
export function compactPathLabel(filePath: string) {
  const value = String(filePath || "").trim();
  if (!value) return "—";
  const parts = value.split("/");
  if (parts.length <= 3) return value;
  return `…/${parts.slice(-3).join("/")}`;
}

/**
 * Build a Figma URL with node-id parameter for a component usage
 */
export function buildComponentFigmaUrl(fileUrl: string | null, nodeId: string | null): string | null {
  const base = String(fileUrl || "").trim();
  if (!base) return null;
  try {
    const parsed = new URL(base);
    const normalizedNodeId = String(nodeId || "").trim().replace(/:/g, "-");
    if (normalizedNodeId) {
      parsed.searchParams.set("node-id", normalizedNodeId);
    }
    return parsed.toString();
  } catch {
    return base;
  }
}

/**
 * Build a unique key for a token usage occurrence
 */
export function buildOccurrenceKey(kind: string, occ: TokenUsageOccurrence, index: number): string {
  return `${kind}:${occ.owner}:${occ.source}:${occ.detail}:${index}`;
}

/**
 * Check if a token matches a reference value
 */
export function tokenMatchesRef(token: TokenEntry, value: string): boolean {
  const ref = String(value || "").trim();
  if (!ref) return false;
  return ref === token.path || ref === token.slashPath || ref === token.cssVar;
}

/**
 * Build the alias chain for a token (following aliasOf references)
 */
export function buildAliasChain(registry: TokenRegistry | null, token: TokenEntry | null) {
  if (!registry || !token) {
    return { chain: [] as TokenEntry[], brokenRef: null as string | null, hasCycle: false };
  }
  const chain: TokenEntry[] = [token];
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
 * Get badge variant for a pipeline stage
 */
export function stageBadge(stage: PipelineStage): "success" | "warning" | "neutral" {
  if (stage === "render" || stage === "visual-proof") return "success";
  if (stage === "markdown") return "warning";
  return "neutral";
}

/**
 * Parse component usage detail to extract slot and condition
 */
export function parseComponentUsageDetail(detail: string) {
  const raw = String(detail || "").trim();
  if (!raw) return { slot: null as string | null, condition: null as string | null };
  const tokenMappingMatch = raw.match(/^token_mapping\.([^:]+)(?::(.+))?$/i);
  if (!tokenMappingMatch) {
    return { slot: null as string | null, condition: null as string | null };
  }
  const slot = tokenMappingMatch[1] ? tokenMappingMatch[1].trim() : null;
  const condition = tokenMappingMatch[2] ? tokenMappingMatch[2].trim() : null;
  return { slot, condition };
}

/**
 * Labels for token usage kinds
 */
export const KIND_LABELS: Record<string, string> = {
  "component-spec": "Component spec",
  "css-alias": "CSS alias",
};

/**
 * Labels for component pipeline stages
 */
export const COMPONENT_STAGE_LABELS: Record<PipelineStage, string> = {
  "missing-spec": "Missing spec",
  spec: "Spec",
  markdown: "Markdown",
  render: "Render",
  "visual-proof": "Visual proof",
};
