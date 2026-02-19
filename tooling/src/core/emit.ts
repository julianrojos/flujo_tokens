/**
 * Emission phase: value resolution and CSS output generation.
 */

import type { EmissionContext, ExecutionSummary, TokenValue, CssVarOwner, CssVarCollision, IndexingContext } from '../types/tokens.js';
import { isPlainObject, isVariableAlias, isModeKey } from '../types/tokens.js';
import { MAX_DEPTH, EMPTY_VISITED_REFS, ALLOW_ALIAS_SCAN } from '../runtime/config.js';
import { findTokenByIdCache, warnedAliasVarCollisions, warnedFindTokenByIdDepthLimit, warnedInvalidTokenDetails } from '../runtime/state.js';
import { walkTokenTree } from './walk.js';
import { getResolvedTokenKeyFromParts } from './analyze.js';
import { W3C_REF_REGEX_REPLACE, W3C_REF_REGEX_TEST } from '../utils/regex.js';
import { pathStr, canonicalizeRefPath, normalizePathKey, buildVisitedRefSet, buildPathKey } from '../utils/paths.js';
import { toKebabCase, isValidCssVariableName, buildCssVarNameFromPrefix, toSafePlaceholderName } from '../utils/strings.js';
import { coerceTypographyDimension, coerceBorderDimension } from '../utils/coerce.js';
import { withPathSegment } from '../utils/path-stack.js';

const tokenDataIdentity = new WeakMap<object, number>();
let tokenDataIdentitySeq = 0;

function getTokenDataIdentity(tokensData: Record<string, any>): number {
    const key = tokensData as unknown as object;
    const existing = tokenDataIdentity.get(key);
    if (existing) return existing;
    const next = ++tokenDataIdentitySeq;
    tokenDataIdentity.set(key, next);
    return next;
}

function replaceW3cReferences(
    input: string,
    replacer: (match: string, tokenPath: string) => string
): { replaced: string; hadRef: boolean } {
    // Use a local regex instance to avoid shared `lastIndex` state across calls.
    const refRegex = new RegExp(W3C_REF_REGEX_REPLACE.source, W3C_REF_REGEX_REPLACE.flags);
    let hadRef = false;
    const replaced = input.replace(refRegex, (match, tokenPath) => {
        hadRef = true;
        return replacer(match, tokenPath);
    });
    return { replaced, hadRef };
}

function containsReference(value: unknown): boolean {
    if (typeof value === 'string') return W3C_REF_REGEX_TEST.test(value);
    if (isVariableAlias(value)) return true;
    if (Array.isArray(value)) return value.some(v => containsReference(v));
    if (isPlainObject(value)) {
        for (const [k, v] of Object.entries(value)) {
            if (k.startsWith('$')) continue;
            if (containsReference(v)) return true;
        }
    }
    return false;
}

function canEmitUntypedTokenValue(rawValue: TokenValue['$value']): boolean {
    if (rawValue == null) return false;
    if (typeof rawValue === 'string' || typeof rawValue === 'number' || typeof rawValue === 'boolean') {
        return true;
    }
    if (isVariableAlias(rawValue)) {
        const aliasId = rawValue.id?.trim();
        return !!aliasId;
    }
    return false;
}

// --- Recording helpers ---

function getSummaryTokenKey(currentPath: string[]): string {
    const normalized = normalizePathKey(buildPathKey(currentPath));
    if (normalized) return normalized;
    return normalizePathKey(pathStr(currentPath));
}

function incrementUniqueTokenCount(summary: ExecutionSummary, currentPath: string[]): void {
    const key = getSummaryTokenKey(currentPath);
    if (!key || summary.countedTokenKeys.has(key)) return;
    summary.countedTokenKeys.add(key);
    summary.totalTokens++;
}

function incrementUniqueGeneratedCount(summary: ExecutionSummary, currentPath: string[]): void {
    const key = getSummaryTokenKey(currentPath);
    if (!key || summary.countedGeneratedKeys.has(key)) return;
    summary.countedGeneratedKeys.add(key);
    summary.successCount++;
}

function incrementUniqueTokenTypeCount(summary: ExecutionSummary, currentPath: string[], varType?: string): void {
    if (!varType) return;
    const key = getSummaryTokenKey(currentPath);
    if (!key) return;

    const typeKey = `${key}::${varType}`;
    if (summary.countedTokenTypeKeys.has(typeKey)) return;
    summary.countedTokenTypeKeys.add(typeKey);
    summary.tokenTypeCounts[varType] = (summary.tokenTypeCounts[varType] || 0) + 1;
}

