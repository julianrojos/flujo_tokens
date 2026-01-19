/**
 * Emission phase: value resolution and CSS output generation.
 */
import { isPlainObject, isVariableAlias } from '../types/tokens.js';
import { MAX_DEPTH, EMPTY_VISITED_REFS } from '../runtime/config.js';
import { findTokenByIdCache, warnedAliasVarCollisions, warnedFindTokenByIdDepthLimit } from '../runtime/state.js';
import { walkTokenTree } from './walk.js';
import { getResolvedTokenKeyFromParts } from './analyze.js';
import { W3C_REF_REGEX_REPLACE, W3C_REF_REGEX_TEST } from '../utils/regex.js';
import { pathStr, canonicalizeRefPath, normalizePathKey, buildVisitedRefSet } from '../utils/paths.js';
import { toKebabCase, isValidCssVariableName, buildCssVarNameFromPrefix, toSafePlaceholderName, quoteCssStringLiteral } from '../utils/strings.js';
// --- Recording helpers ---
export function recordUnresolved(summary, currentPath, reason) {
    summary.unresolvedRefs.push(`${pathStr(currentPath)}${reason}`);
}
export function recordUnresolvedTyped(summary, currentPath, label, detail) {
    recordUnresolved(summary, currentPath, ` (${label}: ${detail})`);
}
/**
 * Emits a single custom property declaration into `collectedVars`, if the name is valid.
 */
export function emitCssVar(summary, collectedVars, varName, value, currentPath, recordInvalidName) {
    if (!isValidCssVariableName(varName)) {
        console.warn(`⚠️  Advertencia: ${varName} no es un nombre de variable CSS válido, se omite`);
        if (recordInvalidName) {
            summary.invalidNames.push(`${pathStr(currentPath)} (Invalid CSS Var: ${varName})`);
        }
        return;
    }
    collectedVars.push(`  ${varName}: ${value};`);
    summary.successCount++;
}
// --- Token lookup helpers ---
/**
 * Fallback VARIABLE_ALIAS resolution by scanning the entire token tree for a matching `$id`.
 * This is used when the `$id` index misses (e.g., partial exports).
 */
export function findTokenById(tokensData, targetId, currentPath = [], depth = 0) {
    if (!isPlainObject(tokensData))
        return null;
    const target = typeof targetId === 'string' ? targetId.trim() : '';
    if (!target)
        return null;
    if (depth > MAX_DEPTH) {
        if (!warnedFindTokenByIdDepthLimit.has(target)) {
            warnedFindTokenByIdDepthLimit.add(target);
            const at = currentPath.length ? pathStr(currentPath) : '<root>';
            console.warn(`⚠️  findTokenById aborted: depth limit (${MAX_DEPTH}) exceeded while searching for $id="${target}" near ${at}.`);
        }
        return null;
    }
    const matchesId = (candidate) => {
        if (typeof candidate !== 'string')
            return false;
        return candidate === target || candidate.trim() === target;
    };
    for (const key in tokensData) {
        if (!Object.prototype.hasOwnProperty.call(tokensData, key))
            continue;
        if (key.startsWith('$')) {
            const keyValue = tokensData[key];
            if (key === '$id' && matchesId(keyValue)) {
                // Clone because `currentPath` is a mutable stack.
                return currentPath.slice();
            }
            continue;
        }
        const value = tokensData[key];
        if (isPlainObject(value)) {
            currentPath.push(key);
            try {
                if ('$id' in value && matchesId(value.$id)) {
                    return currentPath.slice();
                }
                const found = findTokenById(value, target, currentPath, depth + 1);
                if (found)
                    return found;
            }
            finally {
                currentPath.pop();
            }
        }
    }
    return null;
}
/**
 * Cached wrapper for `findTokenById()`; caches misses as well.
 */
