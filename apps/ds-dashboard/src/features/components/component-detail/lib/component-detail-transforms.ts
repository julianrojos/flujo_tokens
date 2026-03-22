/**
 * Pure utility functions for component-detail feature.
 * No React hooks, no JSX — pure transformations only.
 */

import type { PipelineStage } from "@/types/component-registry";
import type { ComponentRegistryItem } from "@/types/component-registry";

/**
 * Pipeline stages in order
 */
export const PIPELINE_STAGES: PipelineStage[] = [
  "missing-spec",
  "spec",
  "markdown",
  "render",
  "visual-proof",
];

/**
 * Labels for pipeline stages
 */
export const STAGE_LABELS: Record<PipelineStage, string> = {
  "missing-spec": "Missing spec",
  spec: "Spec",
  markdown: "Markdown",
  render: "Render",
  "visual-proof": "Visual proof",
};

/**
 * Get index of a pipeline stage (for ordering)
 */
export function stageIndex(stage: PipelineStage): number {
  return PIPELINE_STAGES.indexOf(stage);
}

/**
 * Get badge variant for a pipeline stage
 */
export function stageBadge(stage: PipelineStage): "success" | "warning" | "neutral" {
  if (stage === "render" || stage === "visual-proof") return "success" as const;
  if (stage === "markdown") return "warning" as const;
  return "neutral" as const;
}

/**
 * Get badge variant for component status
 */
export function statusBadge(status: string): "success" | "warning" | "neutral" {
  if (status === "ready") return "success" as const;
  if (status === "needs-review") return "warning" as const;
  return "neutral" as const;
}

/**
 * Truncate a hash value for display
 */
export function truncateHash(value: string | null | undefined, size = 8): string {
  const raw = String(value || "").trim();
  if (!raw) return "—";
  if (raw.length <= size) return raw;
  return `${raw.slice(0, size)}…`;
}

/**
 * Build an asset URL with optional cache key
 */
export function buildAssetUrl(
  projectPath: string | null | undefined,
  cacheKey?: string | null,
): string | null {
  const value = String(projectPath || "").trim();
  if (!value) return null;
  const search = new URLSearchParams({
    path: value,
  });
  if (cacheKey) {
    search.set("t", cacheKey);
  }
  return `/api/asset?${search.toString()}`;
}

/**
 * Convert a string to PascalCase
 */
export function toPascalCase(value: string): string {
  return String(value || "")
    .replace(/[_\-.]+/g, " ")
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join("");
}

/**
 * Extract Figma file key from a Figma URL
 */
export function extractFigmaFileKey(figmaUrl: string | null | undefined): string {
  const source = String(figmaUrl || "").trim();
  if (!source) return "TBD";
  try {
    const parsed = new URL(source);
    const match = parsed.pathname.match(/\/(?:design|file)\/([^/]+)/i);
    return match?.[1] || "TBD";
  } catch {
    return "TBD";
  }
}

/**
 * Build a spec template YAML string for a component
 */
export function buildSpecTemplate(item: ComponentRegistryItem): string {
  const name = toPascalCase(item.display_name || item.slug);
  const figmaFileKey = extractFigmaFileKey(item.figma.file_url);
  const nodeId = String(item.figma.component_set_node_id || "").trim();
  const nodeIdLine = nodeId ? `  component_set_node_id: ${nodeId}\n` : "";
  return [
    `name: ${name}`,
    "status: draft",
    "figma:",
    `  file: ${figmaFileKey}`,
    "  page: TBD",
    `  component_set: ${name}`,
    nodeIdLine ? `${nodeIdLine.trimEnd()}` : null,
    "summary:",
    "  purpose: TBD",
    "  when_to_use: TBD",
    "  when_not_to_use: TBD",
    "anatomy:",
    "  - id: container",
    "    description: TBD",
    "properties:",
    "  - name: state",
    "    type: enum",
    "    values:",
    "      - Default",
    "    default: Default",
    "    required: true",
    "    description: TBD",
    "content_guidelines:",
    "  rules:",
    "    - TBD",
    "best_practices:",
    "  do:",
    "    - TBD",
    "  dont:",
    "    - TBD",
    "accessibility:",
    "  role: TBD",
    "  focus:",
    "    tokens:",
    "      inner: TBD",
    "      outer: TBD",
    "  hit_area:",
    "    desktop_token: TBD",
    "    mobile_token: TBD",
    "  labeling:",
    "    rules:",
    "      - TBD",
    "token_mapping:",
    "  container.background:",
    "    state=Default: TBD",
    "qa:",
    '  - "Properties match Figma component-set controls."',
    '  - "Artwork layer includes a hidden source instance that drives anatomy, properties, and layout/spacing exhibits."',
    '  - "Token references resolve in token registry."',
    "related_components: []",
    "",
  ]
    .filter((row): row is string => Boolean(row))
    .join("\n");
}
