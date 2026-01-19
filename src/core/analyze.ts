/**
 * Dependency analysis for cycle detection.
 */

import type { IndexingContext, TokenValue } from '../types/tokens.js';
import { isPlainObject, isVariableAlias } from '../types/tokens.js';
import { W3C_REF_REGEX_COLLECT } from '../utils/regex.js';
import { canonicalizeRefPath, normalizePathKey } from '../utils/paths.js';

/**
 * Resolves a reference path by:
 * - checking the canonical key first
 * - falling back to a case-insensitive normalized key
 * If the normalized key is marked ambiguous, resolution fails.
 */
export function getResolvedTokenKey(ref: string, ctx: IndexingContext): string | null {
    const canonical = canonicalizeRefPath(ref);
    const normalized = normalizePathKey(canonical);

    const hasKey = (key: string): boolean => ctx.valueMap.has(key) || ctx.refMap.has(key);

    if (ctx.collisionKeys.has(normalized)) return null;
    if (hasKey(canonical)) return canonical;
    if (hasKey(normalized)) return normalized;

    return null;
}

/**
 * Optimized resolution helper using precomputed strings to avoid redundant canonicalization.
 */
export function getResolvedTokenKeyFromParts(canonical: string, normalized: string, ctx: IndexingContext): string | null {
    const hasKey = (key: string): boolean => ctx.valueMap.has(key) || ctx.refMap.has(key);

    if (ctx.collisionKeys.has(normalized)) return null;
    if (hasKey(canonical)) return canonical;
    if (hasKey(normalized)) return normalized;

    return null;
}

/**
 * Collects dependency references for cycle analysis.
 * Handles:
 * - W3C `{...}` references embedded in strings
 * - VARIABLE_ALIAS references via `$id` → tokenKey mapping (when available)
 */
export function collectRefsFromValue(value: unknown, refs: Set<string>, idToTokenKey?: Map<string, string>): void {
    // Global regexes are stateful; ensure we always start from the beginning.
    W3C_REF_REGEX_COLLECT.lastIndex = 0;

    if (isVariableAlias(value)) {
        const id = value.id?.trim();
        if (id && idToTokenKey) {
            const targetKey = idToTokenKey.get(id);
            if (targetKey) refs.add(targetKey);
        }
        return;
    }

    if (typeof value === 'string') {
        let m: RegExpExecArray | null;
        try {
            while ((m = W3C_REF_REGEX_COLLECT.exec(value)) !== null) {
                const tokenPath = (m[1] ?? '').trim();
                if (!tokenPath) continue;
                refs.add(canonicalizeRefPath(tokenPath));
            }
        } finally {
            // Keep regex state clean even if a future refactor throws inside the loop.
            W3C_REF_REGEX_COLLECT.lastIndex = 0;
        }
        return;
    }

    if (Array.isArray(value)) {
        for (const item of value) collectRefsFromValue(item, refs, idToTokenKey);
        return;
    }

    if (isPlainObject(value)) {
        for (const key of Object.keys(value)) {
            if (!key.startsWith('$')) {
                collectRefsFromValue((value as Record<string, unknown>)[key], refs, idToTokenKey);
            }
        }
    }
}

/**
 * Performs a DFS on the dependency graph to determine whether each token can reach a cycle.
 * The returned map stores: tokenKey -> leadsToCycle (boolean).
 */
export function buildCycleStatus(ctx: IndexingContext): Map<string, boolean> {
    const refsByToken = new Map<string, Set<string>>();

    for (const [key, token] of ctx.valueMap.entries()) {
        const refs = new Set<string>();
        collectRefsFromValue((token as TokenValue).$value, refs, ctx.idToTokenKey);
        refsByToken.set(key, refs);
    }

    const color = new Map<string, 0 | 1 | 2>(); // 0=unvisited, 1=visiting, 2=visited
    const leadsToCycle = new Map<string, boolean>();

    const dfs = (node: string): boolean => {
        const state = color.get(node) ?? 0;
        if (state === 1) return true;
        if (state === 2) return leadsToCycle.get(node) ?? false;

        color.set(node, 1);
        let hitCycle = false;

        const refs = refsByToken.get(node);
        if (refs) {
            for (const ref of refs) {
                const next = getResolvedTokenKey(ref, ctx);
                if (!next) continue;
                if (dfs(next)) {
                    hitCycle = true;
                    break;
                }
            }
        }

        color.set(node, 2);
        leadsToCycle.set(node, hitCycle);
        return hitCycle;
    };

    for (const key of refsByToken.keys()) {
        if (!color.has(key)) dfs(key);
    }

    return leadsToCycle;
}
