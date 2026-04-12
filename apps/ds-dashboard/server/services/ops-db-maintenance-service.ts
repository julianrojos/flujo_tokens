import type Database from 'better-sqlite3';

import {
  buildTokenGraph,
  findIdentityCollisions,
  findUnresolvedAliases,
} from '../../../../tooling/src/services/token-graph.js';
import { generateHealthReport } from '../../../../tooling/src/services/token-health.js';
import type { ComponentRepository } from '../db/component-repository.js';
import type { HealthRepository } from '../db/health-repository.js';
import type { TokenRepository } from '../db/token-repository.js';

const DEFAULT_HIGH_USAGE_THRESHOLD = 25;
const DEFAULT_HIGH_INDEGREE_THRESHOLD = 15;
const DEFAULT_MAX_HEALTH_ITEMS = 100;
const DEFAULT_HEALTH_RETENTION_DAYS = 120;

type EmitChunk = (kind: string, text: string) => void;

type UsageRow = {
  tokenId: string;
  kind: string;
  source: string;
  owner: string;
  detail: string;
};

type AliasRow = {
  from_path: string;
  to_path: string;
  modes: string;
};

type ComponentFigmaTokenBindingRow = {
  component_id: number;
  node_id: string | null;
  field: string | null;
  mode: string | null;
  token_path: string | null;
};

function asInt(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.floor(parsed);
}

function asNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asString(value: unknown): string {
  return String(value ?? '').trim();
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
}

function buildTokenRegistryFromDb(args: {
  systemId: string;
  tokenRepo: TokenRepository;
  db: Database.Database;
}) {
  const { systemId, tokenRepo, db } = args;
  const tokenRegistry = tokenRepo.getTokenRegistry(systemId);
  const aliasRows = db
    .prepare(
      `
      SELECT from_path, to_path, modes
      FROM figma_aliases
      WHERE ds_id = ?
    `,
    )
    .all(systemId) as AliasRow[];

  const aliasesBySource = new Map<string, string[]>();
  for (const row of aliasRows) {
    const fromPath = asString(row.from_path);
    const toPath = asString(row.to_path);
    if (!fromPath || !toPath) continue;
    const next = aliasesBySource.get(fromPath) || [];
    next.push(toPath);
    aliasesBySource.set(fromPath, next);
  }

  const registry = {
    entries: tokenRegistry.entries.map((entry) => ({
      id: entry.path,
      path: entry.path,
      $value: entry.resolvedValue,
      type: entry.type,
      collection: entry.collection,
      cssVar: entry.cssVar,
      aliases: aliasesBySource.get(entry.path) || [],
    })),
  };

  return {
    registry,
    aliasRows,
    tokenRegistry,
  };
}

function buildUsageRowsFromDb(args: {
  systemId: string;
  db: Database.Database;
  aliasRows: AliasRow[];
  validTokenIds: Set<string>;
}): { rows: UsageRow[]; warnings: string[] } {
  const { systemId, db, aliasRows, validTokenIds } = args;
  const warnings: string[] = [];
  const rows: UsageRow[] = [];
  const dedupe = new Set<string>();

  const addRow = (row: UsageRow) => {
    if (!validTokenIds.has(row.tokenId)) return;
    const key = `${row.tokenId}\x00${row.kind}\x00${row.source}\x00${row.owner}\x00${row.detail}`;
    if (dedupe.has(key)) return;
    dedupe.add(key);
    rows.push(row);
  };

  const figmaBindingRows = db
    .prepare(
      `
      SELECT b.component_id, b.node_id, b.field, b.mode, b.token_path
      FROM component_figma_token_bindings b
      INNER JOIN components c ON c.id = b.component_id
      WHERE c.ds_id = ?
    `,
    )
    .all(systemId) as ComponentFigmaTokenBindingRow[];

  for (const row of figmaBindingRows) {
    const tokenPath = asString(row.token_path);
    if (!tokenPath) continue;
    const nodeId = asString(row.node_id);
    const field = asString(row.field) || 'field';
    const mode = asString(row.mode) || 'default';
    addRow({
      tokenId: tokenPath,
      kind: 'figma-alias',
      source: 'figma-variables',
      owner: nodeId ? `figma-node:${nodeId}` : `db://component/${row.component_id}`,
      detail: `${field}:${mode}`,
    });
  }

  for (const alias of aliasRows) {
    const targetPath = asString(alias.to_path);
    const sourcePath = asString(alias.from_path);
    if (!targetPath || !sourcePath) continue;
    addRow({
      tokenId: targetPath,
      kind: 'figma-alias',
      source: 'figma-variables',
      owner: sourcePath,
      detail: asString(alias.modes),
    });
  }

  return { rows, warnings };
}

