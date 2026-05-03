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
  resolved_value: string;
}

export interface GenerateTokenCssResult {
  primitivesCount: number;
  tokensCount: number;
  primitivesPath: string;
  tokensPath: string;
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

  const rows = (await db`
    SELECT
      t.id,
      t.css_var,
      t.collection,
      COALESCE(
        (
          SELECT tmv.resolved_value
          FROM token_mode_values tmv
          WHERE tmv.ds_id = t.ds_id
            AND tmv.token_path = t.id
            AND lower(tmv.mode) = 'default'
          LIMIT 1
        ),
        (
          SELECT tmv.resolved_value
          FROM token_mode_values tmv
          WHERE tmv.ds_id = t.ds_id
            AND tmv.token_path = t.id
          ORDER BY tmv.id
          LIMIT 1
        ),
        t.raw_value
      ) AS resolved_value
    FROM tokens t
    WHERE t.ds_id = ${dsId}
    ORDER BY t.collection, t.id
  `) as TokenRow[];

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

  fs.writeFileSync(primitivesPath, buildCssBlock(primitives), 'utf-8');
  fs.writeFileSync(tokensPath, buildCssBlock(tokens), 'utf-8');

  return {
    primitivesCount: primitives.length,
    tokensCount: tokens.length,
    primitivesPath,
    tokensPath,
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
