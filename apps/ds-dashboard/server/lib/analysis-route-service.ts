/**
 * Analysis Route Service
 *
 * Provides utilities for analysis route handlers.
 * Migrated from apps/ds-dashboard/server/lib/analysis-route-service.mjs
 */

import fs from 'node:fs/promises';

export type ImpactRequestResult =
  | {
    ok: true;
    payload: {
      tokenPath: string;
      newValue: string | null;
      depth?: number;
    };
  }
  | {
    ok: false;
    statusCode: number;
    errorArgs: {
      code: string;
      userMessage: string;
      recoverable: boolean;
      context?: Record<string, unknown>;
    };
  };

export interface ImpactArtifacts {
  tokenRegistry: Record<string, unknown>;
  tokenGraph: Record<string, unknown>;
  tokenUsageIndex: Record<string, unknown>;
  tokenHealth: Record<string, unknown>;
  componentRegistry: Record<string, unknown>;
  wcagPairs: Record<string, unknown>;
}

export interface LoadImpactArtifactsDeps {
  readFileFn?: (filePath: string, encoding: BufferEncoding) => Promise<string>;
  normalizeImpactWcagPairsFn: (value: Record<string, unknown>) => unknown;
}

export interface SystemContext {
  tokenRegistryPath: string;
  tokenGraphVizPath: string;
  tokenUsageIndexPath: string;
  tokenHealthPath: string;
  componentRegistryPath: string;
  wcagPairsPath: string;
  [key: string]: string;
}

function isEnoentError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const maybe = error as { code?: unknown; message?: unknown };
  if (maybe.code === 'ENOENT') return true;
  const message = String(maybe.message ?? '');
  return message.includes('ENOENT');
}

function buildFallbackTokenGraph(tokenRegistry: Record<string, unknown>): Record<string, unknown> {
  const rawEntries = Array.isArray(tokenRegistry.entries) ? tokenRegistry.entries : [];
  const nodes = rawEntries.map((rawEntry, index) => {
    const entry =
      rawEntry && typeof rawEntry === 'object'
        ? (rawEntry as Record<string, unknown>)
        : ({} as Record<string, unknown>);
    const pathValue = String(entry.path ?? '').trim();
    const slashPath = String(entry.slashPath ?? pathValue).trim();
    const cssVar = String(entry.cssVar ?? '').trim();
    const type = String(entry.type ?? '').trim();
    const collection = String(entry.collection ?? '').trim();
    const resolvedValue = String(entry.resolvedValue ?? '').trim();
    const fallbackDisplayKey = pathValue || slashPath || cssVar;
    const displayKey = String(entry.displayKey ?? fallbackDisplayKey).trim();
    const idRef = pathValue || slashPath || cssVar || String(index);
    return {
      id: `path:${idRef}`,
      path: pathValue,
      slashPath,
      cssVar,
      type,
      collection,
      resolvedValue,
      displayKey,
      inDegree: 0,
      outDegree: 0,
      isCycleMember: false,
    };
  });

  return {
    ok: true,
    source: {
      registry_path: '',
      graph_viz_path: '',
    },
    summary: {
      nodes: nodes.length,
      edges: 0,
      cycles: 0,
      cycle_nodes: 0,
      unresolved_css_var_refs_total: 0,
      ambiguous_css_vars_total: 0,
      graph_collisions: 0,
    },
    nodes,
    edges: [],
    cycles: [],
    cycle_node_ids: [],
    fingerprint: 'fallback:token-graph-missing',
  };
}

function buildEmptyTokenUsageIndex(): Record<string, unknown> {
  return {
    ok: true,
    summary: {
      tokens_total: 0,
      tokens_with_usage: 0,
      tokens_without_usage: 0,
      usage_links_total: 0,
      usage_links_by_kind: {},
      unresolved_total: 0,
    },
    warnings: [],
    unresolved: [],
    entries: [],
    byPath: {},
    bySlashPath: {},
    byCssVar: {},
  };
}