/**
 * Reconciles component registry rows using DB as the only source of truth.
 *
 * Notes:
 * - Intentionally does not scan docs/spec files from filesystem.
 * - Re-upserts current component rows to normalize persisted shapes.
 */
export function refreshRegistryDbOnly(args: {
  systemId: string;
  componentRepo: ComponentRepository;
  emitChunk: EmitChunk;
}) {
  const { systemId, componentRepo, emitChunk } = args;
  const rows = componentRepo.getAll(systemId);
  const upserted = componentRepo.upsertFromRegistry(
    systemId,
    rows.map((row) => ({
      slug: row.slug,
      name: row.name,
      status: row.status,
      docType: row.docType,
      figma: {
        fileUrl: row.figmaFileUrl,
        componentSetNodeId: row.figmaComponentSetNodeId,
        pageName: row.figma?.pageName,
        variants: row.figma?.variants?.map((variant) => ({
          name: variant.name,
          properties: variant.properties,
          nodeId: variant.nodeId,
        })),
        tokenBindings: row.figma?.tokenBindings?.map((binding) => ({
          nodeId: binding.nodeId,
          nodeName: binding.nodeName,
          field: binding.field,
          variableId: binding.variableId,
          tokenPath: binding.tokenPath,
          mode: binding.mode,
        })),
        layout: row.figma?.layout?.map((layout) => ({
          nodeId: layout.nodeId,
          nodeName: layout.nodeName,
          depth: layout.depth,
          direction: layout.direction,
          hSizing: layout.hSizing,
          vSizing: layout.vSizing,
          alignmentH: layout.alignmentH,
          alignmentV: layout.alignmentV,
          itemSpacing: layout.itemSpacing,
          padding: layout.padding,
        })),
      },
      specs: (row.specs || []).map((spec) => ({
        markdownPath: spec.markdownPath,
        docStatus: spec.docStatus,
        coverage: spec.coverage,
      })),
      visualProofs: (row.visualProofs || []).map((proof) => ({
        imagePath: proof.imagePath,
        screenshotUrl: proof.screenshotUrl,
        caption: proof.caption,
        capturedAt: proof.capturedAt,
        capturedAtEpoch: proof.capturedAtEpoch,
        nodeId: proof.nodeId,
        imageSha256: proof.imageSha256,
        imageBytes: proof.imageBytes,
        imageContentType: proof.imageContentType,
        imageWidth: proof.imageWidth,
        imageHeight: proof.imageHeight,
        variantsCount: proof.variantsCount,
        variants: proof.variants,
      })),
    })),
  );

  emitChunk('result', `Registry normalized in DB (${upserted} row(s) reconciled).`);

  return {
    ok: true,
    code: 0,
    summary: 'Registry refreshed in DB-only mode.',
    payload: {
      components_total: rows.length,
      components_upserted: upserted,
      changed: upserted > 0,
      written: upserted > 0,
    },
  };
}

/**
 * Rebuilds token usage occurrences from DB-backed evidence.
 *
 * Sources:
 * - `component_figma_token_bindings.token_path`
 * - `figma_aliases`
 *
 * No filesystem scans are performed.
 */
