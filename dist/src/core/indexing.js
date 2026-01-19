/**
 * Indexing phase: builds lookup structures for reference resolution.
 */
import { walkTokenTree } from './walk.js';
import { buildPathKey, normalizePathKey, pathStr } from '../utils/paths.js';
import { buildCssVarNameFromPrefix, isValidCssVariableName } from '../utils/strings.js';
import { MAX_COLLISION_DETAILS } from '../runtime/config.js';
import { warnedDuplicateTokenIds } from '../runtime/state.js';
/**
 * Indexes Figma `$id` properties for O(1) VARIABLE_ALIAS resolution.
 * - Stores the trimmed ID (canonical).
 * - Also stores the raw ID if it differs (compatibility with imperfect exports).
 * - Warns once if the same canonical ID maps to multiple tokens (latest mapping wins).
 */
export function indexTokenId(tokenObj, varName, normalizedTokenKey, idToVarName, idToTokenKey) {
    const idRaw = tokenObj?.$id;
    if (typeof idRaw !== 'string')
        return;
    const trimmed = idRaw.trim();
    if (!trimmed)
        return;
    const existingVar = idToVarName.get(trimmed);
    const existingKey = idToTokenKey.get(trimmed);
    const varDiffers = existingVar !== undefined && existingVar !== varName;
    const keyDiffers = existingKey !== undefined && normalizedTokenKey && existingKey !== normalizedTokenKey;
    if ((varDiffers || keyDiffers) && !warnedDuplicateTokenIds.has(trimmed)) {
        warnedDuplicateTokenIds.add(trimmed);
        console.warn(`⚠️  Duplicate $id detected: "${trimmed}" is assigned to multiple tokens. ` +
            `First: var=${existingVar ?? 'n/a'}, key=${existingKey ?? 'n/a'}; ` +
            `Next: var=${varName}, key=${normalizedTokenKey || 'n/a'}. ` +
            `VARIABLE_ALIAS resolution will use the latest mapping.`);
    }
    idToVarName.set(trimmed, varName);
    if (normalizedTokenKey)
        idToTokenKey.set(trimmed, normalizedTokenKey);
    if (idRaw !== trimmed) {
        idToVarName.set(idRaw, varName);
        if (normalizedTokenKey)
            idToTokenKey.set(idRaw, normalizedTokenKey);
    }
}
/**
 * Detects collisions where distinct tokens map to the same CSS variable name.
 * In CSS, the last emitted declaration wins, which can silently override earlier tokens.
 */
