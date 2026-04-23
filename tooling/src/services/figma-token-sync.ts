/**
 * Figma Token Sync Service
 *
 * Shared module for importing Figma local variables into the token database
 * from Figma variables.
 */

import { fetchFigmaLocalVariables, type FigmaVariablesResponse } from '../utils/figma-api.js';
import { fetchFigmaLocalVariablesViaMcp } from './figma-mcp-variables.js';
import { normalizeTokenTypeFromFigma } from '@flujo/shared';
import { stripDiacritics } from '../utils/strip-diacritics.js';
import type { FigmaVariableSource as SharedFigmaVariableSource } from 'ds-types';
import { resolveParseFigmaVariableSource } from '../utils/figma-variable-source.js';
import { bootstrapDatabase } from '../../../apps/ds-dashboard/server/db/pg-db-service.js';

const parseFigmaVariableSource = resolveParseFigmaVariableSource() as (
  rawValue: unknown,
  options?: { defaultValue?: SharedFigmaVariableSource; optionName?: string },
) => SharedFigmaVariableSource;

/**
 * Sanitize a collection name to a valid file stem.
 * Normalizes diacritics (accents) to ASCII base characters.
 */
export function sanitizeCollectionFileStem(rawName: string, fallback = 'imported'): string {
  const normalized = stripDiacritics(String(rawName || '').trim())
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || (fallback || 'imported').toLowerCase();
}

/**
 * Check if value is a plain object.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Check if value has token node shape.
 */
function isTokenNodeShape(value: unknown): boolean {
  return (
    isPlainObject(value) &&
    Object.prototype.hasOwnProperty.call(value, '$value')
  );
}

// ─── Figma variable normalization ─────────────────────────────────────────────

/**
 * Normalize Figma variable collections into a map.
 */
export function normalizeVariableCollections(rawCollections: unknown): Map<string, Record<string, unknown>> {
  const index = new Map<string, Record<string, unknown>>();
  if (Array.isArray(rawCollections)) {
    for (const entry of rawCollections) {
      const id = String(entry?.id || '').trim();
      if (!id) continue;
      index.set(id, entry as Record<string, unknown>);
    }
    return index;
  }
  if (rawCollections && typeof rawCollections === 'object') {
    for (const entry of Object.values(rawCollections)) {
      const id = String(entry?.id || '').trim();
      if (!id) continue;
      index.set(id, entry as Record<string, unknown>);
    }
  }
  return index;
}

/**
 * Normalize variables list from various input shapes.
 */
export function normalizeVariablesList(rawVariables: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(rawVariables)) return rawVariables as Array<Record<string, unknown>>;
  if (rawVariables && typeof rawVariables === 'object') {
    return Object.values(rawVariables) as Array<Record<string, unknown>>;
  }
  return [];
}

/**
 * Pick all mode values from a variable record.
 */
export function pickAllModeValues(
  variableRecord: Record<string, unknown>,
  collectionRecord: Record<string, unknown> | null
): Map<string, unknown> {
  const valuesByMode =
    variableRecord && typeof variableRecord.valuesByMode === 'object'
      ? variableRecord.valuesByMode as Record<string, unknown>
      : {};
  const results = new Map<string, unknown>();

  if (Array.isArray(collectionRecord?.modes)) {
    for (const mode of collectionRecord.modes) {
      const modeId = String(mode?.modeId || '').trim();
      const modeName = String(mode?.name || modeId).trim();
      if (!modeId) continue;
      if (Object.prototype.hasOwnProperty.call(valuesByMode, modeId)) {
        const val = valuesByMode[modeId];
        if (val !== undefined && val !== null) {
          results.set(modeName, val);
        }
      }
    }
  }

  if (results.size === 0) {
    for (const [modeId, val] of Object.entries(valuesByMode)) {
      if (val !== undefined && val !== null) {
        results.set(modeId, val);
      }
    }
  }

  return results;
}

/**
 * Normalize Figma resolved type to DTCG type.
 */
