import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Sql } from 'postgres';
import { stripDiacritics } from '../../../../tooling/src/utils/strip-diacritics.js';
import type {
  FigmaVariable,
  FigmaVariableCollection,
  FigmaVariablesResponse,
} from '../../../../tooling/src/utils/figma.ts';
import {
  buildAliasChains,
  extractCssReferences,
  generateUsageIndex,
} from '../../../../tooling/src/services/token-usage-index.js';
import { resolveUniqueCssVar } from '../../../../tooling/src/utils/css-var-utils.js';
import {
  fetchVariablesDirect,
  getComponentImageDirect,
  getComponentSpecDirect,
  searchComponentsDirect,
} from './figma-direct-bridge-service.ts';
import type { ComponentRepository } from '../db/component-repository.js';
import { resolveSystemPaths } from '../db/design-system-repository.js';

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

function toTokenPaths(rawName: string): {
  path: string;
  slashPath: string;
  cssVar: string;
} {
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

function normalizeType(args: {
  resolvedType: string;
}): string {
  return String(args.resolvedType || '').trim().toUpperCase();
}

function toHexByte(value: number): string {
  const clamped = Math.max(0, Math.min(1, Number(value || 0)));
  return Math.round(clamped * 255)
    .toString(16)
    .padStart(2, '0');
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

function toModeNameMap(
  collections: Record<string, FigmaVariableCollection>,
): Map<string, Map<string, string>> {
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
    if (
      String(objectValue.type || '')
        .trim()
        .toUpperCase() === 'VARIABLE_ALIAS'
    ) {
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
  const usedCssVars = new Set<string>();

  for (const variable of variables) {
    const variableId = String(variable?.id || '').trim();
    const { path, slashPath, cssVar } = toTokenPaths(
      String(variable?.name || ''),
    );
    if (!variableId || !path || !slashPath) continue;

    const collection = collections[String(variable.variableCollectionId || '')];
    const collectionName =
      String(collection?.name || 'default').trim() || 'default';
    const type = normalizeType({
      resolvedType: String(variable.resolvedType || ''),
    });
    const modeNameMap =
      modeNameMapByCollectionId.get(
        String(variable.variableCollectionId || ''),
      ) || new Map<string, string>();

    const localModeValues: TokenModeValueRow[] = [];
    for (const [modeId, rawValue] of Object.entries(
      variable.valuesByMode || {},
    )) {
      const mode =
        modeNameMap.get(modeId) || String(modeId || '').trim() || 'Default';
      const resolvedValue = toResolvedValue(rawValue, idToPath);
      localModeValues.push({ tokenPath: path, mode, resolvedValue });

      const aliasType =
        rawValue && typeof rawValue === 'object'
          ? String((rawValue as Record<string, unknown>).type || '')
              .trim()
              .toUpperCase()
          : '';
      if (aliasType === 'VARIABLE_ALIAS') {
        const aliasId = String(
          (rawValue as Record<string, unknown>).id || '',
        ).trim();
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
      cssVar: resolveUniqueCssVar({
        baseCssVar: cssVar,
        collection: collectionName,
        variableId,
        usedCssVars,
      }),
      type,
      collection: collectionName,
      rawValue: preferred.resolvedValue,
    });
    for (const modeValue of localModeValues) {
      const modeKey = `${modeValue.tokenPath}\x00${modeValue.mode}`;
      // Last writer wins to stay aligned with ON CONFLICT DO UPDATE semantics.
      modeValuesByKey.set(modeKey, modeValue);
    }
  }

  const aliases: AliasRow[] = Array.from(aliasModes.entries()).map(
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

function slugifyComponentName(name: string): string {
  return (
    stripDiacritics(String(name || '').trim())
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 120) || 'component'
  );
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

type FullComponentSpecResult = {
  success: true;
  nodeId: string;
  name: string;
  type: string;
  description: string | null;
  width?: number;
  height?: number;
  variants?: Array<{
    key: string;
    nodeId: string;
    name: string;
    variantProperties: Record<string, string>;
    width?: number;
    height?: number;
    layerTokens?: Array<{
      nodeId: string;
      nodeName: string;
      field: string;
      variableId: string;
      modeId?: string;
      modeName?: string;
    }>;
  }>;
  variantAxes?: Array<{ name: string; values: string[] }>;
  props: Array<{ name: string; type: string; defaultValue: unknown }>;
  states: string[];
  tokenBindings: Array<{
    nodeId: string;
    nodeName: string;
    field: string;
    variableId: string;
  }>;
  instanceDependencies?: Array<{
    instanceNodeId: string;
    instanceNodeName: string;
    usedComponentNodeId: string;
    usedComponentName: string;
    usedComponentKey?: string;
    status?: 'resolved' | 'unresolved';
  }>;
};

type FetchFullComponentSpecFn = (
  fileKey: string | null,
  params: { nodeId: string; depth?: number; compact?: boolean },
) => Promise<FullComponentSpecResult>;

function toSnakeCaseId(value: string, fallback = 'part'): string {
  const normalized = stripDiacritics(String(value || '').trim())
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized || fallback;
}

const warnedUnknownFigmaPropertyTypes = new Set<string>();

function mapFigmaPropertyType(
  value: string,
): 'enum' | 'text' | 'boolean' | 'instance_swap' | 'slot' {
  const rawType = String(value || '').trim();
  const type = rawType.toUpperCase();
  if (type === 'VARIANT') return 'enum';
  if (type === 'TEXT') return 'text';
  if (type === 'BOOLEAN') return 'boolean';
  if (type === 'INSTANCE_SWAP') return 'instance_swap';
  if (type === 'SLOT') return 'slot';
  if (rawType && !warnedUnknownFigmaPropertyTypes.has(type)) {
    warnedUnknownFigmaPropertyTypes.add(type);
    console.warn(
      `[mapFigmaPropertyType] Unknown Figma property type "${rawType}", falling back to "text"`,
    );
  }
  return 'text';
}

function collectInstanceDependenciesFromAnatomy(anatomy: unknown): Array<{
  instanceNodeId: string;
  instanceNodeName: string;
  usedComponentNodeId: string;
  usedComponentName: string;
  usedComponentKey?: string;
  status: 'resolved' | 'unresolved';
}> {
  const dependencies: Array<{
    instanceNodeId: string;
    instanceNodeName: string;
    usedComponentNodeId: string;
    usedComponentName: string;
    usedComponentKey?: string;
    status: 'resolved' | 'unresolved';
  }> = [];
  const seenDependencies = new Set<string>();
  const queue: unknown[] = Array.isArray(anatomy)
    ? [...anatomy]
    : anatomy && typeof anatomy === 'object'
      ? [anatomy]
      : [];

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    if (!current || typeof current !== 'object') continue;
    const record = current as Record<string, unknown>;
    const type = String(record.type || '').trim().toUpperCase();
    if (type === 'INSTANCE') {
      const instanceNodeId = String(record.id || '').trim();
      const instanceNodeName = String(record.name || '').trim();
      const mainComponent =
        record.mainComponent && typeof record.mainComponent === 'object'
          ? (record.mainComponent as Record<string, unknown>)
          : null;
      const usedComponentNodeId = String(
        mainComponent?.id ||
        record.componentId || mainComponent?.name || '',
      ).trim();
      const usedComponentName = String(
        mainComponent?.name || record.componentId || '',
      ).trim();
      const usedComponentKey = String(mainComponent?.key || '').trim();
      if (instanceNodeId && instanceNodeName && usedComponentNodeId) {
        const dedupeKey = `${instanceNodeId}\x00${usedComponentNodeId}\x00${usedComponentKey}`;
        if (!seenDependencies.has(dedupeKey)) {
          seenDependencies.add(dedupeKey);
          dependencies.push({
            instanceNodeId,
            instanceNodeName,
            usedComponentNodeId,
            usedComponentName: usedComponentName || usedComponentNodeId,
            usedComponentKey: usedComponentKey || undefined,
            status:
              (mainComponent?.id || record.componentId)
                ? 'resolved'
                : 'unresolved',
          });
        }
      }
    }

    const children = record.children;
    if (Array.isArray(children)) {
      queue.push(...children);
    }
  }

  return dependencies;
}

function normalizeVariantAxisValues(
  specData: FullComponentSpecResult | null,
  propName: string,
): string[] {
  const name = String(propName || '')
    .trim()
    .toLowerCase();
  if (!name) return [];
  const directAxis = (specData?.variantAxes || []).find(
    (axis) =>
      String(axis?.name || '')
        .trim()
        .toLowerCase() === name,
  );
  const directValues = Array.from(
    new Set(
      (directAxis?.values || [])
        .map((value) => String(value || '').trim())
        .filter(Boolean),
    ),
  );
  if (directValues.length > 0) return directValues;
  const fromVariants = Array.from(
    new Set(
      (specData?.variants || [])
        .map((variant) =>
          String(variant?.variantProperties?.[propName] || '').trim(),
        )
        .filter(Boolean),
    ),
  );
  return fromVariants;
}

function yamlBooleanOrString(value: unknown, fallback: boolean): string {
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase();
  if (normalized === 'true') return 'true';
  if (normalized === 'false') return 'false';
  return fallback ? 'true' : 'false';
}

export function buildVariableIdToTokenPathMap(
  meta: FigmaVariablesResponse['meta'],
): Map<string, string> {
  const out = new Map<string, string>();
  for (const variable of Object.values(meta?.variables || {})) {
    const variableId = String(variable?.id || '').trim();
    if (!variableId) continue;
    const { path } = toTokenPaths(String(variable?.name || ''));
    if (!path) continue;
    out.set(variableId, path);
  }
  return out;
}

function buildVariableIdToDefaultModeContextMap(
  meta: FigmaVariablesResponse['meta'],
): Map<string, { modeId: string; modeName: string }> {
  const out = new Map<string, { modeId: string; modeName: string }>();
  const collections = meta?.variableCollections || {};
  for (const variable of Object.values(meta?.variables || {})) {
    const variableId = String(variable?.id || '').trim();
    if (!variableId) continue;
    const collectionId = String(variable.variableCollectionId || '').trim();
    const collection = collections[collectionId];
    const availableModeIds = Object.keys(variable.valuesByMode || {})
      .map((item) => String(item || '').trim())
      .filter(Boolean);
    const modeId =
      String(collection?.defaultModeId || '').trim() ||
      availableModeIds[0] ||
      String(collection?.modes?.[0]?.modeId || '').trim();
    if (!modeId) continue;
    const modeName =
      String(
        collection?.modes?.find(
          (item) => String(item?.modeId || '').trim() === modeId,
        )?.name || '',
      ).trim() || modeId;
    out.set(variableId, { modeId, modeName });
  }
  return out;
}

function buildVariantSignature(props: Record<string, string>): string {
  return Object.entries(props)
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('|');
}

function normalizeLayerTokenBindingFields(binding: {
  nodeId: string;
  nodeName: string;
  field: string;
  variableId: string;
  modeId?: string;
  modeName?: string;
}): {
  nodeId: string;
  nodeName: string;
  field: string;
  variableId: string;
  modeId: string;
  modeName: string;
} | null {
  const nodeId = String(binding.nodeId || '').trim();
  const nodeName = String(binding.nodeName || '').trim();
  const field = String(binding.field || '').trim();
  const variableId = String(binding.variableId || '').trim();
  if (!nodeId || !nodeName || !field || !variableId) return null;
  return {
    nodeId,
    nodeName,
    field,
    variableId,
    modeId: String(binding.modeId || '').trim(),
    modeName: String(binding.modeName || '').trim(),
  };
}

function makeLayerTokenBindingRow(args: {
  binding: {
    nodeId: string;
    nodeName: string;
    field: string;
    variableId: string;
    modeId?: string;
    modeName?: string;
  };
  variantNodeId: string;
  variantSignature: string;
  variableIdToTokenPath: Map<string, string>;
  variableIdToDefaultModeContext: Map<
    string,
    { modeId: string; modeName: string }
  >;
}): {
  row: SyncComponentEntry['figma']['tokenBindings'][number] | null;
  unresolvedVariableId: string | null;
} {
  const normalized = normalizeLayerTokenBindingFields(args.binding);
  if (!normalized) return { row: null, unresolvedVariableId: null };
  const { nodeId, nodeName, field, variableId } = normalized;

  const tokenPath = args.variableIdToTokenPath.get(variableId);
  const defaultModeContext =
    args.variableIdToDefaultModeContext.get(variableId);
  const modeId =
    normalized.modeId || String(defaultModeContext?.modeId || '').trim();
  const modeName =
    normalized.modeName || String(defaultModeContext?.modeName || '').trim();

  return {
    row: {
      nodeId,
      nodeName,
      field,
      variableId,
      tokenPath,
      mode: modeName,
      variantNodeId: args.variantNodeId,
      variantSignature: args.variantSignature,
      propertyPath: field.toLowerCase(),
      status: tokenPath ? 'resolved' : 'unresolved',
      modeId,
      modeName,
    },
    unresolvedVariableId: tokenPath ? null : variableId,
  };
}

function makeFlatTokenBindingRow(args: {
  binding: {
    nodeId: string;
    nodeName: string;
    field: string;
    variableId: string;
  };
  variableIdToTokenPath: Map<string, string>;
}): SyncComponentEntry['figma']['tokenBindings'][number] | null {
  const nodeId = String(args.binding.nodeId || '').trim();
  const nodeName = String(args.binding.nodeName || '').trim();
  const field = String(args.binding.field || '').trim();
  const variableId = String(args.binding.variableId || '').trim();
  if (!nodeId || !nodeName || !field || !variableId) return null;

  const tokenPath = args.variableIdToTokenPath.get(variableId);

  return {
    nodeId,
    nodeName,
    field,
    variableId,
    tokenPath,
    mode: '',
    variantNodeId: '',
    variantSignature: '',
    propertyPath: field.toLowerCase(),
    status: tokenPath ? 'resolved' : 'unresolved',
    modeId: '',
    modeName: '',
  };
}

/**
 * Extract structured Figma data from spec result (SC-04)
 * Returns variants, tokenBindings (now Layer Token Mapping rows), and unresolved variable IDs.
 *
 * Each binding row includes:
 *  - variantNodeId / variantSignature: grouping context from the enclosing variant
 *  - propertyPath: Figma field vocabulary (trimmed)
 *  - status: 'resolved' when tokenPath found, 'unresolved' otherwise
 *  - modeId / modeName: from variant's mode context (if available)
 */
function extractStructuredFigmaData(args: {
  specData: FullComponentSpecResult | null;
  variableIdToTokenPath: Map<string, string>;
  variableIdToDefaultModeContext: Map<
    string,
    { modeId: string; modeName: string }
  >;
}): {
  variants?: SyncComponentEntry['figma']['variants'];
  tokenBindings?: SyncComponentEntry['figma']['tokenBindings'];
  instanceDependencies?: SyncComponentEntry['figma']['instanceDependencies'];
  props?: SyncComponentEntry['figma']['props'];
  unresolvedVariableIds: string[];
  usedFlatTokenBindingsFallback: boolean;
} {
  const { specData, variableIdToTokenPath, variableIdToDefaultModeContext } =
    args;
  if (!specData)
    return { unresolvedVariableIds: [], usedFlatTokenBindingsFallback: false };

  const result: {
    variants?: SyncComponentEntry['figma']['variants'];
    tokenBindings?: SyncComponentEntry['figma']['tokenBindings'];
    instanceDependencies?: SyncComponentEntry['figma']['instanceDependencies'];
    props?: SyncComponentEntry['figma']['props'];
    unresolvedVariableIds: string[];
    usedFlatTokenBindingsFallback: boolean;
  } = {
    unresolvedVariableIds: [],
    usedFlatTokenBindingsFallback: false,
  };

  // Extract variants from variantAxes + variantProperties
  if (specData.variants && specData.variants.length > 0) {
    result.variants = specData.variants.map((v) => ({
      name: v.name,
      properties: v.variantProperties,
      nodeId: v.nodeId,
      width: v.width,
      height: v.height,
    }));
  }

  // Extract props from specData.props (Migration 034).
  // Preserve explicit empty array to support "clear all props" updates downstream.
  if (Array.isArray(specData.props)) {
    result.props = specData.props.map((p) => {
      const name = String(p.name || '').trim();
      const type = mapFigmaPropertyType(String(p.type || ''));
      const hasExplicitValuesField = Object.prototype.hasOwnProperty.call(
        p as Record<string, unknown>,
        'values',
      );
      const rawValues = (p as Record<string, unknown>).values;
      const explicitValues = Array.isArray(rawValues)
        ? Array.from(
            new Set(
              (rawValues as unknown[])
                .map((value) => String(value || '').trim())
                .filter(Boolean),
            ),
          )
        : [];
      const inferredVariantValues =
        type === 'enum' && name
          ? normalizeVariantAxisValues(specData, name)
          : [];
      return {
        name,
        type,
        values: hasExplicitValuesField
          ? explicitValues.length > 0
            ? explicitValues
            : undefined
          : inferredVariantValues.length > 0
            ? inferredVariantValues
            : undefined,
        defaultValue: (p as Record<string, unknown>).defaultValue,
        required: Boolean((p as Record<string, unknown>).required),
        description: String(
          (p as Record<string, unknown>).description || '',
        ).trim(),
      };
    });
  }

  result.instanceDependencies = [];
  const seenDependencies = new Set<string>();
  if (Array.isArray(specData.instanceDependencies)) {
    for (const dependency of specData.instanceDependencies) {
      const instanceNodeId = String(dependency.instanceNodeId || '').trim();
      const instanceNodeName = String(dependency.instanceNodeName || '').trim();
      const usedComponentNodeId = String(
        dependency.usedComponentNodeId || '',
      ).trim();
      const usedComponentName = String(
        dependency.usedComponentName || dependency.usedComponentKey || usedComponentNodeId || '',
      ).trim();
      if (!instanceNodeId || !instanceNodeName || !usedComponentNodeId) {
        continue;
      }
      const usedComponentKey = String(
        dependency.usedComponentKey || '',
      ).trim();
      const dedupeKey = `${instanceNodeId}\x00${usedComponentNodeId}\x00${usedComponentKey}`;
      if (seenDependencies.has(dedupeKey)) continue;
      seenDependencies.add(dedupeKey);
      result.instanceDependencies.push({
        instanceNodeId,
        instanceNodeName,
        usedComponentNodeId,
        usedComponentName,
        usedComponentKey: usedComponentKey || undefined,
        status: dependency.status === 'unresolved' ? 'unresolved' : 'resolved',
      });
    }
  }
  for (const dependency of collectInstanceDependenciesFromAnatomy(specData.anatomy)) {
    const dedupeKey = `${dependency.instanceNodeId}\x00${dependency.usedComponentNodeId}\x00${dependency.usedComponentKey || ''}`;
    if (seenDependencies.has(dedupeKey)) continue;
    seenDependencies.add(dedupeKey);
    result.instanceDependencies.push(dependency);
  }

  // Primary source of truth: variants[].layerTokens.
  // If the payload only exposes flat tokenBindings, keep them as a fallback so
  // imported components still retain visible token usage in the UI.
  result.tokenBindings = [];
  for (const variant of specData.variants || []) {
    const vNodeId = String(variant.nodeId || '').trim();
    const vSignature = buildVariantSignature(variant.variantProperties || {});
    for (const lt of variant.layerTokens || []) {
      const { row, unresolvedVariableId } = makeLayerTokenBindingRow({
        binding: lt,
        variantNodeId: vNodeId,
        variantSignature: vSignature,
        variableIdToTokenPath,
        variableIdToDefaultModeContext,
      });
      if (unresolvedVariableId)
        result.unresolvedVariableIds.push(unresolvedVariableId);
      if (row) result.tokenBindings.push(row);
    }
  }
  if (
    result.tokenBindings.length === 0 &&
    (specData.tokenBindings || []).length > 0
  ) {
    result.usedFlatTokenBindingsFallback = true;
    for (const binding of specData.tokenBindings || []) {
      const row = makeFlatTokenBindingRow({
        binding,
        variableIdToTokenPath,
      });
      if (row) result.tokenBindings.push(row);
    }
  }

  return result;
}

/**
 * Enrich component entries with structured Figma data (SC-04)
 * This mutates entries in place (entry.figma.*) and does not persist by itself;
 * persistence happens later in upsertFromRegistry.
 */
async function enrichComponentEntriesWithStructuredData(options: {
  entries: SyncComponentEntry[];
  figmaFileId: string | null;
  fetchFullComponentSpec: FetchFullComponentSpecFn;
  variableIdToTokenPath: Map<string, string>;
  variableIdToDefaultModeContext: Map<
    string,
    { modeId: string; modeName: string }
  >;
  concurrency: number;
  warningSink?: string[];
}): Promise<{ attempted: number; failed: number }> {
  const {
    entries,
    figmaFileId,
    fetchFullComponentSpec,
    variableIdToTokenPath,
    variableIdToDefaultModeContext,
    concurrency,
    warningSink,
  } = options;
  let attempted = 0;
  let failed = 0;
  const failureMessages: string[] = [];

  await mapWithConcurrency(entries, concurrency, async (entry) => {
    const componentNodeId = String(entry.figma.componentSetNodeId || '').trim();
    if (!componentNodeId) return;
    attempted += 1;

    let specData: FullComponentSpecResult | null = null;
    try {
      specData = (await fetchFullComponentSpec(figmaFileId, {
        nodeId: componentNodeId,
        depth: 3,
        compact: false,
      })) as FullComponentSpecResult;
    } catch (error) {
      entry.figma.structuredCaptureStatus = 'failed';
      failed += 1;
      const reason = error instanceof Error ? error.message : String(error);
      const failureMessage = `slug=${entry.slug} nodeId=${componentNodeId}: ${reason}`;
      failureMessages.push(failureMessage);
      console.warn(
        `[enrichComponentEntriesWithStructuredData] Failed fetching spec for ${failureMessage}`,
      );
      return; // Skip this component, continue with others
    }

    // Extract and attach structured Figma data
    const structuredData = extractStructuredFigmaData({
      specData,
      variableIdToTokenPath,
      variableIdToDefaultModeContext,
    });
    if (structuredData.usedFlatTokenBindingsFallback && warningSink) {
      warningSink.push(
        `[enrichComponentEntriesWithStructuredData] Used flat tokenBindings fallback for slug=${entry.slug}: variants[].layerTokens were absent in the payload.`,
      );
    }
    if (structuredData.variants) entry.figma.variants = structuredData.variants;
    if (structuredData.tokenBindings)
      entry.figma.tokenBindings = structuredData.tokenBindings;
    if (structuredData.instanceDependencies)
      entry.figma.instanceDependencies = structuredData.instanceDependencies;
    if (Object.prototype.hasOwnProperty.call(structuredData, 'props')) {
      entry.figma.props = structuredData.props ?? [];
    }
    if (Number.isFinite(Number(specData.width))) {
      entry.figma.componentSetWidth = Number(specData.width);
    }
    if (Number.isFinite(Number(specData.height))) {
      entry.figma.componentSetHeight = Number(specData.height);
    }
    entry.figma.structuredCaptureStatus = 'ok';
    if (warningSink && structuredData.unresolvedVariableIds.length > 0) {
      const unresolved = Array.from(
        new Set(structuredData.unresolvedVariableIds),
      );
      warningSink.push(
        `[enrichComponentEntriesWithStructuredData] Unresolved token binding variable IDs for slug=${entry.slug}: ${unresolved.join(', ')}`,
      );
    }
  });

  if (warningSink && attempted > 0 && failed > 0) {
    warningSink.push(
      `[enrichComponentEntriesWithStructuredData] Failed fetching structured component specs for ${failed}/${attempted} components.`,
    );
    const sampleFailures = failureMessages.slice(0, 3);
    for (const message of sampleFailures) {
      warningSink.push(`[enrichComponentEntriesWithStructuredData] ${message}`);
    }
    if (failureMessages.length > sampleFailures.length) {
      warningSink.push(
        `[enrichComponentEntriesWithStructuredData] ...and ${failureMessages.length - sampleFailures.length} additional failures.`,
      );
    }
  }

  return { attempted, failed };
}

function extensionFromFormat(format: string): string {
  const normalized = String(format || '')
    .trim()
    .toUpperCase();
  if (normalized === 'JPG' || normalized === 'JPEG') return 'jpg';
  if (normalized === 'SVG') return 'svg';
  return 'png';
}

type FetchComponentImagesFn = (
  fileKey: string | null,
  params: {
    nodeIds: string[];
    format?: 'PNG' | 'JPG' | 'SVG';
    scale?: number;
  },
) => Promise<{
  success: boolean;
  images: Array<{
    nodeId: string;
    base64?: string;
    format: string;
    byteLength?: number;
    error?: string;
  }>;
  count: number;
  errors: number;
}>;

type FetchComponentSpecFn = (
  fileKey: string | null,
  params: {
    nodeId: string;
    depth?: number;
    compact?: boolean;
  },
) => Promise<{
  success: true;
  variants?: Array<{
    nodeId: string;
    name: string;
  }>;
}>;

const DEFAULT_IMAGE_BATCH_SIZE = 20;
const DEFAULT_IMAGE_FETCH_CONCURRENCY = 4;
const DEFAULT_ENRICH_COMPONENT_SPEC_CONCURRENCY = 6;
const MAX_ENRICH_COMPONENT_SPEC_CONCURRENCY = 32;
const DEFAULT_MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB
const MAX_IMAGE_BATCH_SIZE = 100;
const MAX_IMAGE_FETCH_CONCURRENCY = 16;
const MAX_CAPTURED_IMAGE_BYTES = 50 * 1024 * 1024; // 50MB
const MAX_VARIANT_LIMIT_PER_COMPONENT = 50;
const MAX_PROOF_ERROR_SLUGS = 100;
const MAX_MISSING_VARIANTS_PER_COMPONENT_IN_ERROR = 20;
const MAX_VARIANT_EXPECTATION_FALLBACK_LOOKUPS = 1000;

function createProofRequiredError(
  message: string,
  context: Record<string, unknown>,
) {
  return {
    code: 'sync.component_proofs_required_failed',
    message,
    context,
  } as const;
}

function normalizeBoundedInt(
  value: number,
  fallback: number,
  min: number,
  max: number,
): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  const rounded = Math.floor(numeric);
  return Math.min(max, Math.max(min, rounded));
}

function sanitizeFileSegment(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

async function mapWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return;

  const safeConcurrency = Math.max(1, Math.floor(concurrency));
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(safeConcurrency, items.length) },
    async () => {
      while (true) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        if (currentIndex >= items.length) return;
        await worker(items[currentIndex] as T);
      }
    },
  );
  await Promise.all(workers);
}

