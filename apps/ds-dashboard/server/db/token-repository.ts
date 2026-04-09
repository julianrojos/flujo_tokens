import Database from 'better-sqlite3';

export interface TokenRegistryEntry {
  path: string;
  slashPath: string;
  cssVar: string;
  type: string;
  resolvedValue: string;
  collection: string;
  aliasOf: string | null;
}

interface VariableIdMappingRow {
  /** Canonical form: lowercase without "variableid:" prefix (e.g. "1:12") */
  variable_id: string;
  token_path: string;
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

export class TokenRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  private static buildRegistryIndexes(entries: TokenRegistryEntry[]): {
    byPath: Record<string, TokenRegistryEntry>;
    bySlashPath: Record<string, TokenRegistryEntry>;
  } {
    const byPath: Record<string, TokenRegistryEntry> = {};
    const bySlashPath: Record<string, TokenRegistryEntry> = {};
    for (const entry of entries) {
      byPath[entry.path] = entry;
      bySlashPath[entry.slashPath] = entry;
    }
    return { byPath, bySlashPath };
  }

  private static buildVariableIdIndex(args: {
    mappings: VariableIdMappingRow[];
    byPath: Record<string, TokenRegistryEntry>;
    bySlashPath: Record<string, TokenRegistryEntry>;
  }): Record<string, TokenRegistryEntry> {
    const { mappings, byPath, bySlashPath } = args;
    const byVariableId: Record<string, TokenRegistryEntry> = {};
    for (const mapping of mappings) {
      // SQL already returns canonical form (lowercase, no "variableid:" prefix).
      const bareId = String(mapping.variable_id || '').trim();
      const tokenPath = String(mapping.token_path || '').trim();
      if (!bareId || !tokenPath) continue;
      const entry = byPath[tokenPath] ?? bySlashPath[tokenPath];
      if (!entry) continue;
      // Index variable ids in both forms:
      // - `VariableID:1:12` (canonical prefixed form)
      // - `1:12` (bare id seen in some payloads)
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

  getTokenRegistry(dsId: string): {
    entries: TokenRegistryEntry[];
    byPath: Record<string, TokenRegistryEntry>;
    bySlashPath: Record<string, TokenRegistryEntry>;
    byVariableId: Record<string, TokenRegistryEntry>;
  } {
    const rows = this.db
      .prepare(
        `
        WITH ranked_mode_values AS (
          SELECT
            tmv.ds_id,
            tmv.token_path,
            tmv.resolved_value,
            tmv.mode,
            ROW_NUMBER() OVER (
              PARTITION BY tmv.ds_id, tmv.token_path
              ORDER BY
                CASE
                  WHEN tmv.mode = 'Default' THEN 0
                  WHEN lower(tmv.mode) = 'default' THEN 1
                  ELSE 2
                END,
                tmv.mode COLLATE NOCASE,
                tmv.id
            ) AS rn
          FROM token_mode_values tmv
        ),
        selected_mode AS (
          SELECT ds_id, token_path, mode AS winning_mode
          FROM ranked_mode_values WHERE rn = 1
        ),
        -- Pick at most one alias target per token, preferring:
        -- 1) the same mode chosen for resolved_value, 2) Default,
        -- 3) stable fallback by id (also used when no winning mode exists).
        alias_candidates AS (
          SELECT
            fa.ds_id, fa.from_path, fa.to_path, je.value AS alias_mode,
            ROW_NUMBER() OVER (
              PARTITION BY fa.ds_id, fa.from_path
              ORDER BY
                CASE WHEN lower(je.value) = lower(sm.winning_mode) THEN 0
                     WHEN lower(je.value) = 'default'               THEN 1
                     ELSE 2 END,
                fa.id
            ) AS rn
          FROM figma_aliases fa
          JOIN json_each(fa.modes) je
          LEFT JOIN selected_mode sm
            ON sm.ds_id = fa.ds_id AND sm.token_path = fa.from_path
        ),
        preferred_alias AS (
          SELECT ds_id, from_path, to_path FROM alias_candidates WHERE rn = 1
        )
        SELECT t.id, t.slash_path, t.css_var, t.type, t.collection, ranked_mode_values.resolved_value, t.raw_value, pa.to_path AS alias_of
        FROM tokens t
        LEFT JOIN ranked_mode_values
          ON ranked_mode_values.ds_id = t.ds_id
         AND ranked_mode_values.token_path = t.id
         AND ranked_mode_values.rn = 1
        LEFT JOIN preferred_alias pa
          ON pa.ds_id = t.ds_id AND pa.from_path = t.id
        WHERE t.ds_id = ?
        ORDER BY t.id
      `,
      )
      .all(dsId) as Array<{
      id: string;
      slash_path: string;
      css_var: string;
      type: string;
      collection: string;
      resolved_value: string | null;
      raw_value: string;
      alias_of: string | null;
    }>;

    const variableIdMappings = this.db
      .prepare(
        `
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
          WHERE c.ds_id = ?
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
      `,
      )
      .all(dsId) as VariableIdMappingRow[];

    const entries = rows.map((row) => ({
      path: row.id,
      slashPath: row.slash_path,
      cssVar: row.css_var,
      type: row.type,
      // Fallback to raw_value when mode rows are missing to avoid masking data with empty strings.
      resolvedValue: row.resolved_value ?? row.raw_value,
      collection: row.collection,
      aliasOf: row.alias_of ?? null,
    }));

    const registryIndexes = TokenRepository.buildRegistryIndexes(entries);
    const byVariableId = TokenRepository.buildVariableIdIndex({
      mappings: variableIdMappings,
      byPath: registryIndexes.byPath,
      bySlashPath: registryIndexes.bySlashPath,
    });

    return { entries, ...registryIndexes, byVariableId };
  }

  getTokenUsageIndex(dsId: string): {
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
  } {
    const registry = this.getTokenRegistry(dsId);
    const usageRows = this.db
      .prepare(
        `
        SELECT token_id, kind, source, owner, detail
        FROM token_usage_occurrences
        WHERE ds_id = ?
        ORDER BY token_id
      `,
      )
      .all(dsId) as Array<{
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

    const usageLinksByKind = entries.reduce<Record<string, number>>((acc, entry) => {
      for (const [kind, count] of Object.entries(entry.usageByKind)) {
        acc[kind] = (acc[kind] || 0) + count;
      }
      return acc;
    }, {});

    const tokensWithUsage = entries.filter((entry) => entry.usageCount > 0).length;
    const usageLinksTotal = entries.reduce((sum, entry) => sum + entry.usageCount, 0);

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

  getTokenGraph(dsId: string): Record<string, unknown> | null {
    const row = this.db
      .prepare(
        `
        SELECT graph_json
        FROM token_graph
        WHERE ds_id = ?
      `,
      )
      .get(dsId) as { graph_json: string } | undefined;
    if (!row) return null;
    try {
      return JSON.parse(row.graph_json);
    } catch (error) {
      console.error('[TokenRepository] Invalid token_graph JSON payload', {
        dsId,
        reason: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }
}