export function trackCssVarNameCollision(ctx, varName, owner) {
    const { summary, cssVarNameOwners, cssVarNameCollisionMap } = ctx;
    if (!cssVarNameOwners || !cssVarNameCollisionMap)
        return;
    if (!varName)
        return;
    const existing = cssVarNameOwners.get(varName);
    if (!existing) {
        cssVarNameOwners.set(varName, owner);
        return;
    }
    // Ignore if it's the same token identity (e.g. mode overrides resolving to the same leaf).
    if (existing.tokenKey === owner.tokenKey)
        return;
    let entry = cssVarNameCollisionMap.get(varName);
    if (!entry) {
        entry = { first: existing, others: new Map() };
        cssVarNameCollisionMap.set(varName, entry);
        summary.cssVarNameCollisions++;
        const fmt = (o) => `${o.tokenPath}${o.id ? ` ($id=${o.id})` : ''}`;
        const detail = `${varName}: ${fmt(existing)} <-> ${fmt(owner)}`;
        if (summary.cssVarNameCollisionDetails.length < MAX_COLLISION_DETAILS) {
            summary.cssVarNameCollisionDetails.push(detail);
        }
        console.warn(`⚠️  CSS var name collision for ${varName}: ${fmt(existing)} vs ${fmt(owner)}. ` +
            `In CSS, the last emitted definition wins.`);
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
export function collectTokenMaps(ctx, obj, prefix = [], currentPath = []) {
    const { summary, refMap, valueMap, collisionKeys, idToVarName, idToTokenKey } = ctx;
    const upsertKey = (key, varName, tokenObj, debugLabel, allowOverride) => {
        if (!key)
            return;
        if (!refMap.has(key)) {
            refMap.set(key, varName);
            valueMap.set(key, tokenObj);
            return;
        }
        const existing = refMap.get(key);
        if (existing !== varName) {
            console.warn(`ℹ️  Normalized collision${debugLabel ? ` (${debugLabel})` : ''}: key "${key}" maps to multiple vars.`);
            collisionKeys.add(key);
            return;
        }
        if (allowOverride)
            valueMap.set(key, tokenObj);
        else
            console.warn(`ℹ️  Duplicate token for normalized key ${key}${debugLabel ? ` (${debugLabel})` : ''}`);
    };
    // Indexing does not require sorted traversal order.
    walkTokenTree(summary, obj, prefix, currentPath, {
        onTokenValue: ({ obj: tokenObj, prefix: tokenPrefix, currentPath: tokenPath, inModeBranch, inheritedType }) => {
            const rawValue = tokenObj.$value;
            if (rawValue == null)
                return;
            const tokenPathKey = buildPathKey(tokenPath);
            const normalizedKey = normalizePathKey(tokenPathKey);
            const varName = buildCssVarNameFromPrefix(tokenPrefix);
            // If it won't be emitted, do not index it (prevents unresolved "phantom" refs).
            if (!isValidCssVariableName(varName)) {
                summary.invalidNames.push(`${pathStr(tokenPath)} (Invalid CSS Var: ${varName})`);
                return;
            }
            indexTokenId(tokenObj, varName, normalizedKey, idToVarName, idToTokenKey);
            trackCssVarNameCollision(ctx, varName, {
                tokenKey: normalizedKey,
                tokenPath: pathStr(tokenPath),
                id: typeof tokenObj?.$id === 'string' ? tokenObj.$id : undefined
            });
            // Persist effective type (including inherited type) for consistent downstream behavior.
            const rawType = tokenObj.$type;
            const effectiveType = rawType ?? inheritedType;
            const storedTokenObj = rawType == null && effectiveType
                ? { ...tokenObj, $type: effectiveType }
                : tokenObj;
            upsertKey(normalizedKey, varName, storedTokenObj, tokenPathKey, inModeBranch);
            const relativePathKey = buildPathKey(tokenPath, 1);
            const relativeNormalizedKey = normalizePathKey(relativePathKey);
            if (relativeNormalizedKey && relativeNormalizedKey !== normalizedKey) {
                upsertKey(relativeNormalizedKey, varName, storedTokenObj, `relative:${relativePathKey}`, inModeBranch);
            }
        },
        onLegacyPrimitive: ({ value, key, normalizedKey, currentPath: parentPath, prefix: parentPrefix, inModeBranch, inheritedType }) => {
            const leafPath = [...parentPath, key];
            const leafPrefix = [...parentPrefix, normalizedKey];
            const varName = buildCssVarNameFromPrefix(leafPrefix);
            if (!isValidCssVariableName(varName)) {
                summary.invalidNames.push(`${pathStr(leafPath)} (Invalid CSS Var: ${varName})`);
                return;
            }
            const tokenPathKey = buildPathKey(leafPath);
            const normalizedPathKey = normalizePathKey(tokenPathKey);
            const legacyTokenObj = inheritedType ? { $value: value, $type: inheritedType } : { $value: value };
            trackCssVarNameCollision(ctx, varName, { tokenKey: normalizedPathKey, tokenPath: pathStr(leafPath) });
            upsertKey(normalizedPathKey, varName, legacyTokenObj, tokenPathKey, inModeBranch);
            const relativePathKey = buildPathKey(leafPath, 1);
            const relativeNormalizedKey = normalizePathKey(relativePathKey);
            if (relativeNormalizedKey && relativeNormalizedKey !== normalizedPathKey) {
                upsertKey(relativeNormalizedKey, varName, legacyTokenObj, `relative:${relativePathKey}`, inModeBranch);
            }
        }
    }, 0, false, false);
}