async function captureComponentMainProofImages(options: {
  entries: SyncComponentEntry[];
  repoRoot: string;
  dsId: string;
  figmaFileId: string | null;
  fetchComponentImages: FetchComponentImagesFn;
  imageBatchSize: number;
  imageFetchConcurrency: number;
  maxImageBytes: number;
}): Promise<void> {
  const {
    entries,
    repoRoot,
    dsId,
    figmaFileId,
    fetchComponentImages,
    imageBatchSize,
    imageFetchConcurrency,
    maxImageBytes,
  } = options;
  const paths = resolveSystemPaths(dsId, repoRoot);
  const proofImageDir = path.join(
    paths.generatedDir,
    'visual-proofs',
    'images',
  );
  fs.mkdirSync(proofImageDir, { recursive: true });

  const nodeIdToEntry = new Map<string, SyncComponentEntry>();
  for (const entry of entries) {
    const nodeId = String(entry.figma.componentSetNodeId || '').trim();
    if (!nodeId) continue;
    nodeIdToEntry.set(nodeId, entry);
  }
  const nodeIds = Array.from(nodeIdToEntry.keys());
  if (nodeIds.length === 0) return;

  const batchSize = Math.max(1, Math.floor(imageBatchSize));
  const batches: string[][] = [];
  for (let i = 0; i < nodeIds.length; i += batchSize) {
    batches.push(nodeIds.slice(i, i + batchSize));
  }

  await mapWithConcurrency(batches, imageFetchConcurrency, async (batch) => {
    const result = await fetchComponentImages(figmaFileId, {
      nodeIds: batch,
      format: 'PNG',
      scale: 2,
    });
    for (const image of result.images || []) {
      const nodeId = String(image.nodeId || '').trim();
      const entry = nodeIdToEntry.get(nodeId);
      if (!entry) continue;
      const encoded = String(image.base64 || '').trim();
      if (!encoded) continue;
      let buffer: Buffer;
      try {
        buffer = Buffer.from(encoded, 'base64');
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        console.warn(
          `[captureComponentMainProofImages] Invalid base64 for slug=${entry.slug} nodeId=${nodeId}: ${reason}`,
        );
        continue;
      }
      if (!buffer.length) continue;
      if (buffer.length > maxImageBytes) {
        console.warn(
          `[captureComponentMainProofImages] Skipping oversized image for slug=${entry.slug} nodeId=${nodeId}: ${buffer.length} bytes (limit=${maxImageBytes}).`,
        );
        continue;
      }
      const ext = extensionFromFormat(image.format);
      const outPath = path.join(proofImageDir, `${entry.slug}.${ext}`);
      try {
        await fs.promises.writeFile(outPath, buffer);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        console.warn(
          `[captureComponentMainProofImages] Failed writing image for slug=${entry.slug} nodeId=${nodeId} path=${outPath}: ${reason}`,
        );
        continue;
      }
    }
  });
}