export function recordUnresolved(summary: ExecutionSummary, currentPath: string[], reason: string): void {
    summary.unresolvedRefs.push(`${pathStr(currentPath)}${reason}`);
}

export function recordUnresolvedTyped(summary: ExecutionSummary, currentPath: string[], label: string, detail: string): void {
    recordUnresolved(summary, currentPath, ` (${label}: ${detail})`);
}

/**
 * Precomputes which tokens are actually emittable so references to non-emitted tokens
 * can be flagged as unresolved instead of silently resolving to ghost vars.
 */
export function buildEmittableKeySet(ctx: IndexingContext): Set<string> {
    const emittable = new Set<string>();

    const canEmitValue = (token: TokenValue): boolean => {
        const varType = token.$type;
        const rawValue = token.$value;

        if (rawValue == null) return false;

        // Compatibility mode: untyped primitive/alias tokens are emittable.
        if (!varType) {
            return canEmitUntypedTokenValue(rawValue);
        }

        if (Array.isArray(rawValue)) {
            return varType === 'shadow';
        }

        if (typeof rawValue === 'object') {
            if (isVariableAlias(rawValue)) {
                const aliasId = rawValue.id?.trim();
                return !!aliasId;
            }

            if (varType === 'shadow') return true;

            if (varType === 'typography') {
                const family = (rawValue as any).fontFamily;
                const size = (rawValue as any).fontSize;
                return family != null && size != null;
            }

            if (varType === 'border') {
                const { width, style, color } = rawValue as any;
                return width != null && style != null && color != null;
            }

            return false;
        }

        return true;
    };

    for (const [key, token] of ctx.valueMap.entries()) {
        if (!token) continue;
        if (canEmitValue(token as TokenValue)) {
            emittable.add(key);
        }
    }

    return emittable;
}

/**
 * Emits a single custom property declaration into `collectedVars`, if the name is valid.
 */
export function emitCssVar(
    summary: ExecutionSummary,
    collectedVars: string[],
    varName: string,
    value: string,
    currentPath: string[],
    recordInvalidName: boolean
): void {
    if (!isValidCssVariableName(varName)) {
        console.warn(`⚠️  Warning: ${varName} is not a valid CSS variable name, skipping`);
        if (recordInvalidName) {
            const detail = `${pathStr(currentPath)} (Invalid CSS Var: ${varName})`;
            if (!summary.invalidNames.includes(detail)) {
                summary.invalidNames.push(detail);
            }
        }
        return;
    }

    collectedVars.push(`  ${varName}: ${value};`);
    incrementUniqueGeneratedCount(summary, currentPath);
}

// --- Token lookup helpers ---

/**
 * Fallback VARIABLE_ALIAS resolution by scanning the entire token tree for a matching `$id`.
 * This is used when the `$id` index misses (e.g., partial exports).
 */
export function findTokenById(
    tokensData: Record<string, any>,
    targetId: string,
    currentPath: string[] = [],
    depth = 0
): string[] | null {
    if (!isPlainObject(tokensData)) return null;

    const target = typeof targetId === 'string' ? targetId.trim() : '';
    if (!target) return null;

    if (depth > MAX_DEPTH) {
        if (!warnedFindTokenByIdDepthLimit.has(target)) {
            warnedFindTokenByIdDepthLimit.add(target);
            const at = currentPath.length ? pathStr(currentPath) : '<root>';
            console.warn(
                `⚠️  findTokenById aborted: depth limit (${MAX_DEPTH}) exceeded while searching for $id="${target}" near ${at}.`
            );
        }
        return null;
    }

    const matchesId = (candidate: unknown): boolean => {
        if (typeof candidate !== 'string') return false;
        return candidate === target || candidate.trim() === target;
    };

    for (const key in tokensData) {
        if (!Object.prototype.hasOwnProperty.call(tokensData, key)) continue;

        if (key.startsWith('$')) {
            const keyValue = (tokensData as any)[key];
            if (key === '$id' && matchesId(keyValue)) {
                // Clone because `currentPath` is a mutable stack.
                return currentPath.slice();
            }
            continue;
        }

        const value = (tokensData as any)[key];

        if (isPlainObject(value)) {
            const found = withPathSegment(currentPath, key, () => {
                if ('$id' in value && matchesId((value as any).$id)) {
                    return currentPath.slice();
                }
                return findTokenById(value as Record<string, any>, target, currentPath, depth + 1);
            });
            if (found) return found;
        }
    }

    return null;
}

