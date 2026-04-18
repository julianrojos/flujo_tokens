import type { TokenCatalog, TokenCatalogEntry } from '@/types/token-catalog';
import type { ResolvedVariableRef } from './types';
export type { ResolvedVariableRef } from './types';

const VARIABLE_ID_PATTERN = /VariableID:[^\s"'`)\],;]+/;
const CSS_VAR_PATTERN = /--[A-Za-z0-9_-]+/;
const TOKEN_PATH_PATTERN = /[A-Za-z0-9_-]+(?:[./][A-Za-z0-9_-]+)+/g;

/**
 * Lazy, per-registry cache for CSS var → entry lookups.
 * Avoids O(n) `entries.find` on every resolution.
 * Rebuilt automatically when the registry reference changes (new fetch).
 * Uses a WeakMap so the registry object itself is never mutated.
 */
const cssVarCache = new WeakMap<TokenCatalog, Record<string, TokenCatalogEntry>>();

function getCssVarIndex(registry: TokenCatalog): Record<string, TokenCatalogEntry> {
  const cached = cssVarCache.get(registry);
  if (cached) return cached;
  const index: Record<string, TokenCatalogEntry> = {};
  for (const entry of registry.entries) {
    if (entry.cssVar) index[entry.cssVar] = entry;
  }
  cssVarCache.set(registry, index);
  return index;
}

/**
 * Strip surrounding brackets like "[Token Value]" → "Token Value"
 */
function stripBrackets(text: string): string {
  if (text.startsWith('[') && text.endsWith(']')) {
    return text.slice(1, -1).trim();
  }
  return text;
}

/**
 * Attempt to find a token entry from a normalized text form.
 * Tries exact match, then dot-form, then slash-form in both byPath and bySlashPath.
 */
function tryNormalizedLookup(text: string, registry: TokenCatalog): TokenCatalogEntry | null {
  if (!text) return null;
  const dotForm = text.replace(/\//g, '.');
  const slashForm = text.replace(/\./g, '/');
  return registry.byPath[text]
    ?? registry.bySlashPath[text]
    ?? registry.byPath[dotForm]
    ?? registry.bySlashPath[slashForm]
    ?? null;
}

function findRegistryEntry(inputText: string, registry: TokenCatalog): TokenCatalogEntry | null {
  // 1. Exact match by VariableID, path, or slash path
  const fromDirectKeys =
    registry.byVariableId[inputText]
    ?? tryNormalizedLookup(inputText, registry)
    ?? null;
  if (fromDirectKeys) return fromDirectKeys;

  // 2. Strip brackets — AI sometimes wraps values in [...]
  const stripped = stripBrackets(inputText);
  if (stripped !== inputText) {
    const fromStripped =
      registry.byVariableId[stripped]
      ?? tryNormalizedLookup(stripped, registry)
      ?? null;
    if (fromStripped) return fromStripped;
  }

  // 3. Case-insensitive scan — handles casing mismatch between
  //    orchestrator variable keys (e.g. "Primitives/Blue/300") and
  //    registry paths (e.g. "primitives/blue/300").
  const lowerInput = stripped.toLowerCase();
  if (lowerInput !== stripped) {
    const fromLower = tryNormalizedLookup(lowerInput, registry);
    if (fromLower) return fromLower;
  }

  // 4. Extract VariableID from mixed strings like "VariableID:1:12 var(--color-accent-bg)"
  const variableIdMatch = inputText.match(VARIABLE_ID_PATTERN)?.[0] ?? null;
  if (variableIdMatch) {
    const fromVariableId = registry.byVariableId[variableIdMatch] ?? null;
    if (fromVariableId) return fromVariableId;
    // Also try the bare numeric id (e.g. "1:12")
    const bareId = variableIdMatch.replace(/^VariableID:/i, '');
    if (bareId) {
      const fromBareId = registry.byVariableId[bareId]
        ?? registry.byVariableId[`VariableID:${bareId}`]
        ?? null;
      if (fromBareId) return fromBareId;
    }
  }

  // 5. CSS custom property reference — use memoized index for O(1)
  const cssVarMatch = inputText.match(CSS_VAR_PATTERN)?.[0] ?? null;
  if (cssVarMatch) {
    const cssVarIndex = getCssVarIndex(registry);
    const fromCssVar = cssVarIndex[cssVarMatch] ?? null;
    if (fromCssVar) return fromCssVar;
  }

  // 6. Token-like path fragments from mixed text
  const candidates = inputText.match(TOKEN_PATH_PATTERN) ?? [];
  for (const candidate of candidates) {
    const fromCandidate = tryNormalizedLookup(candidate, registry)
      ?? tryNormalizedLookup(candidate.toLowerCase(), registry)
      ?? null;
    if (fromCandidate) return fromCandidate;
  }

  return null;
}

/**
 * Resolve a raw variable reference string against a token registry.
 *
 * Handles:
 * - A dot-delimited or slash-delimited token path (resolvable)
 * - `VariableID:1:20` (resolved via `registry.byVariableId` when available)
 *
 * Performs a single-hop alias resolution:
 * - If the token has an alias, the alias target is shown.
 * - If the alias target is itself present in the registry, its resolved
 *   value is appended (e.g. `target.path = #5B6CFF`).
 *
 * Reusable in any view that renders Figma variable / token references.
 *
 * @param rawText  — raw text from a token field (name or value)
 * @param registry — token catalog from `/api/token-catalog`
 */
export function resolveVariableRef(
  rawText: unknown,
  registry: TokenCatalog,
): ResolvedVariableRef {
  const inputText = typeof rawText === 'string'
    ? rawText.trim()
    : String(rawText ?? '').trim();

  const emptyResult = (text: string, hadFallback = false): ResolvedVariableRef => ({
    tokenLabel: text,
    bracketLabel: null,
    debug: {
      inputText,
      isAlias: false,
      aliasTarget: null,
      resolvedValue: null,
      hadFallback,
    },
  });

  if (!inputText) return emptyResult('');

  const entry = findRegistryEntry(inputText, registry);

  if (!entry) {
    // Keep unknown inputs (including unresolved VariableID:*) as-is.
    return emptyResult(inputText, true);
  }

  // Found a matching token entry.
  const isAlias = entry.aliasOf !== null;
  const aliasTarget = entry.aliasOf;

  if (!isAlias) {
    // Raw token with a concrete value.
    return {
      tokenLabel: entry.path,
      bracketLabel: entry.resolvedValue,
      debug: {
        inputText,
        isAlias: false,
        aliasTarget: null,
        resolvedValue: entry.resolvedValue,
        hadFallback: false,
      },
    };
  }

  // Alias — try to resolve the target's value (single hop).
  const targetEntry: TokenCatalogEntry | undefined =
    aliasTarget != null
      ? registry.byPath[aliasTarget] ?? registry.bySlashPath[aliasTarget]
      : undefined;

  if (targetEntry) {
    return {
      tokenLabel: entry.path,
      bracketLabel: `${aliasTarget} = ${targetEntry.resolvedValue}`,
      debug: {
        inputText,
        isAlias: true,
        aliasTarget,
        resolvedValue: targetEntry.resolvedValue,
        hadFallback: false,
      },
    };
  }

  // Alias target not in registry — show the alias path without the value.
  return {
    tokenLabel: entry.path,
    bracketLabel: aliasTarget,
    debug: {
      inputText,
      isAlias: true,
      aliasTarget,
      resolvedValue: null,
      hadFallback: false,
    },
  };
}

/**
 * Format a resolved variable reference into a display string.
 *
 * Produces one of:
 * - `tokenPath [value]`          — raw token
 * - `tokenPath [aliasTarget = value]` — alias with resolvable target
 * - `tokenPath [aliasTarget]`    — alias whose target is not in registry
 * - `rawText`                    — unresolvable / fallback
 *
 * Reusable in any view that renders Figma variable / token references.
 */
export function formatVariableRef(resolved: ResolvedVariableRef): string {
  if (resolved.bracketLabel == null) return resolved.tokenLabel;
  return `${resolved.tokenLabel} [${resolved.bracketLabel}]`;
}