function normalizeFigmaResolvedType(args: {
  rawType: string;
  variableName?: string;
}): string {
  return normalizeTokenTypeFromFigma({
    resolvedType: args.rawType,
    variableName: args.variableName,
  });
}

/**
 * Convert a 0-1 value to a hex byte.
 */
function toHexByte(value: number): string {
  const clamped = Math.max(0, Math.min(1, Number(value || 0)));
  const byte = Math.round(clamped * 255);
  return byte.toString(16).padStart(2, '0');
}

/**
 * Convert Figma color object to hex string.
 */
function figmaColorToHex(colorValue: Record<string, unknown> | null): string | null {
  if (!colorValue || typeof colorValue !== 'object') return null;
  const r = toHexByte(colorValue.r as number);
  const g = toHexByte(colorValue.g as number);
  const b = toHexByte(colorValue.b as number);
  const a = toHexByte(Number(colorValue.a ?? 1));
  // Use uppercase for CSS hex color convention
  if (a === 'ff') return `#${r}${g}${b}`.toUpperCase();
  return `#${r}${g}${b}${a}`.toUpperCase();
}

export interface TokenNode {
  $value: unknown;
  $type: string;
  $id?: string;
}

/**
 * Build a token node from a Figma variable record.
 */
export function buildTokenNodeFromFigmaVariable(
  variableRecord: Record<string, unknown>,
  rawValue: unknown
): TokenNode | null {
  const resolvedType = normalizeFigmaResolvedType({
    rawType: variableRecord?.resolvedType as string,
    variableName: String(variableRecord?.name || ''),
  });
  let normalizedValue = rawValue;
  if (resolvedType === 'color') {
    if (
      rawValue &&
      typeof rawValue === 'object' &&
      String((rawValue as Record<string, unknown>).type || '').trim().toUpperCase() === 'VARIABLE_ALIAS'
    ) {
      normalizedValue = {
        type: 'VARIABLE_ALIAS',
        id: String((rawValue as Record<string, unknown>).id || '').trim(),
      };
    } else {
      normalizedValue = figmaColorToHex(rawValue as Record<string, unknown> | null);
    }
  }

  if (
    normalizedValue &&
    typeof normalizedValue === 'object' &&
    String((normalizedValue as Record<string, unknown>).type || '').trim().toUpperCase() === 'VARIABLE_ALIAS'
  ) {
    const aliasId = String((normalizedValue as Record<string, unknown>).id || '').trim();
    if (!aliasId) return null;
    return {
      $id: String(variableRecord?.id || '').trim() || undefined,
      $value: { type: 'VARIABLE_ALIAS', id: aliasId },
      $type: resolvedType,
    };
  }

  if (resolvedType === 'color' && typeof normalizedValue !== 'string') return null;
  if (resolvedType === 'dimension' && typeof normalizedValue !== 'number') return null;
  if (
    resolvedType === 'fontWeight' &&
    typeof normalizedValue !== 'number' &&
    typeof normalizedValue !== 'string'
  ) {
    return null;
  }
  if (resolvedType === 'string' && typeof normalizedValue !== 'string') return null;
  if (resolvedType === 'fontFamily' && typeof normalizedValue !== 'string') return null;
  if (resolvedType === 'boolean' && typeof normalizedValue !== 'boolean') return null;

  const tokenNode: TokenNode = {
    $value: normalizedValue,
    $type: resolvedType,
  };
  const tokenId = String(variableRecord?.id || '').trim();
  if (tokenId) {
    tokenNode.$id = tokenId;
  }
  return tokenNode;
}

/**
 * Assign a token node at a path in a target object.
 */
export function assignTokenAtPath(
  targetRoot: Record<string, unknown>,
  pathSegments: string[],
  tokenNode: TokenNode
): boolean {
  if (!targetRoot || typeof targetRoot !== 'object') return false;
  if (!Array.isArray(pathSegments) || pathSegments.length === 0) return false;
  let cursor: Record<string, unknown> = targetRoot;
  for (let index = 0; index < pathSegments.length - 1; index += 1) {
    const part = String(pathSegments[index] || '').trim();
    if (!part) return false;
    const current = cursor[part];
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      cursor[part] = {};
    }
    cursor = cursor[part] as Record<string, unknown>;
  }
  const leaf = String(pathSegments[pathSegments.length - 1] || '').trim();
  if (!leaf) return false;
  cursor[leaf] = tokenNode;
  return true;
}