export function refreshUsageIndexDbOnly(args: {
  systemId: string;
  emitChunk: EmitChunk;
  db: Database.Database;
  tokenRepo: TokenRepository;
}) {
  const { systemId, emitChunk, db, tokenRepo } = args;

  const { registry, aliasRows } = buildTokenRegistryFromDb({
    systemId,
    tokenRepo,
    db,
  });

  if (registry.entries.length === 0) {
    throw new Error(`Cannot rebuild usage index for "${systemId}": token registry is empty in DB.`);
  }

  const usageBuild = buildUsageRowsFromDb({
    systemId,
    db,
    aliasRows,
    validTokenIds: new Set(registry.entries.map((entry) => entry.id)),
  });

  for (const warning of usageBuild.warnings) {
    emitChunk('warning', warning);
  }

  db.transaction(() => {
    db.prepare('DELETE FROM token_usage_occurrences WHERE ds_id = ?').run(systemId);
    const insertStmt = db.prepare(`
      INSERT OR IGNORE INTO token_usage_occurrences (ds_id, token_id, kind, source, owner, detail)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const row of usageBuild.rows) {
      insertStmt.run(systemId, row.tokenId, row.kind, row.source, row.owner, row.detail);
    }
  })();

  emitChunk('result', `Usage index rebuilt in DB with ${usageBuild.rows.length} occurrence(s).`);

  return {
    ok: true,
    code: 0,
    summary: 'Token usage index rebuilt in DB-only mode.',
    payload: {
      rows_written: usageBuild.rows.length,
      warnings: usageBuild.warnings,
    },
  };
}

function toCyclePayload(args: {
  cycles: string[][];
  tokenPathById: Map<string, string>;
}) {
  const { cycles, tokenPathById } = args;
  return cycles.map((cycle) => {
    const nodeIds = uniqueSorted(cycle.map((id) => asString(id)).filter(Boolean));
    return {
      kind: nodeIds.length <= 1 ? 'self_loop' : 'strongly_connected_component',
      size: nodeIds.length,
      nodes: nodeIds.map((id) => tokenPathById.get(id) || id),
      node_ids: nodeIds,
    };
  });
}

/**
 * Recomputes token dependency graph from DB token registry + alias edges.
 * Persists result into `token_graph.graph_json`.
 */
export function refreshTokenGraphDbOnly(args: {
  systemId: string;
  emitChunk: EmitChunk;
  db: Database.Database;
  tokenRepo: TokenRepository;
  sha256Text: (value: string) => string;
}) {
  const { systemId, emitChunk, db, tokenRepo, sha256Text } = args;

  const { registry, tokenRegistry } = buildTokenRegistryFromDb({
    systemId,
    tokenRepo,
    db,
  });

  if (registry.entries.length === 0) {
    throw new Error(`Cannot rebuild token graph for "${systemId}": token registry is empty in DB.`);
  }

  const graph = buildTokenGraph(registry);
  const unresolvedAliases = findUnresolvedAliases(registry, graph);
  const collisions = findIdentityCollisions(registry);
  const tokenPathById = new Map(registry.entries.map((entry) => [entry.id, entry.path]));
  const tokenByPath = new Map(tokenRegistry.entries.map((entry) => [entry.path, entry]));
  const cyclePayload = toCyclePayload({
    cycles: graph.cycles,
    tokenPathById,
  });
  const cycleNodeIds = uniqueSorted(
    cyclePayload.flatMap((cycle) => cycle.node_ids),
  );

  const nodes = graph.nodes.map((node) => {
    const base = tokenByPath.get(node.id);
    const collection = asString(base?.collection || node.path.split('.')[0] || '');
    const displayKey = collection && node.path.startsWith(`${collection}.`)
      ? node.path.slice(collection.length + 1).replace(/\./g, '/')
      : node.path.replace(/\./g, '/');
    return {
      id: node.id,
      path: node.path,
      slashPath: node.path.replace(/\./g, '/'),
      cssVar: asString(base?.cssVar || node.cssVar || ''),
      type: asString(base?.type || node.type || ''),
      collection,
      resolvedValue: asString(base?.resolvedValue || ''),
      displayKey,
      inDegree: asInt(node.inDegree, 0),
      outDegree: asInt(node.outDegree, 0),
      isCycleMember: cycleNodeIds.includes(node.id),
    };
  });

  const edges = graph.edges.map((edge) => ({
    source: edge.from,
    target: edge.to,
  }));

  const payload = {
    ok: true,
    generated_at: new Date().toISOString(),
    source: {
      registry_path: `db://tokens/${systemId}`,
      graph_viz_path: `db://token_graph/${systemId}`,
    },
    summary: {
      nodes: nodes.length,
      edges: edges.length,
      cycles: cyclePayload.length,
      cycle_nodes: cycleNodeIds.length,
      unresolved_css_var_refs_total: unresolvedAliases.length,
      ambiguous_css_vars_total: collisions.length,
      graph_collisions: collisions.length,
    },
    nodes,
    edges,
    cycles: cyclePayload,
    cycle_node_ids: cycleNodeIds,
    fingerprint: sha256Text(
      JSON.stringify({
        nodes,
        edges,
        cycles: cyclePayload,
      }),
    ),
  };

  db.prepare(
    `
    INSERT INTO token_graph (ds_id, graph_json, generated_at)
    VALUES (?, ?, strftime('%s', 'now'))
    ON CONFLICT(ds_id) DO UPDATE SET
      graph_json = excluded.graph_json,
      generated_at = excluded.generated_at
  `,
  ).run(systemId, JSON.stringify(payload));

  emitChunk('result', `Token graph rebuilt in DB (${payload.summary.nodes} nodes, ${payload.summary.edges} edges).`);

  return {
    ok: true,
    code: 0,
    summary: 'Token graph rebuilt in DB-only mode.',
    payload,
  };
}

/**
 * Reads WCAG pair config from app_settings (`wcag_pairs`) in DB.
 * Returns an empty array when setting is absent or malformed.
 */
function readWcagPairsFromDb(db: Database.Database): unknown[] {
  const row = db
    .prepare("SELECT value FROM app_settings WHERE key = 'wcag_pairs' LIMIT 1")
    .get() as { value?: string | null } | undefined;
  const raw = asString(row?.value);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as { pairs?: unknown[] } | unknown[];
    if (Array.isArray(parsed)) return parsed;
    return Array.isArray(parsed?.pairs) ? parsed.pairs : [];
  } catch {
    return [];
  }
}