async function captureComponentVariantProofImages(options: {
  entries: SyncComponentEntry[];
  repoRoot: string;
  dsId: string;
  figmaFileId: string | null;
  fetchComponentSpec: FetchComponentSpecFn;
  fetchComponentImages: FetchComponentImagesFn;
  variantLimitPerComponent: number;
  imageBatchSize: number;
  imageFetchConcurrency: number;
  maxImageBytes: number;
}): Promise<void> {
  const {
    entries,
    repoRoot,
    dsId,
    figmaFileId,
    fetchComponentSpec,
    fetchComponentImages,
    variantLimitPerComponent,
    imageBatchSize,
    imageFetchConcurrency,
    maxImageBytes,
  } = options;
  const paths = resolveSystemPaths(dsId, repoRoot);
  const variantsDir = path.join(
    paths.generatedDir,
    'visual-proofs',
    'images',
    'variants',
  );
  fs.mkdirSync(variantsDir, { recursive: true });

  const processEntry = async (entry: SyncComponentEntry): Promise<void> => {
    const componentNodeId = String(entry.figma.componentSetNodeId || '').trim();
    if (!componentNodeId) return;
    let spec;
    try {
      spec = await fetchComponentSpec(figmaFileId, {
        nodeId: componentNodeId,
        depth: 2,
        compact: true,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.warn(
        `[captureComponentVariantProofImages] Failed to fetch spec for slug=${entry.slug} nodeId=${componentNodeId}: ${reason}`,
      );
      return;
    }
    const variants = Array.isArray(spec?.variants)
      ? spec.variants.slice(0, variantLimitPerComponent)
      : [];
    if (variants.length === 0) return;
    const nodeIds = [
      ...new Set(
        variants
          .map((variant) => String(variant.nodeId || '').trim())
          .filter(Boolean),
      ),
    ];
    if (nodeIds.length === 0) return;
    const byNode = new Map<
      string,
      {
        nodeId: string;
        base64?: string;
        format: string;
        byteLength?: number;
        error?: string;
      }
    >();
    const batchSize = Math.max(1, Math.floor(imageBatchSize));
    for (let i = 0; i < nodeIds.length; i += batchSize) {
      const batch = nodeIds.slice(i, i + batchSize);
      let imageResult;
      try {
        imageResult = await fetchComponentImages(figmaFileId, {
          nodeIds: batch,
          format: 'PNG',
          scale: 2,
        });
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        console.warn(
          `[captureComponentVariantProofImages] Failed to fetch images for slug=${entry.slug} nodeId=${componentNodeId}: ${reason}`,
        );
        continue;
      }
      for (const item of imageResult.images || []) {
        const itemNodeId = String(item.nodeId || '').trim();
        if (!itemNodeId) continue;
        byNode.set(itemNodeId, item);
      }
    }
    for (let i = 0; i < variants.length; i += 1) {
      const variant = variants[i];
      const nodeId = String(variant.nodeId || '').trim();
      const image = byNode.get(nodeId);
      const encoded = String(image?.base64 || '').trim();
      if (!encoded) continue;
      let buffer: Buffer;
      try {
        buffer = Buffer.from(encoded, 'base64');
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        console.warn(
          `[captureComponentVariantProofImages] Invalid base64 for slug=${entry.slug} variantNodeId=${nodeId}: ${reason}`,
        );
        continue;
      }
      if (!buffer.length) continue;
      if (buffer.length > maxImageBytes) {
        console.warn(
          `[captureComponentVariantProofImages] Skipping oversized variant image for slug=${entry.slug} variantNodeId=${nodeId}: ${buffer.length} bytes (limit=${maxImageBytes}).`,
        );
        continue;
      }
      const ext = extensionFromFormat(image?.format || 'PNG');
      const variantName =
        sanitizeFileSegment(String(variant.name || 'variant')) || 'variant';
      const outName = `${entry.slug}__${String(i + 1).padStart(2, '0')}__${variantName}.${ext}`;
      const outPath = path.join(variantsDir, outName);
      try {
        await fs.promises.writeFile(outPath, buffer);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        console.warn(
          `[captureComponentVariantProofImages] Failed writing variant image for slug=${entry.slug} variantNodeId=${nodeId} path=${outPath}: ${reason}`,
        );
        continue;
      }
    }
  };

  await mapWithConcurrency(entries, imageFetchConcurrency, processEntry);
}

const IMAGE_EXTENSION_TO_CONTENT_TYPE: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

function isImageFile(fileName: string): boolean {
  const ext = path.extname(String(fileName || '').toLowerCase());
  return Object.prototype.hasOwnProperty.call(
    IMAGE_EXTENSION_TO_CONTENT_TYPE,
    ext,
  );
}

function toRepoRelativePath(
  repoRoot: string,
  absolutePath: string,
): string | null {
  const relative = path.relative(
    path.resolve(repoRoot),
    path.resolve(absolutePath),
  );
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative))
    return null;
  return relative.split(path.sep).join('/');
}

