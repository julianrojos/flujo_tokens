/**
 * Figma Descriptions Resolver
 *
 * PRECEDENCE: Figma descriptions from DB always override AI-generated content.
 * This is the single enforcement point. Do not add description resolution logic elsewhere.
 *
 * S-03: Provides the resolveDescriptionsForRender() function that wraps
 * raw DB data with a staleness flag for downstream renderers.
 */

import type { FigmaDescriptionsRawResult } from '../db/component-repository.js';

/** TTL for Figma description freshness (5 minutes). */
export const TTL_MS = 5 * 60 * 1000;

/**
 * Figma descriptions result with staleness metadata.
 * Extends the raw DB result with a `stale` flag.
 */
export interface FigmaDescriptionsResult {
  componentSet: string | null;
  variants: Array<{ nodeId: string; canonicalKey: string; description: string | null }>;
  syncedAt: number | null;
  stale: boolean;
}

/**
 * Resolve Figma descriptions for rendering.
 *
 * DB always wins — AI cannot override Figma descriptions.
 * Returns null if no descriptions have been synced yet.
 * Adds a `stale` flag based on TTL_MS.
 */
export function resolveDescriptionsForRender(
  dbDescriptions: FigmaDescriptionsRawResult | null,
): FigmaDescriptionsResult | null {
  if (!dbDescriptions) return null;

  const now = Date.now();
  const syncedAtMs = dbDescriptions.syncedAt != null
    ? dbDescriptions.syncedAt * 1000
    : null;

  return {
    componentSet: dbDescriptions.componentSet,
    variants: dbDescriptions.variants,
    syncedAt: dbDescriptions.syncedAt,
    stale: syncedAtMs == null || (now - syncedAtMs) > TTL_MS,
  };
}

/**
 * Build a canonical key from variant properties.
 * Sorts keys alphabetically, joins with "|".
 * Used for matching variants when nodeId is unreliable.
 */
export function buildCanonicalKey(variantProperties: Record<string, string>): string {
  return Object.entries(variantProperties)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('|');
}
