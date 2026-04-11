/**
 * Operations artifacts utilities - pure functions and types.
 * No React hooks, no JSX — pure transformations only.
 */

import { Database, Activity, ShieldAlert, GitGraph } from "lucide-react";
import type { ElementType } from "react";

import { getActiveSystemId } from "@/lib/api";

export interface ArtifactMeta {
  id: string;
  label: string;
  icon: ElementType;
  generatedAt?: string;
  summary?: string;
  isStale?: boolean;
}

export type ArtifactId = "registry" | "usage" | "health" | "graph";

export const STALE_HOURS = 24;

export const INITIAL_ARTIFACTS: ArtifactMeta[] = [
  { id: "registry", label: "Registry", icon: Database },
  { id: "usage", label: "Usage Index", icon: Activity },
  { id: "health", label: "Token Health", icon: ShieldAlert },
  { id: "graph", label: "Token Graph", icon: GitGraph },
];

/**
 * Check if an artifact is stale based on its generatedAt timestamp
 */
export function staleness(isoString?: string): boolean {
  if (!isoString) return false;
  const hoursOld = (Date.now() - new Date(isoString).getTime()) / 3_600_000;
  return hoursOld > STALE_HOURS;
}

/**
 * Get system headers for API requests
 */
export const getSystemHeaders = (): HeadersInit | undefined => {
  const id = getActiveSystemId();
  return id ? { "x-ds-system": id } : undefined;
};

/**
 * Fetch artifact metadata from API endpoints
 */
export async function fetchArtifactMeta(id: ArtifactId, systemId?: string): Promise<Partial<ArtifactMeta>> {
  const headers: HeadersInit | undefined = systemId
    ? { "x-ds-system": systemId }
    : getSystemHeaders();
  try {
    switch (id) {
      case "registry": {
        const r = await fetch("/api/component-registry", { headers });
        if (!r.ok) return {};
        const d = await r.json();
        const lm = r.headers.get("Last-Modified");
        const generatedAt = lm ? new Date(lm).toISOString() : undefined;
        const count = Array.isArray(d.components) ? d.components.length : "?";
        return { generatedAt, summary: `${count} components · v${d.schema_version ?? 1}` };
      }
      case "usage": {
        const r = await fetch("/api/token-usage-index", { headers });
        if (!r.ok) return {};
        const d = await r.json();
        const lm = r.headers.get("Last-Modified");
        const generatedAt = d.generated_at ?? (lm ? new Date(lm).toISOString() : undefined);
        const total = d.summary?.usage_links_total ?? d.summary?.tokens_total ?? "?";
        return { generatedAt, summary: `${total} tokens indexados` };
      }
      case "health": {
        const r = await fetch("/api/token-health", { headers });
        if (!r.ok) return {};
        const d = await r.json();
        const generatedAt = d.generated_at;
        const broken = d.summary?.broken_aliases_total ?? 0;
        const unused = d.summary?.unused_tokens_total ?? 0;
        return { generatedAt, summary: `${broken} broken · ${unused} unused` };
      }
      case "graph": {
        const r = await fetch("/api/token-graph", { headers });
        if (!r.ok) return {};
        const d = await r.json();
        const lm = r.headers.get("Last-Modified");
        const generatedAt = d.generated_at ?? (lm ? new Date(lm).toISOString() : undefined);
        const nodes = d.summary?.total_nodes ?? d.nodes?.length ?? "?";
        const cycles = d.cycles?.length ?? 0;
        return { generatedAt, summary: `${nodes} nodos · ${cycles} ciclos` };
      }
    }
  } catch {
    return {};
  }
}
