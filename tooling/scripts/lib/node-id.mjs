/**
 * Canonical regex for Figma node IDs in spec metadata (colon-separated integers).
 */
export const FIGMA_NODE_ID_RE = /^\d+:\d+$/;

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