export function findTokenByIdCached(tokensData, targetId) {
    const key = typeof targetId === 'string' ? targetId.trim() : '';
    if (!key)
        return null;
    if (findTokenByIdCache.has(key))
        return findTokenByIdCache.get(key);
    const found = findTokenById(tokensData, key);
    findTokenByIdCache.set(key, found);
    return found;
}
// --- Reference resolution ---
/**
 * Generates a placeholder `var(--broken-ref-...)` for unresolved references.
 */
export function brokenRefPlaceholder(summary, currentPath, canonicalPath, match) {
    const cssPath = canonicalPath.split('.').map(toKebabCase).join('-');
    const varName = `--broken-ref-${cssPath || 'unknown'}`;
    if (!isValidCssVariableName(varName)) {
        summary.invalidNames.push(`${pathStr(currentPath)} (Ref to invalid name: ${varName})`);
        return match;
    }
    return `var(${varName})`;
}
export function resolveReference(ctx, match, tokenPath, originalValue, currentPath, visitedRefs, seenInValue) {
    const { summary, refMap, collisionKeys, cycleStatus } = ctx;
    tokenPath = tokenPath.trim();
    if (!tokenPath) {
        console.warn(`⚠️  Empty W3C reference in "${originalValue}" at ${pathStr(currentPath)}`);
        recordUnresolved(summary, currentPath, ' (Empty ref)');
        return match;
    }
    const canonicalPath = canonicalizeRefPath(tokenPath);
    const normalizedTokenPath = normalizePathKey(canonicalPath);
    const resolvedKey = getResolvedTokenKeyFromParts(canonicalPath, normalizedTokenPath, ctx);
    if (!resolvedKey) {
        const isCollision = collisionKeys.has(normalizedTokenPath);
        console.warn(`⚠️  ${isCollision ? 'Ambiguous' : 'Unresolved'} W3C reference ${match} at ${pathStr(currentPath)}${isCollision ? ' (normalized collision)' : ''}`);
        if (isCollision)
            recordUnresolvedTyped(summary, currentPath, 'Collision', tokenPath);
        else
            recordUnresolvedTyped(summary, currentPath, 'Ref', tokenPath);
        return brokenRefPlaceholder(summary, currentPath, canonicalPath, match);
    }
    // Per-value loop guard: avoids repeated cycle checks for the same reference key.
    const seenKey = normalizePathKey(resolvedKey);
    if (!seenInValue.has(seenKey)) {
        if (visitedRefs.has(seenKey) || visitedRefs.has(resolvedKey)) {
            console.warn(`⚠️  Circular W3C reference: ${tokenPath} at ${pathStr(currentPath)}`);
            summary.circularDeps++;
            return `/* circular-ref: ${tokenPath} */`;
        }
        const cachedHasCycle = cycleStatus.get(resolvedKey);
        if (cachedHasCycle === true) {
            console.warn(`⚠️  Deep circular dependency detected starting from: ${tokenPath} at ${pathStr(currentPath)}`);
            summary.circularDeps++;
            return `/* circular-ref: ${tokenPath} */`;
        }
        seenInValue.add(seenKey);
    }
    const mappedVarName = refMap.get(resolvedKey);
    if (mappedVarName)
        return `var(${mappedVarName})`;
    console.warn(`⚠️  Unresolved W3C reference ${match} at ${pathStr(currentPath)} (resolved key missing in refMap)`);
    recordUnresolvedTyped(summary, currentPath, 'Ref', tokenPath);
    return brokenRefPlaceholder(summary, currentPath, canonicalPath, match);
}
/**
 * Builds a CSS token sequence for string tokens that contain references.
 * CSS does not support string interpolation.
 */