function walkFiles(
  dirPath: string,
  options: {
    maxDepth?: number;
    maxFiles?: number;
  } = {},
): { files: string[]; truncated: boolean } {
  const { maxDepth = 6, maxFiles = 10_000 } = options;
  if (!fs.existsSync(dirPath)) return { files: [], truncated: false };
  const out: string[] = [];
  let truncated = false;
  const stack: Array<{ path: string; depth: number }> = [
    { path: dirPath, depth: 0 },
  ];
  while (stack.length > 0) {
    if (out.length >= maxFiles) {
      truncated = true;
      break;
    }
    const current = stack.pop() as { path: string; depth: number };
    if (current.depth > maxDepth) continue;
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(current.path, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const absolute = path.join(current.path, entry.name);
      if (entry.isDirectory()) {
        // Skip common non-content folders to avoid wasteful traversal.
        if (
          entry.name === 'node_modules' ||
          entry.name === '.git' ||
          entry.name === '.svn' ||
          entry.name === '.hg' ||
          entry.name.startsWith('.')
        ) {
          continue;
        }
        stack.push({ path: absolute, depth: current.depth + 1 });
        continue;
      }
      if (entry.isFile()) out.push(absolute);
    }
  }
  return { files: out, truncated };
}

function deriveVariantName(fileStem: string, slug: string): string {
  const normalizedSlug = String(slug || '')
    .trim()
    .toLowerCase();
  const normalizedStem = String(fileStem || '').trim();
  if (!normalizedStem) return 'Variant';
  if (normalizedStem.includes('__')) {
    const [, ...rest] = normalizedStem.split('__');
    const candidate = rest.join(' ').replace(/[_-]+/g, ' ').trim();
    return candidate || 'Variant';
  }
  if (
    normalizedSlug &&
    normalizedStem.toLowerCase().startsWith(`${normalizedSlug}-`)
  ) {
    const candidate = normalizedStem
      .slice(normalizedSlug.length + 1)
      .replace(/[_-]+/g, ' ')
      .trim();
    return candidate || 'Variant';
  }
  return normalizedStem.replace(/[_-]+/g, ' ').trim() || 'Variant';
}

function discoverComponentSpecsFromFilesystem(options: {
  entries: SyncComponentEntry[];
  repoRoot: string;
  componentsDir: string;
}): Map<string, SyncComponentEntry['specs']> {
  const { entries, repoRoot, componentsDir } = options;
  const bySlug = new Map<string, SyncComponentEntry['specs']>();
  if (!fs.existsSync(componentsDir)) return bySlug;
  const knownSlugs = new Set(entries.map((entry) => entry.slug));
  let files: fs.Dirent[] = [];
  try {
    files = fs.readdirSync(componentsDir, { withFileTypes: true });
  } catch {
    return bySlug;
  }
  for (const file of files) {
    if (!file.isFile() || !file.name.toLowerCase().endsWith('.md')) continue;
    const fileStem = file.name.slice(0, -3);
    const slug = slugifyComponentName(fileStem);
    if (!knownSlugs.has(slug)) continue;
    const absolutePath = path.join(componentsDir, file.name);
    const docPath = toRepoRelativePath(repoRoot, absolutePath);
    if (!docPath) continue;
    bySlug.set(slug, [
      {
        docPath,
        docStatus: 'draft',
        coverage: 0,
      },
    ]);
  }
  return bySlug;
}

function discoverComponentVisualProofsFromFilesystem(options: {
  entries: SyncComponentEntry[];
  repoRoot: string;
  generatedDir: string;
}): Map<string, SyncComponentEntry['visualProofs']> {
  const { entries, repoRoot, generatedDir } = options;
  const bySlug = new Map<string, SyncComponentEntry['visualProofs']>();
  const entryBySlug = new Map(entries.map((entry) => [entry.slug, entry]));
  const variantDimensionsBySlug = new Map<
    string,
    Map<string, { image_width?: number | null; image_height?: number | null }>
  >();
  for (const entry of entries) {
    const variants = Array.isArray(entry.figma.variants)
      ? entry.figma.variants
      : [];
    if (variants.length === 0) continue;
    const dimensionsByName = new Map<
      string,
      { image_width?: number | null; image_height?: number | null }
    >();
    for (const variant of variants) {
      const variantSlug = slugifyComponentName(String(variant.name || ''));
      if (!variantSlug) continue;
      dimensionsByName.set(variantSlug, {
        image_width: Number.isFinite(Number(variant.width))
          ? Number(variant.width)
          : null,
        image_height: Number.isFinite(Number(variant.height))
          ? Number(variant.height)
          : null,
      });
    }
    if (dimensionsByName.size > 0) {
      variantDimensionsBySlug.set(entry.slug, dimensionsByName);
    }
  }
  const knownSlugs = new Set(entries.map((entry) => entry.slug));
  const mainImageDir = path.join(generatedDir, 'visual-proofs', 'images');
  const variantsDir = path.join(mainImageDir, 'variants');
  if (!fs.existsSync(mainImageDir)) return bySlug;

  const variantRowsBySlug = new Map<
    string,
    Array<{
      name: string;
      image_path?: string | null;
      captured_at?: string | null;
      image_bytes?: number | null;
      image_content_type?: string | null;
      image_width?: number | null;
      image_height?: number | null;
    }>
  >();

  const variantWalk = walkFiles(variantsDir);
  if (variantWalk.truncated) {
    console.warn(
      `[discoverComponentVisualProofsFromFilesystem] Variant scan truncated at ${variantWalk.files.length} files for ${variantsDir}.`,
    );
  }
  for (const absolutePath of variantWalk.files) {
    const fileName = path.basename(absolutePath);
    if (!isImageFile(fileName)) continue;
    const fileStem = path.basename(fileName, path.extname(fileName));
    const slugRaw = fileStem.includes('__')
      ? fileStem.split('__')[0]
      : fileStem.split('.')[0];
    const slug = slugifyComponentName(slugRaw);
    if (!knownSlugs.has(slug)) continue;
    const relPath = toRepoRelativePath(repoRoot, absolutePath);
    if (!relPath) continue;
    let stats: fs.Stats | null = null;
    try {
      stats = fs.statSync(absolutePath);
    } catch {
      stats = null;
    }
    const variantRows = variantRowsBySlug.get(slug) || [];
    const variantName = deriveVariantName(fileStem, slug);
    const variantDimensions = variantDimensionsBySlug.get(slug)?.get(
      slugifyComponentName(variantName),
    );
    variantRows.push({
      name: variantName,
      image_path: relPath,
      captured_at: stats ? new Date(stats.mtimeMs).toISOString() : null,
      image_bytes: stats ? stats.size : null,
      image_content_type:
        IMAGE_EXTENSION_TO_CONTENT_TYPE[path.extname(fileName).toLowerCase()] ||
        null,
      image_width: variantDimensions?.image_width ?? null,
      image_height: variantDimensions?.image_height ?? null,
    });
    variantRowsBySlug.set(slug, variantRows);
  }

  let files: fs.Dirent[] = [];
  try {
    files = fs.readdirSync(mainImageDir, { withFileTypes: true });
  } catch {
    files = [];
  }

  for (const file of files) {
    if (!file.isFile() || !isImageFile(file.name)) continue;
    const slug = slugifyComponentName(
      path.basename(file.name, path.extname(file.name)),
    );
    if (!knownSlugs.has(slug)) continue;
    const absolutePath = path.join(mainImageDir, file.name);
    const imagePath = toRepoRelativePath(repoRoot, absolutePath);
    if (!imagePath) continue;
    let stats: fs.Stats | null = null;
    try {
      stats = fs.statSync(absolutePath);
    } catch {
      stats = null;
    }
    const variants = variantRowsBySlug.get(slug) || [];
    bySlug.set(slug, [
      {
        imagePath,
        capturedAt: stats ? new Date(stats.mtimeMs).toISOString() : undefined,
        capturedAtEpoch: stats ? Math.floor(stats.mtimeMs / 1000) : undefined,
        imageBytes: stats ? stats.size : undefined,
        imageContentType:
          IMAGE_EXTENSION_TO_CONTENT_TYPE[
            path.extname(file.name).toLowerCase()
          ],
        imageWidth:
          entryBySlug.get(slug)?.figma.componentSetWidth ??
          undefined,
        imageHeight:
          entryBySlug.get(slug)?.figma.componentSetHeight ??
          undefined,
        variantsCount: variants.length,
        variants,
      },
    ]);
  }

  return bySlug;
}

