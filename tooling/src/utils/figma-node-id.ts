/**
 * Figma Node ID Utilities
 *
 * Sourced from tooling/lib/property-type-map.json
 */

/**
 * Canonical regex for Figma node IDs (colon-separated integers).
 * e.g. "123:456"
 */
export const FIGMA_NODE_ID_RE = /^\d+:\d+$/;

/**
 * Normalize a raw Figma node ID.
 * Supports "123:456" and "123-456" formats.
 */
export function normalizeNodeId(raw: string | null | undefined): string {
    const value = String(raw || '').trim();
    if (!value) return '';
    if (value.includes(':')) return value;
    if (value.includes('-')) {
        const parts = value.split('-').filter(Boolean);
        if (parts.length === 2) return `${parts[0]}:${parts[1]}`;
    }
    return value;
}

/**
 * Check if a raw string is a valid normalized Figma node ID.
 */
export function isValidNodeId(raw: string | null | undefined): boolean {
    const normalized = normalizeNodeId(raw);
    if (!normalized) return false;
    return FIGMA_NODE_ID_RE.test(normalized);
}
