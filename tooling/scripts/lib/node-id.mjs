import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const TYPE_MAP = require("../../lib/property-type-map.json");

/**
 * Canonical regex for Figma node IDs in YAML/frontmatter (colon-separated integers).
 * Pattern is sourced from tooling/lib/property-type-map.json → figma_node_id.pattern.
 * See component-figma-traceability.mdc § "Node ID format contract".
 */
export const FIGMA_NODE_ID_RE = new RegExp(TYPE_MAP.figma_node_id.pattern);

export function normalizeNodeId(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";
  if (value.includes(":")) return value;
  if (value.includes("-")) {
    const parts = value.split("-").filter(Boolean);
    if (parts.length === 2) return `${parts[0]}:${parts[1]}`;
  }
  return value;
}

/** Returns true when raw (after normalization) is a valid Figma node ID (`\d+:\d+`). */
export function isValidNodeId(raw) {
  const normalized = normalizeNodeId(raw);
  if (!normalized) return false;
  return FIGMA_NODE_ID_RE.test(normalized);
}