function enrichComponentEntriesFromFilesystem(options: {
  entries: SyncComponentEntry[];
  repoRoot: string;
  dsId: string;
}): SyncComponentEntry[] {
  const { entries, repoRoot, dsId } = options;
  const systemPaths = resolveSystemPaths(dsId, repoRoot);
  const specsBySlug = discoverComponentSpecsFromFilesystem({
    entries,
    repoRoot,
    componentsDir: systemPaths.componentsDir,
  });
  const proofsBySlug = discoverComponentVisualProofsFromFilesystem({
    entries,
    repoRoot,
    generatedDir: systemPaths.generatedDir,
  });

  return entries.map((entry) => {
    const specs = specsBySlug.get(entry.slug);
    const visualProofs = proofsBySlug.get(entry.slug);
    return {
      ...entry,
      specs: specs && specs.length > 0 ? specs : entry.specs,
      visualProofs:
        visualProofs && visualProofs.length > 0
          ? visualProofs
          : entry.visualProofs,
    };
  });
}

type SyncComponentEntry = {
  slug: string;
  name: string;
  status: 'draft';
  docType: 'component';
    figma: {
      fileUrl: string;
      componentSetNodeId: string;
      componentSetWidth?: number;
      componentSetHeight?: number;
      pageName?: string;
      runId?: string;
      capturedAtEpoch?: number;
      schemaVersion?: number;
      structuredCaptureStatus?: 'ok' | 'failed';
      variants?: Array<{
        name: string;
        properties: Record<string, string>;
        nodeId?: string;
        width?: number;
        height?: number;
      }>;
    tokenBindings?: Array<{
      nodeId: string;
      nodeName: string;
      field: string;
      variableId: string;
      tokenPath?: string;
      mode?: string;
      // Layer Token Mapping fields (Migration 027)
      variantNodeId?: string;
      variantSignature?: string;
      propertyPath?: string;
      status?: 'resolved' | 'unresolved';
      modeId?: string;
      modeName?: string;
    }>;
    instanceDependencies?: Array<{
      instanceNodeId: string;
      instanceNodeName: string;
      usedComponentNodeId: string;
      usedComponentName: string;
      usedComponentKey?: string;
      status?: 'resolved' | 'unresolved';
    }>;
    layout?: Array<{
      nodeId: string;
      nodeName: string;
      depth: number;
      direction?: 'Horizontal' | 'Vertical' | '—';
      hSizing?: string;
      vSizing?: string;
      alignmentH?: string;
      alignmentV?: string;
      itemSpacing?: number;
      padding?: { top: number; right: number; bottom: number; left: number };
    }>;
    props?: Array<{
      name: string;
      type: 'enum' | 'text' | 'boolean' | 'instance_swap' | 'slot';
      values?: string[];
      defaultValue?: unknown;
      required?: boolean;
      description?: string;
    }>;
  };
  specs?: Array<{
    docPath: string;
    docStatus?: 'draft' | 'ready' | 'needs-review';
    coverage?: number;
  }>;
  visualProofs?: Array<{
    imagePath: string;
    screenshotUrl?: string;
    caption?: string;
    capturedAt?: string;
    capturedAtEpoch?: number;
    nodeId?: string;
    imageSha256?: string;
    imageBytes?: number;
    imageContentType?: string;
    imageWidth?: number;
    imageHeight?: number;
    variantsCount?: number;
    variants?: Array<{
      name: string;
      node_id?: string | null;
      screenshot_url?: string | null;
      image_path?: string | null;
      captured_at?: string | null;
      image_sha256?: string | null;
      image_bytes?: number | null;
      image_content_type?: string | null;
      image_width?: number | null;
      image_height?: number | null;
    }>;
  }>;
};

export interface SyncFromPluginOptions {
  db: Sql;
  componentRepo: ComponentRepository;
  dsId: string;
  figmaFileId: string;
  includeComponents?: boolean;
  dryRun?: boolean;
  selectedComponentNodeIds?: string[];
  /** When true, import fails if any imported component lacks a main screenshot. */
  requireComponentProofs?: boolean;
  /** When true, import fails if any component with variants lacks variant screenshots. */
  requireVariantProofsWhenPresent?: boolean;
  fetchVariables?: (fileKey?: string | null) => Promise<FigmaVariablesResponse>;
  searchComponents?: (
    fileKey: string | null,
    params: {
      includeVariants?: boolean;
      compact?: boolean;
      limit?: number;
      offset?: number;
      scanSessionId?: string;
    },
  ) => Promise<{
    components: Array<{ nodeId: string; name: string; pageName?: string }>;
    truncated?: boolean;
    total?: number;
    totalIsEstimated?: boolean;
    hasMore?: boolean;
    nextOffset?: number | null;
  }>;
  fetchComponentImages?: FetchComponentImagesFn;
  fetchComponentSpec?: FetchComponentSpecFn;
  fetchFullComponentSpec?: FetchFullComponentSpecFn;
  captureComponentProofs?: boolean;
  captureComponentProofVariants?: boolean;
  captureComponentProofVariantLimit?: number;
  imageBatchSize?: number;
  imageFetchConcurrency?: number;
  maxCapturedImageBytes?: number;
  enrichComponentSpecConcurrency?: number;
  createRunId?: () => string;
  repoRoot?: string;
  reindexUsageFromFilesystem?: boolean;
  usageReindexStrict?: boolean;
}

export interface SyncFromPluginResult {
  tokens: number;
  tokenModeValues: number;
  aliases: number;
  components: number;
  componentsTruncated: boolean;
  usageRestored: number;
  usageDropped: number;
  usageReindexed: number;
  usageReindexStatus: 'not_requested' | 'ok' | 'failed';
  usageReindexReason:
    | 'none'
    | 'missing_repo_root'
    | 'no_sources'
    | 'runtime_error';
  usageReindexWarnings: string[];
  specsEnriched: number;
  proofsEnriched: number;
  dryRun: boolean;
  importMode: 'full' | 'partial';
  selectedCount: number;
  notSelectedCount: number;
}

type UsageOccurrenceRow = {
  tokenId: string;
  kind: string;
  source: string;
  owner: string;
  detail: string;
};

function mapPluginBridgeError(
  error: unknown,
  args: {
    figmaFileId: string;
    operation: 'variables' | 'components';
  },
): Error {
  const message = error instanceof Error ? error.message : String(error);
  const wrapWithCause = (userMessage: string): Error => {
    const cause = error instanceof Error ? error : new Error(message);
    return new Error(userMessage, { cause });
  };
  const action =
    args.operation === 'variables' ? 'read variables' : 'read components';
  if (message.includes('ws.request.no_socket_for_file')) {
    return wrapWithCause(
      `Cannot ${action} from Figma file "${args.figmaFileId}" because no plugin socket is connected for that file. ` +
        'Open that exact file in Figma Desktop, run the Figma Desktop Bridge plugin, and retry.',
    );
  }
  if (message.includes('ws.request.timeout')) {
    return wrapWithCause(
      `Timeout while trying to ${action} from Figma file "${args.figmaFileId}". ` +
        'Ensure the Figma Desktop Bridge plugin is running and responsive, then retry.',
    );
  }
  if (
    message.includes('ws.request.socket_not_open') ||
    message.includes('ws.connection.closed')
  ) {
    return wrapWithCause(
      `Plugin connection was lost while trying to ${action} from Figma file "${args.figmaFileId}". ` +
        'Reopen the file in Figma Desktop, restart the Figma Desktop Bridge plugin, and retry.',
    );
  }
  if (
    message.includes('ws.request.no_connection') ||
    message.includes('ws.request.send_failed')
  ) {
    return wrapWithCause(
      `Plugin bridge is unavailable while trying to ${action} from Figma file "${args.figmaFileId}". ` +
        'Restart the Figma Desktop Bridge plugin and retry.',
    );
  }
  if (message.includes('ws.response.error:')) {
    return wrapWithCause(
      `Plugin reported an error while trying to ${action} from Figma file "${args.figmaFileId}". ` +
        'Check the Figma Desktop Bridge plugin console for details and retry.',
    );
  }
  // Unmapped error: wrap with original as cause if it's an Error
  return error instanceof Error ? error : new Error(message);
}

