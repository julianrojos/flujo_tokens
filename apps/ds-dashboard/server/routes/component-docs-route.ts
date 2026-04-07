/**
 * Component Docs Routes
 *
 * S-05: GET /api/components/:slug/docs/markdown
 *   - Syncs Figma descriptions (with TTL), renders markdown in memory,
 *     returns result with freshness metadata.
 */

import type { Context } from 'hono';
import { getComponentSpecDirect } from '../services/figma-direct-bridge-service.js';
import {
  extractFileKey,
  resolveFileKeyFromManager,
  isFileKeySuccess,
  type FileKeyResult,
} from '../lib/filekey-utils.js';
import { renderComponentDoc } from '../services/ai-component-doc-renderer.js';
import { buildDocOutputFromDb } from '../services/db-doc-assembler.js';
import {
  resolveDescriptionsForRender,
  buildCanonicalKey,
  TTL_MS,
} from '../services/figma-descriptions-resolver.js';
import type { ComponentRepository } from '../db/component-repository.js';
import type { VariantSpec } from '../../../figma-plugin/src/bridge/protocol.js';

/** TTL for Figma description freshness (5 minutes). Re-exported for tests. */
export { TTL_MS } from '../services/figma-descriptions-resolver.js';

export interface ComponentDocsRouteDeps {
  componentRepo?: ComponentRepository;
}

/**
 * GET /api/components/:slug/docs/markdown?refresh=true|false
 *
 * Response:
 *   {
 *     markdown: string,  // always a string when component exists
 *     source: "fresh"|"cache",
 *     syncedAt: number | null,
 *     stale: boolean,
 *     descriptions: {
 *       componentSet: string | null,
 *       variants: Array<{ canonicalKey: string; description: string | null }>,
 *     } | null,
 *     warnings?: string[],  // omitted when empty
 *   }
 */
async function handleGetDocsMarkdown(c: Context, deps: ComponentDocsRouteDeps): Promise<Response> {
  const slug = c.req.param('slug');
  if (!slug) {
    return c.json({ ok: false, code: 'docs.missing_slug', message: 'Missing slug parameter' }, 400);
  }

  const componentRepo = deps.componentRepo;
  if (!componentRepo) {
    return c.json({ ok: false, code: 'docs.no_repo', message: 'Component repository not available' }, 503);
  }

  // Resolve component ID by slug
  const dsIdHeader = String(c.req.header('x-ds-system') || '').trim();
  const dsId = dsIdHeader || undefined;
  let componentId: number | null = null;

  try {
    componentId = componentRepo.getComponentIdBySlug(slug, dsId);
  } catch (error) {
    console.error('[component-docs-route] Failed to resolve component by slug', {
      slug,
      dsId,
      error,
    });
    return c.json(
      { ok: false, code: 'docs.lookup_failed', message: 'Failed to resolve component' },
      500,
    );
  }

  if (componentId == null) {
    return c.json({
      ok: false,
      code: 'docs.not_found',
      message: 'Component not found',
    } as const, 404);
  }

  const refreshParam = String(c.req.query('refresh') || '').toLowerCase();
  const forceRefresh = refreshParam === 'true';

  // Check if descriptions are stale
  const existingDescriptions = componentRepo.getFigmaDescriptions(componentId);
  const nowSec = Math.floor(Date.now() / 1000);
  const isStale =
    existingDescriptions == null ||
    existingDescriptions.syncedAt == null ||
    (nowSec - existingDescriptions.syncedAt) * 1000 > TTL_MS;

  // Sync from Figma if stale or refresh requested
  let source: 'fresh' | 'cache' = 'cache';
  if (isStale || forceRefresh) {
    // Attempt to refresh from Figma plugin (fail-open).
    // Mark as "fresh" only when sync actually wrote data to DB.
    try {
      const didSync = await syncDescriptionsFromFigma(componentRepo, componentId);
      source = didSync ? 'fresh' : 'cache';
    } catch (error) {
      console.warn('[component-docs-route] Failed to sync Figma descriptions; using cache', {
        slug,
        componentId,
        forceRefresh,
        error,
      });
      source = 'cache';
    }
  }

  // Get the (possibly updated) descriptions
  const dbDescriptions = componentRepo.getFigmaDescriptions(componentId);
  const figmaDescriptions = resolveDescriptionsForRender(dbDescriptions);

  // Build raw descriptions payload for UI display
  const descriptions = dbDescriptions ? {
    componentSet: dbDescriptions.componentSet,
    variants: dbDescriptions.variants.map(v => ({
      canonicalKey: v.canonicalKey,
      description: v.description,
    })),
  } : null;

  // Assemble ComponentDocOutput from DB (handles missing AI doc, corrupt JSON, etc.)
  // Pass dbDescriptions to avoid duplicate getFigmaDescriptions call inside assembler
  const { output, editorialPatch, warnings } = buildDocOutputFromDb(componentId, componentRepo, dbDescriptions);

  // Render markdown — always produces a string
  const markdown = renderComponentDoc({ output, editorialPatch }, figmaDescriptions);

  return c.json({
    ok: true,
    markdown,
    source,
    syncedAt: figmaDescriptions?.syncedAt ?? null,
    stale: figmaDescriptions?.stale ?? true,
    descriptions,
    ...(warnings.length > 0 ? { warnings } : {}),
  }, 200);
}

/**
 * Sync Figma descriptions to DB for a component (fail-open).
 */
async function syncDescriptionsFromFigma(
  componentRepo: ComponentRepository,
  componentId: number,
): Promise<boolean> {
  const nodeId = componentRepo.getFigmaComponentSetNodeId(componentId);
  if (!nodeId) return false;

  // Resolve Figma file key:
  // 1. Try connection manager directly (works if single connection).
  // 2. Fall back to figma_file_url stored in components table.
  let resolved = resolveFileKeyFromManager(undefined, {
    ambiguous: 'Multiple Figma sockets connected; cannot determine which to use for sync.',
    noSocket: 'No Figma socket connected; cannot sync descriptions.',
  });

  if (!isFileKeySuccess(resolved)) {
    // Fallback: extract fileKey from the component's stored figma_file_url
    const figmaUrl = componentRepo.getFigmaFileUrl(componentId) ?? '';
    const fileKey = extractFileKey(figmaUrl);
    if (!fileKey) return false;

    // Direct resolution by file key (bypass ambiguous guard when we have explicit key)
    resolved = { fileKey } satisfies FileKeyResult;
  }

  const spec = await getComponentSpecDirect(resolved.fileKey, { nodeId, depth: 1, compact: false });
  if (!spec.success) return false;

  const componentSetDesc = spec.description ?? null;
  const syncedAt = Math.floor(Date.now() / 1000);

  const variants = (spec.variants ?? []).map((v: VariantSpec) => ({
    nodeId: v.nodeId,
    canonicalKey: buildCanonicalKey(v.variantProperties ?? {}),
    description: v.description ?? null,
  }));

  componentRepo.saveFigmaDescriptions(componentId, { componentSet: componentSetDesc, syncedAt, variants });
  return true;
}

export function registerComponentDocsRoutes(
  app: { get: (path: string, handler: (c: Context) => Response | Promise<Response>) => void },
  deps: ComponentDocsRouteDeps,
): void {
  app.get('/api/components/:slug/docs/markdown', (c) => handleGetDocsMarkdown(c, deps));
}
