/**
 * Analysis Route Handler Service
 *
 * Handles analysis-related API routes.
 * Migrated from apps/ds-dashboard/server/services/analysis-route-handler-service.mjs
 */

import { computeImpactReport } from '../../src/lib/impact.ts';
import {
  buildImpactFailure,
  parseImpactRequest,
  type SystemContext,
} from '../lib/analysis-route-service.ts';
import { normalizeImpactWcagPairs } from './analysis-artifacts-service.ts';

export interface AnalysisRouteHandlerDeps {
  failJson: (c: any, statusCode: number, args: Record<string, unknown>) => any;
  getSystemContext: (systemHeader: string) => Pick<SystemContext, 'systemId'> & {
    wcagPairs?: Record<string, unknown>;
  };
  tokenRepo?: import('../db/token-repository.js').TokenRepository;
  healthRepo?: import('../db/health-repository.js').HealthRepository;
}

function buildFallbackTokenGraph(
  tokenRegistry: { entries?: Array<{ path?: string; slashPath?: string; cssVar?: string; type?: string; collection?: string; resolvedValue?: string }> },
): Record<string, unknown> {
  const rawEntries = Array.isArray(tokenRegistry.entries) ? tokenRegistry.entries : [];
  const cssVarToNodeId = new Map<string, string>();
  for (let index = 0; index < rawEntries.length; index += 1) {
    const entry = rawEntries[index] || {};
    const cssVar = String(entry.cssVar || '').trim();
    const nodeId = `path:${String(entry.path || entry.slashPath || entry.cssVar || index)}`;
    if (cssVar) cssVarToNodeId.set(cssVar, nodeId);
  }
  const edges: Array<{ source: string; target: string; type: string }> = [];
  const aliasRefRegex = /^var\(\s*(--[a-z0-9-]+)\s*(?:,[^)]+)?\)\s*$/i;
  for (let index = 0; index < rawEntries.length; index += 1) {
    const entry = rawEntries[index] || {};
    const sourceNodeId = `path:${String(entry.path || entry.slashPath || entry.cssVar || index)}`;
    const resolvedValue = String(entry.resolvedValue || '').trim();
    const match = resolvedValue.match(aliasRefRegex);
    if (!match) continue;
    const targetCssVar = String(match[1] || '').trim();
    if (!targetCssVar) continue;
    const targetNodeId = cssVarToNodeId.get(targetCssVar);
    if (!targetNodeId) continue;
    edges.push({
      source: sourceNodeId,
      target: targetNodeId,
      type: 'alias',
    });
  }
  return {
    ok: true,
    source: {
      registry_path: 'db://tokens',
      graph_viz_path: 'db://token_graph',
    },
    summary: {
      nodes: rawEntries.length,
      edges: edges.length,
      cycles: 0,
      cycle_nodes: 0,
      unresolved_css_var_refs_total: 0,
      ambiguous_css_vars_total: 0,
      graph_collisions: 0,
    },
    nodes: rawEntries.map((entry, index) => ({
      id: `path:${String(entry.path || entry.slashPath || entry.cssVar || index)}`,
      path: String(entry.path || ''),
      slashPath: String(entry.slashPath || ''),
      cssVar: String(entry.cssVar || ''),
      type: String(entry.type || ''),
      collection: String(entry.collection || ''),
      resolvedValue: String(entry.resolvedValue || ''),
      inDegree: 0,
      outDegree: 0,
      isCycleMember: false,
    })),
    edges,
    cycles: [],
    cycle_node_ids: [],
    fingerprint: 'fallback:token-graph-missing',
  };
}

function buildDbImpactArtifacts(
  dsId: string,
  deps: Pick<AnalysisRouteHandlerDeps, 'tokenRepo' | 'healthRepo'>,
) {
  if (!deps.tokenRepo) {
    throw new Error('Token repository is not initialized.');
  }
  const tokenRegistry = deps.tokenRepo.getTokenRegistry(dsId);
  const tokenUsageIndex = deps.tokenRepo.getTokenUsageIndex(dsId);
  const tokenGraph = deps.tokenRepo.getTokenGraph(dsId) ?? buildFallbackTokenGraph(tokenRegistry);
  const tokenHealth = deps.healthRepo?.getSnapshot(dsId, 'tokens')?.snapshotJson ?? null;
  return {
    tokenRegistry,
    tokenGraph,
    tokenUsageIndex,
    tokenHealth,
    componentRegistry: null,
  };
}

/**
 * Handle impact analysis route.
 */
export async function handleImpactRoute(c: any, deps: AnalysisRouteHandlerDeps): Promise<any> {
  const { failJson, getSystemContext } = deps;
  const sysCtx = getSystemContext(c.req.header('x-ds-system') ?? '');
  const parsedRequest = parseImpactRequest({
    tokenPathRaw: c.req.query('tokenPath'),
    newValueRaw: c.req.query('newValue'),
    depthRaw: c.req.query('depth'),
  });
  if (!parsedRequest.ok) {
    return failJson(c, parsedRequest.statusCode, parsedRequest.errorArgs);
  }
  const { tokenPath, newValue, depth } = parsedRequest.payload;

  try {
    const impactArtifacts = buildDbImpactArtifacts(sysCtx.systemId, deps);
    const wcagPairs = normalizeImpactWcagPairs(sysCtx.wcagPairs ?? { pairs: [] });
    const report = computeImpactReport({
      tokenPath,
      newValue,
      depth,
      ...(impactArtifacts as unknown as Record<string, unknown>),
      wcagPairs,
    } as Parameters<typeof computeImpactReport>[0]);
    return c.json(report);
  } catch (error) {
    console.error('[analysis] impact computation failed', {
      systemId: sysCtx.systemId,
      tokenPath,
      reason: error instanceof Error ? error.message : String(error),
    });
    const failure = buildImpactFailure(tokenPath, error);
    return failJson(c, failure.statusCode, failure.errorArgs);
  }
}