function buildTokenUsageRowsFromFilesystem(options: {
  dsId: string;
  repoRoot: string;
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
  aliases: AliasRow[];
}): { rows: UsageOccurrenceRow[]; warnings: string[]; noSources: boolean } {
  const { dsId, repoRoot, tokenCatalog, aliases } = options;
  const paths = resolveSystemPaths(dsId, repoRoot);
  const warnings: string[] = [];
  const rows: UsageOccurrenceRow[] = [];

  const cssFiles = [
    path.join(paths.outputDir, 'primitives.css'),
    path.join(paths.outputDir, 'tokens.css'),
  ];
  const existingCssFiles = cssFiles.filter((filePath) => {
    const exists = fs.existsSync(filePath);
    if (!exists)
      warnings.push(`Missing CSS source for usage scan: ${filePath}`);
    return exists;
  });
  if (existingCssFiles.length === 0) {
    return {
      rows: [],
      warnings,
      noSources: true,
    };
  }

  const cssRefs = extractCssReferences(existingCssFiles, tokenCatalog);
  const aliasChains = buildAliasChains(existingCssFiles, tokenCatalog);
  const usageIndex = generateUsageIndex(tokenCatalog, cssRefs, aliasChains);

  for (const entry of usageIndex.entries) {
    for (const usage of entry.usedIn) {
      rows.push({
        tokenId: entry.path,
        kind: usage.kind,
        source: usage.source,
        owner: usage.owner,
        detail: usage.detail ?? '',
      });
    }
  }

  for (const alias of aliases) {
    rows.push({
      tokenId: alias.toPath,
      kind: 'figma-alias',
      source: 'figma-variables',
      owner: alias.fromPath,
      detail: JSON.stringify(alias.modes || []),
    });
  }

  return { rows, warnings, noSources: false };
}

