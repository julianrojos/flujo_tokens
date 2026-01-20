/**
 * Tree traversal utilities.
 */

import type { ExecutionSummary, WalkHandlers } from '../types/tokens.js';
import { isPlainObject, isModeKey, shouldSkipKey } from '../types/tokens.js';
import { MAX_DEPTH } from '../runtime/config.js';
import { warnedAmbiguousModeDefaultAt, warnedBaseValueSkippedForMode, warnedPreferredModeFallback, foundModeKeys, modeFallbackCounts, modeFallbackExamples } from '../runtime/state.js';
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

export function pickModeKey(keys: string[], preferredMode?: string): string | undefined {
    // Prefer "modeDefault" for stability; otherwise prefer preferred mode, then first mode branch.
    const preferred = normalizePreferredMode(preferredMode);

    return (
        keys.find(k => k.toLowerCase() === 'modedefault') ??
        keys.find(k => matchesPreferredMode(k, preferred)) ??
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

function normalizePreferredMode(preferredMode?: string): string | undefined {
    const trimmed = preferredMode?.trim().toLowerCase();
    return trimmed ? trimmed.replace(/^[^a-z0-9]+/i, '') : undefined;
}

function matchesPreferredMode(key: string, preferred?: string): boolean {
    if (!preferred) return false;
    if (!isModeKey(key)) return false;
    const tail = key.slice(4);
    const normalized = tail.replace(/^[^a-z0-9]+/i, '').toLowerCase();
    return normalized.startsWith(preferred);
}

/**
 * Selects a mode key deterministically without sorting the entire key list.
 * This preserves the same selection you would get from sorted keys + `pickModeKey()`.
 */
export function pickModeKeyDeterministic(keys: string[], preferredMode?: string): string | undefined {
    const preferred = normalizePreferredMode(preferredMode);

    let bestDefault: string | undefined;
    let bestPreferred: string | undefined;
    let bestMode: string | undefined;

    for (const k of keys) {
        if (k.toLowerCase() === 'modedefault') {
            if (!bestDefault || compareByCodeUnit(k, bestDefault) < 0) bestDefault = k;
            continue;
        }
        if (matchesPreferredMode(k, preferred)) {
            if (!bestPreferred || compareByCodeUnit(k, bestPreferred) < 0) bestPreferred = k;
        }
        if (isModeKey(k)) {
            if (!bestMode || compareByCodeUnit(k, bestMode) < 0) bestMode = k;
        }
    }

    return bestDefault ?? bestPreferred ?? bestMode;
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
    inheritedType?: string,
    preferredMode?: string,
    modeStrict = true,
    skipBaseWhenMode = true
): void {
    if (checkDepthLimit(summary, depth, currentPath)) return;

    // Propagate `$type` down the tree unless a child provides its own `$type`.
    let nextInheritedType = inheritedType;
    if (isPlainObject(obj)) {
        const t = (obj as any).$type;
        if (typeof t === 'string' && t) nextInheritedType = t;
    }

    const isObj = isPlainObject(obj);
    const keys = isObj ? (sortKeys ? Object.keys(obj).sort() : Object.keys(obj)) : [];
    const hasValue = obj && typeof obj === 'object' && '$value' in obj;

    if (!isObj) return;

    warnAmbiguousModeDefault(keys, currentPath);

    const modeKey = sortKeys ? pickModeKey(keys, preferredMode) : pickModeKeyDeterministic(keys, preferredMode);
    const hasAnyModeBranch = keys.some(isModeKey);
    const preferred = normalizePreferredMode(preferredMode);
    const preferredFound = preferred && modeKey ? matchesPreferredMode(modeKey, preferred) : false;
    const missingPreferred = preferred && hasAnyModeBranch && (!modeKey || !preferredFound);

    if (hasAnyModeBranch) {
        for (const k of keys) {
            if (isModeKey(k)) foundModeKeys.add(k);
        }
    }

    if (modeStrict && missingPreferred) {
        const path = pathStr(currentPath) || '<root>';
        throw new Error(`Preferred mode "${preferred}" not found at ${path}`);
    }

    if (hasValue) {
        // DTCG Ambiguity Check: A node with $value should not have other children (except $type, $description, etc.)
        // Mode branches are allowed; non-mode children block emission.
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

        const path = pathStr(currentPath);
        const warnKeyFallback = `${path}|${preferred ?? 'none'}|${modeKey ?? 'none'}`;

        const shouldEmitBase =
            !hasAnyModeBranch ||
            !modeKey ||
            missingPreferred ||
            (modeKey && !skipBaseWhenMode);

        const skipModeTraversal = hasAnyModeBranch && missingPreferred && hasValue;

        if (missingPreferred) {
            if (!warnedPreferredModeFallback.has(warnKeyFallback)) {
                warnedPreferredModeFallback.add(warnKeyFallback);
                console.warn(
                    `ℹ️  Preferred mode "${preferred}" not found at ${path}; ${hasValue ? 'emitting base $value only' : 'using available mode branch'} (${modeKey ?? 'none'}).`
                );
            }
        } else if (modeKey && skipBaseWhenMode) {
            const warnKey = `${path}|${modeKey}`;
            if (!warnedBaseValueSkippedForMode.has(warnKey)) {
                warnedBaseValueSkippedForMode.add(warnKey);
                console.warn(
                    `ℹ️  ${path} has $value and mode branch "${modeKey}". Base $value is skipped to avoid double emission.`
                );
            }
        }

        if (shouldEmitBase) {
            handlers.onTokenValue?.({ obj, prefix, currentPath, depth, inModeBranch, inheritedType: nextInheritedType });
        }

        if (modeKey && skipModeTraversal) {
            return;
        }
    }

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
            walkTokenTree(
                summary,
                value,
                prefix,
                currentPath,
                handlers,
                depth + 1,
                inModeBranch,
                sortKeys,
                nextInheritedType,
                preferredMode,
                modeStrict,
                skipBaseWhenMode
            );
        } finally {
            currentPath.pop();
            prefix.pop();
        }
    }

    if (missingPreferred) {
        const path = pathStr(currentPath);
        const warnKey = `${path}|${preferred}|${modeKey ?? 'none'}`;
        if (!warnedPreferredModeFallback.has(warnKey)) {
            warnedPreferredModeFallback.add(warnKey);
            console.warn(
                `ℹ️  Preferred mode "${preferred}" not found at ${path}; ${hasValue ? 'emitting base $value only' : 'using available mode branch'} (${modeKey ?? 'none'}).`
            );
        }
        const key = preferred ?? '<none>';
        modeFallbackCounts.set(key, (modeFallbackCounts.get(key) || 0) + 1);
        const samples = modeFallbackExamples.get(key) ?? [];
        if (samples.length < 5) {
            samples.push(path || '<root>');
            modeFallbackExamples.set(key, samples);
        }
    }

    if (modeKey && !(hasAnyModeBranch && missingPreferred && hasValue)) {
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
                nextInheritedType,
                preferredMode,
                modeStrict,
                skipBaseWhenMode
            );
        } finally {
            currentPath.pop();
        }
    }
}