function collectHighCouplingRows(args: {
  registryEntries: Array<{ path: string; slashPath: string; cssVar: string; type: string; collection: string; resolvedValue: string }>;
  usageEntries: Array<{ path: string; usageCount: number; usedIn: Array<{ kind: string; owner: string }> }>;
  graphNodes: Array<{ id: string; inDegree: number; outDegree: number; isCycleMember?: boolean }>;
  highUsageTokens: Array<{ tokenId: string; usageCount: number }>;
  highIndegreeTokens: Array<{ tokenId: string; inDegree: number }>;
}) {
  const { registryEntries, usageEntries, graphNodes, highUsageTokens, highIndegreeTokens } = args;
  const registryByPath = new Map(registryEntries.map((entry) => [entry.path, entry]));
  const usageByPath = new Map(usageEntries.map((entry) => [entry.path, entry]));
  const graphNodeById = new Map(graphNodes.map((entry) => [entry.id, entry]));

  const ids = uniqueSorted([
    ...highUsageTokens.map((item) => item.tokenId),
    ...highIndegreeTokens.map((item) => item.tokenId),
  ]);

  return ids.map((id) => {
    const base = registryByPath.get(id);
    const usage = usageByPath.get(id);
    const node = graphNodeById.get(id);
    const reasons: string[] = [];
    if (highUsageTokens.some((item) => item.tokenId === id)) reasons.push('high-usage');
    if (highIndegreeTokens.some((item) => item.tokenId === id)) reasons.push('high-indegree');

    const usedByComponents = uniqueSorted(
      (usage?.usedIn || [])
        .filter((entry) => entry.kind === 'component-spec')
        .map((entry) => asString(entry.owner)),
    );

    return {
      path: asString(base?.path || id),
      slashPath: asString(base?.slashPath || id.replace(/\./g, '/')),
      cssVar: asString(base?.cssVar || ''),
      type: asString(base?.type || ''),
      collection: asString(base?.collection || ''),
      usageCount: asInt(usage?.usageCount, 0),
      inDegree: asInt(node?.inDegree, 0),
      outDegree: asInt(node?.outDegree, 0),
      isCycleMember: Boolean(node?.isCycleMember),
      reasons,
      usedByComponents,
    };
  });
}

