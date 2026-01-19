/**
 * Tree traversal utilities.
 */
import { isPlainObject, isModeKey, shouldSkipKey } from '../types/tokens.js';
import { MAX_DEPTH } from '../runtime/config.js';
import { warnedAmbiguousModeDefaultAt } from '../runtime/state.js';
import { pathStr } from '../utils/paths.js';
import { toKebabCase } from '../utils/strings.js';
/**
 * Safety guard against infinite recursion or unexpectedly deep JSON structures.
 * When exceeded, traversal is truncated and the incident is recorded in the summary.
 */
export function checkDepthLimit(summary, depth, currentPath) {
    if (depth <= MAX_DEPTH)
        return false;
    console.error(`❌ Depth limit (${MAX_DEPTH}) reached at ${pathStr(currentPath)}; truncating traversal.`);
    summary.depthLimitHits++;
    return true;
}
export function pickModeKey(keys) {
    // Prefer "modeDefault" for stability; otherwise pick the first mode branch.
    return keys.find(k => k.toLowerCase() === 'modedefault') ?? keys.find(isModeKey);
}
/**
 * UTF-16 code unit comparison to match JavaScript's default `.sort()` ordering.
 * Used to keep mode selection deterministic when we intentionally do not sort keys.
 */
export function compareByCodeUnit(a, b) {
    return a > b ? 1 : a < b ? -1 : 0;
}
/**
 * Selects a mode key deterministically without sorting the entire key list.
 * This preserves the same selection you would get from sorted keys + `pickModeKey()`.
 */
export function pickModeKeyDeterministic(keys) {
    let bestDefault;
    let bestMode;
    for (const k of keys) {
        if (k.toLowerCase() === 'modedefault') {
            if (!bestDefault || compareByCodeUnit(k, bestDefault) < 0)
                bestDefault = k;
            continue;
        }
        if (isModeKey(k)) {
            if (!bestMode || compareByCodeUnit(k, bestMode) < 0)
                bestMode = k;
        }
    }
    return bestDefault ?? bestMode;
}
/**
 * Warns (once per path) when multiple keys match `modeDefault` case-insensitively.
 * This does not change selection; it only surfaces potentially confusing exports.
 */
export function warnAmbiguousModeDefault(keys, currentPath) {
    let count = 0;
    for (const k of keys)
        if (k.toLowerCase() === 'modedefault')
            count++;
    if (count <= 1)
        return;
    const at = pathStr(currentPath);
    const sig = `${at}|${count}`;
    if (warnedAmbiguousModeDefaultAt.has(sig))
        return;
    warnedAmbiguousModeDefaultAt.add(sig);
    console.warn(`⚠️  Multiple "modeDefault" keys detected at ${at} (count=${count}). ` +
        `Mode selection is deterministic but may be surprising; consider normalizing the export.`);
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
export function walkTokenTree(summary, obj, prefix, currentPath, handlers, depth = 0, inModeBranch = false, sortKeys = true, inheritedType) {
    if (checkDepthLimit(summary, depth, currentPath))
        return;
    // Propagate `$type` down the tree unless a child provides its own `$type`.
    let nextInheritedType = inheritedType;
    if (isPlainObject(obj)) {
        const t = obj.$type;
        if (typeof t === 'string' && t)
            nextInheritedType = t;
    }
    if (obj && typeof obj === 'object' && '$value' in obj) {
        handlers.onTokenValue?.({ obj, prefix, currentPath, depth, inModeBranch, inheritedType: nextInheritedType });
        return;
    }
    if (!isPlainObject(obj))
        return;
    const keys = sortKeys ? Object.keys(obj).sort() : Object.keys(obj);
    warnAmbiguousModeDefault(keys, currentPath);
    const modeKey = sortKeys ? pickModeKey(keys) : pickModeKeyDeterministic(keys);
    for (const key of keys) {
        if (shouldSkipKey(key))
            continue;
        const value = obj[key];
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
        }
        finally {
            currentPath.pop();
            prefix.pop();
        }
    }
    if (modeKey) {
        // Mode branches affect the JSON path but must not affect the CSS var name prefix.
        currentPath.push(modeKey);
        try {
            walkTokenTree(summary, obj[modeKey], prefix, currentPath, handlers, depth + 1, true, sortKeys, nextInheritedType);
        }
        finally {
            currentPath.pop();
        }
    }
}
