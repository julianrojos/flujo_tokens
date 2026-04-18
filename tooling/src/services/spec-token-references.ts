/**
 * Spec Token References
 *
 * Extract token references from component spec YAML files.
 * This module is independent from token usage index generation.
 */

import * as fs from 'node:fs';
import * as yaml from 'js-yaml';

import type { TokenRegistry, TokenRegistryEntry } from './token-types.js';
import { extractCssVarReferences, findTokenByCssVar } from './token-utils.js';

function isTbdMarker(value: string): boolean {
  const trimmed = String(value || '').trim().toLowerCase();
  return trimmed === 'tbd' || trimmed === '' || trimmed === 'null' || trimmed === 'undefined';
}

export interface SpecReference {
  tokenId: string;
  tokenPath: string;
  file: string;
  owner: string;
  property?: string;
}

function normalizeHexColor(value: string): string | null {
  const raw = String(value || '').trim().toUpperCase();
  if (!raw.startsWith('#')) return null;
  const hex = raw.slice(1);
  if (!/^[0-9A-F]+$/.test(hex)) return null;

  if (hex.length === 3) {
    return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`;
  }
  if (hex.length === 4) {
    return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  }
  if (hex.length === 6 || hex.length === 8) {
    return `#${hex}`;
  }
  return null;
}

function normalizeTokenResolvedValue(value: string): string | null {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;
  const hex = normalizeHexColor(trimmed);
  if (hex) return hex;
  return trimmed.toLowerCase();
}