/**
 * Rebuilds and stores token health snapshot from DB artifacts only.
 *
 * Prerequisites:
 * - token registry exists in DB
 * - token graph exists in DB
 */
export function refreshTokenHealthSnapshotDbOnly(args: {
  systemId: string;
  emitChunk: EmitChunk;
  tokenRepo: TokenRepository;
  healthRepo: HealthRepository;
  db: Database.Database;
  sha256Text: (value: string) => string;
}) {
  const { systemId, emitChunk, tokenRepo, healthRepo, db, sha256Text } = args;

  const { registry } = buildTokenRegistryFromDb({
    systemId,
    tokenRepo,
    db,
  });
  if (registry.entries.length === 0) {
    throw new Error(`Cannot refresh token health for "${systemId}": token registry is empty in DB.`);
  }

  const usageIndex = tokenRepo.getTokenUsageIndex(systemId);
  const graph = tokenRepo.getTokenGraph(systemId);
  if (!graph || typeof graph !== 'object') {
    throw new Error(
      `Cannot refresh token health for "${systemId}": token graph is missing in DB. Run refresh-token-graph first.`,
    );
  }

  const wcagPairs = readWcagPairsFromDb(db);
  const report = generateHealthReport(
    registry,
    usageIndex,
    graph,
    wcagPairs as never,
    {
      maxItems: DEFAULT_MAX_HEALTH_ITEMS,
      highUsageThreshold: DEFAULT_HIGH_USAGE_THRESHOLD,
      highIndegreeThreshold: DEFAULT_HIGH_INDEGREE_THRESHOLD,
    },
  );

  const usageEntries = Array.isArray((usageIndex as { entries?: unknown[] }).entries)
    ? ((usageIndex as { entries: Array<{ path: string; slashPath: string; cssVar: string; type: string; collection: string; usageCount: number; usedIn: Array<{ kind: string; owner: string }> }> }).entries)
    : [];

  const graphNodes = Array.isArray((graph as { nodes?: unknown[] }).nodes)
    ? ((graph as { nodes: Array<{ id: string; inDegree: number; outDegree: number; isCycleMember?: boolean }> }).nodes)
    : [];

  const unusedTokens = usageEntries
    .filter((entry) => asInt(entry.usageCount, 0) === 0)
    .map((entry) => ({
      path: entry.path,
      slashPath: entry.slashPath,
      cssVar: entry.cssVar,
      type: entry.type,
      collection: entry.collection,
      resolvedValue: asString(
        registry.entries.find((token) => token.path === entry.path)?.$value || '',
      ),
      usageCount: 0,
    }));

  const highCouplingTokens = collectHighCouplingRows({
    registryEntries: usageEntries.map((entry) => ({
      path: entry.path,
      slashPath: entry.slashPath,
      cssVar: entry.cssVar,
      type: entry.type,
      collection: entry.collection,
      resolvedValue: asString(
        registry.entries.find((token) => token.path === entry.path)?.$value || '',
      ),
    })),
    usageEntries,
    graphNodes,
    highUsageTokens: report.highUsageTokens,
    highIndegreeTokens: report.highIndegreeTokens,
  });

  const brokenAliases = report.issues
    .filter((issue) => issue.code === 'BROKEN_ALIAS')
    .map((issue) => {
      const aliasMatch = String(issue.message || '').match(/alias:\s*([^\s]+)$/i);
      const aliasTarget = asString(aliasMatch?.[1] || '');
      return {
        token: asString(issue.tokenPath || issue.tokenId || ''),
        aliasCssVar: aliasTarget.startsWith('--') ? aliasTarget : '',
        aliasTarget: aliasTarget || null,
        reason: asString(issue.message || 'Broken alias reference.'),
      };
    });

  const brokenCssVarRefs = report.issues
    .filter((issue) => issue.code === 'BROKEN_REF')
    .map((issue) => {
      const cssVarMatch = String(issue.message || '').match(/(--[a-z0-9-]+)/i);
      return {
        from: asString(issue.tokenPath || issue.tokenId || ''),
        cssVar: asString(cssVarMatch?.[1] || ''),
        reason: asString(issue.message || 'Broken css var reference.'),
      };
    });

  const wcagFailures = Array.isArray(report.wcagFailures)
    ? report.wcagFailures.map((failure) => ({
      foreground: asString((failure as Record<string, unknown>).fgToken || ''),
      background: asString((failure as Record<string, unknown>).bgToken || ''),
      level: asString((failure as Record<string, unknown>).requiredLevel || 'AA') === 'AAA' ? 'AAA' : 'AA',
      textSize: 'normal' as const,
      contrastRatio: asNumber((failure as Record<string, unknown>).contrastRatio, 0),
      requiredRatio: asString((failure as Record<string, unknown>).requiredLevel || 'AA') === 'AAA' ? 7 : 4.5,
      foregroundHex: '',
      backgroundHex: '',
    }))
    : [];

  const cycleNodeCount = Array.isArray((graph as { cycle_node_ids?: unknown[] }).cycle_node_ids)
    ? (graph as { cycle_node_ids: unknown[] }).cycle_node_ids.length
    : 0;

  const snapshotBase = {
    ok: true,
    schema_version: 1,
    generated_at: new Date().toISOString(),
    source: {
      registry_path: `db://tokens/${systemId}`,
      usage_index_path: `db://token_usage_occurrences/${systemId}`,
      graph_viz_path: `db://token_graph/${systemId}`,
      wcag_pairs_path: 'db://app_settings/wcag_pairs',
    },
    thresholds: {
      high_usage_threshold: DEFAULT_HIGH_USAGE_THRESHOLD,
      high_indegree_threshold: DEFAULT_HIGH_INDEGREE_THRESHOLD,
    },
    summary: {
      tokens_total: asInt((usageIndex as { summary?: { tokens_total?: unknown } }).summary?.tokens_total, registry.entries.length),
      tokens_with_usage: asInt((usageIndex as { summary?: { tokens_with_usage?: unknown } }).summary?.tokens_with_usage, 0),
      unused_tokens_total: unusedTokens.length,
      high_coupling_tokens_total: highCouplingTokens.length,
      broken_aliases_total: brokenAliases.length,
      broken_css_var_refs_total: brokenCssVarRefs.length,
      cycle_nodes_total: cycleNodeCount,
      wcag_pairs_configured_total: wcagPairs.length,
      wcag_pairs_resolved_total: 0,
      wcag_failures_total: wcagFailures.length,
    },
    warnings: report.issues
      .filter((issue) => issue.severity === 'warning')
      .slice(0, DEFAULT_MAX_HEALTH_ITEMS)
      .map((issue) => ({
        id: asString(issue.code || 'warning'),
        message: asString(issue.message || 'Warning'),
      })),
    unused_tokens: {
      items: unusedTokens,
      total: unusedTokens.length,
      truncated: false,
    },
    high_coupling_tokens: {
      items: highCouplingTokens,
      total: highCouplingTokens.length,
      truncated: false,
    },
    broken_aliases: {
      items: brokenAliases,
      total: brokenAliases.length,
      truncated: false,
    },
    broken_css_var_refs: {
      items: brokenCssVarRefs,
      total: brokenCssVarRefs.length,
      truncated: false,
    },
    wcag_failures: {
      items: wcagFailures,
      total: wcagFailures.length,
      truncated: false,
    },
    upstream_fingerprints: {
      token_usage_index: sha256Text(JSON.stringify((usageIndex as { summary?: unknown }).summary || {})),
      token_graph_viz: asString((graph as { fingerprint?: unknown }).fingerprint || sha256Text(JSON.stringify((graph as { summary?: unknown }).summary || {}))),
    },
  };

  const snapshot = {
    ...snapshotBase,
    fingerprint_sha256: sha256Text(JSON.stringify(snapshotBase)),
  };

  healthRepo.upsertSnapshot(systemId, 'tokens', snapshot);

  emitChunk('result', `Token health snapshot stored in DB (${snapshot.summary.tokens_total} tokens).`);

  return {
    ok: true,
    code: 0,
    summary: 'Token health snapshot refreshed in DB-only mode.',
    payload: snapshot,
  };
}

