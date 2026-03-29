import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { stripDiacritics } from '../../../../tooling/src/utils/strip-diacritics.js';
import type { FigmaVariable, FigmaVariableCollection, FigmaVariablesResponse } from '../../../../tooling/src/utils/figma.ts';
import { fetchVariablesDirect, searchComponentsDirect } from './figma-direct-bridge-service.ts';
import type { ComponentRepository } from '../db/component-repository.js';

type TokenRow = {
  id: string;
  slashPath: string;
  cssVar: string;
  type: string;
  collection: string;
  rawValue: string;
};

type TokenModeValueRow = {
  tokenPath: string;
  mode: string;
  resolvedValue: string;
};

type AliasRow = {
  fromPath: string;
  toPath: string;
  modes: string[];
};

function normalizeSegments(rawName: string): string[] {
  return String(rawName || '')
    .split('/')
    .map((segment) => stripDiacritics(String(segment || '').trim()))
    .filter(Boolean);
}

function toTokenPaths(rawName: string): { path: string; slashPath: string; cssVar: string } {
  const segments = normalizeSegments(rawName);
  const slashPath = segments.join('/');
  const path = segments.join('.');
  const cssStem = segments
    .join('-')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  const cssVar = `--${cssStem || 'token'}`;
  return { path, slashPath, cssVar };
}

function normalizeType(resolvedType: string): string {
  const type = String(resolvedType || '').trim().toUpperCase();
  if (type === 'COLOR') return 'color';
  if (type === 'FLOAT') return 'dimension';
  if (type === 'STRING') return 'string';
  if (type === 'BOOLEAN') return 'boolean';
  return 'string';
}

function toHexByte(value: number): string {
  const clamped = Math.max(0, Math.min(1, Number(value || 0)));
  return Math.round(clamped * 255).toString(16).padStart(2, '0');
}

function figmaColorToHex(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  const r = toHexByte(Number(value.r));
  const g = toHexByte(Number(value.g));
  const b = toHexByte(Number(value.b));
  const a = toHexByte(Number(value.a ?? 1));
  if (a === 'ff') return `#${r}${g}${b}`.toUpperCase();
  return `#${r}${g}${b}${a}`.toUpperCase();
}

function toModeNameMap(collections: Record<string, FigmaVariableCollection>): Map<string, Map<string, string>> {
  const byCollectionId = new Map<string, Map<string, string>>();
  for (const collection of Object.values(collections || {})) {
    const modes = new Map<string, string>();
    for (const mode of collection.modes || []) {
      const modeId = String(mode?.modeId || '').trim();
      if (!modeId) continue;
      modes.set(modeId, String(mode?.name || modeId).trim() || modeId);
    }
    byCollectionId.set(String(collection.id || ''), modes);
  }
  return byCollectionId;
}

function toResolvedValue(raw: unknown, idToPath: Map<string, string>): string {
  if (raw && typeof raw === 'object') {
    const objectValue = raw as Record<string, unknown>;
    if (String(objectValue.type || '').trim().toUpperCase() === 'VARIABLE_ALIAS') {
      const aliasId = String(objectValue.id || '').trim();
      return idToPath.get(aliasId) || aliasId;
    }
    const colorHex = figmaColorToHex(raw);
    if (colorHex) return colorHex;
    return JSON.stringify(raw);
  }
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'number' || typeof raw === 'boolean') return String(raw);
  return '';
}

function parseFileKey(figmaUrl: string): string | null {
  const raw = String(figmaUrl || '').trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const segments = url.pathname.split('/').filter(Boolean);
    for (let i = 0; i < segments.length - 1; i += 1) {
      if (segments[i] === 'file' || segments[i] === 'design') {
        return segments[i + 1] || null;
      }
    }
  } catch {
    return null;
  }
  return null;
}