function buildPathLookup(registry: TokenRegistry): Map<string, TokenRegistryEntry[]> {
  const setLookup = (
    map: Map<string, TokenRegistryEntry[]>,
    rawKey: string,
    entry: TokenRegistryEntry,
  ) => {
    const key = String(rawKey || '').trim();
    if (!key) return;
    const current = map.get(key) || [];
    const hasEntry = current.some(
      (existing) =>
        String(existing.path || '') === String(entry.path || '') &&
        String(existing.id || '') === String(entry.id || ''),
    );
    if (!hasEntry) {
      current.push(entry);
      map.set(key, current);
    }
  };

  const map = new Map<string, TokenRegistryEntry[]>();
  for (const entry of registry.entries) {
    const tokenPath = String(entry.path || '').trim();
    const slashFromPath = tokenPath.replace(/\./g, '/');
    const slashPath = String((entry as TokenRegistryEntry & { slashPath?: string }).slashPath || '').trim();
    const collection = String(entry.collection || '').trim();

    setLookup(map, tokenPath, entry);
    setLookup(map, slashFromPath, entry);
    if (entry.cssVar) setLookup(map, String(entry.cssVar || '').trim(), entry);
    if (slashPath) {
      setLookup(map, slashPath, entry);
      setLookup(map, slashPath.replace(/\//g, '.'), entry);
    }

    if (collection && tokenPath.toLowerCase().startsWith(`${collection.toLowerCase()}.`)) {
      const withoutCollection = tokenPath.slice(collection.length + 1);
      setLookup(map, withoutCollection, entry);
      setLookup(map, withoutCollection.replace(/\./g, '/'), entry);
    }

    const normalizedPath = tokenPath.replace(/^_+/, '');
    if (normalizedPath) {
      setLookup(map, normalizedPath, entry);
      setLookup(map, normalizedPath.replace(/\./g, '/'), entry);
    }
  }
  return map;
}

function extractContextKeywords(raw: string): string[] {
  const stopWords = new Set([
    'anatomy',
    'children',
    'default',
    'fill',
    'stroke',
    'variant',
    'container',
    'text',
  ]);

  return String(raw || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 1 && !stopWords.has(part));
}

function rankTokenCandidate(entry: TokenRegistryEntry, keywords: string[]): number {
  const haystack = [
    String(entry.path || ''),
    String(entry.cssVar || ''),
    String((entry as TokenRegistryEntry & { slashPath?: string }).slashPath || ''),
    String(entry.collection || ''),
  ]
    .join(' ')
    .toLowerCase();

  let score = 0;
  for (const keyword of keywords) {
    if (haystack.includes(keyword)) score += 1;
  }
  return score;
}

function pickBestTokenCandidate(
  candidates: TokenRegistryEntry[],
  contextHint: string,
): TokenRegistryEntry | null {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  const keywords = extractContextKeywords(contextHint);
  const ranked = candidates
    .map((entry) => ({
      entry,
      score: rankTokenCandidate(entry, keywords),
      depth: String(entry.path || '').split('.').filter(Boolean).length,
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.depth !== a.depth) return b.depth - a.depth;
      return String(a.entry.path || '').localeCompare(String(b.entry.path || ''));
    });

  return ranked[0]?.entry || null;
}

function buildResolvedValueLookup(registry: TokenRegistry): Map<string, TokenRegistryEntry[]> {
  const map = new Map<string, TokenRegistryEntry[]>();
  for (const entry of registry.entries) {
    const rawValue =
      (entry as TokenRegistryEntry & { resolvedValue?: unknown }).resolvedValue ?? entry.$value;
    const normalized = normalizeTokenResolvedValue(String(rawValue || ''));
    if (!normalized) continue;
    const current = map.get(normalized) || [];
    current.push(entry);
    map.set(normalized, current);
  }
  return map;
}

function resolveTokenFromRef(
  registry: TokenRegistry,
  pathLookup: Map<string, TokenRegistryEntry[]>,
  resolvedValueLookup: Map<string, TokenRegistryEntry[]>,
  rawRef: unknown,
  contextHint = '',
): TokenRegistryEntry | null {
  const ref = String(rawRef ?? '').trim();
  if (!ref || isTbdMarker(ref)) return null;

  const exactCandidates = pathLookup.get(ref) || [];
  const exact = pickBestTokenCandidate(exactCandidates, `${ref} ${contextHint}`);
  if (exact) return exact;

  const varMatch = ref.match(/^var\(\s*(--[a-z0-9-]+)\s*(?:,[^)]+)?\)$/i);
  if (varMatch) {
    const cssToken = findTokenByCssVar(registry, varMatch[1]);
    if (cssToken) return cssToken;
  }

  const normalizedValue = normalizeTokenResolvedValue(ref);
  if (!normalizedValue) return null;
  const candidates = resolvedValueLookup.get(normalizedValue) || [];
  return pickBestTokenCandidate(candidates, contextHint);
}

function collectTokenMappingReferences(
  node: unknown,
  keyPath: string,
  refs: Array<{ tokenRef: string; keyPath: string }>,
): void {
  if (typeof node === 'string') {
    refs.push({ tokenRef: node, keyPath });
    return;
  }
  if (!node || typeof node !== 'object') return;

  const entries = Object.entries(node as Record<string, unknown>);
  if (entries.length === 0) return;
  const allStringValues = entries.every(([, value]) => typeof value === 'string');

  if (allStringValues && keyPath) {
    for (const [condition, value] of entries) {
      refs.push({ tokenRef: String(value), keyPath: `${keyPath}:${condition}` });
    }
    return;
  }

  for (const [key, value] of entries) {
    const nextKeyPath = keyPath ? `${keyPath}.${key}` : key;
    collectTokenMappingReferences(value, nextKeyPath, refs);
  }
}

function collectHeuristicScalarReferences(
  node: unknown,
  keyPath: string,
  variantContext: string | null,
  refs: Array<{ tokenRef: string; keyPath: string }>,
): void {
  if (typeof node === 'string' || typeof node === 'number') {
    const detail = variantContext ? `${keyPath}:${variantContext}` : keyPath;
    refs.push({ tokenRef: String(node), keyPath: detail });
    return;
  }

  if (Array.isArray(node)) {
    for (const item of node) {
      collectHeuristicScalarReferences(item, keyPath, variantContext, refs);
    }
    return;
  }

  if (!node || typeof node !== 'object') return;

  const objectNode = node as Record<string, unknown>;
  const rawName = typeof objectNode.name === 'string' ? String(objectNode.name).trim() : '';
  const nextVariantContext = /[A-Za-z0-9_-]+\s*=/.test(rawName)
    ? rawName
    : variantContext;
  const ignoredScalarKeys = new Set(['name', 'fill_alias_chain', 'fill_resolved']);

  for (const [key, value] of Object.entries(objectNode)) {
    if (ignoredScalarKeys.has(key)) continue;
    const nextPath = keyPath ? `${keyPath}.${key}` : key;
    collectHeuristicScalarReferences(value, nextPath, nextVariantContext, refs);
  }
}

function collectVariantReferences(
  node: unknown,
  refs: Array<{ tokenRef: string; keyPath: string }>,
): void {
  if (!Array.isArray(node)) return;

  for (let index = 0; index < node.length; index += 1) {
    const variant = node[index];
    if (!variant || typeof variant !== 'object') continue;
    const variantRecord = variant as Record<string, unknown>;
    const variantBasePath = `variants[${index}]`;

    if (typeof variantRecord.token === 'string') {
      refs.push({
        tokenRef: variantRecord.token,
        keyPath: `${variantBasePath}.token`,
      });
    }
    if (typeof variantRecord.fallback === 'string') {
      refs.push({
        tokenRef: variantRecord.fallback,
        keyPath: `${variantBasePath}.fallback`,
      });
    }
  }
}

export function extractSpecReferences(
  specRoot: string,
  registry: TokenRegistry,
): SpecReference[] {
  const refs: SpecReference[] = [];
  const seen = new Set<string>();
  const pathLookup = buildPathLookup(registry);
  const resolvedValueLookup = buildResolvedValueLookup(registry);

  if (!fs.existsSync(specRoot)) {
    return refs;
  }

  const specFiles = fs
    .readdirSync(specRoot, { withFileTypes: true })
    .filter((f) => f.isFile() && f.name.endsWith('.yml'))
    .map((f) => f.name);

  for (const file of specFiles) {
    const filePath = `${specRoot}/${file}`;
    const content = fs.readFileSync(filePath, 'utf8');
    const owner = file.replace(/\.yml$/i, '').trim();

    try {
      const spec = yaml.load(content) as Record<string, unknown>;

      const registerRef = (tokenRef: string, property: string) => {
        const token = resolveTokenFromRef(
          registry,
          pathLookup,
          resolvedValueLookup,
          tokenRef,
          property,
        );
        if (!token) return;
        const signature = `${owner}|${token.path}|${property}`;
        if (seen.has(signature)) return;
        seen.add(signature);
        refs.push({
          tokenId: token.id,
          tokenPath: token.path,
          file: filePath,
          owner,
          property,
        });
      };

      const tokenMappingRefs: Array<{ tokenRef: string; keyPath: string }> = [];
      collectTokenMappingReferences(spec.token_mapping, 'token_mapping', tokenMappingRefs);
      for (const ref of tokenMappingRefs) {
        registerRef(ref.tokenRef, ref.keyPath);
      }

      const anatomyRefs: Array<{ tokenRef: string; keyPath: string }> = [];
      collectHeuristicScalarReferences(spec.anatomy, 'anatomy', null, anatomyRefs);
      for (const ref of anatomyRefs) {
        registerRef(ref.tokenRef, ref.keyPath);
      }

      const variantRefs: Array<{ tokenRef: string; keyPath: string }> = [];
      collectVariantReferences(spec.variants, variantRefs);
      for (const ref of variantRefs) {
        registerRef(ref.tokenRef, ref.keyPath);
      }

      const contentStr = JSON.stringify(spec);
      const varRefs = extractCssVarReferences(contentStr);
      for (const varName of varRefs) {
        const token = findTokenByCssVar(registry, varName);
        if (token) {
          const property = 'inline';
          const signature = `${owner}|${token.path}|${property}|${varName}`;
          if (seen.has(signature)) continue;
          seen.add(signature);
          refs.push({
            tokenId: token.id,
            tokenPath: token.path,
            file: filePath,
            owner,
            property,
          });
        }
      }
    } catch {
      // Skip invalid YAML files
    }
  }

  return refs;
}