/**
 * Parse refresh query parameter.
 */
export function parseRefreshQuery(raw: unknown): boolean {
  return String(raw ?? 'false').trim() === 'true';
}

/**
 * Parse impact request parameters.
 */
export function parseImpactRequest(params: {
  tokenPathRaw: unknown;
  newValueRaw: unknown;
  depthRaw: unknown;
}): ImpactRequestResult {
  const { tokenPathRaw, newValueRaw, depthRaw } = params;

  const tokenPath = String(tokenPathRaw ?? '').trim();
  if (!tokenPath) {
    return {
      ok: false,
      statusCode: 400,
      errorArgs: {
        code: 'validation.token_path_required',
        userMessage: 'tokenPath query param is required.',
        recoverable: true,
        context: { field: 'tokenPath' },
      },
    };
  }

  const newValue = newValueRaw ? String(newValueRaw).trim() : null;
  const depthParsed = depthRaw ? Number.parseInt(String(depthRaw), 10) : Number.NaN;
  const depth = Number.isFinite(depthParsed) ? depthParsed : undefined;
  return {
    ok: true,
    payload: { tokenPath, newValue, depth },
  };
}

/**
 * Load all impact analysis artifacts.
 */
export async function loadImpactArtifacts(
  sysCtx: SystemContext,
  deps: LoadImpactArtifactsDeps
): Promise<ImpactArtifacts> {
  const readFileFn =
    deps.readFileFn ??
    (async (filePath: string, encoding: BufferEncoding): Promise<string> => {
      return await fs.readFile(filePath, encoding);
    });
  const normalizeImpactWcagPairsFn = deps.normalizeImpactWcagPairsFn;
  if (typeof normalizeImpactWcagPairsFn !== 'function') {
    throw new Error('normalizeImpactWcagPairsFn is required');
  }

  const tokenRegistryRaw = await readFileFn(sysCtx.tokenRegistryPath, 'utf8');
  const tokenRegistry = JSON.parse(tokenRegistryRaw) as Record<string, unknown>;

  const [tokenGraphRaw, tokenUsageRaw, tokenHealthRaw, componentRegistryRaw, wcagPairsRaw] =
    await Promise.all([
      readFileFn(sysCtx.tokenGraphVizPath, 'utf8').catch((error: unknown) => {
        if (isEnoentError(error)) {
          return JSON.stringify(buildFallbackTokenGraph(tokenRegistry));
        }
        throw error;
      }),
      readFileFn(sysCtx.tokenUsageIndexPath, 'utf8').catch((error: unknown) => {
        if (isEnoentError(error)) {
          return JSON.stringify(buildEmptyTokenUsageIndex());
        }
        throw error;
      }),
      readFileFn(sysCtx.tokenHealthPath, 'utf8').catch(() => 'null'),
      readFileFn(sysCtx.componentRegistryPath, 'utf8').catch(() => 'null'),
      readFileFn(sysCtx.wcagPairsPath, 'utf8').catch(() => '{"pairs": []}'),
    ]);

  return {
    tokenRegistry,
    tokenGraph: JSON.parse(tokenGraphRaw),
    tokenUsageIndex: JSON.parse(tokenUsageRaw),
    tokenHealth: JSON.parse(tokenHealthRaw),
    componentRegistry: JSON.parse(componentRegistryRaw),
    wcagPairs: normalizeImpactWcagPairsFn(
      JSON.parse(wcagPairsRaw) as Record<string, unknown>
    ) as Record<string, unknown>,
  };
}

/**
 * Build impact failure response.
 */
export function buildImpactFailure(tokenPath: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const normalizedMessage = message.toLowerCase();
  const notFound = normalizedMessage.includes('not found');
  return {
    statusCode: notFound ? 404 : 400,
    errorArgs: {
      code: notFound ? 'impact.token_not_found' : 'impact.invalid_request',
      userMessage: message,
      recoverable: true,
      context: { tokenPath },
    },
  };
}
