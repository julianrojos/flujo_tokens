/**
 * Indexing phase: builds lookup structures for reference resolution.
 */

import type { IndexingContext, TokenValue, BaseContext, CssVarOwner, WalkHandlers } from '../types/tokens.js';
import type { WalkState, WalkOptions } from './walk.js';
import {
    walkTokenTreeInternal,
    createWalkContext,
} from './walk.js';
import { buildPathKey, normalizePathKey, pathStr } from '../utils/paths.js';
import { buildCssVarNameFromPrefix, isValidCssVariableName } from '../utils/strings.js';
import { warnedDuplicateTokenIds } from '../runtime/state.js';
import { MAX_COLLISION_DETAILS } from '../runtime/config.js';

function recordInvalidCssVarName(summary: BaseContext['summary'], tokenPath: string[], varName: string): void {
    const detail = `${pathStr(tokenPath)} (Invalid CSS Var: ${varName})`;
    if (!summary.invalidNames.includes(detail)) {
        summary.invalidNames.push(detail);
    }
}

/**
 * Indexes Figma `$id` properties for O(1) VARIABLE_ALIAS resolution.
 * - Stores the trimmed ID (canonical).
 * - Also stores the raw ID if it differs (compatibility with imperfect exports).
 * - Warns once if the same canonical ID maps to multiple tokens (latest mapping wins).
 */
export function indexTokenId(
    tokenObj: any,
    varName: string,
    normalizedTokenKey: string,
    idToVarName: Map<string, string>,
    idToTokenKey: Map<string, string>
): void {
    const idRaw = tokenObj?.$id;
    if (typeof idRaw !== 'string') return;

    const trimmed = idRaw.trim();
    if (!trimmed) return;

    const existingVar = idToVarName.get(trimmed);
    const existingKey = idToTokenKey.get(trimmed);
    const varDiffers = existingVar !== undefined && existingVar !== varName;
    const keyDiffers = existingKey !== undefined && normalizedTokenKey && existingKey !== normalizedTokenKey;

    if ((varDiffers || keyDiffers) && !warnedDuplicateTokenIds.has(trimmed)) {
        warnedDuplicateTokenIds.add(trimmed);
        console.warn(
            `⚠️  Duplicate $id detected: "${trimmed}" is assigned to multiple tokens. ` +
            `First: var=${existingVar ?? 'n/a'}, key=${existingKey ?? 'n/a'}; ` +
            `Next: var=${varName}, key=${normalizedTokenKey || 'n/a'}. ` +
            `VARIABLE_ALIAS resolution will use the latest mapping.`
        );
    }

    idToVarName.set(trimmed, varName);
    if (normalizedTokenKey) idToTokenKey.set(trimmed, normalizedTokenKey);

    if (idRaw !== trimmed) {
        idToVarName.set(idRaw, varName);
        if (normalizedTokenKey) idToTokenKey.set(idRaw, normalizedTokenKey);
    }
}

/**
 * Detects collisions where distinct tokens map to the same CSS variable name.
 * In CSS, the last emitted declaration wins, which can silently override earlier tokens.
 */
export function trackCssVarNameCollision(ctx: BaseContext, varName: string, owner: CssVarOwner): void {
    const { summary, cssVarNameOwners, cssVarNameCollisionMap } = ctx;
    if (!cssVarNameOwners || !cssVarNameCollisionMap) return;
    if (!varName) return;

    const existing = cssVarNameOwners.get(varName);
    if (!existing) {
        cssVarNameOwners.set(varName, owner);
        return;
    }

    // Ignore if it's the same token identity (e.g. mode overrides resolving to the same leaf).
    if (existing.tokenKey === owner.tokenKey) return;

    let entry = cssVarNameCollisionMap.get(varName);
    if (!entry) {
        entry = { first: existing, others: new Map<string, CssVarOwner>() };
        cssVarNameCollisionMap.set(varName, entry);
        summary.cssVarNameCollisions++;
        if (summary.cssVarNameCollisionDetails.length < MAX_COLLISION_DETAILS) {
            summary.cssVarNameCollisionDetails.push(varName);
        }
        console.error('\n🚨 CSS VARIABLE NAME COLLISION DETECTED');
        console.error(`   Colliding name: ${varName}`);
        console.error('   Multiple tokens map to the same CSS variable; last declaration wins.\n');
    }

    entry.others.set(owner.tokenKey || owner.tokenPath, owner);
}

/**
 * Indexing phase: builds lookup structures used for reference/alias resolution and diagnostics.
 *
 * Indexing rules:
 * - Only tokens that will be emitted are indexed (prevents "ghost" references).
 * - Tokens are indexed by both full path and (when distinct) a relative path that omits the namespace root.
 * - Effective `$type` (including inherited `$type`) is persisted for later phases.
 */
