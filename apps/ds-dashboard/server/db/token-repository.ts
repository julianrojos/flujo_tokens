import type { Sql } from 'postgres';

export interface TokenCatalogEntry {
  path: string;
  slashPath: string;
  cssVar: string;
  type: string;
  resolvedValue: string;
  collection: string;
  aliasOf: string | null;
}

interface VariableIdMappingRow {
  variable_id: string;
  token_path: string;
}

interface TokenRow {
  id: string;
  slash_path: string;
  css_var: string;
  type: string;
  collection: string;
  raw_value: string;
}

interface TokenModeValueRow {
  id: number;
  token_path: string;
  mode: string;
  resolved_value: string;
}

interface FigmaAliasRow {
  id: number;
  from_path: string;
  to_path: string;
  modes: unknown;
}

export interface TokenUsageOccurrence {
  kind: string;
  source: string;
  owner: string;
  detail: string;
}

export interface TokenUsageEntry {
  path: string;
  slashPath: string;
  cssVar: string;
  type: string;
  collection: string;
  usageCount: number;
  usageByKind: Record<string, number>;
  usedIn: TokenUsageOccurrence[];
}

function normalizeAliasModes(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry || '').trim()).filter(Boolean);
  }
  if (value == null) return [];
  if (typeof value === 'string') {
    const raw = value.trim();
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((entry) => String(entry || '').trim()).filter(Boolean);
      }
    } catch {
      // Fall through to a single-value fallback.
    }
    return [raw];
  }
  return [String(value || '').trim()].filter(Boolean);
}

function rankModeValue(mode: string): number {
  if (mode === 'Default') return 0;
  if (mode.toLowerCase() === 'default') return 1;
  return 2;
}

function compareModeRows(left: TokenModeValueRow, right: TokenModeValueRow): number {
  const leftRank = rankModeValue(left.mode);
  const rightRank = rankModeValue(right.mode);
  if (leftRank !== rightRank) return leftRank - rightRank;
  const leftLower = left.mode.toLowerCase();
  const rightLower = right.mode.toLowerCase();
  if (leftLower !== rightLower) return leftLower.localeCompare(rightLower);
  if (left.mode !== right.mode) return left.mode.localeCompare(right.mode);
  return left.id - right.id;
}

export class TokenRepository {
  private sql: Sql;

  constructor(sql: Sql) {
    this.sql = sql;
  }

  private static buildRegistryIndexes(entries: TokenCatalogEntry[]): {
    byPath: Record<string, TokenCatalogEntry>;
    bySlashPath: Record<string, TokenCatalogEntry>;
  } {
    const byPath: Record<string, TokenCatalogEntry> = {};
    const bySlashPath: Record<string, TokenCatalogEntry> = {};
    for (const entry of entries) {
      byPath[entry.path] = entry;
      bySlashPath[entry.slashPath] = entry;
    }
    return { byPath, bySlashPath };
  }

  private static buildVariableIdIndex(args: {
    mappings: VariableIdMappingRow[];
    byPath: Record<string, TokenCatalogEntry>;
    bySlashPath: Record<string, TokenCatalogEntry>;
  }): Record<string, TokenCatalogEntry> {
    const { mappings, byPath, bySlashPath } = args;
    const byVariableId: Record<string, TokenCatalogEntry> = {};
    for (const mapping of mappings) {
      const bareId = String(mapping.variable_id || '').trim();
      const tokenPath = String(mapping.token_path || '').trim();
      if (!bareId || !tokenPath) continue;
      const entry = byPath[tokenPath] ?? bySlashPath[tokenPath];
      if (!entry) continue;
      byVariableId[bareId] = entry;
      byVariableId[`VariableID:${bareId}`] = entry;
    }
    return byVariableId;
  }

  private static buildUsageIndexes(entries: TokenUsageEntry[]): {
    byPath: Record<string, TokenUsageEntry>;
    bySlashPath: Record<string, TokenUsageEntry>;
    byCssVar: Record<string, TokenUsageEntry>;
  } {
    const byPath: Record<string, TokenUsageEntry> = {};
    const bySlashPath: Record<string, TokenUsageEntry> = {};
    const byCssVar: Record<string, TokenUsageEntry> = {};
    for (const entry of entries) {
      byPath[entry.path] = entry;
      bySlashPath[entry.slashPath] = entry;
      byCssVar[entry.cssVar] = entry;
    }
    return { byPath, bySlashPath, byCssVar };
  }