/**
 * Cached wrapper for `findTokenById()`; caches misses as well.
 */
export function findTokenByIdCached(tokensData: Record<string, any>, targetId: string): string[] | null {
    const key = typeof targetId === 'string' ? targetId.trim() : '';
    if (!key) return null;

    const scopedKey = `${getTokenDataIdentity(tokensData)}::${key}`;
    if (findTokenByIdCache.has(scopedKey)) return findTokenByIdCache.get(scopedKey)!;

    const found = findTokenById(tokensData, key);
    findTokenByIdCache.set(scopedKey, found);
    return found;
}

// --- Reference resolution ---

/**
 * Generates a placeholder `var(--broken-ref-...)` for unresolved references.
 */
function brokenRefPlaceholder(summary: ExecutionSummary, currentPath: string[], canonicalPath: string, match: string): string {
    const cssPath = canonicalPath.split('.').map(toKebabCase).join('-');
    const varName = `--broken-ref-${cssPath || 'unknown'}`;

    if (!isValidCssVariableName(varName)) {
        summary.invalidNames.push(`${pathStr(currentPath)} (Ref to invalid name: ${varName})`);
        return match;
    }
    return `var(${varName})`;
}

export function resolveReference(
    ctx: EmissionContext,
    match: string,
    tokenPath: string,
    originalValue: string,
    currentPath: string[],
    visitedRefs: ReadonlySet<string>,
    seenInValue: Set<string>
): string {
    const { summary, refMap, collisionKeys, cycleStatus, emittableKeys } = ctx;

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
        console.warn(
            `⚠️  ${isCollision ? 'Ambiguous' : 'Unresolved'} W3C reference ${match} at ${pathStr(currentPath)}${isCollision ? ' (normalized collision)' : ''
            }`
        );

        if (isCollision) recordUnresolvedTyped(summary, currentPath, 'Collision', tokenPath);
        else recordUnresolvedTyped(summary, currentPath, 'Ref', tokenPath);

        return brokenRefPlaceholder(summary, currentPath, canonicalPath, match);
    }

    const isEmittable = emittableKeys.has(resolvedKey) || emittableKeys.has(normalizedTokenPath);
    if (!isEmittable) {
        console.warn(
            `⚠️  W3C reference ${match} at ${pathStr(currentPath)} points to a token that will not be emitted (${tokenPath})`
        );
        recordUnresolvedTyped(summary, currentPath, 'Ref (not emitted)', tokenPath);
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

    const mappedVarName = refMap.get(resolvedKey) ?? refMap.get(normalizedTokenPath);
    if (mappedVarName) return `var(${mappedVarName})`;

    console.warn(`⚠️  Unresolved W3C reference ${match} at ${pathStr(currentPath)} (resolved key missing in refMap)`);
    recordUnresolvedTyped(summary, currentPath, 'Ref', tokenPath);

    return brokenRefPlaceholder(summary, currentPath, canonicalPath, match);
}

// --- VARIABLE_ALIAS processing ---

/**
 * Resolve a VARIABLE_ALIAS object into `var(--...)` when possible.
 */
