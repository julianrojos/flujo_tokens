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
 * value (or first available), and optionally writes split CSS files to the
 * output directory.
 *
 * Pass `skipDiskWrite: true` when the caller will handle the disk writes itself
 * (e.g. to overlap them with other async work). The returned `primitivesPath`
 * and `tokensPath` still reflect the expected paths even when skipped.
 */
export async function generateTokenCssFromDb(options: {
  db: Sql;
  dsId: string;
  repoRoot: string;
  skipDiskWrite?: boolean;
}): Promise<GenerateTokenCssResult> {
  const { db, dsId, repoRoot, skipDiskWrite = false } = options;
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

  const rawRows = (tokenRows as Array<
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

  // Build a dot-path → css_var lookup.
  //
  // Token IDs stored in the DB are the dot-path representation of the Figma
  // variable name (e.g. "Color.Grey.100"). When a token is an alias its
  // resolved_value is the dot-path of the target token rather than a concrete
  // CSS value (e.g. "Color.Grey.100" instead of "#ECECEC" or
  // "var(--color-grey-100)"). Leaving that string as-is produces invalid CSS
  // and prevents the alias-chain scanner from detecting the relationship.
  //
  // We resolve one pass here: any resolved_value that exactly matches a known
  // token dot-path is rewritten to var(<target-css-var>) so that:
  //   --bottom-bar-background-default: var(--color-grey-100);
  // is emitted instead of the opaque Figma path string.
  const dotPathToCssVar = new Map<string, string>(
    rawRows.map((r) => [String(r.id || '').trim(), r.css_var]),
  );

  const rows = rawRows.map((row) => {
    const rv = String(row.resolved_value || '').trim();
    const aliasCssVar = rv ? dotPathToCssVar.get(rv) : undefined;
    return aliasCssVar
      ? { ...row, resolved_value: `var(${aliasCssVar})` }
      : row;
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

  const primitivesPath = path.join(paths.outputDir, 'primitives.css');
  const tokensPath = path.join(paths.outputDir, 'tokens.css');

  const primitivesCss = buildCssBlock(primitives);
  const tokensCss = buildCssBlock(tokens);

  if (!skipDiskWrite) {
    fs.mkdirSync(paths.outputDir, { recursive: true });
    fs.writeFileSync(primitivesPath, primitivesCss, 'utf-8');
    fs.writeFileSync(tokensPath, tokensCss, 'utf-8');
  }

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

/**
 * Writes the CSS files from a GenerateTokenCssResult to disk asynchronously.
 *
 * Callers that used `skipDiskWrite: true` in generateTokenCssFromDb can call
 * this to flush the CSS to disk independently from the main generation step,
 * allowing the write to overlap with other async work.
 */
export async function flushCssToDisk(result: GenerateTokenCssResult): Promise<void> {
  await fs.promises.mkdir(path.dirname(result.primitivesPath), { recursive: true });
  await Promise.all([
    fs.promises.writeFile(result.primitivesPath, result.primitivesCss, 'utf-8'),
    fs.promises.writeFile(result.tokensPath, result.tokensCss, 'utf-8'),
  ]);
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