  async getTokenCatalog(dsId: string): Promise<{
    entries: TokenCatalogEntry[];
    byPath: Record<string, TokenCatalogEntry>;
    bySlashPath: Record<string, TokenCatalogEntry>;
    byVariableId: Record<string, TokenCatalogEntry>;
  }> {
    const catalogResults = await Promise.all([
      this.sql`
        SELECT t.id, t.slash_path, t.css_var, t.type, t.collection, t.raw_value
        FROM tokens t
        WHERE t.ds_id = ${dsId}
        ORDER BY t.id
      `,
      this.sql`
        SELECT tmv.id, tmv.token_path, tmv.mode, tmv.resolved_value
        FROM token_mode_values tmv
        WHERE tmv.ds_id = ${dsId}
        ORDER BY tmv.token_path, tmv.id
      `,
      this.sql`
        SELECT fa.id, fa.from_path, fa.to_path, fa.modes
        FROM figma_aliases fa
        WHERE fa.ds_id = ${dsId}
        ORDER BY fa.from_path, fa.id
      `,
      this.sql`
      WITH normalized_bindings AS (
        SELECT
          c.ds_id,
          CASE
            WHEN lower(trim(b.variable_id)) LIKE 'variableid:%'
              THEN trim(substr(trim(b.variable_id), 12))
            ELSE trim(b.variable_id)
          END AS canonical_variable_id,
          b.token_path,
          b.captured_at,
          b.id
        FROM component_figma_token_bindings b
        JOIN components c
          ON c.id = b.component_id
        WHERE c.ds_id = ${dsId}
          AND length(trim(b.variable_id)) > 0
          AND length(trim(COALESCE(b.token_path, ''))) > 0
      ),
      ranked_bindings AS (
        SELECT
          ds_id,
          canonical_variable_id,
          token_path,
          captured_at,
          id,
          ROW_NUMBER() OVER (
            PARTITION BY ds_id, canonical_variable_id
            ORDER BY captured_at DESC, id DESC
          ) AS rn
        FROM normalized_bindings
        WHERE length(canonical_variable_id) > 0
      )
      SELECT canonical_variable_id AS variable_id, token_path
      FROM ranked_bindings
      WHERE rn = 1
      ` as VariableIdMappingRow[],
    ]);
    const [tokenRows, modeValueRows, aliasRows, variableIdMappings] = catalogResults as [
      TokenRow[],
      TokenModeValueRow[],
      FigmaAliasRow[],
      VariableIdMappingRow[],
    ];

    const bestModeByTokenPath = new Map<
      string,
      { mode: string; resolvedValue: string }
    >();
    for (const row of modeValueRows) {
      const tokenPath = String(row.token_path || '').trim();
      const mode = String(row.mode || '').trim();
      if (!tokenPath || !mode || row.resolved_value == null) continue;
      const resolvedValue = String(row.resolved_value);
      const next = { mode, resolvedValue };
      const existing = bestModeByTokenPath.get(tokenPath);
      if (!existing) {
        bestModeByTokenPath.set(tokenPath, next);
        continue;
      }
      if (compareModeRows(
        { id: 0, token_path: tokenPath, mode: next.mode, resolved_value: next.resolvedValue },
        { id: 0, token_path: tokenPath, mode: existing.mode, resolved_value: existing.resolvedValue },
      ) < 0) {
        bestModeByTokenPath.set(tokenPath, next);
      }
    }

    const aliasRowsBySource = new Map<
      string,
      Array<{ id: number; toPath: string; modes: string[] }>
    >();
    for (const row of aliasRows) {
      const fromPath = String(row.from_path || '').trim();
      const toPath = String(row.to_path || '').trim();
      if (!fromPath || !toPath) continue;
      const next = aliasRowsBySource.get(fromPath) || [];
      next.push({
        id: Number(row.id || 0),
        toPath,
        modes: normalizeAliasModes(row.modes),
      });
      aliasRowsBySource.set(fromPath, next);
    }

    const entries = tokenRows.map((row) => {
      const tokenPath = String(row.id || '').trim();
      const bestMode = bestModeByTokenPath.get(tokenPath);
      const aliasCandidates = aliasRowsBySource.get(tokenPath) || [];
      let aliasOf: string | null = null;
      if (aliasCandidates.length > 0) {
        let bestScore = Number.POSITIVE_INFINITY;
        let bestAliasId = Number.POSITIVE_INFINITY;
        for (const candidate of aliasCandidates) {
          let score = 2;
          for (const mode of candidate.modes) {
            if (bestMode && mode.toLowerCase() === bestMode.mode.toLowerCase()) {
              score = 0;
              break;
            }
            if (mode.toLowerCase() === 'default' && score > 1) {
              score = 1;
            }
          }
          if (
            score < bestScore ||
            (score === bestScore && candidate.id < bestAliasId)
          ) {
            bestScore = score;
            bestAliasId = candidate.id;
            aliasOf = candidate.toPath;
          }
        }
      }

      return {
        path: tokenPath,
        slashPath: row.slash_path,
        cssVar: row.css_var,
        type: row.type,
        resolvedValue: bestMode?.resolvedValue ?? row.raw_value,
        collection: row.collection,
        aliasOf,
      };
    });

    const registryIndexes = TokenRepository.buildRegistryIndexes(entries);
    const byVariableId = TokenRepository.buildVariableIdIndex({
      mappings: variableIdMappings,
      byPath: registryIndexes.byPath,
      bySlashPath: registryIndexes.bySlashPath,
    });

    return { entries, ...registryIndexes, byVariableId };
  }