export function processVariableAlias(
    ctx: EmissionContext,
    aliasObj: unknown,
    currentPath: string[],
    visitedRefs?: ReadonlySet<string>
): string {
    if (!isVariableAlias(aliasObj)) return JSON.stringify(aliasObj);

    const { summary, tokensData, refMap, idToVarName, idToTokenKey, cycleStatus, emittableKeys, cssVarNameCollisionMap } = ctx;

    const aliasId = aliasObj.id?.trim();
    const targetKey = aliasId ? idToTokenKey.get(aliasId) : undefined;

    if (!aliasId) {
        console.warn(`⚠️  VARIABLE_ALIAS without a valid id at ${pathStr(currentPath)}; emitting unresolved placeholder`);
        const placeholderName = toSafePlaceholderName(pathStr(currentPath)) || 'alias';
        recordUnresolvedTyped(summary, currentPath, 'Alias ID', 'missing');
        return `var(--unresolved-alias-${placeholderName})`;
    }

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

    if (aliasId && targetKey && !emittableKeys.has(targetKey)) {
        console.warn(
            `⚠️  VARIABLE_ALIAS at ${pathStr(currentPath)} points to a token not emitted in this scope (id=${aliasId}).`
        );
        const placeholderName = toSafePlaceholderName(aliasId);
        recordUnresolvedTyped(summary, currentPath, 'Alias ID (not emitted)', aliasId);
        return `var(--unresolved-${placeholderName})`;
    }

    const warnIfCollidingVarName = (varNameWithDashes: string) => {
        const collision = cssVarNameCollisionMap?.get(varNameWithDashes);
        if (!collision || !aliasId) return;

        const warnKey = `${aliasId}|${varNameWithDashes}`;
        if (warnedAliasVarCollisions.has(warnKey)) return;
        warnedAliasVarCollisions.add(warnKey);

        const fmt = (o: CssVarOwner) => `${o.tokenPath}${o.id ? ` ($id=${o.id})` : ''}`;
        const sample = Array.from(collision.others.values())[0];
        const total = 1 + collision.others.size;

        console.warn(
            `⚠️  VARIABLE_ALIAS at ${pathStr(currentPath)} (id=${aliasId}) resolved to ${varNameWithDashes}, ` +
            `but this CSS var name collides across ${total} distinct tokens. ` +
            `Last emitted wins; this alias may read an unexpected value. ` +
            `Examples: ${fmt(collision.first)}${sample ? ` | ${fmt(sample)}` : ''}`
        );
    };

    const deriveVarNameFromTokenPath = (tokenPath: string[]): string => {
        // `tokenPath` includes the file root (currentPath starts with file name in CLI),
        // but emitted variable names intentionally omit that namespace segment.
        const segments = tokenPath
            .slice(1)
            .filter(seg => !!seg && !isModeKey(seg))
            .map(toKebabCase)
            .filter(Boolean);
        return buildCssVarNameFromPrefix(segments);
    };

    if (aliasId && tokensData) {
        // Fast path: O(1) lookup via `$id` index.
        const direct = idToVarName.get(aliasId);
        if (direct) {
            warnIfCollidingVarName(direct);
            return `var(${direct})`;
        }

        if (ALLOW_ALIAS_SCAN) {
            // Optional fallback: cached O(N) scan.
            const tokenPath = findTokenByIdCached(tokensData, aliasId);
            if (tokenPath) {
                const fullKey = buildPathKey(tokenPath);
                const fullKeyNorm = normalizePathKey(fullKey);
                const relativeKey = buildPathKey(tokenPath, 1);
                const relativeKeyNorm = normalizePathKey(relativeKey);
                const candidateKeys = [fullKey, fullKeyNorm, relativeKey, relativeKeyNorm].filter(k => !!k) as string[];
                const targetIsEmittableInScope = candidateKeys.some(k => emittableKeys.has(k));

                if (!targetIsEmittableInScope) {
                    console.warn(
                        `⚠️  VARIABLE_ALIAS at ${pathStr(currentPath)} resolved id="${aliasId}" to a token not emitted in this scope.`
                    );
                    const placeholderName = toSafePlaceholderName(aliasId);
                    recordUnresolvedTyped(summary, currentPath, 'Alias ID (not emitted)', aliasId);
                    return `var(--unresolved-${placeholderName})`;
                }

                const mappedFromIndex =
                    refMap.get(fullKey) ??
                    refMap.get(fullKeyNorm) ??
                    refMap.get(relativeKey) ??
                    refMap.get(relativeKeyNorm);

                if (mappedFromIndex) {
                    warnIfCollidingVarName(mappedFromIndex);
                    return `var(${mappedFromIndex})`;
                }

                const derived = deriveVarNameFromTokenPath(tokenPath);

                if (!isValidCssVariableName(derived)) {
                    console.warn(
                        `⚠️  VARIABLE_ALIAS fallback resolved to invalid var name "${derived}" at ${pathStr(currentPath)}; using placeholder.`
                    );
                    const placeholderName = toSafePlaceholderName(aliasId);
                    recordUnresolvedTyped(summary, currentPath, 'Alias ID', aliasId);
                    return `var(--unresolved-${placeholderName})`;
                }

                warnIfCollidingVarName(derived);
                return `var(${derived})`;
            }
        } else {
            console.warn(
                `ℹ️  VARIABLE_ALIAS scan fallback is disabled (ALLOW_ALIAS_SCAN=false); ` +
                `skipping tree scan for id="${aliasId}" at ${pathStr(currentPath)}.`
            );
        }

        console.warn(`ℹ️  VARIABLE_ALIAS reference at ${pathStr(currentPath)} with ID: ${aliasId}`);
        console.warn(
            `   Could not resolve automatically. This is normal if the ID refers to a Figma variable not exported in the JSON.`
        );
        console.warn(`   A placeholder will be generated. To resolve this, convert the reference to W3C format: {token.path}`);

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
export function processShadow(ctx: EmissionContext, shadowObj: unknown, currentPath: string[], visitedRefs: ReadonlySet<string>): string {
    if (!isPlainObject(shadowObj)) return JSON.stringify(shadowObj);

    const shadow = shadowObj as Record<string, any>;

    const rawType = shadow.type as unknown;
    const rawColor = shadow.color as unknown;
    const rawOffset = shadow.offset as unknown;
    const rawRadius = shadow.radius as unknown;
    const rawSpread = shadow.spread as unknown;

    const type = rawType === 'INNER_SHADOW' ? 'INNER_SHADOW' : 'DROP_SHADOW';

    // Helper to resolve dimensions (number, string, or ref)
    const resolveDim = (val: unknown, def: number): string => {
        if (val == null) return `${def}px`;

        let resolved = val;
        // 1. Try to resolve if it's a ref/alias string
        if (typeof val === 'string') {
            resolved = processValue(ctx, val, undefined, currentPath, visitedRefs) ?? val;
        }

        // 2. If it's a number (or stringy number "5"), append px
        if (typeof resolved === 'number' || (typeof resolved === 'string' && /^-?\d+(\.\d+)?$/.test(resolved.trim()))) {
            return `${resolved}px`;
        }

        // 3. Otherwise trust the string (supports "0.5rem", "var(--foo)", etc.)
        return String(resolved);
    };

    const offset = isPlainObject(rawOffset) ? (rawOffset as { x?: number | null; y?: number | null }) : { x: 0, y: 0 };
    const offsetXStr = resolveDim(offset.x, 0);
    const offsetYStr = resolveDim(offset.y, 0);
    const radiusStr = resolveDim(rawRadius, 0);
    const spreadStr = resolveDim(rawSpread, 0);

    const colorPart = (() => {
        if (rawColor == null) return 'rgba(0, 0, 0, 1)';

        return withPathSegment(currentPath, 'color', () => {
            if (isVariableAlias(rawColor)) {
                return processVariableAlias(ctx, rawColor, currentPath, visitedRefs);
            }

            if (typeof rawColor === 'string') {
                const processed = processValue(ctx, rawColor, undefined, currentPath, visitedRefs);
                return processed ?? rawColor;
            }

            if (isPlainObject(rawColor)) {
                const r0 = (rawColor as any).r;
                const g0 = (rawColor as any).g;
                const b0 = (rawColor as any).b;
                const a0 = (rawColor as any).a;

                if (typeof r0 === 'number' && typeof g0 === 'number' && typeof b0 === 'number') {
                    const channels = [r0, g0, b0];
                    const hasChannelGreaterThanOne = channels.some(c => c > 1);
                    const allWithinUnitRange = channels.every(c => c >= 0 && c <= 1);
                    const isNormalized = !hasChannelGreaterThanOne && allWithinUnitRange;
                    const to255 = (c: number, normalized: boolean): number =>
                        normalized ? Math.round((c || 0) * 255) : Math.round(c || 0);

                    const r = to255(r0, isNormalized);
                    const g = to255(g0, isNormalized);
                    const b = to255(b0, isNormalized);
                    const a = typeof a0 === 'number' ? a0 : 1;

                    return `rgba(${r}, ${g}, ${b}, ${a})`;
                }
            }

            console.warn(`⚠️  Unsupported shadow color format at ${pathStr(currentPath)}; defaulting to transparent`);
            return 'rgba(0, 0, 0, 0)';
        });
    })();

    if (type === 'INNER_SHADOW') return `inset ${offsetXStr} ${offsetYStr} ${radiusStr} ${spreadStr} ${colorPart}`;
    return `${offsetXStr} ${offsetYStr} ${radiusStr} ${spreadStr} ${colorPart}`;
}

// --- Composite Token Helpers ---

function processTypography(ctx: EmissionContext, value: Record<string, any>, currentPath: string[], visitedRefs: ReadonlySet<string>): string | null {
    // Expected keys: fontFamily, fontSize, fontWeight, lineHeight, fontStyle
    // CSS font shorthand: [font-style] [font-weight] [font-size]/[line-height] [font-family]

    const resolve = (key: string) => {
        const val = value[key];
        if (val == null) return null;
        // Use processValue to ensure ANY reference (W3C or Alias) is resolved
        return processValue(ctx, val, undefined, currentPath, visitedRefs) ?? String(val);
    };

    const family = resolve('fontFamily');
    const size = resolve('fontSize');
    const weight = resolve('fontWeight');
    const lineHeight = resolve('lineHeight');
    const style = resolve('fontStyle');

    // Minimum requirement for valid font shorthand is size and family
    if (!size || !family) {
        return null;
    }

    const parts: string[] = [];
    if (style) parts.push(style);
    if (weight) parts.push(weight);

    let sizePart = size;
    if (lineHeight) {
        sizePart += `/${lineHeight}`;
    }
    parts.push(sizePart);

    // Ensure family is quoted if it contains spaces and isn't a var() or already quoted.
    let finalFamily = family;
    const hasSpaces = /\s/.test(family);
    const isVar = family.startsWith('var(');
    const isQuoted = /^['"]/.test(family);

    if (hasSpaces && !isVar && !isQuoted) {
        finalFamily = `"${family}"`;
    }
    parts.push(finalFamily);

    return parts.join(' ');
}

function processBorder(ctx: EmissionContext, value: Record<string, any>, currentPath: string[], visitedRefs: ReadonlySet<string>): string | null {
    // Expected keys: width, style, color
    // CSS border: [width] [style] [color]

    const resolve = (key: string) => {
        const val = value[key];
        if (val == null) return null;
        // Use processValue for everything to resolve deep references
        return processValue(ctx, val, undefined, currentPath, visitedRefs) ?? String(val);
    };

    const width = resolve('width');
    const style = resolve('style'); // Strict mode: mandatory
    const color = resolve('color');

    if (!width || !color || !style) {
        // In strict mode, missing style is invalid.
        return null;
    }

    return `${width} ${style} ${color}`;
}

// --- Main value processing ---

/**
 * Processes a token `$value` into a CSS-ready string.
 */
export function processValue(
    ctx: EmissionContext,
    value: TokenValue['$value'],
    varType?: string,
    currentPath: string[] = [],
    visitedRefs: ReadonlySet<string> = EMPTY_VISITED_REFS
): string | null {
    const { summary } = ctx;

    // Treat null/undefined as "no value"
    if (value == null) return null;

    const coerced = coerceTypographyDimension(value, varType, currentPath);
    value = coerced.value;
    varType = coerced.varType;
    const coercedBorder = coerceBorderDimension(value, varType, currentPath);
    value = coercedBorder.value;
    varType = coercedBorder.varType;

    if (Array.isArray(value)) {
        if (varType === 'shadow') {
            return value.map(v => processShadow(ctx, v, currentPath, visitedRefs)).join(', ');
        }
        // Array fallback - Explicitly warn about unsupported arrays to avoid silent failure
        console.warn(`⚠️  Array value found for type '${varType}' at ${pathStr(currentPath)} - Arrays are only supported for shadows.`);
        recordUnresolved(summary, currentPath, ` (Unsupported Array Value for type: ${varType})`);
        return null;
    }

    if (typeof value === 'object') {
        if (isVariableAlias(value)) {
            return processVariableAlias(ctx, value, currentPath, visitedRefs);
        }

        // Composite Handling based on Type
        if (varType === 'shadow') {
            return processShadow(ctx, value, currentPath, visitedRefs);
        }
        if (varType === 'typography') {
            const fontCss = processTypography(ctx, value as Record<string, any>, currentPath, visitedRefs);
            if (fontCss) return fontCss;
            // Fallthrough to error if invalid typography
        }
        if (varType === 'border') {
            const borderCss = processBorder(ctx, value as Record<string, any>, currentPath, visitedRefs);
            if (borderCss) return borderCss;
            // Fallthrough to error
        }

        // Strict Fallback: Error and Skip
        console.error(`❌ Error: Unable to process composite token at ${pathStr(currentPath)} (Type: ${varType}). Skipping.`);
        recordUnresolved(summary, currentPath, ` (Invalid/Unsupported Composite: ${varType})`);
        return null;
    }

    if (typeof value === 'string') {
        // Preserve common CSS color formats verbatim.
        if (value.startsWith('rgba') || value.startsWith('rgb(')) return value;
        if (/^#(?:[0-9A-Fa-f]{3}|[0-9A-Fa-f]{4}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/.test(value)) return value;

        const seenInValue = new Set<string>();
        const { replaced, hadRef } = replaceW3cReferences(
            value,
            (m, tp) => resolveReference(ctx, m, tp, value, currentPath, visitedRefs, seenInValue)
        );

        // Do not force-quote string tokens. Keep raw CSS keywords/idents (e.g., bold, solid),
        // while still resolving embedded references.
        return hadRef ? replaced : value;
    }

    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return String(value);
}

// --- Emission orchestration ---

/**
 * Emission phase: flattens the token tree into CSS declarations.
 * Sorted traversal is used to make the output deterministic across runs.
 *
 * Returns primitives first (no references) and aliases later.
 */
export function flattenTokens(
    ctx: EmissionContext,
    obj: any,
    prefix: string[] = [],
    currentPath: string[] = [],
    preferredMode?: string,
    modeStrict = false,
    skipBaseWhenMode = false,
    modeOverridesOnly = false,
    allowModeBranches = true
): { primitives: string[]; aliases: string[] } {
    const { summary } = ctx;
    const primitiveVars: string[] = [];
    const aliasVars: string[] = [];

    walkTokenTree(
        summary,
        obj,
        prefix,
        currentPath,
        {
            onTokenValue: ({ obj: tokenObj, prefix: tokenPrefix, currentPath: tokenPath, inheritedType }) => {
                incrementUniqueTokenCount(summary, tokenPath);
                const rawValue = (tokenObj as TokenValue).$value;
                const varType = (tokenObj as TokenValue).$type ?? inheritedType;

                incrementUniqueTokenTypeCount(summary, tokenPath, varType);

                if (rawValue == null) {
                    console.warn(`⚠️  Token without $value (or null) at ${pathStr(tokenPath)}, skipping`);
                    return;
                }

                // Compatibility mode for non-strict exports:
                // allow untyped primitive/alias tokens, but keep blocking untyped composites.
                if (!varType && !canEmitUntypedTokenValue(rawValue)) {
                    const detail = `${pathStr(tokenPath)} (Missing $type)`;
                    if (summary.invalidTokens.includes(detail)) {
                        return;
                    }

                    if (!warnedInvalidTokenDetails.has(detail)) {
                        warnedInvalidTokenDetails.add(detail);
                        console.error(`❌ Strict Error: Token without $type at ${pathStr(tokenPath)}. SKIPPING.`);
                    }
                    summary.invalidTokens.push(detail);
                    return;
                }

                const visitedRefs = buildVisitedRefSet(tokenPath);
                const resolvedValue = processValue(ctx, rawValue, varType, tokenPath, visitedRefs);
                if (resolvedValue === null) return;

                const varName = buildCssVarNameFromPrefix(tokenPrefix);
                const target = containsReference(rawValue) ? aliasVars : primitiveVars;
                emitCssVar(summary, target, varName, resolvedValue, tokenPath, true);
            },

            onLegacyPrimitive: ({ value, key, normalizedKey, currentPath: parentPath, prefix: parentPrefix, inheritedType }) => {
                const varName = buildCssVarNameFromPrefix([...parentPrefix, normalizedKey]);
                const leafPath = [...parentPath, key];
                incrementUniqueTokenCount(summary, leafPath);

                const visitedRefs = buildVisitedRefSet(leafPath);

                incrementUniqueTokenTypeCount(summary, leafPath, inheritedType);

                const processedValue = processValue(ctx, value, inheritedType, leafPath, visitedRefs);
                if (processedValue === null) return;

                const target = containsReference(value) ? aliasVars : primitiveVars;
                emitCssVar(summary, target, varName, processedValue, leafPath, false);
            }
        },
        0,
        false,
        true,
        undefined,
        preferredMode,
        modeStrict,
        skipBaseWhenMode,
        modeOverridesOnly,
        allowModeBranches
    );

    return { primitives: primitiveVars, aliases: aliasVars };
}
