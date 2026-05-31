import type { Sql } from 'postgres';

import type { TokenRepository } from '../db/token-repository.js';
import { bulkInsert } from '../lib/sql-bulk-insert.ts';

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

function asString(value: unknown): string {
  return String(value ?? '').trim();
}

async function buildTokenCatalogFromDb(args: {
  systemId: string;
  tokenRepo: TokenRepository;
  sql: Sql;
}) {
  const { systemId, tokenRepo, sql } = args;
  const tokenCatalog = await tokenRepo.getTokenCatalog(systemId);
  const aliasRows = (await sql`
    SELECT from_path, to_path, modes
    FROM figma_aliases
    WHERE ds_id = ${systemId}
  `) as AliasRow[];

  const aliasesBySource = new Map<string, string[]>();
  for (const row of aliasRows) {
    const fromPath = asString(row.from_path);
    const toPath = asString(row.to_path);
    if (!fromPath || !toPath) continue;
    const next = aliasesBySource.get(fromPath) || [];
    next.push(toPath);
    aliasesBySource.set(fromPath, next);
  }

  const registry = Object.assign({}, tokenCatalog, {
    entries: tokenCatalog.entries.map((entry) => ({
      id: entry.path,
      path: entry.path,
      $value: entry.resolvedValue,
      type: entry.type,
      collection: entry.collection,
      cssVar: entry.cssVar,
      aliases: aliasesBySource.get(entry.path) || [],
    })),
  });

  return {
    registry,
    aliasRows,
    tokenCatalog,
  };
}

async function buildUsageRowsFromDb(args: {
  systemId: string;
  sql: Sql;
  aliasRows: AliasRow[];
  validTokenIds: Set<string>;
}): Promise<{ rows: UsageRow[]; warnings: string[] }> {
  const { systemId, sql, aliasRows, validTokenIds } = args;
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

  const figmaBindingRows = (await sql`
    SELECT b.component_id, b.node_id, b.field, b.mode, b.token_path
    FROM component_figma_token_bindings b
    INNER JOIN components c ON c.id = b.component_id
    WHERE c.ds_id = ${systemId}
  `) as ComponentFigmaTokenBindingRow[];

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
      owner: nodeId
        ? `figma-node:${nodeId}`
        : `db://component/${row.component_id}`,
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
 * Rebuilds token usage occurrences from DB-backed evidence.
 *
 * Sources:
 * - `component_figma_token_bindings.token_path`
 * - `figma_aliases`
 *
 * No filesystem scans are performed.
 */
export async function refreshUsageIndexDbOnly(args: {
  systemId: string;
  emitChunk: EmitChunk;
  sql: Sql;
  tokenRepo: TokenRepository;
}) {
  const { systemId, emitChunk, sql, tokenRepo } = args;

  const { registry, aliasRows } = await buildTokenCatalogFromDb({
    systemId,
    tokenRepo,
    sql,
  });

  if (registry.entries.length === 0) {
    throw new Error(
      `Cannot rebuild usage index for "${systemId}": token registry is empty in DB.`,
    );
  }

  const usageBuild = await buildUsageRowsFromDb({
    systemId,
    sql,
    aliasRows,
    validTokenIds: new Set(registry.entries.map((entry) => entry.id)),
  });

  for (const warning of usageBuild.warnings) {
    emitChunk('warning', warning);
  }

  await sql.begin(async (tx) => {
    await tx`DELETE FROM token_usage_occurrences WHERE ds_id = ${systemId}`;
    await bulkInsert(tx, {
      table: 'token_usage_occurrences',
      columns: ['ds_id', 'token_id', 'kind', 'source', 'owner', 'detail'],
      rows: usageBuild.rows.map((row) => [
        systemId,
        row.tokenId,
        row.kind,
        row.source,
        row.owner,
        row.detail,
      ]),
      onConflict:
        'ON CONFLICT (ds_id, token_id, kind, source, owner, detail) DO NOTHING',
    });
  });

  emitChunk(
    'result',
    `Usage index rebuilt in DB with ${usageBuild.rows.length} occurrence(s).`,
  );

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
