/**
 * Reference resolution for W3C token references and VARIABLE_ALIAS.
 * 
 * This module encapsulates all logic related to:
 * - Resolving W3C references ({token.path} syntax)
 * - Resolving VARIABLE_ALIAS objects (Figma variable IDs)
 * - Cycle detection and tracking
 * - Unresolved reference reporting
 */

import type { EmissionContext } from '../types/tokens.js';
import { isVariableAlias, isPlainObject, isModeKey } from '../types/tokens.js';
import { MAX_DEPTH, ALLOW_ALIAS_SCAN } from '../runtime/config.js';
import { warnedFindTokenByIdDepthLimit, warnedAliasVarCollisions, findTokenByIdCache } from '../runtime/state.js';
import { getNodeIdByTokenPath, getResolvedTokenKeyFromParts } from './token-graph.js';
import { W3C_REF_REGEX_REPLACE, W3C_REF_REGEX_TEST } from '../utils/regex.js';
import { pathStr, canonicalizeRefPath, normalizePathKey, buildVisitedRefSet, buildPathKey } from '../utils/paths.js';
import { toKebabCase, isValidCssVariableName, buildCssVarNameFromPrefix, toSafePlaceholderName } from '../utils/strings.js';
import { canEmitTokenValue } from '../utils/emittable.js';
import { withPathSegment } from '../utils/path-stack.js';

// --- Module-level state for token data identity (shared across all ReferenceResolver instances) ---
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

// --- Types ---

export interface ReferenceResolutionContext {
    ctx: EmissionContext;
    currentPath: string[];
    visitedRefs?: ReadonlySet<string>;
    seenInValue?: Set<string>;
}

export interface FindTokenByIdCache {
    get(key: string): string[] | null | undefined;
    set(key: string, value: string[] | null): void;
    has(key: string): boolean;
}

// --- Helpers (internal) ---

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

function recordUnresolved(summary: EmissionContext['summary'], currentPath: string[], reason: string): void {
    summary.unresolvedRefs.push(`${pathStr(currentPath)}${reason}`);
}

function recordUnresolvedTyped(
    summary: EmissionContext['summary'],
    currentPath: string[],
    label: string,
    detail: string
): void {
    recordUnresolved(summary, currentPath, ` (${label}: ${detail})`);
}

function brokenRefPlaceholder(
    summary: EmissionContext['summary'],
    currentPath: string[],
    canonicalPath: string,
    match: string
): string {
    const cssPath = canonicalPath.split('.').map(toKebabCase).join('-');
    const varName = `--broken-ref-${cssPath || 'unknown'}`;

    if (!isValidCssVariableName(varName)) {
        summary.invalidNames.push(`${pathStr(currentPath)} (Ref to invalid name: ${varName})`);
        return match;
    }
    return `var(${varName})`;
}

/**
 * Fallback VARIABLE_ALIAS resolution by scanning the entire token tree for a matching `$id`.
 * This is used when the `$id` index misses (e.g., partial exports).
 */