export function buildCssStringTokenSequence(ctx, raw, currentPath, visitedRefs) {
    const parts = [];
    const seenInValue = new Set();
    W3C_REF_REGEX_REPLACE.lastIndex = 0;
    let last = 0;
    let m;
    try {
        while ((m = W3C_REF_REGEX_REPLACE.exec(raw)) !== null) {
            const start = m.index;
            const end = W3C_REF_REGEX_REPLACE.lastIndex;
            const before = raw.slice(last, start);
            if (before)
                parts.push(quoteCssStringLiteral(before));
            const wholeMatch = m[0];
            const tokenPath = (m[1] ?? '').trim();
            const resolved = resolveReference(ctx, wholeMatch, tokenPath, raw, currentPath, visitedRefs, seenInValue);
            // If resolution fails and returns the raw match, keep it as text to guarantee valid CSS output.
            parts.push(resolved === wholeMatch ? quoteCssStringLiteral(wholeMatch) : resolved);
            last = end;
        }
    }
    finally {
        W3C_REF_REGEX_REPLACE.lastIndex = 0;
    }
    const tail = raw.slice(last);
    if (tail)
        parts.push(quoteCssStringLiteral(tail));
    return parts.length ? parts.join(' ') : quoteCssStringLiteral('');
}
// --- VARIABLE_ALIAS processing ---
/**
 * Resolve a VARIABLE_ALIAS object into `var(--...)` when possible.
 */
export function processVariableAlias(ctx, aliasObj, currentPath, visitedRefs) {
    if (!isVariableAlias(aliasObj))
        return JSON.stringify(aliasObj);
    const { summary, tokensData, idToVarName, idToTokenKey, cycleStatus, cssVarNameCollisionMap } = ctx;
    const aliasId = aliasObj.id?.trim();
    const targetKey = aliasId ? idToTokenKey.get(aliasId) : undefined;
    if (aliasId && targetKey && visitedRefs?.has(targetKey)) {
        console.warn(`⚠️  Circular VARIABLE_ALIAS reference (id=${aliasId}) at ${pathStr(currentPath)}`);
        summary.circularDeps++;
        return `/* circular-alias: ${aliasId} */`;
    }
    if (aliasId && targetKey) {
        const cachedHasCycle = cycleStatus.get(targetKey);
        if (cachedHasCycle === true) {
            console.warn(`⚠️  Deep circular dependency reachable via VARIABLE_ALIAS (id=${aliasId}) at ${pathStr(currentPath)}`);
            summary.circularDeps++;
            return `/* circular-alias: ${aliasId} */`;
        }
    }
    const warnIfCollidingVarName = (varNameWithDashes) => {
        const collision = cssVarNameCollisionMap?.get(varNameWithDashes);
        if (!collision || !aliasId)
            return;
        const warnKey = `${aliasId}|${varNameWithDashes}`;
        if (warnedAliasVarCollisions.has(warnKey))
            return;
        warnedAliasVarCollisions.add(warnKey);
        const fmt = (o) => `${o.tokenPath}${o.id ? ` ($id=${o.id})` : ''}`;
        const sample = Array.from(collision.others.values())[0];
        const total = 1 + collision.others.size;
        console.warn(`⚠️  VARIABLE_ALIAS at ${pathStr(currentPath)} (id=${aliasId}) resolved to ${varNameWithDashes}, ` +
            `but this CSS var name collides across ${total} distinct tokens. ` +
            `Last emitted wins; this alias may read an unexpected value. ` +
            `Examples: ${fmt(collision.first)}${sample ? ` | ${fmt(sample)}` : ''}`);
    };
    if (aliasId && tokensData) {
        // Fast path: O(1) lookup via `$id` index.
        const direct = idToVarName.get(aliasId);
        if (direct) {
            warnIfCollidingVarName(direct);
            return `var(${direct})`;
        }
        // Fallback: cached O(N) scan.
        const tokenPath = findTokenByIdCached(tokensData, aliasId);
        if (tokenPath) {
            const cssPath = tokenPath.map(toKebabCase).join('-');
            const derived = `--${cssPath}`;
            if (!isValidCssVariableName(derived)) {
                console.warn(`⚠️  VARIABLE_ALIAS fallback resolved to invalid var name "${derived}" at ${pathStr(currentPath)}; using placeholder.`);
                const placeholderName = toSafePlaceholderName(aliasId);
                recordUnresolvedTyped(summary, currentPath, 'Alias ID', aliasId);
                return `var(--unresolved-${placeholderName})`;
            }
            warnIfCollidingVarName(derived);
            return `var(${derived})`;
        }
        console.warn(`ℹ️  Referencia VARIABLE_ALIAS en ${pathStr(currentPath)} con ID: ${aliasId}`);
        console.warn(`   No se pudo resolver automáticamente. Esto es normal si el ID referencia una variable de Figma no exportada en el JSON.`);
        console.warn(`   Se generará un placeholder. Para resolverlo, convierte la referencia a formato W3C: {token.path}`);
        const placeholderName = toSafePlaceholderName(aliasId);
        recordUnresolvedTyped(summary, currentPath, 'Alias ID', aliasId);
        return `var(--unresolved-${placeholderName})`;
    }
    return `var(--${currentPath.map(toKebabCase).join('-')})`;
}
// --- Shadow processing ---
/**
 * Formats a shadow token into CSS `box-shadow` syntax.
 */