function buildTokenRows(meta: FigmaVariablesResponse['meta']): {
  tokens: TokenRow[];
  modeValues: TokenModeValueRow[];
  aliases: AliasRow[];
  graphJson: string;
} {
  const variables = Object.values(meta?.variables || {});
  const collections = meta?.variableCollections || {};
  const modeNameMapByCollectionId = toModeNameMap(collections);

  const idToPath = new Map<string, string>();
  for (const variable of variables) {
    const variableId = String(variable?.id || '').trim();
    const { path } = toTokenPaths(String(variable?.name || ''));
    if (!variableId || !path) continue;
    idToPath.set(variableId, path);
  }

  const tokens: TokenRow[] = [];
  const modeValuesByKey = new Map<string, TokenModeValueRow>();
  const aliasModes = new Map<string, Set<string>>();

  for (const variable of variables) {
    const variableId = String(variable?.id || '').trim();
    const { path, slashPath, cssVar } = toTokenPaths(String(variable?.name || ''));
    if (!variableId || !path || !slashPath) continue;

    const collection = collections[String(variable.variableCollectionId || '')];
    const collectionName = String(collection?.name || 'default').trim() || 'default';
    const type = normalizeType(String(variable.resolvedType || ''));
    const modeNameMap = modeNameMapByCollectionId.get(String(variable.variableCollectionId || '')) || new Map<string, string>();

    const localModeValues: TokenModeValueRow[] = [];
    for (const [modeId, rawValue] of Object.entries(variable.valuesByMode || {})) {
      const mode = modeNameMap.get(modeId) || String(modeId || '').trim() || 'Default';
      const resolvedValue = toResolvedValue(rawValue, idToPath);
      localModeValues.push({ tokenPath: path, mode, resolvedValue });

      const aliasType = rawValue && typeof rawValue === 'object'
        ? String((rawValue as Record<string, unknown>).type || '').trim().toUpperCase()
        : '';
      if (aliasType === 'VARIABLE_ALIAS') {
        const aliasId = String((rawValue as Record<string, unknown>).id || '').trim();
        const targetPath = idToPath.get(aliasId);
        if (targetPath) {
          const key = `${path}::${targetPath}`;
          const modes = aliasModes.get(key) || new Set<string>();
          modes.add(mode);
          aliasModes.set(key, modes);
        }
      }
    }

    if (localModeValues.length === 0) continue;
    const preferred =
      localModeValues.find((entry) => entry.mode === 'Default') ||
      localModeValues.find((entry) => entry.mode.toLowerCase() === 'default') ||
      localModeValues[0];

    tokens.push({
      id: path,
      slashPath,
      cssVar,
      type,
      collection: collectionName,
      rawValue: preferred.resolvedValue,
    });
    for (const modeValue of localModeValues) {
      const modeKey = `${modeValue.tokenPath}\x00${modeValue.mode}`;
      // Last writer wins to stay aligned with tokens_staging INSERT OR REPLACE semantics.
      modeValuesByKey.set(modeKey, modeValue);
    }
  }

  const aliases: AliasRow[] = Array.from(aliasModes.entries()).map(([edge, modes]) => {
    const [fromPath, toPath] = edge.split('::');
    return {
      fromPath,
      toPath,
      modes: Array.from(modes).sort((a, b) => a.localeCompare(b)),
    };
  });

  const graphJson = JSON.stringify({
    timestamp: new Date().toISOString(),
    graph: {
      nodes: tokens.map((token) => ({
        path: token.id,
        type: token.type,
        cssVar: token.cssVar,
      })),
      edges: aliases.map((alias) => ({
        from: alias.fromPath,
        to: alias.toPath,
        type: 'figma-alias',
      })),
    },
  });

  return { tokens, modeValues: Array.from(modeValuesByKey.values()), aliases, graphJson };
}

function slugifyComponentName(name: string): string {
  return stripDiacritics(String(name || '').trim())
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'component';
}

function uniqueSlug(baseSlug: string, used: Set<string>): string {
  if (!used.has(baseSlug)) {
    used.add(baseSlug);
    return baseSlug;
  }
  let counter = 2;
  while (used.has(`${baseSlug}-${counter}`)) counter += 1;
  const next = `${baseSlug}-${counter}`;
  used.add(next);
  return next;
}

export interface SyncFromPluginOptions {
  db: Database.Database;
  componentRepo: ComponentRepository;
  dsId: string;
  figmaFileId: string;
  includeComponents?: boolean;
  dryRun?: boolean;
  fetchVariables?: (fileKey?: string | null) => Promise<FigmaVariablesResponse>;
  searchComponents?: (fileKey: string | null, params: {
    includeVariants?: boolean;
    compact?: boolean;
    limit?: number;
  }) => Promise<{
    components: Array<{ nodeId: string; name: string }>;
    truncated?: boolean;
  }>;
  createRunId?: () => string;
}

export interface SyncFromPluginResult {
  tokens: number;
  tokenModeValues: number;
  aliases: number;
  components: number;
  componentsTruncated: boolean;
  usageRestored: number;
  usageDropped: number;
  dryRun: boolean;
}