// ─── Deep merge for --merge mode ──────────────────────────────────────────────

/**
 * Deep merge two token trees.
 */
export function mergeTokenTrees(base: unknown, incoming: unknown): unknown {
  if (!base || typeof base !== 'object') return incoming;
  if (!incoming || typeof incoming !== 'object') return base;
  // Token/group shape collisions must replace, not merge, to avoid invalid DTCG nodes.
  if (isTokenNodeShape(base) || isTokenNodeShape(incoming)) {
    return incoming;
  }
  const result = { ...base } as Record<string, unknown>;
  for (const [key, value] of Object.entries(incoming)) {
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      result[key] &&
      typeof result[key] === 'object' &&
      !Array.isArray(result[key])
    ) {
      result[key] = mergeTokenTrees(result[key] as Record<string, unknown>, value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
}

// ─── Build files map from Figma variables payload ────────────────────────────

interface FilesMapPayload {
  description: string;
  data: Record<string, unknown>;
}

export interface BuildFilesMapResult {
  filesMap: Map<string, FilesMapPayload>;
  tokenCount: number;
}
/**
 * Build a map of files from Figma variables payload.
 */
export function buildFilesMapFromVariables(meta: Record<string, unknown> | null): BuildFilesMapResult {
  const collectionsIndex = normalizeVariableCollections(meta?.variableCollections);
  const variableRecords = normalizeVariablesList(meta?.variables);
  const filesMap = new Map<string, FilesMapPayload>();
  let tokenCount = 0;

  for (const variableRecord of variableRecords) {
    if (!variableRecord || typeof variableRecord !== 'object') continue;
    const variableName = String(variableRecord.name || '').trim();
    if (!variableName) continue;

    const collectionId = String(variableRecord.variableCollectionId || '').trim();
    const collectionRecord = collectionsIndex.get(collectionId) || null;
    const collectionName =
      String(collectionRecord?.name || 'Imported').trim() || 'Imported';
    const collectionFileStem = sanitizeCollectionFileStem(collectionName, 'imported');

    const modeValues = pickAllModeValues(variableRecord, collectionRecord);
    if (modeValues.size === 0) continue;

    for (const [modeName, modeValue] of modeValues) {
      const fileKey =
        modeValues.size === 1
          ? collectionFileStem
          : `${collectionFileStem}-${sanitizeCollectionFileStem(modeName as string, 'default')}`;

      const tokenNode = buildTokenNodeFromFigmaVariable(variableRecord, modeValue);
      if (!tokenNode) continue;

      if (!filesMap.has(fileKey)) {
        filesMap.set(fileKey, {
          description:
            modeValues.size === 1
              ? collectionName
              : `${collectionName} (${modeName})`,
          data: {},
        });
      }

      const target = filesMap.get(fileKey)!;
      const pathSegments = variableName
        .split('/')
        .map((segment) => {
          const trimmed = String(segment || '').trim();
          // Normalize diacritics in the entire path segment
          return stripDiacritics(trimmed);
        })
        .filter(Boolean);
      if (pathSegments.length === 0) continue;
      const assigned = assignTokenAtPath(target.data, pathSegments, tokenNode);
      if (!assigned) continue;
      tokenCount += 1;
    }
  }

  return { filesMap, tokenCount };
}

// ─── Main sync function ───────────────────────────────────────────────────────

export type FigmaVariableSource = SharedFigmaVariableSource;

export function isFatalSyncReason(reason: string): boolean {
  const fatalReasons = ['fetch-failed', 'system-missing', 'system-database-url-missing', 'figma-file-key-missing', 'invalid-source'];
  return fatalReasons.includes(reason);
}

interface VariablesFetchResult {
  payload?: FigmaVariablesResponse;
  sourceUsed?: Exclude<FigmaVariableSource, 'auto'>;
  sourceAttempts: Array<Exclude<FigmaVariableSource, 'auto'>>;
  error?: string;
}

function normalizeVariableSource(rawSource: unknown): FigmaVariableSource {
  return parseFigmaVariableSource(rawSource, {
    defaultValue: 'mcp',
    optionName: 'variable source',
  });
}

function toMcpFileUrl(fileKey: string, explicitFileUrl?: string): string {
  const direct = String(explicitFileUrl || '').trim();
  if (direct) return direct;
  return `https://www.figma.com/design/${encodeURIComponent(fileKey)}`;
}

function normalizeDbSegments(rawName: string): string[] {
  return String(rawName || '')
    .split('/')
    .map((segment) => stripDiacritics(String(segment || '').trim()))
    .filter(Boolean);
}

function toDbTokenPaths(rawName: string): {
  path: string;
  slashPath: string;
  cssVar: string;
} {
  const segments = normalizeDbSegments(rawName);
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

function normalizeDbType(args: { resolvedType: string }): string {
  return String(args.resolvedType || '').trim().toUpperCase();
}

function toDbHexByte(value: number): string {
  const clamped = Math.max(0, Math.min(1, Number(value || 0)));
  return Math.round(clamped * 255)
    .toString(16)
    .padStart(2, '0');
}

function dbFigmaColorToHex(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  const r = toDbHexByte(Number(value.r));
  const g = toDbHexByte(Number(value.g));
  const b = toDbHexByte(Number(value.b));
  const a = toDbHexByte(Number(value.a ?? 1));
  if (a === 'ff') return `#${r}${g}${b}`.toUpperCase();
  return `#${r}${g}${b}${a}`.toUpperCase();
}

function buildModeNameMap(
  collections: Record<string, Record<string, unknown>>,
): Map<string, Map<string, string>> {
  const byCollectionId = new Map<string, Map<string, string>>();
  for (const collection of Object.values(collections || {})) {
    const collectionRecord = collection as Record<string, unknown>;
    const modes = new Map<string, string>();
    for (const mode of Array.isArray(collectionRecord.modes) ? collectionRecord.modes : []) {
      const modeRecord = mode as Record<string, unknown>;
      const modeId = String(modeRecord?.modeId || '').trim();
      if (!modeId) continue;
      modes.set(modeId, String(modeRecord?.name || modeId).trim() || modeId);
    }
    byCollectionId.set(String(collectionRecord.id || ''), modes);
  }
  return byCollectionId;
}

function resolveDbValue(raw: unknown, idToPath: Map<string, string>): string {
  if (raw && typeof raw === 'object') {
    const objectValue = raw as Record<string, unknown>;
    if (String(objectValue.type || '').trim().toUpperCase() === 'VARIABLE_ALIAS') {
      const aliasId = String(objectValue.id || '').trim();
      return idToPath.get(aliasId) || aliasId;
    }
    const colorHex = dbFigmaColorToHex(raw);
    if (colorHex) return colorHex;
    return JSON.stringify(raw);
  }
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'number' || typeof raw === 'boolean') return String(raw);
  return '';
}

type DbTokenRow = {
  id: string;
  slashPath: string;
  cssVar: string;
  type: string;
  collection: string;
  rawValue: string;
};

type DbModeValueRow = {
  tokenPath: string;
  mode: string;
  resolvedValue: string;
};

type DbAliasRow = {
  fromPath: string;
  toPath: string;
  modes: string[];
};

function buildDbTokenRows(meta: FigmaVariablesResponse['meta']): {
  tokens: DbTokenRow[];
  modeValues: DbModeValueRow[];
  aliases: DbAliasRow[];
  graphJson: string;
} {
  const variables = Object.values(meta?.variables || {});
  const collections = (meta?.variableCollections || {}) as Record<string, Record<string, unknown>>;
  const modeNameMapByCollectionId = buildModeNameMap(collections);

  const idToPath = new Map<string, string>();
  for (const variable of variables) {
    const variableId = String((variable as Record<string, unknown>)?.id || '').trim();
    const { path } = toDbTokenPaths(String((variable as Record<string, unknown>)?.name || ''));
    if (!variableId || !path) continue;
    idToPath.set(variableId, path);
  }

  const tokens: DbTokenRow[] = [];
  const modeValuesByKey = new Map<string, DbModeValueRow>();
  const aliasModes = new Map<string, Set<string>>();

  for (const variable of variables) {
    const variableRecord = variable as Record<string, unknown>;
    const variableId = String(variableRecord?.id || '').trim();
    const { path, slashPath, cssVar } = toDbTokenPaths(String(variableRecord?.name || ''));
    if (!variableId || !path || !slashPath) continue;

    const collection = collections[String(variableRecord.variableCollectionId || '')];
    const collectionName =
      String(collection?.name || 'default').trim() || 'default';
    const type = normalizeDbType({
      resolvedType: String(variableRecord.resolvedType || ''),
    });
    const modeNameMap =
      modeNameMapByCollectionId.get(
        String(variableRecord.variableCollectionId || ''),
      ) || new Map<string, string>();

    const localModeValues: DbModeValueRow[] = [];
    for (const [modeId, rawValue] of Object.entries(
      (variableRecord.valuesByMode as Record<string, unknown>) || {},
    )) {
      const mode =
        modeNameMap.get(modeId) || String(modeId || '').trim() || 'Default';
      const resolvedValue = resolveDbValue(rawValue, idToPath);
      localModeValues.push({ tokenPath: path, mode, resolvedValue });

      const aliasType =
        rawValue && typeof rawValue === 'object'
          ? String((rawValue as Record<string, unknown>).type || '')
              .trim()
              .toUpperCase()
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
      modeValuesByKey.set(modeKey, modeValue);
    }
  }

  const aliases: DbAliasRow[] = Array.from(aliasModes.entries()).map(
    ([edge, modes]) => {
      const [fromPath, toPath] = edge.split('::');
      return {
        fromPath,
        toPath,
        modes: Array.from(modes).sort((a, b) => a.localeCompare(b)),
      };
    },
  );

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

  return {
    tokens,
    modeValues: Array.from(modeValuesByKey.values()),
    aliases,
    graphJson,
  };
}

async function fetchVariablesBySource(options: {
  source: FigmaVariableSource;
  fileKey: string;
  figmaToken?: string;
  mcpFileUrl?: string;
  fetchRestVariablesFn: typeof fetchFigmaLocalVariables;
  fetchMcpVariablesFn: typeof fetchFigmaLocalVariablesViaMcp;
}): Promise<VariablesFetchResult> {
  const {
    source,
    fileKey,
    figmaToken,
    mcpFileUrl,
    fetchRestVariablesFn,
    fetchMcpVariablesFn,
  } = options;

  const sourceAttempts: Array<Exclude<FigmaVariableSource, 'auto'>> = [];

  const tryMcp = async (): Promise<FigmaVariablesResponse> => {
    sourceAttempts.push('mcp');
    return await fetchMcpVariablesFn({
      fileUrl: toMcpFileUrl(fileKey, mcpFileUrl),
    });
  };

  const tryRest = async (): Promise<FigmaVariablesResponse> => {
    sourceAttempts.push('rest');
    const token = String(figmaToken || '').trim();
    if (!token) {
      throw new Error(
        'Missing Figma token for REST variables fetch. Provide --figma-token or use source=mcp.',
      );
    }
    return await fetchRestVariablesFn({ fileKey, token });
  };

  if (source === 'mcp') {
    try {
      const payload = await tryMcp();
      return { payload, sourceUsed: 'mcp', sourceAttempts };
    } catch (error) {
      return {
        sourceAttempts,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  if (source === 'rest') {
    try {
      const payload = await tryRest();
      return { payload, sourceUsed: 'rest', sourceAttempts };
    } catch (error) {
      return {
        sourceAttempts,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // AUTO strategy (MCP-first):
  // 1) Prefer MCP because it does not require Enterprise variables scope.
  // 2) Fallback to REST only when MCP fails and a token is available.
  let mcpErrorMessage = '';
  try {
    const payload = await tryMcp();
    return { payload, sourceUsed: 'mcp', sourceAttempts };
  } catch (error) {
    mcpErrorMessage = error instanceof Error ? error.message : String(error);
  }

  try {
    const payload = await tryRest();
    return { payload, sourceUsed: 'rest', sourceAttempts };
  } catch (error) {
    const restErrorMessage = error instanceof Error ? error.message : String(error);
    const restUnavailableReason = restErrorMessage.includes('Missing Figma token')
      ? 'REST fallback is unavailable because FIGMA_TOKEN is missing'
      : 'REST fetch failed';
    return {
      sourceAttempts,
      error: `MCP fetch failed: ${mcpErrorMessage}; ${restUnavailableReason}: ${restErrorMessage}`,
    };
  }
}

export interface SyncFigmaTokensToDatabaseOptions {
  repoRoot: string;
  system: {
    id?: string;
    name?: string;
    paths?: {
      databaseUrl?: string;
    };
  } | null;
  fileKey: string;
  figmaToken?: string;
  force?: boolean;
  merge?: boolean;
  dryRun?: boolean;
  source?: FigmaVariableSource;
  mcpFileUrl?: string;
  fetchRestVariablesFn?: typeof fetchFigmaLocalVariables;
  fetchMcpVariablesFn?: typeof fetchFigmaLocalVariablesViaMcp;
  bootstrapDatabaseFn?: typeof bootstrapDatabase;
}

export interface SyncFigmaTokensToDatabaseResult {
  attempted: boolean;
  reason?: string;
  error?: string;
  dryRun?: boolean;
  force?: boolean;
  merge?: boolean;
  files_planned?: number;
  tokens_planned?: number;
  files?: string[];
  collections?: string[];
  tokens_written?: number;
  tokens_total?: number;
  backed_up?: string[];
  source_requested?: FigmaVariableSource;
  source_used?: Exclude<FigmaVariableSource, 'auto'>;
  source_attempts?: Array<Exclude<FigmaVariableSource, 'auto'>>;
}

export async function syncFigmaTokensToDatabase(
  options: SyncFigmaTokensToDatabaseOptions,
): Promise<SyncFigmaTokensToDatabaseResult> {
  const {
    repoRoot,
    system,
    fileKey,
    figmaToken,
    force = false,
    merge = false,
    dryRun = false,
    source = 'mcp',
    mcpFileUrl,
    fetchRestVariablesFn = fetchFigmaLocalVariables,
    fetchMcpVariablesFn = fetchFigmaLocalVariablesViaMcp,
    bootstrapDatabaseFn = bootstrapDatabase,
  } = options;

  let sourceRequested: FigmaVariableSource;
  try {
    sourceRequested = normalizeVariableSource(source);
  } catch (error) {
    return {
      attempted: false,
      reason: 'invalid-source',
      error: error instanceof Error ? error.message : String(error),
    };
  }

  if (!system) {
    return { attempted: false, reason: 'system-missing' };
  }
  const dsId = String(system.id || '').trim();
  if (!dsId) {
    return { attempted: false, reason: 'system-id-missing' };
  }
  const databaseUrl = String(system.paths?.databaseUrl || '').trim();
  if (!databaseUrl) {
    return { attempted: false, reason: 'system-database-url-missing' };
  }
  if (!fileKey) {
    return { attempted: false, reason: 'figma-file-key-missing' };
  }

  const variablesFetchResult = await fetchVariablesBySource({
    source: sourceRequested,
    fileKey,
    figmaToken,
    mcpFileUrl,
    fetchRestVariablesFn,
    fetchMcpVariablesFn,
  });

  if (!variablesFetchResult.payload) {
    return {
      attempted: true,
      reason: 'fetch-failed',
      error: variablesFetchResult.error || 'Unknown variables fetch error.',
      source_requested: sourceRequested,
      source_attempts: variablesFetchResult.sourceAttempts,
    };
  }

  const variablesPayload = variablesFetchResult.payload;
  const meta: Record<string, unknown> | null = variablesPayload?.meta
    ? (variablesPayload.meta as Record<string, unknown>)
    : null;
  const { tokens, modeValues, aliases, graphJson } = buildDbTokenRows(
    meta as FigmaVariablesResponse['meta'],
  );

  if (tokens.length === 0 || modeValues.length === 0) {
    return {
      attempted: true,
      reason: 'variables-empty',
      tokens_total: 0,
      source_requested: sourceRequested,
      source_used: variablesFetchResult.sourceUsed,
      source_attempts: variablesFetchResult.sourceAttempts,
    };
  }

  const collections = Array.from(new Set(tokens.map((token) => token.collection)));
  const plannedFiles = collections.map((collection) => `${collection}.json`);

  if (dryRun) {
    return {
      attempted: true,
      dryRun: true,
      force,
      merge,
      files_planned: plannedFiles.length,
      tokens_planned: tokens.length,
      tokens_total: tokens.length,
      files: plannedFiles,
      collections,
      source_requested: sourceRequested,
      source_used: variablesFetchResult.sourceUsed,
      source_attempts: variablesFetchResult.sourceAttempts,
    };
  }

  const sql = await bootstrapDatabaseFn(databaseUrl);
  try {
    await sql.begin(async (tx) => {
      await tx`DELETE FROM token_mode_values WHERE ds_id = ${dsId}`;
      await tx`DELETE FROM tokens WHERE ds_id = ${dsId}`;
      await tx`DELETE FROM figma_aliases WHERE ds_id = ${dsId}`;
      await tx`DELETE FROM token_graph WHERE ds_id = ${dsId}`;

      for (const token of tokens) {
        await tx`
          INSERT INTO tokens (id, ds_id, slash_path, css_var, type, collection, raw_value)
          VALUES (${token.id}, ${dsId}, ${token.slashPath}, ${token.cssVar}, ${token.type}, ${token.collection}, ${token.rawValue})
          ON CONFLICT (ds_id, id) DO UPDATE SET
            slash_path = EXCLUDED.slash_path,
            css_var = EXCLUDED.css_var,
            type = EXCLUDED.type,
            collection = EXCLUDED.collection,
            raw_value = EXCLUDED.raw_value
        `;
      }

      for (const modeValue of modeValues) {
        await tx`
          INSERT INTO token_mode_values (ds_id, token_path, mode, resolved_value)
          VALUES (${dsId}, ${modeValue.tokenPath}, ${modeValue.mode}, ${modeValue.resolvedValue})
          ON CONFLICT (ds_id, token_path, mode) DO UPDATE SET
            resolved_value = EXCLUDED.resolved_value
        `;
      }

      for (const alias of aliases) {
        await tx`
          INSERT INTO figma_aliases (ds_id, from_path, to_path, modes)
          VALUES (${dsId}, ${alias.fromPath}, ${alias.toPath}, ${JSON.stringify(alias.modes)})
          ON CONFLICT (ds_id, from_path, to_path) DO NOTHING
        `;
      }

      await tx`
        INSERT INTO token_graph (ds_id, graph_json, generated_at)
        VALUES (${dsId}, ${graphJson}, now())
        ON CONFLICT (ds_id) DO UPDATE SET
          graph_json = EXCLUDED.graph_json,
          generated_at = EXCLUDED.generated_at
      `;
    });
  } finally {
    await sql.end();
  }

  return {
    attempted: true,
    reason: 'persisted',
    dryRun: false,
    force,
    merge,
    tokens_written: tokens.length,
    tokens_total: tokens.length,
    collections,
    backed_up: [],
    source_requested: sourceRequested,
    source_used: variablesFetchResult.sourceUsed,
    source_attempts: variablesFetchResult.sourceAttempts,
  };
}
