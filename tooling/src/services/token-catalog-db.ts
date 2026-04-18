import { bootstrapDatabase } from '../../../apps/ds-dashboard/server/db/pg-db-service.js';
import { TokenRepository } from '../../../apps/ds-dashboard/server/db/token-repository.js';
import type { TokenCatalog } from './token-types.js';

export interface TokenCatalogDbRow {
  path: string;
  cssVar: string;
  type: string;
  resolvedValue: string;
  collection: string;
  aliasOf: string | null;
}

export function buildTokenCatalogFromDbRows(
  rows: TokenCatalogDbRow[],
  generatedAt: string = new Date().toISOString(),
): TokenCatalog {
  return {
    entries: rows.map((row) => ({
      id: row.path,
      path: row.path,
      $value: row.resolvedValue,
      type: row.type,
      collection: row.collection,
      cssVar: row.cssVar,
      aliases: row.aliasOf ? [row.aliasOf] : undefined,
    })),
    meta: {
      generatedAt,
      version: 'database',
    },
  };
}

export async function loadTokenCatalogFromDatabase(options: {
  databaseUrl: string;
  systemId: string;
}): Promise<TokenCatalog> {
  const databaseUrl = String(options.databaseUrl || '').trim();
  if (!databaseUrl) {
    throw new Error('Database URL is required to load the token registry.');
  }

  const sql = await bootstrapDatabase(databaseUrl);
  try {
    const repository = new TokenRepository(sql);
    const registry = await repository.getTokenCatalog(options.systemId);
    return buildTokenCatalogFromDbRows(registry.entries);
  } finally {
    await sql.end();
  }
}