export async function syncDesignSystemFromPlugin(
  options: SyncFromPluginOptions,
): Promise<SyncFromPluginResult> {
  const {
    db,
    componentRepo,
    dsId,
    figmaFileId,
    includeComponents = true,
    dryRun = false,
    fetchVariables = fetchVariablesDirect,
    searchComponents = searchComponentsDirect,
    fetchComponentImages = getComponentImageDirect,
    fetchComponentSpec = getComponentSpecDirect,
    fetchFullComponentSpec = getComponentSpecDirect as FetchFullComponentSpecFn,
    captureComponentProofs = false,
    captureComponentProofVariants = false,
    captureComponentProofVariantLimit = 8,
    imageBatchSize = DEFAULT_IMAGE_BATCH_SIZE,
    imageFetchConcurrency = DEFAULT_IMAGE_FETCH_CONCURRENCY,
    maxCapturedImageBytes = DEFAULT_MAX_IMAGE_BYTES,
    enrichComponentSpecConcurrency = DEFAULT_ENRICH_COMPONENT_SPEC_CONCURRENCY,
    createRunId = randomUUID,
    repoRoot,
    reindexUsageFromFilesystem = false,
    usageReindexStrict = true,
    requireComponentProofs = false,
    requireVariantProofsWhenPresent = false,
  } = options;
  const safeVariantLimitPerComponent = normalizeBoundedInt(
    captureComponentProofVariantLimit,
    8,
    0,
    MAX_VARIANT_LIMIT_PER_COMPONENT,
  );
  const safeImageBatchSize = normalizeBoundedInt(
    imageBatchSize,
    DEFAULT_IMAGE_BATCH_SIZE,
    1,
    MAX_IMAGE_BATCH_SIZE,
  );
  const safeImageFetchConcurrency = normalizeBoundedInt(
    imageFetchConcurrency,
    DEFAULT_IMAGE_FETCH_CONCURRENCY,
    1,
    MAX_IMAGE_FETCH_CONCURRENCY,
  );
  const safeMaxCapturedImageBytes = normalizeBoundedInt(
    maxCapturedImageBytes,
    DEFAULT_MAX_IMAGE_BYTES,
    1,
    MAX_CAPTURED_IMAGE_BYTES,
  );
  const safeEnrichComponentSpecConcurrency = normalizeBoundedInt(
    enrichComponentSpecConcurrency,
    DEFAULT_ENRICH_COMPONENT_SPEC_CONCURRENCY,
    1,
    MAX_ENRICH_COMPONENT_SPEC_CONCURRENCY,
  );
  const willRunReindex = reindexUsageFromFilesystem && Boolean(repoRoot);
  const syncRunId = createRunId();
  const syncCapturedAtEpoch = Math.floor(Date.now() / 1000);
  const structuredSchemaVersion = 1;

  if (reindexUsageFromFilesystem && !repoRoot && usageReindexStrict) {
    throw new Error(
      'Token usage reindex failed: Token usage reindex requested but repoRoot is missing.',
    );
  }

  let variablesResponse: FigmaVariablesResponse;
  try {
    variablesResponse = await fetchVariables(figmaFileId);
  } catch (error) {
    throw mapPluginBridgeError(error, {
      figmaFileId,
      operation: 'variables',
    });
  }
  const { tokens, modeValues, aliases, graphJson } = buildTokenRows(
    variablesResponse.meta,
  );
  const variableIdToTokenPath = buildVariableIdToTokenPathMap(
    variablesResponse.meta,
  );
  const variableIdToDefaultModeContext = buildVariableIdToDefaultModeContextMap(
    variablesResponse.meta,
  );

  let componentEntries: SyncComponentEntry[] = [];
  let componentsTruncated = false;
  let specsEnriched = 0;
  let proofsEnriched = 0;
  const structuredDataWarnings: string[] = [];
  let importMode: 'full' | 'partial' = 'full';
  let selectedCount = 0;
  let notSelectedCount = 0;

  if (includeComponents) {
    const selectedSet = new Set(
      (options.selectedComponentNodeIds || [])
        .map((value) => String(value || '').trim())
        .filter((value) => value.length > 0),
    );
    importMode = selectedSet.size > 0 ? 'partial' : 'full';

    const PAGE_LIMIT = 500;
    const MAX_COMPONENT_SCAN_PAGES = 100;
    const scanSessionId = `sync-${syncRunId}`;
    const dedupedByNodeId = new Map<
      string,
      { nodeId: string; name: string; pageName?: string; width?: number; height?: number }
    >();
    let scannedTotal: number | null = null;
    let offset = 0;
    let page = 0;
    let hasMore = true;

    try {
      while (hasMore && page < MAX_COMPONENT_SCAN_PAGES) {
        page += 1;
        const pageResult = await searchComponents(figmaFileId, {
          includeVariants: false,
          compact: true,
          limit: PAGE_LIMIT,
          offset,
          scanSessionId,
        });
        const pageComponents = Array.isArray(pageResult.components)
          ? pageResult.components
          : [];
        componentsTruncated =
          componentsTruncated ||
          pageResult.truncated === true ||
          pageResult.totalIsEstimated === true;
        if (
          typeof pageResult.total === 'number' &&
          Number.isFinite(pageResult.total) &&
          pageResult.total >= 0
        ) {
          scannedTotal = Math.floor(pageResult.total);
        }

        for (const entry of pageComponents) {
          const nodeId = String(entry.nodeId || '').trim();
          if (!nodeId || dedupedByNodeId.has(nodeId)) continue;
          dedupedByNodeId.set(nodeId, {
            nodeId,
            name: String(entry.name || '').trim(),
            pageName: entry.pageName,
            width: Number.isFinite(Number(entry.width)) ? Number(entry.width) : undefined,
            height: Number.isFinite(Number(entry.height)) ? Number(entry.height) : undefined,
          });
        }

        const pageHasMore =
          pageResult.hasMore === true ||
          (pageResult.hasMore === undefined &&
            pageComponents.length === PAGE_LIMIT);
        const reachedKnownTotal =
          scannedTotal !== null &&
          offset + pageComponents.length >= scannedTotal;
        if (!pageHasMore || pageComponents.length === 0) {
          hasMore = false;
          break;
        }
        if (reachedKnownTotal) {
          hasMore = false;
          break;
        }

        const nextOffsetRaw = Number(pageResult.nextOffset);
        const nextOffset = Number.isFinite(nextOffsetRaw)
          ? Math.max(0, Math.floor(nextOffsetRaw))
          : offset + pageComponents.length;
        if (!Number.isFinite(nextOffsetRaw)) {
          console.warn(
            `[syncDesignSystemFromPlugin] SEARCH_COMPONENTS returned non-finite nextOffset (${String(pageResult.nextOffset)}); using fallback offset progression.`,
          );
        }
        if (nextOffset <= offset) {
          hasMore = false;
          break;
        }
        offset = nextOffset;
      }
      if (hasMore && page >= MAX_COMPONENT_SCAN_PAGES) {
        componentsTruncated = true;
      }
    } catch (error) {
      throw mapPluginBridgeError(error, {
        figmaFileId,
        operation: 'components',
      });
    }

    const scannedComponents = Array.from(dedupedByNodeId.values());
    const effectiveScannedTotal = scannedTotal ?? scannedComponents.length;
    const usedSlugs = new Set<string>();
    const figmaFileUrl = `https://www.figma.com/design/${encodeURIComponent(figmaFileId)}`;
    componentEntries = scannedComponents.map((entry) => {
      const slug = uniqueSlug(slugifyComponentName(entry.name), usedSlugs);
      return {
        slug,
        name: String(entry.name || '').trim() || slug,
        status: 'draft' as const,
        docType: 'component' as const,
        figma: {
          fileUrl: figmaFileUrl,
          componentSetNodeId: String(entry.nodeId || '').trim(),
          componentSetWidth: Number.isFinite(Number(entry.width))
            ? Number(entry.width)
            : undefined,
          componentSetHeight: Number.isFinite(Number(entry.height))
            ? Number(entry.height)
            : undefined,
          pageName: entry.pageName,
          runId: syncRunId,
          capturedAtEpoch: syncCapturedAtEpoch,
          schemaVersion: structuredSchemaVersion,
          structuredCaptureStatus: 'failed',
        },
      };
    });

    // Filter by selected node IDs for partial import (Migration 034 flow)
    if (importMode === 'partial') {
      const beforeCount = componentEntries.length;
      componentEntries = componentEntries.filter((e) => {
        const nodeId = String(e.figma.componentSetNodeId || '').trim();
        return nodeId.length > 0 && selectedSet.has(nodeId);
      });
      const filteredCount = beforeCount - componentEntries.length;
      if (filteredCount > 0) {
        console.log(
          `[syncDesignSystemFromPlugin] Partial import: ${componentEntries.length}/${beforeCount} components selected`,
        );
      }
      if (selectedSet.size > 0 && componentEntries.length === 0) {
        console.warn(
          `[syncDesignSystemFromPlugin] Partial import requested ${selectedSet.size} component node id(s), but none matched the scanned component set.`,
        );
      }
    }
    selectedCount = componentEntries.length;
    notSelectedCount =
      importMode === 'partial'
        ? Math.max(0, effectiveScannedTotal - selectedCount)
        : 0;

    if (!dryRun && componentEntries.length > 0 && repoRoot) {
      if (captureComponentProofs) {
        try {
          await captureComponentMainProofImages({
            entries: componentEntries,
            repoRoot,
            dsId,
            figmaFileId,
            fetchComponentImages,
            imageBatchSize: safeImageBatchSize,
            imageFetchConcurrency: safeImageFetchConcurrency,
            maxImageBytes: safeMaxCapturedImageBytes,
          });
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          if (requireComponentProofs) {
            throw createProofRequiredError(
              `Component screenshot capture failed: ${reason}`,
              {
                importMode: importMode === 'partial' ? 'partial' : 'full',
                importedCount: componentEntries.length,
                proofsEnriched,
                proofCaptureStage: 'main_capture',
                captureFailureReason: reason,
                missingMainProofSlugs: [],
                totalMissingMainProofs: 0,
                missingVariantProofSlugs: [],
                totalMissingVariantProofs: 0,
                variantExpectationErrors: [],
                totalVariantExpectationErrors: 0,
              },
            );
          }
          console.warn(
            `[syncDesignSystemFromPlugin] Component proof capture failed (continuing import): ${reason}`,
          );
        }
      }
      if (captureComponentProofs && captureComponentProofVariants) {
        try {
          await captureComponentVariantProofImages({
            entries: componentEntries,
            repoRoot,
            dsId,
            figmaFileId,
            fetchComponentSpec,
            fetchComponentImages,
            variantLimitPerComponent: safeVariantLimitPerComponent,
            imageBatchSize: safeImageBatchSize,
            imageFetchConcurrency: safeImageFetchConcurrency,
            maxImageBytes: safeMaxCapturedImageBytes,
          });
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          if (requireVariantProofsWhenPresent) {
            throw createProofRequiredError(
              `Component variant screenshot capture failed: ${reason}`,
              {
                importMode: importMode === 'partial' ? 'partial' : 'full',
                importedCount: componentEntries.length,
                proofsEnriched,
                proofCaptureStage: 'variant_capture',
                captureFailureReason: reason,
                missingMainProofSlugs: [],
                totalMissingMainProofs: 0,
                missingVariantProofSlugs: [],
                totalMissingVariantProofs: 0,
                variantExpectationErrors: [],
                totalVariantExpectationErrors: 0,
              },
            );
          }
          console.warn(
            `[syncDesignSystemFromPlugin] Component variant proof capture failed (continuing import): ${reason}`,
          );
        }
      }
    }

    if (componentEntries.length > 0 && repoRoot) {
      try {
        componentEntries = enrichComponentEntriesFromFilesystem({
          entries: componentEntries,
          repoRoot,
          dsId,
        });
        specsEnriched = componentEntries.filter(
          (e) => Array.isArray(e.specs) && e.specs.length > 0,
        ).length;
        proofsEnriched = componentEntries.filter(
          (e) => Array.isArray(e.visualProofs) && e.visualProofs.length > 0,
        ).length;
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        console.warn(
          `[syncDesignSystemFromPlugin] Component filesystem enrichment failed: ${reason}`,
        );
      }
    }

    // Strict proof validation (S-05, S-06, S-07)
    if (
      !dryRun &&
      (requireComponentProofs || requireVariantProofsWhenPresent) &&
      componentEntries.length > 0
    ) {
      const normalizeVariantName = (value: unknown): string =>
        String(value || '')
          .trim()
          .toLocaleLowerCase()
          .replace(/^[0-9]+\s+/, '')
          .replace(/[_=:+-]+/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

      const expectedVariantNamesBySlug = new Map<string, string[]>();
      const variantExpectationErrors: Array<{ slug: string; reason: string }> =
        [];
      let variantFallbackSpecLookups = 0;
      let variantFallbackLookupLimitHit = false;
      let variantFallbackLookupLimitHitSlug = '';

      if (requireVariantProofsWhenPresent) {
        await mapWithConcurrency(
          componentEntries,
          safeEnrichComponentSpecConcurrency,
          async (entry) => {
            const slug = String(entry.slug || '').trim();
            if (variantFallbackLookupLimitHit) {
              expectedVariantNamesBySlug.set(slug, []);
              return;
            }
            const structuredVariants = Array.isArray(entry.figma?.variants)
              ? entry.figma.variants
              : [];
            const structuredNames = Array.from(
              new Set(
                structuredVariants
                  .map((variant) => normalizeVariantName(variant?.name))
                  .filter(Boolean),
              ),
            );
            if (structuredNames.length > 0) {
              expectedVariantNamesBySlug.set(slug, structuredNames);
              return;
            }

            const nodeId = String(entry.figma?.componentSetNodeId || '').trim();
            if (!nodeId) {
              expectedVariantNamesBySlug.set(slug, []);
              return;
            }

            if (
              variantFallbackSpecLookups >=
              MAX_VARIANT_EXPECTATION_FALLBACK_LOOKUPS
            ) {
              variantFallbackLookupLimitHit = true;
              variantFallbackLookupLimitHitSlug = slug;
              expectedVariantNamesBySlug.set(slug, []);
              return;
            }

            try {
              variantFallbackSpecLookups += 1;
              const spec = await fetchFullComponentSpec(figmaFileId, {
                nodeId,
                depth: 2,
                compact: true,
              });
              const fallbackVariants = Array.isArray(spec?.variants)
                ? spec.variants
                : [];
              const fallbackNames = Array.from(
                new Set(
                  fallbackVariants
                    .map((variant) => normalizeVariantName(variant?.name))
                    .filter(Boolean),
                ),
              );
              expectedVariantNamesBySlug.set(slug, fallbackNames);
            } catch (error) {
              const reason =
                error instanceof Error ? error.message : String(error);
              variantExpectationErrors.push({ slug, reason });
              expectedVariantNamesBySlug.set(slug, []);
            }
          },
        );
        if (variantFallbackLookupLimitHit) {
          throw createProofRequiredError(
            `Strict variant screenshot validation stopped after ${MAX_VARIANT_EXPECTATION_FALLBACK_LOOKUPS} fallback component-spec lookups. ` +
              'Narrow the component selection or ensure compact component search includes variant names.',
            {
              importMode: options.selectedComponentNodeIds?.length
                ? 'partial'
                : 'full',
              importedCount: componentEntries.length,
              proofsEnriched,
              fallbackSpecLookupLimit: MAX_VARIANT_EXPECTATION_FALLBACK_LOOKUPS,
              fallbackSpecLookups: variantFallbackSpecLookups,
              fallbackSpecLookupLimitHitSlug:
                variantFallbackLookupLimitHitSlug || null,
            },
          );
        }
        if (variantFallbackSpecLookups >= 100) {
          console.warn(
            `[syncDesignSystemFromPlugin] Strict variant proof validation required ${variantFallbackSpecLookups} fallback GET_COMPONENT_SPEC calls. This can slow imports for large design systems.`,
          );
        }
      }

      const missingMainProofSlugs: string[] = [];
      const missingVariantProofSlugs: Array<{
        slug: string;
        missingVariants: string[];
        totalMissingVariants: number;
      }> = [];

      for (const entry of componentEntries) {
        const slug = String(entry.slug || '').trim();
        const visualProofs = Array.isArray(entry.visualProofs)
          ? entry.visualProofs
          : [];

        const hasMainProof = visualProofs.some((proof) => {
          const imagePath = String(proof?.imagePath || '').trim();
          const screenshotUrl = String(proof?.screenshotUrl || '').trim();
          return imagePath.length > 0 || screenshotUrl.length > 0;
        });
        if (requireComponentProofs && !hasMainProof) {
          missingMainProofSlugs.push(slug);
        }

        if (requireVariantProofsWhenPresent) {
          const expectedVariantNames =
            expectedVariantNamesBySlug.get(slug) || [];
          if (expectedVariantNames.length > 0) {
            const capturedVariantNames = new Set<string>();
            for (const proof of visualProofs) {
              const variants = Array.isArray(proof?.variants)
                ? proof.variants
                : [];
              for (const variant of variants) {
                const normalized = normalizeVariantName(variant?.name);
                const hasVariantImage =
                  String(variant?.image_path || '').trim().length > 0 ||
                  String(variant?.screenshot_url || '').trim().length > 0;
                if (normalized && hasVariantImage) {
                  capturedVariantNames.add(normalized);
                }
              }
            }
            const missingVariants = expectedVariantNames.filter(
              (name) => !capturedVariantNames.has(name),
            );
            if (missingVariants.length > 0) {
              missingVariantProofSlugs.push({
                slug,
                missingVariants: missingVariants.slice(
                  0,
                  MAX_MISSING_VARIANTS_PER_COMPONENT_IN_ERROR,
                ),
                totalMissingVariants: missingVariants.length,
              });
            }
          }
        }
      }

      if (
        missingMainProofSlugs.length > 0 ||
        missingVariantProofSlugs.length > 0 ||
        variantExpectationErrors.length > 0
      ) {
        const hasSelection =
          options.selectedComponentNodeIds &&
          options.selectedComponentNodeIds.length > 0;
        const totalMissingMainProofs = missingMainProofSlugs.length;
        const totalMissingVariantProofs = missingVariantProofSlugs.length;
        const totalVariantExpectationErrors = variantExpectationErrors.length;
        const context = {
          importMode: hasSelection ? 'partial' : 'full',
          importedCount: componentEntries.length,
          proofsEnriched,
          missingMainProofSlugs: missingMainProofSlugs.slice(
            0,
            MAX_PROOF_ERROR_SLUGS,
          ),
          totalMissingMainProofs,
          missingVariantProofSlugs: missingVariantProofSlugs.slice(
            0,
            MAX_PROOF_ERROR_SLUGS,
          ),
          totalMissingVariantProofs,
          variantExpectationErrors: variantExpectationErrors.slice(
            0,
            MAX_PROOF_ERROR_SLUGS,
          ),
          totalVariantExpectationErrors,
        };
        throw createProofRequiredError(
          `Required screenshots missing: ${totalMissingMainProofs} component(s) without main proof, ${totalMissingVariantProofs} component(s) with missing variant proofs, ${totalVariantExpectationErrors} component(s) with unknown variant expectations.`,
          context,
        );
      }
    }
  }

  if (!dryRun) {
    const runId = syncRunId;
    const usageRows = (await db`
      SELECT token_id, kind, source, owner, detail
      FROM token_usage_occurrences
      WHERE ds_id = ${dsId}
    `) as Array<{
      token_id: string;
      kind: string;
      source: string;
      owner: string;
      detail: string;
    }>;
    let usageRestored = 0;
    let usageDropped = 0;
    let usageReindexed = 0;
    let usageReindexStatus: SyncFromPluginResult['usageReindexStatus'] =
      'not_requested';
    let usageReindexReason: SyncFromPluginResult['usageReindexReason'] = 'none';
    let usageReindexWarnings: string[] = [];
    let reindexUsageRows: UsageOccurrenceRow[] = [];

    const nextTokenCatalog = {
      entries: tokens.map((token) => ({
        id: token.id,
        path: token.id,
        $value: token.rawValue,
        type: token.type,
        collection: token.collection,
        cssVar: token.cssVar,
      })),
    };

    if (willRunReindex) {
      try {
        const usageBuild = buildTokenUsageRowsFromFilesystem({
          dsId,
          repoRoot: String(repoRoot),
          tokenCatalog: nextTokenCatalog,
          aliases,
        });
        usageReindexWarnings = usageBuild.warnings;
        if (usageBuild.noSources) {
          usageReindexStatus = 'failed';
          usageReindexReason = 'no_sources';
        } else {
          usageReindexStatus = 'ok';
          usageReindexReason = 'none';
          reindexUsageRows = usageBuild.rows;
        }
      } catch (error) {
        usageReindexStatus = 'failed';
        usageReindexReason = 'runtime_error';
        const reason = error instanceof Error ? error.message : String(error);
        if (usageReindexStrict) {
          throw new Error(`Token usage reindex failed: ${reason}`);
        }
        usageReindexWarnings = [...usageReindexWarnings, reason];
        console.warn(
          `[syncDesignSystemFromPlugin] Token usage reindex failed (non-strict mode): ${reason}`,
        );
      }
    }

    // Upsert tokens directly with ON CONFLICT DO UPDATE (replaces staging)
    await db.begin(async (tx) => {
      await tx`DELETE FROM token_mode_values WHERE ds_id = ${dsId}`;
      await tx`DELETE FROM tokens WHERE ds_id = ${dsId}`;
      await tx`DELETE FROM figma_aliases WHERE ds_id = ${dsId}`;
      await tx`DELETE FROM token_graph WHERE ds_id = ${dsId}`;

      for (const token of tokens) {
        await tx`
          INSERT INTO tokens (id, ds_id, slash_path, css_var, type, collection, raw_value)
          VALUES (${token.id}, ${dsId}, ${token.slashPath}, ${token.cssVar}, ${token.type}, ${token.collection}, ${token.rawValue})
          ON CONFLICT (id, ds_id) DO UPDATE SET
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

      const tokenCountResult = await tx<
        { count: bigint }[]
      >`SELECT COUNT(*) as count FROM tokens WHERE ds_id = ${dsId}`;
      const tokenCount = Number(tokenCountResult[0]?.count ?? 0);
      if (tokenCount === 0) {
        throw new Error('No tokens inserted — aborting swap');
      }

      const orphanAliasResult = await tx<{ count: bigint }[]>`
        SELECT COUNT(*) as count
        FROM figma_aliases fa
        WHERE fa.ds_id = ${dsId}
          AND (
            NOT EXISTS (SELECT 1 FROM tokens st WHERE st.ds_id = fa.ds_id AND st.id = fa.from_path)
            OR NOT EXISTS (SELECT 1 FROM tokens st WHERE st.ds_id = fa.ds_id AND st.id = fa.to_path)
          )
      `;
      const orphanAliasCount = Number(orphanAliasResult[0]?.count ?? 0);
      if (orphanAliasCount > 0) {
        throw new Error(
          `Inserted ${orphanAliasCount} figma aliases with missing token endpoints — aborting swap`,
        );
      }

      const orphanModeResult = await tx<{ count: bigint }[]>`
        SELECT COUNT(*) as count
        FROM token_mode_values sm
        WHERE sm.ds_id = ${dsId}
          AND NOT EXISTS (
            SELECT 1
            FROM tokens st
            WHERE st.ds_id = sm.ds_id
              AND st.id = sm.token_path
          )
      `;
      const orphanModeCount = Number(orphanModeResult[0]?.count ?? 0);
      if (orphanModeCount > 0) {
        throw new Error(
          `Inserted ${orphanModeCount} mode value rows with missing token endpoints — aborting swap`,
        );
      }

      if (willRunReindex && usageReindexStatus === 'ok') {
        await tx`DELETE FROM token_usage_occurrences WHERE ds_id = ${dsId}`;
        for (const usage of reindexUsageRows) {
          const result = await tx`
            INSERT INTO token_usage_occurrences (ds_id, token_id, kind, source, owner, detail)
            VALUES (${dsId}, ${usage.tokenId}, ${usage.kind}, ${usage.source}, ${usage.owner}, ${usage.detail})
            ON CONFLICT (ds_id, token_id, kind, source, owner, detail) DO NOTHING
          `;
          usageReindexed += result.count ?? 0;
        }
      } else {
        const tokenRows = await tx<
          { id: string }[]
        >`SELECT id FROM tokens WHERE ds_id = ${dsId}`;
        const existingTokenIds = new Set(tokenRows.map((row) => row.id));
        for (const usage of usageRows) {
          if (!existingTokenIds.has(usage.token_id)) {
            usageDropped += 1;
            continue;
          }
          const result = await tx`
            INSERT INTO token_usage_occurrences (ds_id, token_id, kind, source, owner, detail)
            VALUES (${dsId}, ${usage.token_id}, ${usage.kind}, ${usage.source}, ${usage.owner}, ${usage.detail})
            ON CONFLICT (ds_id, token_id, kind, source, owner, detail) DO NOTHING
          `;
          if ((result.count ?? 0) > 0) {
            usageRestored += 1;
          }
        }
      }

      await tx`
        INSERT INTO token_graph (ds_id, graph_json, generated_at)
        VALUES (${dsId}, ${graphJson}, now())
        ON CONFLICT (ds_id) DO UPDATE SET
          graph_json = EXCLUDED.graph_json,
          generated_at = EXCLUDED.generated_at
      `;
    });

    if (reindexUsageFromFilesystem && !repoRoot) {
      usageReindexStatus = 'failed';
      usageReindexReason = 'missing_repo_root';
      const reason = 'Token usage reindex requested but repoRoot is missing.';
      usageReindexWarnings = [...usageReindexWarnings, reason];
      console.warn(`[syncDesignSystemFromPlugin] ${reason}`);
    }

    if (includeComponents) {
      // Capture structured Figma data before persistence so upsert can store
      // variants/token bindings/layout in one write pass.
      if (!dryRun && componentEntries.length > 0) {
        try {
          await enrichComponentEntriesWithStructuredData({
            entries: componentEntries,
            figmaFileId,
            fetchFullComponentSpec,
            variableIdToTokenPath,
            variableIdToDefaultModeContext,
            concurrency: safeEnrichComponentSpecConcurrency,
            warningSink: structuredDataWarnings,
          });
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          structuredDataWarnings.push(
            `[syncDesignSystemFromPlugin] Structured data capture failed: ${reason}`,
          );
          console.warn(
            `[syncDesignSystemFromPlugin] Structured data capture failed (continuing import): ${reason}`,
          );
        }
        if (structuredDataWarnings.length > 0) {
          for (const warning of Array.from(new Set(structuredDataWarnings))) {
            console.warn(warning);
          }
        }
      }

      await componentRepo.upsertFromRegistry(dsId, componentEntries);

      // Only mark missing when the component list is complete.
      // If truncated, marking missing would create false positives for components not fetched yet.
      // If partial import, skip missing reconciliation entirely — unselected ≠ missing.
      if (importMode === 'full' && !componentsTruncated) {
        const syncedSlugs = componentEntries.map((e) => e.slug);
        const markedMissing = await componentRepo.markMissingComponents(
          dsId,
          syncedSlugs,
        );
        if (markedMissing > 0) {
          console.log(
            `  Marked ${markedMissing} component(s) as missing (removed from Figma).`,
          );
        }
      } else if (importMode === 'partial') {
        console.log(
          '  Partial import: missing-component reconciliation skipped.',
        );
      } else {
        console.warn(
          '  Component search results were truncated; missing-component reconciliation skipped.',
        );
      }
    }
    if (usageDropped > 0) {
      console.warn(
        `  Dropped ${usageDropped} token-usage row(s) referencing removed tokens.`,
      );
    }
    return {
      tokens: tokens.length,
      tokenModeValues: modeValues.length,
      aliases: aliases.length,
      components: componentEntries.length,
      componentsTruncated,
      usageRestored,
      usageDropped,
      usageReindexed,
      usageReindexStatus,
      usageReindexReason,
      usageReindexWarnings,
      specsEnriched,
      proofsEnriched,
      dryRun,
      importMode,
      selectedCount,
      notSelectedCount,
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
    usageReindexed: 0,
    usageReindexStatus: 'not_requested',
    usageReindexReason: 'none',
    usageReindexWarnings: [],
    specsEnriched,
    proofsEnriched,
    dryRun,
    importMode,
    selectedCount,
    notSelectedCount,
  };
}

export function resolveFileKeyForSystem(
  figmaFileId: string | undefined,
  body: Record<string, unknown>,
): string {
  const fromSystem = String(figmaFileId || '').trim();
  const fromBodyFileKey = String(body.fileKey || body['file-key'] || '').trim();
  const fromBodyUrl = parseFileKey(
    String(body.url || body.figmaUrl || '').trim(),
  );
  return fromBodyFileKey || fromBodyUrl || fromSystem;
}
