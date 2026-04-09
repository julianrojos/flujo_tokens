import type { TokenRegistry, TokenEntry } from '@/types/token-registry';
import type { ResolvedVariableRef } from './types';
export type { ResolvedVariableRef } from './types';

/**
 * Resolve a raw variable reference string against a token registry.
 *
 * Handles:
 * - A dot-delimited or slash-delimited token path (resolvable)
 * - `VariableID:1:20` (passthrough fallback when not present in registry)
 *
 * Performs a single-hop alias resolution:
 * - If the token has an alias, the alias target is shown.
 * - If the alias target is itself present in the registry, its resolved
 *   value is appended (e.g. `target.path = #5B6CFF`).
 *
 * Reusable in any view that renders Figma variable / token references.
 *
 * @param rawText  — raw text from a token field (name or value)
 * @param registry — token registry from `/api/token-registry`
 */
export function resolveVariableRef(
  rawText: unknown,
  registry: TokenRegistry,
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

  // Try to look up the text as a token path (both dot and slash forms).
  const entry = registry.byPath[inputText] ?? registry.bySlashPath[inputText] ?? null;

  if (!entry) {
    // Registry currently indexes token paths, not raw Figma VariableID values.
    // Keep unknown inputs (including VariableID:*) as-is.
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
  const targetEntry: TokenEntry | undefined =
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