export function processShadow(ctx, shadowObj, currentPath, visitedRefs) {
    if (!isPlainObject(shadowObj))
        return JSON.stringify(shadowObj);
    const shadow = shadowObj;
    const rawType = shadow.type;
    const rawColor = shadow.color;
    const rawOffset = shadow.offset;
    const rawRadius = shadow.radius;
    const rawSpread = shadow.spread;
    const type = rawType === 'INNER_SHADOW' ? 'INNER_SHADOW' : 'DROP_SHADOW';
    const offset = isPlainObject(rawOffset) ? rawOffset : { x: 0, y: 0 };
    const offsetX = typeof offset.x === 'number' ? offset.x : 0;
    const offsetY = typeof offset.y === 'number' ? offset.y : 0;
    const radius = typeof rawRadius === 'number' ? rawRadius : rawRadius == null ? 0 : Number(rawRadius) || 0;
    const spread = typeof rawSpread === 'number' ? rawSpread : rawSpread == null ? 0 : Number(rawSpread) || 0;
    const colorPart = (() => {
        if (rawColor == null)
            return 'rgba(0, 0, 0, 1)';
        const baseLen = currentPath.length;
        currentPath.push('color');
        try {
            if (isVariableAlias(rawColor)) {
                return processVariableAlias(ctx, rawColor, currentPath, visitedRefs);
            }
            if (typeof rawColor === 'string') {
                const processed = processValue(ctx, rawColor, undefined, currentPath, visitedRefs);
                return processed ?? rawColor;
            }
            if (isPlainObject(rawColor)) {
                const r0 = rawColor.r;
                const g0 = rawColor.g;
                const b0 = rawColor.b;
                const a0 = rawColor.a;
                if (typeof r0 === 'number' && typeof g0 === 'number' && typeof b0 === 'number') {
                    const isNormalized = (r0 || 0) <= 1 && (g0 || 0) <= 1 && (b0 || 0) <= 1;
                    const to255 = (c, normalized) => normalized ? Math.round((c || 0) * 255) : Math.round(c || 0);
                    const r = to255(r0, isNormalized);
                    const g = to255(g0, isNormalized);
                    const b = to255(b0, isNormalized);
                    const a = typeof a0 === 'number' ? a0 : 1;
                    return `rgba(${r}, ${g}, ${b}, ${a})`;
                }
            }
            console.warn(`⚠️  Unsupported shadow color format at ${pathStr(currentPath)}; defaulting to black`);
            return 'rgba(0, 0, 0, 1)';
        }
        finally {
            currentPath.length = baseLen;
        }
    })();
    if (type === 'INNER_SHADOW')
        return `inset ${offsetX}px ${offsetY}px ${radius}px ${spread}px ${colorPart}`;
    return `${offsetX}px ${offsetY}px ${radius}px ${spread}px ${colorPart}`;
}
// --- Main value processing ---
/**
 * Processes a token `$value` into a CSS-ready string.
 */
