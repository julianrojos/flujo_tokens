/**
 * Pure utility functions for component-detail feature.
 * No React hooks, no JSX — pure transformations only.
 */

/**
 * Build an asset URL with optional cache key.
 */
export function buildAssetUrl(
  projectPath: string | null | undefined,
  cacheKey?: string | null,
  systemId?: string | null,
): string | null {
  const value = String(projectPath || "").trim();
  if (!value) return null;
  const search = new URLSearchParams({
    path: value,
  });
  if (cacheKey) {
    search.set("t", cacheKey);
  }
  const normalizedSystemId = String(systemId || "").trim();
  if (normalizedSystemId) {
    search.set("system", normalizedSystemId);
  }
  return `/api/asset?${search.toString()}`;
}
