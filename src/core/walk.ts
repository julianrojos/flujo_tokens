/**
 * Tree traversal utilities.
 */

import type { ExecutionSummary, WalkHandlers } from '../types/tokens.js';
import { isPlainObject, isModeKey, shouldSkipKey } from '../types/tokens.js';
import { MAX_DEPTH } from '../runtime/config.js';
import { warnedAmbiguousModeDefaultAt } from '../runtime/state.js';
import { pathStr } from '../utils/paths.js';
import { toKebabCase } from '../utils/strings.js';

/**
 * Safety guard against infinite recursion or unexpectedly deep JSON structures.
 * When exceeded, traversal is truncated and the incident is recorded in the summary.
 */
export function checkDepthLimit(summary: ExecutionSummary, depth: number, currentPath: string[]): boolean {
    if (depth <= MAX_DEPTH) return false;
    console.error(`❌ Depth limit (${MAX_DEPTH}) reached at ${pathStr(currentPath)}; truncating traversal.`);
    summary.depthLimitHits++;
    return true;
}

export function pickModeKey(keys: string[]): string | undefined {
    // Prefer "modeDefault" for stability; otherwise prefer Light, then first mode branch.
    return (
        keys.find(k => k.toLowerCase() === 'modedefault') ??
        keys.find(isLightModeKey) ??
        keys.find(isModeKey)
    );
}

/**
 * UTF-16 code unit comparison to match JavaScript's default `.sort()` ordering.
 * Used to keep mode selection deterministic when we intentionally do not sort keys.
 */
export function compareByCodeUnit(a: string, b: string): number {
    return a > b ? 1 : a < b ? -1 : 0;
}

function isLightModeKey(key: string): boolean {
    if (!isModeKey(key)) return false;
    const tail = key.slice(4);
    const normalized = tail.replace(/^[^a-z0-9]+/i, '').toLowerCase();
    return normalized.startsWith('light');
}

/**
 * Selects a mode key deterministically without sorting the entire key list.
 * This preserves the same selection you would get from sorted keys + `pickModeKey()`.
 */
export function pickModeKeyDeterministic(keys: string[]): string | undefined {
    let bestDefault: string | undefined;
    let bestLight: string | undefined;
    let bestMode: string | undefined;

    for (const k of keys) {
        if (k.toLowerCase() === 'modedefault') {
            if (!bestDefault || compareByCodeUnit(k, bestDefault) < 0) bestDefault = k;
            continue;
        }
        if (isLightModeKey(k)) {
            if (!bestLight || compareByCodeUnit(k, bestLight) < 0) bestLight = k;
        }
        if (isModeKey(k)) {
            if (!bestMode || compareByCodeUnit(k, bestMode) < 0) bestMode = k;
        }
    }

    return bestDefault ?? bestLight ?? bestMode;
}

/**
 * Warns (once per path) when multiple keys match `modeDefault` case-insensitively.
 * This does not change selection; it only surfaces potentially confusing exports.
 */
export function warnAmbiguousModeDefault(keys: string[], currentPath: string[]): void {
    let count = 0;
    for (const k of keys) if (k.toLowerCase() === 'modedefault') count++;
    if (count <= 1) return;

    const at = pathStr(currentPath);
    const sig = `${at}|${count}`;
    if (warnedAmbiguousModeDefaultAt.has(sig)) return;
    warnedAmbiguousModeDefaultAt.add(sig);

    console.warn(
        `⚠️  Multiple "modeDefault" keys detected at ${at} (count=${count}). ` +
        `Mode selection is deterministic but may be surprising; consider normalizing the export.`
    );
}

/**
 * Traverses the token object tree.
 *
 * Behaviors:
 * - Deterministic traversal when `sortKeys=true`.
 * - Mode branches: mode keys are skipped during base traversal; a single selected mode branch is traversed afterwards.
 * - Leaf detection:
 *   - objects containing `$value` are treated as W3C token leaves
 *   - primitive leaves are treated as legacy tokens
 * - `$type` inheritance: a `$type` on a parent node applies to descendants unless overridden.
 *
 * Performance:
 * - Uses mutable stacks (`prefix`, `currentPath`) with `push`/`pop` + `try/finally` to avoid per-node allocations.
 */
export function walkTokenTree(
    summary: ExecutionSummary,
    obj: any,
    prefix: string[],
    currentPath: string[],
    handlers: WalkHandlers,
    depth = 0,
    inModeBranch = false,
    sortKeys = true,
    inheritedType?: string
): void {
    if (checkDepthLimit(summary, depth, currentPath)) return;

    // Propagate `$type` down the tree unless a child provides its own `$type`.
    let nextInheritedType = inheritedType;
    if (isPlainObject(obj)) {
        const t = (obj as any).$type;
        if (typeof t === 'string' && t) nextInheritedType = t;
    }

    const hasValue = obj && typeof obj === 'object' && '$value' in obj;
    if (hasValue) {
        // DTCG Ambiguity Check: A node with $value should not have other children (except $type, $description, etc.)
        // Mode branches are allowed; non-mode children block emission.
        if (isPlainObject(obj)) {
            const keys = Object.keys(obj);
            const reserved = new Set(['$value', '$type', '$description', '$extensions', '$id']);
            const extraKeys = keys.filter(k => !reserved.has(k) && !isModeKey(k));

            if (extraKeys.length > 0) {
                console.error(
                    `❌  Token/Group Ambiguity Error at ${pathStr(currentPath)}: has $value but also extra keys (${extraKeys.join(', ')}). ` +
                    `BLOCKED: This token will not be emitted as it is invalid per DTCG.`
                );
                // Strict blocking: record error and do NOT process the token value.
                summary.invalidTokens.push(`${pathStr(currentPath)} (Ambiguous: has $value + children)`);
                return;
            }
        }

        handlers.onTokenValue?.({ obj, prefix, currentPath, depth, inModeBranch, inheritedType: nextInheritedType });
    }

    if (!isPlainObject(obj)) return;

    const keys = sortKeys ? Object.keys(obj).sort() : Object.keys(obj);

    warnAmbiguousModeDefault(keys, currentPath);

    const modeKey = sortKeys ? pickModeKey(keys) : pickModeKeyDeterministic(keys);

    for (const key of keys) {
        if (shouldSkipKey(key)) continue;

        const value = (obj as Record<string, any>)[key];
        const normalizedKey = toKebabCase(key);

        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
            // Legacy primitives are reported as parent path + leaf key.
            handlers.onLegacyPrimitive?.({
                value,
                key,
                normalizedKey,
                prefix,
                currentPath,
                depth,
                inModeBranch,
                inheritedType: nextInheritedType
            });
            continue;
        }

        prefix.push(normalizedKey);
        currentPath.push(key);
        try {
            walkTokenTree(summary, value, prefix, currentPath, handlers, depth + 1, inModeBranch, sortKeys, nextInheritedType);
        } finally {
            currentPath.pop();
            prefix.pop();
        }
    }

    if (modeKey) {
        // Mode branches affect the JSON path but must not affect the CSS var name prefix.
        currentPath.push(modeKey);
        try {
            walkTokenTree(
                summary,
                (obj as Record<string, any>)[modeKey],
                prefix,
                currentPath,
                handlers,
                depth + 1,
                true,
                sortKeys,
                nextInheritedType
            );
        } finally {
            currentPath.pop();
        }
    }
}