export function processValue(ctx, value, varType, currentPath = [], visitedRefs = EMPTY_VISITED_REFS) {
    const { summary } = ctx;
    // Treat null/undefined as "no value": emit nothing rather than invalid CSS.
    if (value == null)
        return null;
    if (Array.isArray(value)) {
        if (varType === 'shadow') {
            return value.map(v => processShadow(ctx, v, currentPath, visitedRefs)).join(', ');
        }
        try {
            return JSON.stringify(value);
        }
        catch {
            return String(value);
        }
    }
    if (typeof value === 'object') {
        if (varType === 'shadow' && !isVariableAlias(value)) {
            return processShadow(ctx, value, currentPath, visitedRefs);
        }
        if (isVariableAlias(value)) {
            return processVariableAlias(ctx, value, currentPath, visitedRefs);
        }
        console.warn(`⚠️  Token compuesto no soportado en ${pathStr(currentPath)}, se omite`);
        recordUnresolved(summary, currentPath, ' (Composite object skipped)');
        return null;
    }
    if (typeof value === 'string') {
        // Preserve common CSS color formats verbatim.
        if (value.startsWith('rgba') || value.startsWith('rgb('))
            return value;
        if (/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(value))
            return value;
        if (varType === 'string') {
            const hasRef = W3C_REF_REGEX_TEST.test(value);
            if (!hasRef)
                return quoteCssStringLiteral(value);
            return buildCssStringTokenSequence(ctx, value, currentPath, visitedRefs);
        }
        const seenInValue = new Set();
        let hadRef = false;
        W3C_REF_REGEX_REPLACE.lastIndex = 0;
        const replaced = value.replace(W3C_REF_REGEX_REPLACE, (m, tp) => {
            hadRef = true;
            return resolveReference(ctx, m, tp, value, currentPath, visitedRefs, seenInValue);
        });
        W3C_REF_REGEX_REPLACE.lastIndex = 0;
        return hadRef ? replaced : value;
    }
    if (typeof value === 'number' || typeof value === 'boolean')
        return String(value);
    return String(value);
}
// --- Emission orchestration ---
/**
 * Emission phase: flattens the token tree into CSS declarations.
 * Sorted traversal is used to make the output deterministic across runs.
 */
export function flattenTokens(ctx, obj, prefix = [], collectedVars = [], currentPath = []) {
    const { summary } = ctx;
    walkTokenTree(summary, obj, prefix, currentPath, {
        onTokenValue: ({ obj: tokenObj, prefix: tokenPrefix, currentPath: tokenPath, inheritedType }) => {
            summary.totalTokens++;
            const rawValue = tokenObj.$value;
            const varType = tokenObj.$type ?? inheritedType;
            if (rawValue == null) {
                console.warn(`⚠️  Token sin $value (o null) en ${pathStr(tokenPath)}, se omite`);
                return;
            }
            const visitedRefs = buildVisitedRefSet(tokenPath);
            const resolvedValue = processValue(ctx, rawValue, varType, tokenPath, visitedRefs);
            if (resolvedValue === null)
                return;
            const varName = buildCssVarNameFromPrefix(tokenPrefix);
            emitCssVar(summary, collectedVars, varName, resolvedValue, tokenPath, true);
        },
        onLegacyPrimitive: ({ value, key, normalizedKey, currentPath: parentPath, prefix: parentPrefix, inheritedType }) => {
            summary.totalTokens++;
            const varName = buildCssVarNameFromPrefix([...parentPrefix, normalizedKey]);
            const leafPath = [...parentPath, key];
            const visitedRefs = buildVisitedRefSet(leafPath);
            const processedValue = processValue(ctx, value, inheritedType, leafPath, visitedRefs);
            if (processedValue === null)
                return;
            emitCssVar(summary, collectedVars, varName, processedValue, leafPath, false);
        }
    }, 0, false, true);
    return collectedVars;
}