export function collectTokenMaps(
    ctx: IndexingContext,
    obj: any,
    prefix: string[] = [],
    currentPath: string[] = [],
    preferredMode?: string,
    modeStrict = false,
    skipBaseWhenMode = false,
    modeOverridesOnly = false,
    allowModeBranches = true
): void {
    const { summary, refMap, valueMap, collisionKeys, idToVarName, idToTokenKey } = ctx;

    const upsertKey = (key: string, varName: string, tokenObj: TokenValue, allowOverride: boolean) => {
        if (!key) return;

        if (!refMap.has(key)) {
            refMap.set(key, varName);
            valueMap.set(key, tokenObj);
            return;
        }

        const existing = refMap.get(key);
        if (existing !== varName) {
            collisionKeys.add(key);
            return;
        }

        if (allowOverride) valueMap.set(key, tokenObj);
    };

    // Indexing does not require sorted traversal order.
    const state: WalkState = {
        summary,
        prefix,
        currentPath,
        depth: 0,
        inModeBranch: false,
        inheritedType: undefined,
    };

    const options: WalkOptions = {
        sortKeys: false,
        preferredMode,
        modeStrict,
        skipBaseWhenMode,
        modeOverridesOnly,
        allowModeBranches,
    };

    const handlers: WalkHandlers = {
        onTokenValue: ({ obj: tokenObj, prefix: tokenPrefix, currentPath: tokenPath, inModeBranch, inheritedType }) => {
            const rawValue = tokenObj.$value;
            if (rawValue == null) return;

            const tokenPathKey = buildPathKey(tokenPath);
            const normalizedKey = normalizePathKey(tokenPathKey);

            const varName = buildCssVarNameFromPrefix(tokenPrefix);

            // If it won't be emitted, do not index it (prevents unresolved "phantom" refs).
            if (!isValidCssVariableName(varName)) {
                recordInvalidCssVarName(summary, tokenPath, varName);
                return;
            }

            indexTokenId(tokenObj, varName, normalizedKey, idToVarName, idToTokenKey);

            trackCssVarNameCollision(ctx, varName, {
                tokenKey: normalizedKey,
                tokenPath: pathStr(tokenPath),
                id: typeof tokenObj.$id === 'string' ? tokenObj.$id : undefined
            });

            // Persist effective type (including inherited type) for consistent downstream behavior.
            const rawType = tokenObj.$type;
            const effectiveType = rawType ?? inheritedType;
            const storedTokenObj: TokenValue =
                rawType == null && effectiveType
                    ? { ...tokenObj, $type: effectiveType }
                    : tokenObj;

            upsertKey(normalizedKey, varName, storedTokenObj, inModeBranch);

            const relativePathKey = buildPathKey(tokenPath, 1);
            const relativeNormalizedKey = normalizePathKey(relativePathKey);
            if (relativeNormalizedKey && relativeNormalizedKey !== normalizedKey) {
                upsertKey(relativeNormalizedKey, varName, storedTokenObj, inModeBranch);
            }
        },

        onLegacyPrimitive: ({
            value,
            key,
            normalizedKey,
            currentPath: parentPath,
            prefix: parentPrefix,
            inModeBranch,
            inheritedType
        }) => {
            const leafPath = [...parentPath, key];
            const leafPrefix = [...parentPrefix, normalizedKey];
            const varName = buildCssVarNameFromPrefix(leafPrefix);

            if (!isValidCssVariableName(varName)) {
                recordInvalidCssVarName(summary, leafPath, varName);
                return;
            }

            const tokenPathKey = buildPathKey(leafPath);
            const normalizedPathKey = normalizePathKey(tokenPathKey);

            const legacyTokenObj: TokenValue = inheritedType ? { $value: value, $type: inheritedType } : { $value: value };

            trackCssVarNameCollision(ctx, varName, { tokenKey: normalizedPathKey, tokenPath: pathStr(leafPath) });

            upsertKey(normalizedPathKey, varName, legacyTokenObj, inModeBranch);

            const relativePathKey = buildPathKey(leafPath, 1);
            const relativeNormalizedKey = normalizePathKey(relativePathKey);
            if (relativeNormalizedKey && relativeNormalizedKey !== normalizedPathKey) {
                upsertKey(relativeNormalizedKey, varName, legacyTokenObj, inModeBranch);
            }
        }
    };

    const walkCtx = createWalkContext(handlers, options);
    walkTokenTreeInternal(obj, state, walkCtx);
}
