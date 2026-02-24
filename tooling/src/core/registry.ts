/**
 * Token registry export for documentation pipeline validation.
 */

import fs from 'fs';
import path from 'path';

import type { EmissionContext, TokenValue } from '../types/tokens.js';
import { isVariableAlias } from '../types/tokens.js';
import { createSummary } from '../runtime/context.js';
import { walkTokenTree } from './walk.js';
import { processValue } from './emit.js';
import { buildPathKey, buildVisitedRefSet, normalizePathKey } from '../utils/paths.js';
import { buildCssVarNameFromPrefix, toKebabCase } from '../utils/strings.js';
import { getNodeIdByTokenPath } from './token-graph.js';

export interface TokenRegistryEntry {
    path: string;
    slashPath: string;
    cssVar: string;
    type: string;
    resolvedValue: string;
    aliasOf?: string;
    collection: string;
}

function inferValueType(value: unknown): string {
    if (isVariableAlias(value)) return 'alias';
    if (Array.isArray(value)) return 'array';
    if (value == null) return 'unknown';
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return typeof value;
    }
    if (typeof value === 'object') return 'object';
    return 'unknown';
}

function normalizeCollection(segment: string): string {
    const cleaned = String(segment || '').replace(/^_+/, '');
    return cleaned || String(segment || 'Unknown');
}

function buildRegistryPathSegments(pathKey: string): string[] {
    const segments = pathKey.split('.').filter(Boolean);
    if (segments.length === 0) return [];

    const [collection, ...rest] = segments;
    return [normalizeCollection(collection), ...rest];
}

function resolveCssVarName(
    ctx: Readonly<EmissionContext>,
    fullPathKey: string,
    relativePathKey: string,
    fallbackPrefix: string[]
): string {
    const fullNorm = normalizePathKey(fullPathKey);
    const relativeNorm = normalizePathKey(relativePathKey);

    return (
        ctx.refMap.get(fullNorm) ??
        ctx.refMap.get(relativeNorm) ??
        buildCssVarNameFromPrefix(fallbackPrefix.map(toKebabCase))
    );
}

function resolveAliasTarget(ctx: Readonly<EmissionContext>, rawValue: TokenValue['$value']): string | undefined {
    if (!isVariableAlias(rawValue)) return undefined;
    const aliasId = rawValue.id?.trim();
    if (!aliasId) return undefined;
    const byNodeId = ctx.tokenGraph?.idToNodeId.get(aliasId);
    if (byNodeId) return byNodeId;

    const byPath = ctx.idToTokenKey.get(aliasId);
    if (!byPath) return aliasId;

    return ctx.tokenGraph ? (getNodeIdByTokenPath(ctx.tokenGraph, byPath) ?? byPath) : byPath;
}

function buildResolvedValue(
    localCtx: EmissionContext,
    rawValue: TokenValue['$value'],
    effectiveType: string | undefined,
    tokenPath: string[]
): string {
    const visited = buildVisitedRefSet(tokenPath);
    const processed = processValue(localCtx, rawValue, effectiveType, tokenPath, visited);
    if (processed !== null) return processed;
    if (rawValue == null) return '';
    return String(rawValue);
}

function upsertRegistryEntry(
    registry: Map<string, TokenRegistryEntry>,
    entry: TokenRegistryEntry
): void {
    const key = normalizePathKey(entry.path);
    if (registry.has(key)) return;
    registry.set(key, entry);
}

export interface TokenRegistryIndex {
    entries: TokenRegistryEntry[];
    byPath: Record<string, TokenRegistryEntry>;
    bySlashPath: Record<string, TokenRegistryEntry>;
}

export function exportTokenRegistry(ctx: Readonly<EmissionContext>): TokenRegistryIndex {
    const localSummary = createSummary();
    const localCtx: EmissionContext = {
        ...ctx,
        summary: localSummary
    };

    const registry = new Map<string, TokenRegistryEntry>();

    walkTokenTree(
        localSummary,
        ctx.tokensData,
        [],
        [],
        {
            onTokenValue: ({ obj, prefix, currentPath, inheritedType }) => {
                const tokenObj = obj as TokenValue;
                const rawValue = tokenObj.$value;
                if (rawValue == null) return;

                const fullPathKey = buildPathKey(currentPath);
                if (!fullPathKey) return;

                const relativePathKey = buildPathKey(currentPath, 1);
                const pathSegments = buildRegistryPathSegments(fullPathKey);
                if (pathSegments.length === 0) return;

                const collection = pathSegments[0];
                const dotPath = pathSegments.join('.');
                const slashPath = (pathSegments.length > 1 ? pathSegments.slice(1) : pathSegments).join('/');

                const effectiveType = tokenObj.$type ?? inheritedType ?? inferValueType(rawValue);
                const cssVar = resolveCssVarName(ctx, fullPathKey, relativePathKey, prefix);
                const resolvedValue = buildResolvedValue(localCtx, rawValue, effectiveType, currentPath);
                const aliasOf = resolveAliasTarget(ctx, rawValue);

                upsertRegistryEntry(registry, {
                    path: dotPath,
                    slashPath,
                    cssVar,
                    type: String(effectiveType || 'unknown'),
                    resolvedValue,
                    aliasOf,
                    collection
                });
            },
            onLegacyPrimitive: ({ value, key, normalizedKey, currentPath, prefix, inheritedType }) => {
                const leafPath = [...currentPath, key];
                const fullPathKey = buildPathKey(leafPath);
                if (!fullPathKey) return;

                const relativePathKey = buildPathKey(leafPath, 1);
                const pathSegments = buildRegistryPathSegments(fullPathKey);
                if (pathSegments.length === 0) return;

                const collection = pathSegments[0];
                const dotPath = pathSegments.join('.');
                const slashPath = (pathSegments.length > 1 ? pathSegments.slice(1) : pathSegments).join('/');

                const cssVar = resolveCssVarName(ctx, fullPathKey, relativePathKey, [...prefix, normalizedKey]);
                const resolvedValue = buildResolvedValue(localCtx, value, inheritedType, leafPath);
                const type = inheritedType ?? inferValueType(value);

                upsertRegistryEntry(registry, {
                    path: dotPath,
                    slashPath,
                    cssVar,
                    type,
                    resolvedValue,
                    collection
                });
            }
        },
        0,
        false,
        true,
        undefined,
        undefined,
        false,
        false,
        false,
        true
    );

    const entries = Array.from(registry.values()).sort((a, b) =>
        a.path.localeCompare(b.path, 'en', { sensitivity: 'base' })
    );

    const byPath: Record<string, TokenRegistryEntry> = Object.create(null);
    const bySlashPath: Record<string, TokenRegistryEntry> = Object.create(null);
    for (const entry of entries) {
        if (entry.path) byPath[entry.path] = entry;
        if (entry.slashPath) bySlashPath[entry.slashPath] = entry;
    }

    return { entries, byPath, bySlashPath };
}

export function writeTokenRegistry(filePath: string, index: TokenRegistryIndex): void {
    const outputDir = path.dirname(filePath);
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    fs.writeFileSync(filePath, `${JSON.stringify(index, null, 2)}\n`, 'utf-8');
}