/**
 * Rebuilds component health report from component repository data in DB.
 * The resulting snapshot is stored in `health_snapshots` (kind=components).
 */
export function refreshComponentsHealthSnapshotDbOnly(args: {
  systemId: string;
  emitChunk: EmitChunk;
  componentRepo: ComponentRepository;
  healthRepo: HealthRepository;
  sha256Text: (value: string) => string;
}) {
  const { systemId, emitChunk, componentRepo, healthRepo, sha256Text } = args;

  const rows = componentRepo.getAll(systemId);

  const components = rows.map((row) => {
    const spec = row.specs?.[0];
    const specExists = Boolean(row.editorialExists);

    return {
      slug: row.slug,
      display_name: row.name || row.slug,
      coverage: asNumber(spec?.coverage, 0),
      with_spec: specExists,
      paths: {
        spec: `db://component_editorial/${row.id}`,
      },
    };
  });

  const summary = {
    total_components: components.length,
    with_spec: components.filter((entry) => entry.with_spec).length,
    without_spec: components.filter((entry) => !entry.with_spec).length,
    average_coverage_percent:
      components.length > 0
        ? Number((components.reduce((acc, entry) => acc + asNumber(entry.coverage, 0), 0) / components.length).toFixed(2))
        : 0,
  };

  const reportBase = {
    schema_version: 2,
    source: {
      registry_path: `db://components/${systemId}`,
    },
    summary,
    filters: {
      without_spec: {
        items: components.filter((entry) => !entry.with_spec).map((entry) => entry.slug),
        total: components.filter((entry) => !entry.with_spec).length,
        truncated: false,
      },
    },
    components,
  };

  const report = {
    ...reportBase,
    fingerprint_sha256: sha256Text(JSON.stringify(reportBase)),
  };

  healthRepo.upsertSnapshot(systemId, 'components', report);

  emitChunk('result', `Components health snapshot stored in DB (${summary.total_components} component(s)).`);

  return {
    ok: true,
    code: 0,
    summary: 'Components health snapshot refreshed in DB-only mode.',
    payload: report,
  };
}