function findTokenById(
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

// --- ReferenceResolver Class ---

/**
 * Encapsulates all reference resolution logic for W3C refs and VARIABLE_ALIAS.
 * 
 * Manages:
 * - Cycle detection via visitedRefs and seenInValue
 * - Resolution of {token.path} syntax to var(--token-path)
 * - Resolution of VARIABLE_ALIAS objects to var(--css-var) or placeholders
 * - Error reporting and unresolved ref tracking
 */
export class ReferenceResolver {
    private readonly ctx: EmissionContext;
    private readonly currentPath: string[];
    private readonly visitedRefs: ReadonlySet<string>;
    private readonly seenInValue: Set<string>;

    constructor(context: ReferenceResolutionContext) {
        this.ctx = context.ctx;
        this.currentPath = context.currentPath;
        this.visitedRefs = context.visitedRefs ?? buildVisitedRefSet(context.currentPath);
        this.seenInValue = context.seenInValue ?? new Set<string>();
    }

    /**
     * Public accessor for the inherited visitedRefs set.
     * Used by processors that delegate nested resolution to processValueWithRegistry
     * and need to thread the cycle-detection guard through.
     */
    get visitedRefsSet(): ReadonlySet<string> {
        return this.visitedRefs;
    }

    /**
     * Resolves a W3C reference match ({token.path}) into var(--token-path) or a placeholder.
     */
    resolveW3CReference(match: string, tokenPath: string, originalValue: string): string {
        const { summary, refMap, collisionKeys, cycleStatus, emittableKeys } = this.ctx;

        tokenPath = tokenPath.trim();
        if (!tokenPath) {
            console.warn(`⚠️  Empty W3C reference in "${originalValue}" at ${pathStr(this.currentPath)}`);
            recordUnresolved(summary, this.currentPath, ' (Empty ref)');
            return match;
        }

        const canonicalPath = canonicalizeRefPath(tokenPath);
        const normalizedTokenPath = normalizePathKey(canonicalPath);

        const resolvedKey = getResolvedTokenKeyFromParts(canonicalPath, normalizedTokenPath, this.ctx);
        if (!resolvedKey) {
            const isCollision = collisionKeys.has(normalizedTokenPath);
            console.warn(
                `⚠️  ${isCollision ? 'Ambiguous' : 'Unresolved'} W3C reference ${match} at ${pathStr(this.currentPath)}${isCollision ? ' (normalized collision)' : ''
                }`
            );

            if (isCollision) recordUnresolvedTyped(summary, this.currentPath, 'Collision', tokenPath);
            else recordUnresolvedTyped(summary, this.currentPath, 'Ref', tokenPath);

            return brokenRefPlaceholder(summary, this.currentPath, canonicalPath, match);
        }

        const isEmittable = emittableKeys.has(resolvedKey) || emittableKeys.has(normalizedTokenPath);
        if (!isEmittable) {
            console.warn(
                `⚠️  W3C reference ${match} at ${pathStr(this.currentPath)} points to a token that will not be emitted (${tokenPath})`
            );
            recordUnresolvedTyped(summary, this.currentPath, 'Ref (not emitted)', tokenPath);
            return brokenRefPlaceholder(summary, this.currentPath, canonicalPath, match);
        }

        // Per-value loop guard: avoids repeated cycle checks for the same reference key.
        const seenKey = normalizePathKey(resolvedKey);
        if (!this.seenInValue.has(seenKey)) {
            if (this.visitedRefs.has(seenKey) || this.visitedRefs.has(resolvedKey)) {
                console.warn(`⚠️  Circular W3C reference: ${tokenPath} at ${pathStr(this.currentPath)}`);
                summary.circularDeps++;
                return `/* circular-ref: ${tokenPath} */`;
            }

            const cachedHasCycle = cycleStatus.get(resolvedKey);
            if (cachedHasCycle === true) {
                console.warn(`⚠️  Deep circular dependency detected starting from: ${tokenPath} at ${pathStr(this.currentPath)}`);
                summary.circularDeps++;
                return `/* circular-ref: ${tokenPath} */`;
            }

            this.seenInValue.add(seenKey);
        }

        const mappedVarName = refMap.get(resolvedKey) ?? refMap.get(normalizedTokenPath);
        if (mappedVarName) return `var(${mappedVarName})`;

        console.warn(`⚠️  Unresolved W3C reference ${match} at ${pathStr(this.currentPath)} (resolved key missing in refMap)`);
        recordUnresolvedTyped(summary, this.currentPath, 'Ref', tokenPath);

        return brokenRefPlaceholder(summary, this.currentPath, canonicalPath, match);
    }

    /**
     * Processes all W3C references in a string value.
     */
    resolveW3CReferencesInString(value: string): { replaced: string; hadRef: boolean } {
        let hadRef = false;
        W3C_REF_REGEX_REPLACE.lastIndex = 0;
        try {
            const replaced = value.replace(W3C_REF_REGEX_REPLACE, (match, tokenPath) => {
                hadRef = true;
                return this.resolveW3CReference(match, tokenPath, value);
            });
            return { replaced, hadRef };
        } finally {
            W3C_REF_REGEX_REPLACE.lastIndex = 0;
        }
    }

    /**
     * Resolves a VARIABLE_ALIAS object into var(--css-var) or a placeholder.
     */
    resolveVariableAlias(aliasObj: unknown, aliasCurrentPath?: string[]): string {
        if (!isVariableAlias(aliasObj)) return JSON.stringify(aliasObj);

        const {
            summary,
            tokensData,
            refMap,
            idToVarName,
            idToTokenKey,
            cycleStatus,
            emittableKeys,
            cssVarNameCollisionMap,
            tokenGraph
        } = this.ctx;

        const pathForWarnings = aliasCurrentPath ?? this.currentPath;
        const aliasId = aliasObj.id?.trim();
        const targetKey = aliasId ? idToTokenKey.get(aliasId) : undefined;
        const targetNodeId = aliasId
            ? tokenGraph?.idToNodeId.get(aliasId) ??
            (targetKey && tokenGraph ? getNodeIdByTokenPath(tokenGraph, targetKey) : undefined)
            : undefined;

        if (!aliasId) {
            console.warn(`⚠️  VARIABLE_ALIAS without a valid id at ${pathStr(pathForWarnings)}; emitting unresolved placeholder`);
            const placeholderName = toSafePlaceholderName(pathStr(pathForWarnings)) || 'alias';
            recordUnresolvedTyped(summary, pathForWarnings, 'Alias ID', 'missing');
            return `var(--unresolved-alias-${placeholderName})`;
        }

        if (aliasId && (targetNodeId || targetKey) && (this.visitedRefs.has(targetNodeId || '') || this.visitedRefs.has(targetKey || ''))) {
            console.warn(`⚠️  Circular VARIABLE_ALIAS reference (id=${aliasId}) at ${pathStr(pathForWarnings)}`);
            summary.circularDeps++;
            return `/* circular-alias: ${aliasId} */`;
        }

        const cycleLookupKey = targetNodeId ?? targetKey;
        if (aliasId && cycleLookupKey) {
            const cachedHasCycle = cycleStatus.get(cycleLookupKey);
            if (cachedHasCycle === true) {
                console.warn(`⚠️  Deep circular dependency reachable via VARIABLE_ALIAS (id=${aliasId}) at ${pathStr(pathForWarnings)}`);
                summary.circularDeps++;
                return `/* circular-alias: ${aliasId} */`;
            }
        }

        if (aliasId && cycleLookupKey && !emittableKeys.has(cycleLookupKey)) {
            console.warn(
                `⚠️  VARIABLE_ALIAS at ${pathStr(pathForWarnings)} points to a token not emitted in this scope (id=${aliasId}).`
            );
            const placeholderName = toSafePlaceholderName(aliasId);
            recordUnresolvedTyped(summary, pathForWarnings, 'Alias ID (not emitted)', aliasId);
            return `var(--unresolved-${placeholderName})`;
        }

        const warnIfCollidingVarName = (varNameWithDashes: string) => {
            const collision = cssVarNameCollisionMap?.get(varNameWithDashes);
            if (!collision || !aliasId) return;

            const warnKey = `${aliasId}|${varNameWithDashes}`;
            if (warnedAliasVarCollisions.has(warnKey)) return;
            warnedAliasVarCollisions.add(warnKey);

            const fmt = (o: { tokenPath: string; id?: string }) => `${o.tokenPath}${o.id ? ` ($id=${o.id})` : ''}`;
            const sample = Array.from(collision.others.values())[0];
            const total = 1 + collision.others.size;

            console.warn(
                `⚠️  VARIABLE_ALIAS at ${pathStr(pathForWarnings)} (id=${aliasId}) resolved to ${varNameWithDashes}, ` +
                `but this CSS var name collides across ${total} distinct tokens. ` +
                `Last emitted wins; this alias may read an unexpected value. ` +
                `Examples: ${fmt(collision.first)}${sample ? ` | ${fmt(sample)}` : ''}`
            );
        };

        const deriveVarNameFromTokenPath = (tokenPath: string[]): string => {
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

            if (tokenGraph && targetNodeId) {
                const targetNode = tokenGraph.nodes.get(targetNodeId);
                const mappedFromGraph =
                    targetNode?.metadata.cssVar ??
                    refMap.get(targetNodeId) ??
                    refMap.get(normalizePathKey(targetNodeId)) ??
                    (targetKey ? refMap.get(targetKey) : undefined) ??
                    (targetKey ? refMap.get(normalizePathKey(targetKey)) : undefined);

                if (mappedFromGraph) {
                    warnIfCollidingVarName(mappedFromGraph);
                    return `var(${mappedFromGraph})`;
                }
            }

            if (!tokenGraph && ALLOW_ALIAS_SCAN) {
                // Optional fallback: cached O(N) scan.
                const tokenPath = this.findTokenByIdCached(tokensData, aliasId);
                if (tokenPath) {
                    const fullKey = buildPathKey(tokenPath);
                    const fullKeyNorm = normalizePathKey(fullKey);
                    const relativeKey = buildPathKey(tokenPath, 1);
                    const relativeKeyNorm = normalizePathKey(relativeKey);
                    const candidateKeys = [fullKey, fullKeyNorm, relativeKey, relativeKeyNorm].filter(k => !!k) as string[];
                    const targetIsEmittableInScope = candidateKeys.some(k => emittableKeys.has(k));

                    if (!targetIsEmittableInScope) {
                        console.warn(
                            `⚠️  VARIABLE_ALIAS at ${pathStr(pathForWarnings)} resolved id="${aliasId}" to a token not emitted in this scope.`
                        );
                        const placeholderName = toSafePlaceholderName(aliasId);
                        recordUnresolvedTyped(summary, pathForWarnings, 'Alias ID (not emitted)', aliasId);
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
                            `⚠️  VARIABLE_ALIAS fallback resolved to invalid var name "${derived}" at ${pathStr(pathForWarnings)}; using placeholder.`
                        );
                        const placeholderName = toSafePlaceholderName(aliasId);
                        recordUnresolvedTyped(summary, pathForWarnings, 'Alias ID', aliasId);
                        return `var(--unresolved-${placeholderName})`;
                    }

                    warnIfCollidingVarName(derived);
                    return `var(${derived})`;
                }
            } else if (!tokenGraph) {
                console.warn(
                    `ℹ️  VARIABLE_ALIAS scan fallback is disabled (ALLOW_ALIAS_SCAN=false); ` +
                    `skipping tree scan for id="${aliasId}" at ${pathStr(pathForWarnings)}.`
                );
            }

            console.warn(`ℹ️  VARIABLE_ALIAS reference at ${pathStr(pathForWarnings)} with ID: ${aliasId}`);
            console.warn(
                `   Could not resolve automatically. This is normal if the ID refers to a Figma variable not exported in the JSON.`
            );
            console.warn(`   A placeholder will be generated. To resolve this, convert the reference to W3C format: {token.path}`);

            const placeholderName = toSafePlaceholderName(aliasId);
            recordUnresolvedTyped(summary, pathForWarnings, 'Alias ID', aliasId);
            return `var(--unresolved-${placeholderName})`;
        }

        return `var(--${this.currentPath.map(toKebabCase).join('-')})`;
    }

    /**
     * Cached wrapper for `findTokenById()`; caches misses as well.
     */
    private findTokenByIdCached(tokensData: Record<string, any>, targetId: string): string[] | null {
        const key = typeof targetId === 'string' ? targetId.trim() : '';
        if (!key) return null;

        const scopedKey = `${getTokenDataIdentity(tokensData)}::${key}`;
        if (findTokenByIdCache.has(scopedKey)) return findTokenByIdCache.get(scopedKey)!;

        const found = findTokenById(tokensData, key);
        findTokenByIdCache.set(scopedKey, found);
        return found;
    }

    /**
     * Checks if a value contains any references (W3C or VARIABLE_ALIAS).
     */
    static containsReference(value: unknown): boolean {
        return containsReference(value);
    }

    /**
     * Records an unresolved reference reason for the current path.
     */
    recordUnresolved(reason: string): void {
        this.ctx.summary.unresolvedRefs.push(`${pathStr(this.currentPath)}${reason}`);
    }
}