  async getTokenUsageIndex(dsId: string): Promise<{
    ok: true;
    summary: {
      generatedAt: string;
      tokens_total: number;
      tokens_with_usage: number;
      tokens_without_usage: number;
      usage_links_total: number;
      usage_links_by_kind: Record<string, number>;
      unresolved_total: number;
    };
    warnings: Array<{ kind: string; source: string; message: string }>;
    unresolved: Array<{
      kind: string;
      source: string;
      owner: string;
      keyPath: string;
      tokenPath: string;
      reason: string;
      suggested: string | null;
    }>;
    entries: TokenUsageEntry[];
    byPath: Record<string, TokenUsageEntry>;
    bySlashPath: Record<string, TokenUsageEntry>;
    byCssVar: Record<string, TokenUsageEntry>;
  }> {
    const registry = await this.getTokenCatalog(dsId);
    const usageRows = (await this.sql`
      SELECT token_id, kind, source, owner, detail
      FROM token_usage_occurrences
      WHERE ds_id = ${dsId}
      ORDER BY token_id
    `) as Array<{
      token_id: string;
      kind: string;
      source: string;
      owner: string;
      detail: string;
    }>;

    const usageMap = new Map<string, TokenUsageEntry['usedIn']>();
    for (const row of usageRows) {
      const prev = usageMap.get(row.token_id) || [];
      prev.push({
        kind: row.kind,
        source: row.source,
        owner: row.owner,
        detail: row.detail,
      });
      usageMap.set(row.token_id, prev);
    }

    const entries: TokenUsageEntry[] = registry.entries.map((token) => {
      const usedIn = usageMap.get(token.path) || [];
      const usageByKind = usedIn.reduce<Record<string, number>>((acc, occ) => {
        acc[occ.kind] = (acc[occ.kind] || 0) + 1;
        return acc;
      }, {});
      return {
        path: token.path,
        slashPath: token.slashPath,
        cssVar: token.cssVar,
        type: token.type,
        collection: token.collection,
        usageCount: usedIn.length,
        usageByKind,
        usedIn,
      };
    });

    const usageLinksByKind = entries.reduce<Record<string, number>>(
      (acc, entry) => {
        for (const [kind, count] of Object.entries(entry.usageByKind)) {
          acc[kind] = (acc[kind] || 0) + count;
        }
        return acc;
      },
      {},
    );

    const tokensWithUsage = entries.filter(
      (entry) => entry.usageCount > 0,
    ).length;
    const usageLinksTotal = entries.reduce(
      (sum, entry) => sum + entry.usageCount,
      0,
    );

    const indexes = TokenRepository.buildUsageIndexes(entries);
    return {
      ok: true,
      summary: {
        generatedAt: new Date().toISOString(),
        tokens_total: entries.length,
        tokens_with_usage: tokensWithUsage,
        tokens_without_usage: entries.length - tokensWithUsage,
        usage_links_total: usageLinksTotal,
        usage_links_by_kind: usageLinksByKind,
        unresolved_total: 0,
      },
      warnings: [],
      unresolved: [],
      entries,
      ...indexes,
    };
  }

  async getTokenGraph(dsId: string): Promise<Record<string, unknown> | null> {
    const row = (await this.sql`
      SELECT graph_json
      FROM token_graph
      WHERE ds_id = ${dsId}
    `) as Array<{ graph_json: unknown }>;
    if (row.length === 0) return null;
    const graphJson = row[0].graph_json;
    if (graphJson == null) return null;
    if (typeof graphJson === 'object') {
      return graphJson as Record<string, unknown>;
    }
    try {
      return JSON.parse(String(graphJson));
    } catch (error) {
      console.error('[TokenRepository] Invalid token_graph JSON payload', {
        dsId,
        reason: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }
}