export async function syncDesignSystemFromPlugin(options: SyncFromPluginOptions): Promise<SyncFromPluginResult> {
  const {
    db,
    componentRepo,
    dsId,
    figmaFileId,
    includeComponents = true,
    dryRun = false,
    fetchVariables = fetchVariablesDirect,
    searchComponents = searchComponentsDirect,
    createRunId = randomUUID,
  } = options;

  const variablesResponse = await fetchVariables(figmaFileId);
  const { tokens, modeValues, aliases, graphJson } = buildTokenRows(variablesResponse.meta);

  let componentEntries: Array<{
    slug: string;
    name: string;
    status: 'draft';
    docType: 'component';
    figma: { fileUrl: string; componentSetNodeId: string };
  }> = [];
  let componentsTruncated = false;

  if (includeComponents) {
    const componentsResult = await searchComponents(figmaFileId, {
      includeVariants: false,
      compact: true,
      limit: 200,
    });
    componentsTruncated = componentsResult.truncated === true;
    const usedSlugs = new Set<string>();
    const figmaFileUrl = `https://www.figma.com/design/${encodeURIComponent(figmaFileId)}`;
    componentEntries = (componentsResult.components || []).map((entry) => {
      const slug = uniqueSlug(slugifyComponentName(entry.name), usedSlugs);
      return {
        slug,
        name: String(entry.name || '').trim() || slug,
        status: 'draft' as const,
        docType: 'component' as const,
        figma: {
          fileUrl: figmaFileUrl,
          componentSetNodeId: String(entry.nodeId || '').trim(),
        },
      };
    });
  }

  if (!dryRun) {
    const runId = createRunId();
    const usageRows = db.prepare(`
      SELECT token_id, kind, source, owner, detail
      FROM token_usage_occurrences
      WHERE ds_id = ?
    `).all(dsId) as Array<{
      token_id: string;
      kind: string;
      source: string;
      owner: string;
      detail: string;
    }>;
    let usageRestored = 0;
    let usageDropped = 0;

    // Stage
    db.transaction(() => {
      db.prepare('DELETE FROM tokens_staging WHERE run_id = ? AND ds_id = ?').run(runId, dsId);
      db.prepare('DELETE FROM token_mode_values_staging WHERE run_id = ? AND ds_id = ?').run(runId, dsId);
      db.prepare('DELETE FROM figma_aliases_staging WHERE run_id = ? AND ds_id = ?').run(runId, dsId);

      const insertTokenStaging = db.prepare(`
        INSERT OR REPLACE INTO tokens_staging (id, run_id, ds_id, slash_path, css_var, type, collection, raw_value)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const token of tokens) {
        insertTokenStaging.run(token.id, runId, dsId, token.slashPath, token.cssVar, token.type, token.collection, token.rawValue);
      }

      const insertModeStaging = db.prepare(`
        INSERT INTO token_mode_values_staging (run_id, ds_id, token_path, mode, resolved_value)
        VALUES (?, ?, ?, ?, ?)
      `);
      for (const modeValue of modeValues) {
        insertModeStaging.run(runId, dsId, modeValue.tokenPath, modeValue.mode, modeValue.resolvedValue);
      }

      const insertAliasStaging = db.prepare(`
        INSERT OR IGNORE INTO figma_aliases_staging (run_id, ds_id, from_path, to_path, modes)
        VALUES (?, ?, ?, ?, ?)
      `);
      for (const alias of aliases) {
        insertAliasStaging.run(runId, dsId, alias.fromPath, alias.toPath, JSON.stringify(alias.modes));
      }
    })();

    // Validate
    const tokenCount = (db.prepare('SELECT COUNT(*) as count FROM tokens_staging WHERE run_id = ? AND ds_id = ?').get(runId, dsId) as { count: number }).count;
    if (tokenCount === 0) {
      throw new Error('No tokens in staging after import — aborting swap');
    }

    const orphanAliasCount = (db.prepare(`
      SELECT COUNT(*) as count
      FROM figma_aliases_staging sa
      WHERE sa.run_id = ? AND sa.ds_id = ?
        AND (
          NOT EXISTS (SELECT 1 FROM tokens_staging st WHERE st.run_id = sa.run_id AND st.ds_id = sa.ds_id AND st.id = sa.from_path)
          OR NOT EXISTS (SELECT 1 FROM tokens_staging st WHERE st.run_id = sa.run_id AND st.ds_id = sa.ds_id AND st.id = sa.to_path)
        )
    `).get(runId, dsId) as { count: number }).count;
    if (orphanAliasCount > 0) {
      throw new Error(`Staging contains ${orphanAliasCount} figma aliases with missing token endpoints — aborting swap`);
    }

    const orphanModeCount = (db.prepare(`
      SELECT COUNT(*) as count
      FROM token_mode_values_staging sm
      WHERE sm.run_id = ? AND sm.ds_id = ?
        AND NOT EXISTS (
          SELECT 1
          FROM tokens_staging st
          WHERE st.run_id = sm.run_id
            AND st.ds_id = sm.ds_id
            AND st.id = sm.token_path
        )
    `).get(runId, dsId) as { count: number }).count;
    if (orphanModeCount > 0) {
      throw new Error(`Staging contains ${orphanModeCount} mode value rows with missing token endpoints — aborting swap`);
    }

    // Swap
    db.transaction(() => {
      db.prepare('DELETE FROM token_mode_values WHERE ds_id = ?').run(dsId);
      db.prepare('DELETE FROM tokens WHERE ds_id = ?').run(dsId);
      db.prepare('DELETE FROM figma_aliases WHERE ds_id = ?').run(dsId);
      db.prepare('DELETE FROM token_graph WHERE ds_id = ?').run(dsId);

      db.prepare(`
        INSERT INTO tokens (id, ds_id, slash_path, css_var, type, collection, raw_value)
        SELECT id, ds_id, slash_path, css_var, type, collection, raw_value
        FROM tokens_staging WHERE run_id = ? AND ds_id = ?
      `).run(runId, dsId);

      db.prepare(`
        INSERT INTO token_mode_values (ds_id, token_path, mode, resolved_value)
        SELECT ds_id, token_path, mode, resolved_value
        FROM (
          SELECT
            ds_id,
            token_path,
            mode,
            resolved_value,
            ROW_NUMBER() OVER (
              PARTITION BY ds_id, token_path, mode
              ORDER BY id DESC
            ) AS rn
          FROM token_mode_values_staging
          WHERE run_id = ? AND ds_id = ?
        ) dedup
        WHERE dedup.rn = 1
      `).run(runId, dsId);

      db.prepare(`
        INSERT OR IGNORE INTO figma_aliases (ds_id, from_path, to_path, modes)
        SELECT ds_id, from_path, to_path, modes
        FROM figma_aliases_staging WHERE run_id = ? AND ds_id = ?
      `).run(runId, dsId);

      const tokenRows = db.prepare(`
        SELECT id
        FROM tokens
        WHERE ds_id = ?
      `).all(dsId) as Array<{ id: string }>;
      const existingTokenIds = new Set(tokenRows.map((row) => row.id));
      const restoreUsageStmt = db.prepare(`
        INSERT OR IGNORE INTO token_usage_occurrences (ds_id, token_id, kind, source, owner, detail)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      for (const usage of usageRows) {
        if (!existingTokenIds.has(usage.token_id)) {
          usageDropped += 1;
          continue;
        }
        restoreUsageStmt.run(dsId, usage.token_id, usage.kind, usage.source, usage.owner, usage.detail);
        usageRestored += 1;
      }

      db.prepare(`
        INSERT INTO token_graph (ds_id, graph_json, generated_at)
        VALUES (?, ?, strftime('%s', 'now'))
      `).run(dsId, graphJson);

      db.prepare('DELETE FROM tokens_staging WHERE run_id = ? AND ds_id = ?').run(runId, dsId);
      db.prepare('DELETE FROM token_mode_values_staging WHERE run_id = ? AND ds_id = ?').run(runId, dsId);
      db.prepare('DELETE FROM figma_aliases_staging WHERE run_id = ? AND ds_id = ?').run(runId, dsId);
    })();

    if (includeComponents) {
      componentRepo.upsertFromRegistry(dsId, componentEntries);
      // Only mark missing when the component list is complete.
      // If truncated, marking missing would create false positives for components not fetched yet.
      if (!componentsTruncated) {
        const syncedSlugs = componentEntries.map((e) => e.slug);
        const markedMissing = componentRepo.markMissingComponents(dsId, syncedSlugs);
        if (markedMissing > 0) {
          console.log(`  Marked ${markedMissing} component(s) as missing (removed from Figma).`);
        }
      } else {
        console.warn('  Component search results were truncated; missing-component reconciliation skipped.');
      }
    }
    if (usageDropped > 0) {
      console.warn(`  Dropped ${usageDropped} token-usage row(s) referencing removed tokens.`);
    }
    return {
      tokens: tokens.length,
      tokenModeValues: modeValues.length,
      aliases: aliases.length,
      components: componentEntries.length,
      componentsTruncated,
      usageRestored,
      usageDropped,
      dryRun,
    };
  }

  return {
    tokens: tokens.length,
    tokenModeValues: modeValues.length,
    aliases: aliases.length,
    components: componentEntries.length,
    componentsTruncated,
    usageRestored: 0,
    usageDropped: 0,
    dryRun,
  };
}

export function resolveFileKeyForSystem(figmaFileId: string | undefined, body: Record<string, unknown>): string {
  const fromSystem = String(figmaFileId || '').trim();
  const fromBodyFileKey = String(body.fileKey || body['file-key'] || '').trim();
  const fromBodyUrl = parseFileKey(String(body.url || body.figmaUrl || '').trim());
  return fromBodyFileKey || fromBodyUrl || fromSystem;
}
