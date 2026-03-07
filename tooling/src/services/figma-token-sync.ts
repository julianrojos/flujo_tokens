/**
 * Figma Token Sync Service
 *
 * Shared module for importing Figma local variables into design-token JSON files
 * and optionally compiling them to CSS custom properties.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fetchFigmaLocalVariables, type FigmaVariablesResponse } from '../utils/figma-api.js';

// ─── File helpers ─────────────────────────────────────────────────────────────

/**
 * Check if input directory has JSON files.
 */
export function hasInputJsonFiles(repoRoot: string, inputDir: string): boolean {
  // Validate inputDir is not empty to avoid resolving to repo root
  if (!inputDir?.trim()) return false;
  const resolvedDir = path.resolve(repoRoot, inputDir);
  if (!fs.existsSync(resolvedDir)) return false;
  return fs
    .readdirSync(resolvedDir, { withFileTypes: true })
    .some((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.json'));
}

/**
 * Sanitize a collection name to a valid file stem.
 */
export function sanitizeCollectionFileStem(rawName: string, fallback = 'imported'): string {
  const normalized = String(rawName || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || (fallback || 'imported').toLowerCase();
}

/**
 * Write text to file atomically.
 */
function writeTextAtomic(filePath: string, text: string): void {
  const tempPath = `${filePath}.tmp`;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(tempPath, text, 'utf8');
  fs.renameSync(tempPath, filePath);
}

/**
 * Backup an input JSON file before overwrite.
 */
function backupInputJson(filePath: string): string | null {
  if (!fs.existsSync(filePath)) return null;
  const backupPath = `${filePath}.bak`;
  fs.copyFileSync(filePath, backupPath);
  return backupPath;
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
function normalizeFigmaResolvedType(rawType: string): string {
  const type = String(rawType || '').trim().toUpperCase();
  if (type === 'COLOR') return 'color';
  if (type === 'FLOAT') return 'dimension';
  if (type === 'STRING') return 'string';
  if (type === 'BOOLEAN') return 'boolean';
  return 'string';
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
  const resolvedType = normalizeFigmaResolvedType(variableRecord?.resolvedType as string);
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
  if (resolvedType === 'string' && typeof normalizedValue !== 'string') return null;
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
      const tokenNode = buildTokenNodeFromFigmaVariable(variableRecord, modeValue);
      if (!tokenNode) continue;

      // Single mode → use collection name; multiple modes → append mode name
      const fileKey =
        modeValues.size === 1
          ? collectionFileStem
          : `${collectionFileStem}-${sanitizeCollectionFileStem(modeName as string, 'default')}`;

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
        .map((segment) => String(segment || '').trim())
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

export interface SyncFigmaTokensToInputOptions {
  repoRoot: string;
  system: Record<string, unknown> | null;
  fileKey: string;
  figmaToken: string;
  force?: boolean;
  merge?: boolean;
  dryRun?: boolean;
}

export interface SyncFigmaTokensToInputResult {
  attempted: boolean;
  reason?: string;
  hint?: string;  // Added for helpful messages
  error?: string;
  dryRun?: boolean;
  force?: boolean;
  merge?: boolean;
  files_planned?: number;
  tokens_planned?: number;
  files?: string[];
  collections?: string[];
  files_written?: number;
  tokens_written?: number;
  tokens_total?: number;
  backed_up?: string[];
}

/**
 * Sync Figma local variables to input JSON files.
 */
export async function syncFigmaTokensToInput(options: SyncFigmaTokensToInputOptions): Promise<SyncFigmaTokensToInputResult> {
  const {
    repoRoot,
    system,
    fileKey,
    figmaToken,
    force = false,
    merge = false,
    dryRun = false,
  } = options;

  if (!system) {
    return { attempted: false, reason: 'system-missing' };
  }
  if (!fileKey) {
    return { attempted: false, reason: 'figma-file-key-missing' };
  }
  // Validate inputDir is not empty to prevent writing to repo root
  const inputDir = String(system.inputDir || '').trim();
  if (!inputDir) {
    return { attempted: false, reason: 'system-input-dir-missing' };
  }

  const existingJsonFiles = hasInputJsonFiles(repoRoot, inputDir);
  if (existingJsonFiles && !force) {
    return { attempted: false, reason: 'input-json-exists', hint: 'Use --force true to re-sync.' };
  }

  // Fetch variables from Figma
  let variablesPayload: FigmaVariablesResponse | undefined;
  try {
    variablesPayload = await fetchFigmaLocalVariables({ fileKey, token: figmaToken });
  } catch (error) {
    return {
      attempted: true,
      reason: 'fetch-failed',
      error: error instanceof Error ? error.message : String(error),
    };
  }

  const meta: Record<string, unknown> | null = variablesPayload?.meta
    ? (variablesPayload.meta as Record<string, unknown>)
    : null;

  const { filesMap, tokenCount } = buildFilesMapFromVariables(meta);

  if (filesMap.size === 0 || tokenCount === 0) {
    return { attempted: true, reason: 'variables-empty', tokens_total: 0 };
  }

  const inputDirPath = path.resolve(repoRoot, inputDir);

  // Build preview / dry-run result
  const plannedFiles = Array.from(filesMap.keys()).map((stem) =>
    path.relative(repoRoot, path.join(inputDirPath, `${stem}.json`)),
  );

  if (dryRun) {
    return {
      attempted: true,
      dryRun: true,
      force,
      merge,
      files_planned: plannedFiles.length,
      tokens_planned: tokenCount,
      tokens_total: tokenCount,
      files: plannedFiles,
      collections: Array.from(filesMap.values()).map((f) => f.description),
    };
  }

  // Write files
  fs.mkdirSync(inputDirPath, { recursive: true });
  const writtenFiles: string[] = [];
  const backedUpFiles: string[] = [];

  for (const [fileStem, payload] of filesMap.entries()) {
    const filePath = path.join(inputDirPath, `${fileStem}.json`);

    // Backup before overwrite
    if (force && fs.existsSync(filePath)) {
      const backupPath = backupInputJson(filePath);
      if (backupPath) backedUpFiles.push(path.relative(repoRoot, backupPath));
    }

    let finalData = payload.data;

    // Merge mode: deep-merge incoming over existing
    if (merge && fs.existsSync(filePath)) {
      try {
        const existing = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        // Strip $description from merge base, re-add payload.description after
        const { $description: _desc, ...existingData } = existing;
        finalData = mergeTokenTrees(existingData as Record<string, unknown>, payload.data) as Record<string, unknown>;
      } catch {
        // If existing file is unparseable, fall through to full overwrite
      }
    }

    const jsonPayload = {
      $description: payload.description,
      ...finalData,
    };
    writeTextAtomic(filePath, `${JSON.stringify(jsonPayload, null, 2)}\n`);
    writtenFiles.push(path.relative(repoRoot, filePath));
  }

  return {
    attempted: true,
    dryRun: false,
    force,
    merge,
    files_written: writtenFiles.length,
    tokens_written: tokenCount,
    tokens_total: tokenCount,
    files: writtenFiles,
    backed_up: backedUpFiles,
  };
}

// ─── Compile step ─────────────────────────────────────────────────────────────

export interface RunTokensCompileOptions {
  repoRoot: string;
  system: Record<string, unknown> | null;
}

export interface RunTokensCompileResult {
  attempted: boolean;
  compiled?: boolean;
  reason?: string;
  stderr?: string;
  outputs?: {
    primitives: string;
    tokens: string;
    registry: string;
  };
  output?: string;
}

/**
 * Run ds-tokens-sync.mjs to compile input JSON → CSS custom properties.
 */
export function runTokensCompile(options: RunTokensCompileOptions): RunTokensCompileResult {
  const { repoRoot, system } = options;
  if (!system) return { attempted: false, reason: 'system-missing' };
  
  // Validate inputDir is not empty
  const inputDir = String(system.inputDir || '').trim();
  if (!inputDir) {
    return { attempted: false, reason: 'system-input-dir-missing' };
  }

  const inputDirPath = path.resolve(repoRoot, inputDir);
  const outputDir = path.resolve(repoRoot, String(system.outputDir || ''));
  const docsDir = path.resolve(repoRoot, String(system.docsDir || ''));
  const tokenRegistryPath = path.join(docsDir, '_generated', 'token-registry.json');

  if (!hasInputJsonFiles(repoRoot, inputDir)) {
    return { attempted: false, reason: 'input-json-missing' };
  }

  fs.mkdirSync(outputDir, { recursive: true });
  fs.mkdirSync(path.join(docsDir, '_generated'), { recursive: true });

  const args = [
    path.join(repoRoot, 'tooling', 'scripts', 'ds-tokens-sync.mjs'),
    '--input',
    inputDirPath,
    '--output-primitives',
    path.join(outputDir, 'primitives.css'),
    '--output-tokens',
    path.join(outputDir, 'tokens.css'),
    '--registry-output',
    tokenRegistryPath,
    '--force',
    'true',
  ];

  const result = spawnSync(process.execPath, args, {
    cwd: repoRoot,
    stdio: 'pipe',
    env: process.env,
  });
  const stdout = result.stdout ? String(result.stdout).trim() : '';
  const stderr = result.stderr ? String(result.stderr).trim() : '';

  if ((result.status ?? 1) !== 0) {
    return {
      attempted: true,
      compiled: false,
      reason: 'compile-failed',
      stderr: stderr || stdout,
    };
  }

  return {
    attempted: true,
    compiled: true,
    reason: 'compiled',
    outputs: {
      primitives: path.relative(repoRoot, path.join(outputDir, 'primitives.css')),
      tokens: path.relative(repoRoot, path.join(outputDir, 'tokens.css')),
      registry: path.relative(repoRoot, tokenRegistryPath),
    },
    output: stdout,
  };
}
