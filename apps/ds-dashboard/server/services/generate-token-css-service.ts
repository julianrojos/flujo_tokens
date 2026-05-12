/**
 * Generates CSS custom property files from the token registry in the database.
 *
 * Produces output/primitives.css (Primitives collection) and output/tokens.css
 * (all other collections) so that the token usage scan can run without requiring
 * the separate file-based tooling pipeline.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { Sql } from 'postgres';

import { resolveSystemPaths } from '../db/design-system-repository.js';

interface TokenRow {
  id: string;
  css_var: string;
  collection: string;
  type: string;
  resolved_value: string;
}

export interface GenerateTokenCssResult {
  primitivesCount: number;
  tokensCount: number;
  primitivesPath: string;
  tokensPath: string;
  primitivesCss: string;
  tokensCss: string;
  tokenCatalog: {
    entries: Array<{
      id: string;
      path: string;
      $value: string;
      type: string;
      collection: string;
      cssVar: string;
    }>;
  };
}

/**
 * Queries all tokens for a design system from the DB, picks the default mode
 * value (or first available), and writes split CSS files to the output directory.
 */
export async function generateTokenCssFromDb(options: {
  db: Sql;
  dsId: string;
  repoRoot: string;
}): Promise<GenerateTokenCssResult> {
  const { db, dsId, repoRoot } = options;
  const paths = resolveSystemPaths(dsId, repoRoot);

  const [tokenRows, modeValueRows] = await Promise.all([
    db`
      SELECT
        t.id,
        t.css_var,
        t.collection,
        t.type,
        t.raw_value
      FROM tokens t
      WHERE t.ds_id = ${dsId}
      ORDER BY t.collection, t.id
    `,
    db`
      SELECT
        tmv.token_path,
        tmv.mode,
        tmv.resolved_value
      FROM token_mode_values tmv
      WHERE tmv.ds_id = ${dsId}
      ORDER BY tmv.token_path, tmv.id
    `,
  ]);

  const modeValueMap = new Map<
    string,
    {
      defaultValue: string | null;
      firstValue: string | null;
    }
  >();
  for (const row of modeValueRows as Array<{
    token_path: string;
    mode: string;
    resolved_value: string;
  }>) {
    const tokenPath = String(row.token_path || '').trim();
    if (!tokenPath) continue;
    const mode = String(row.mode || '').trim().toLowerCase();
    const existing =
      modeValueMap.get(tokenPath) || { defaultValue: null, firstValue: null };
    if (existing.firstValue == null) {
      existing.firstValue = row.resolved_value == null ? null : String(row.resolved_value);
    }
    if (mode === 'default' && existing.defaultValue == null) {
      existing.defaultValue = row.resolved_value == null ? null : String(row.resolved_value);
    }
    modeValueMap.set(tokenPath, existing);
  }

  const rows = (tokenRows as Array<
    {
      id: string;
      css_var: string;
      collection: string;
      type: string;
      raw_value: string;
    }
  >).map((row) => {
    const modeValue = modeValueMap.get(String(row.id || '').trim());
    const resolvedValue = modeValue?.defaultValue ?? modeValue?.firstValue ?? row.raw_value;
    return {
      id: row.id,
      css_var: row.css_var,
      collection: row.collection,
      type: row.type,
      resolved_value: resolvedValue == null ? '' : String(resolvedValue),
    };
  });

  const tokenCatalog = {
    entries: rows.map((row) => ({
      id: row.id,
      path: row.id,
      $value: row.resolved_value,
      type: row.type,
      collection: row.collection,
      cssVar: row.css_var,
    })),
  };

  const primitives: TokenRow[] = [];
  const tokens: TokenRow[] = [];

  for (const row of rows) {
    if (row.collection.toLowerCase() === 'primitives') {
      primitives.push(row);
    } else {
      tokens.push(row);
    }
  }

  fs.mkdirSync(paths.outputDir, { recursive: true });

  const primitivesPath = path.join(paths.outputDir, 'primitives.css');
  const tokensPath = path.join(paths.outputDir, 'tokens.css');

  const primitivesCss = buildCssBlock(primitives);
  const tokensCss = buildCssBlock(tokens);

  fs.writeFileSync(primitivesPath, primitivesCss, 'utf-8');
  fs.writeFileSync(tokensPath, tokensCss, 'utf-8');

  return {
    primitivesCount: primitives.length,
    tokensCount: tokens.length,
    primitivesPath,
    tokensPath,
    primitivesCss,
    tokensCss,
    tokenCatalog,
  };
}

function buildCssBlock(rows: TokenRow[]): string {
  if (rows.length === 0) return ':root {}\n';
  const declarations = rows
    .map((row) => `  ${row.css_var}: ${sanitizeCssValue(row.resolved_value)};`)
    .join('\n');
  return `:root {\n${declarations}\n}\n`;
}

function sanitizeCssValue(value: string): string {
  // Strip any embedded newlines/nulls that could break the CSS block
  return String(value ?? '').replace(/[\r\n\0]/g, ' ').trim() || 'unset';
}