/**
 * Captures historical health entry into DB (`health_history`) from current
 * token/components snapshots. Applies dedupe and retention pruning.
 */
export function captureHealthSnapshotDbOnly(args: {
  systemId: string;
  beforeRef: string;
  retentionDays: number;
  allowDuplicateDay: boolean;
  skipDiff: boolean;
  emitChunk: EmitChunk;
  tokenRepo: TokenRepository;
  healthRepo: HealthRepository;
  db: Database.Database;
  sha256Text: (value: string) => string;
}) {
  const {
    systemId,
    beforeRef,
    retentionDays,
    allowDuplicateDay,
    skipDiff,
    emitChunk,
    tokenRepo,
    healthRepo,
    db,
    sha256Text,
  } = args;

  const tokenSnapshot = healthRepo.getSnapshot(systemId, 'tokens')?.snapshotJson as Record<string, unknown> | null;
  const componentsSnapshot = healthRepo.getSnapshot(systemId, 'components')?.snapshotJson as Record<string, unknown> | null;

  if (!tokenSnapshot) {
    throw new Error(`Cannot capture health snapshot for "${systemId}": token health snapshot is missing in DB.`);
  }
  if (!componentsSnapshot) {
    throw new Error(`Cannot capture health snapshot for "${systemId}": components health snapshot is missing in DB.`);
  }

  const usageIndex = tokenRepo.getTokenUsageIndex(systemId);
  const nowIso = new Date().toISOString();
  // DB-only mode does not execute token diffing yet.
  const breakingChanges: number | null = null;
  const tokenDiffFingerprint = '';
  const diffWarning = skipDiff
    ? 'Token diff skipped (--skip-diff true).'
    : 'Token diff is not available in DB-only mode; breaking_changes remains null.';

  const snapshot = {
    captured_at: nowIso,
    metrics: {
      breaking_changes: breakingChanges,
      wcag_failures_total: asInt((tokenSnapshot.summary as Record<string, unknown> | undefined)?.wcag_failures_total, 0),
      coverage_avg: asNumber((componentsSnapshot.summary as Record<string, unknown> | undefined)?.average_coverage_percent, 0),
      unresolved_total: asInt((usageIndex.summary as { unresolved_total?: unknown }).unresolved_total, 0),
      unused_tokens_total: asInt((tokenSnapshot.summary as Record<string, unknown> | undefined)?.unused_tokens_total, 0),
      without_spec_total: asInt((componentsSnapshot.summary as Record<string, unknown> | undefined)?.without_spec, 0),
    },
    fingerprints: {
      token_health: asString(tokenSnapshot.fingerprint_sha256),
      components_health: asString(componentsSnapshot.fingerprint_sha256),
      token_usage: sha256Text(JSON.stringify(usageIndex.summary || {})),
      token_diff: tokenDiffFingerprint,
      signature_sha256: '',
    },
    meta: {
      before_ref: beforeRef,
      diff_available: false,
    },
  };

  snapshot.fingerprints.signature_sha256 = sha256Text(
    JSON.stringify({
      metrics: snapshot.metrics,
      fingerprints: {
        token_health: snapshot.fingerprints.token_health,
        components_health: snapshot.fingerprints.components_health,
        token_usage: snapshot.fingerprints.token_usage,
        token_diff: snapshot.fingerprints.token_diff,
      },
      before_ref: snapshot.meta.before_ref,
    }),
  );

  const latest = healthRepo.getHistory(systemId, 'tokens', 1)[0]?.entryJson as
    | { captured_at?: unknown; fingerprints?: { signature_sha256?: unknown } }
    | undefined;

  const sameDay = latest
    ? String(latest.captured_at || '').slice(0, 10) === nowIso.slice(0, 10)
    : false;
  const sameSignature = latest
    ? asString(latest.fingerprints?.signature_sha256) === snapshot.fingerprints.signature_sha256
    : false;

  const shouldAppend = allowDuplicateDay || !(sameDay && sameSignature);

  if (shouldAppend) {
    healthRepo.appendHistory(systemId, 'tokens', snapshot);
  }

  const effectiveRetentionDays = Math.max(1, asInt(retentionDays, DEFAULT_HEALTH_RETENTION_DAYS));
  const cutoffEpoch = Math.floor(Date.now() / 1000) - effectiveRetentionDays * 24 * 60 * 60;
  const pruneResult = db
    .prepare('DELETE FROM health_history WHERE ds_id = ? AND kind = ? AND recorded_at < ?')
    .run(systemId, 'tokens', cutoffEpoch);

  const historyCountRow = db
    .prepare('SELECT COUNT(*) AS count FROM health_history WHERE ds_id = ? AND kind = ?')
    .get(systemId, 'tokens') as { count?: number } | undefined;
  const snapshotsTotal = asInt(historyCountRow?.count, 0);

  emitChunk('result', shouldAppend ? 'Health snapshot appended to DB history.' : 'Health snapshot deduplicated (same day/signature).');
  emitChunk('warning', diffWarning);

  return {
    ok: true,
    code: 0,
    summary: shouldAppend ? 'Health snapshot captured in DB-only mode.' : 'Health snapshot deduplicated in DB-only mode.',
    payload: {
      ok: true,
      dry_run: false,
      appended: shouldAppend,
      deduplicated_same_day: !shouldAppend,
      pruned_old_snapshots: asInt(pruneResult.changes, 0),
      snapshots_total: snapshotsTotal,
      changed: shouldAppend,
      written: shouldAppend,
      snapshot,
      warnings: [diffWarning],
    },
  };
}
