/**
 * Token Graph Route Handler Service
 *
 * Handles token graph and token usage index API routes.
 * Migrated from apps/ds-dashboard/server/services/token-graph-route-handler-service.mjs
 */

import type { Context } from 'hono';

import {
    artifactReadFailureToApiError,
    readJsonArtifact,
} from './registry-artifacts-service.mjs';
import {
    buildTokenGraphQueryPayload,
    normalizeTokenGraphDepth,
    normalizeTokenGraphDirection,
} from './token-graph-service.mjs';
import type { SystemContext } from '../lib/analysis-route-service.ts';

export interface TokenGraphRouteHandlerDeps {
    failJson: (c: Context, statusCode: number, args: Record<string, unknown>) => unknown;
    getSystemContext: (systemHeader: string) => unknown;
}

interface LegacyTokenUsageEntry {
    tokenPath: string;
    usageCount: number;
    usedIn: Array<{
        kind?: string;
        context?: string;
        file?: string;
        property?: string;
    }>;
}

interface LegacyTokenUsageIndex {
    usage?: LegacyTokenUsageEntry[];
    timestamp?: string;
    totalTokens?: number;
    unresolved?: Array<{
        context?: string;
        file?: string;
        ref?: string;
    }>;
}

interface TokenUsageOccurrenceNew {
    kind: string;
    source: string;
    owner: string;
    detail: string;
}

interface TokenUsageEntryNew {
    path: string;
    slashPath: string;
    cssVar: string;
    type: string;
    collection: string;
    usageCount: number;
    usageByKind: Record<string, number>;
    usedIn: TokenUsageOccurrenceNew[];
}

interface TokenUsageIndexSummaryNew {
    generatedAt: string;
    tokens_total: number;
    tokens_with_usage: number;
    tokens_without_usage: number;
    usage_links_total: number;
    usage_links_by_kind: Record<string, number>;
    unresolved_total: number;
}

interface TokenUsageIndexNew {
    ok?: boolean;
    summary: TokenUsageIndexSummaryNew;
    warnings: Array<{ message: string; tokenPath?: string }>;
    unresolved: Array<{
        kind: string;
        source: string;
        owner: string;
        keyPath: string;
        tokenPath: string;
        reason: string;
        suggested: string | null;
    }>;
    entries: TokenUsageEntryNew[];
    byPath: Record<string, TokenUsageEntryNew>;
    bySlashPath: Record<string, TokenUsageEntryNew>;
    byCssVar: Record<string, TokenUsageEntryNew>;
}

interface LoadArtifactResult<T = unknown> {
    ok: boolean;
    value?: T;
    response?: unknown;
    error?: {
        kind: string;
        artifactName: string;
        filePath: string;
    };
}

async function loadArtifactOrFail(
    c: Context,
    args: {
        filePath: string;
        artifactName: string;
        allowMissing?: boolean;
        missingValue?: null;
        readFile?: typeof import('node:fs/promises').readFile;
    },
    failJson: (c: Context, statusCode: number, args: Record<string, unknown>) => unknown,
): Promise<LoadArtifactResult> {
    const loaded = await readJsonArtifact(args);
    if (loaded.ok) return loaded as LoadArtifactResult;
    const failure = artifactReadFailureToApiError(loaded.error);
    return {
        ok: false,
        response: failJson(c, failure.statusCode, failure.args),
    };
}

// TODO(cleanup): remove when all systems have regenerated token-usage-index.json in new format
export function normalizeLegacyUsageIndex(raw: unknown): TokenUsageIndexNew {
    // Check if it's already new format
    if (raw && typeof raw === 'object') {
        const obj = raw as Record<string, unknown>;
        if (typeof obj.byPath === 'object') {
            // Normalize summary field names from camelCase to snake_case for consistency
            const newObj = raw as TokenUsageIndexNew;
            if (newObj.summary && typeof newObj.summary === 'object') {
                const summary = newObj.summary as unknown as Record<string, unknown>;
                const normalizedSummary: Record<string, unknown> = {};

                // Bidirectional fallback: prefer snake_case if exists, otherwise use camelCase
                normalizedSummary.tokens_total = (summary.tokens_total as number) ?? (summary.totalTokens as number) ?? 0;
                normalizedSummary.tokens_with_usage = (summary.tokens_with_usage as number) ?? (summary.tokensWithUsage as number) ?? 0;
                normalizedSummary.usage_links_total = (summary.usage_links_total as number) ?? 0;
                normalizedSummary.generatedAt = (summary.generatedAt as string) ?? '';

                // Calculate tokens_without_usage from actual values
                const totalTokens = normalizedSummary.tokens_total as number;
                const tokensWithUsage = normalizedSummary.tokens_with_usage as number;
                normalizedSummary.tokens_without_usage = (summary.tokens_without_usage as number) ?? (totalTokens - tokensWithUsage);

                // Preserve existing aggregations if present
                normalizedSummary.usage_links_by_kind = (summary.usage_links_by_kind as Record<string, number>) ?? {};
                normalizedSummary.unresolved_total = (summary.unresolved_total as number) ?? 0;

                return {
                    ...newObj,
                    summary: normalizedSummary as unknown as TokenUsageIndexSummaryNew,
                };
            }
            return raw as TokenUsageIndexNew;
        }
        // Check if it's legacy format (has 'usage' array)
        if (Array.isArray(obj.usage)) {
            const input = raw as LegacyTokenUsageIndex;
            const usage = input.usage;
            if (!usage) {
                return raw as TokenUsageIndexNew;
            }
            const entries: TokenUsageEntryNew[] = usage.map((u: LegacyTokenUsageEntry) => {
                const usedIn: TokenUsageOccurrenceNew[] = u.usedIn.map((x: LegacyTokenUsageEntry['usedIn'][number]) => {
                    // Map legacy context to new source enum values
                    const sourceMap = {
                        spec: 'component-spec',
                        css: 'css-alias',
                        other: 'unknown'
                    };
                    const context = x.context || 'other';
                    const kind = x.kind || context;

                    return {
                        kind,
                        source: sourceMap[context as keyof typeof sourceMap] || 'unknown',
                        owner: x.file || 'unknown',
                        detail: x.property || 'unknown',
                    };
                });

                const kinds = [...new Set(usedIn.map((x) => x.kind))];
                const usageByKind: Record<string, number> = Object.fromEntries(
                    kinds.map((k) => [k, usedIn.filter((x) => x.kind === k).length]),
                );

                return {
                    path: u.tokenPath,
                    slashPath: u.tokenPath.replace(/\./g, '/'),
                    cssVar: '--' + u.tokenPath.replace(/\./g, '-'),
                    type: '',
                    collection: '',
                    usageCount: u.usageCount,
                    usageByKind,
                    usedIn,
                };
            });
            const usageLinksByKind = entries.reduce<Record<string, number>>((acc, entry) => {
                for (const [kind, count] of Object.entries(entry.usageByKind)) {
                    acc[kind] = (acc[kind] || 0) + count;
                }
                return acc;
            }, {});

            return {
                ok: true,
                summary: {
                    generatedAt: input.timestamp || '',
                    tokens_total: input.totalTokens || 0,
                    tokens_with_usage: entries.length,
                    tokens_without_usage: (input.totalTokens || 0) - entries.length,
                    usage_links_total: entries.reduce((s, e) => s + e.usageCount, 0),
                    usage_links_by_kind: usageLinksByKind,
                    unresolved_total: input.unresolved?.length || 0,
                },
                warnings: [],
                unresolved: (input.unresolved || []).map((u) => {
                    const uref = u as { context?: string; file?: string; ref?: string };
                    const context = uref.context || 'other';

                    // Map legacy context to new source enum values
                    const sourceMap = {
                        spec: 'component-spec',
                        css: 'css-alias',
                        other: 'unknown'
                    };

                    return {
                        kind: context,
                        source: sourceMap[context as keyof typeof sourceMap] || 'unknown',
                        owner: uref.file || 'unknown',
                        keyPath: uref.ref || '',
                        tokenPath: uref.ref || '',
                        reason: 'unresolved',
                        suggested: null,
                    };
                }),
                entries,
                byPath: Object.fromEntries(entries.map((e) => [e.path, e])),
                bySlashPath: Object.fromEntries(entries.map((e) => [e.slashPath, e])),
                byCssVar: Object.fromEntries(entries.map((e) => [e.cssVar, e])),
            };
        }
    }

    // Unknown format - return as-is
    return raw as TokenUsageIndexNew;
}

export async function handleTokenUsageIndexRoute(
    c: Context,
    deps: TokenGraphRouteHandlerDeps & { tokenRepo?: import('../db/token-repository.js').TokenRepository },
): Promise<unknown> {
    const { failJson, getSystemContext, tokenRepo } = deps;
    const sysCtx = getSystemContext(c.req.header('x-ds-system') ?? '') as SystemContext;

    // JSON-first: usage index is system-scoped; DB cache is global and can be stale across systems/imports.
    const loaded = await loadArtifactOrFail(
        c,
        {
            filePath: sysCtx.tokenUsageIndexPath,
            artifactName: 'token usage index',
            allowMissing: true,
            missingValue: null,
        },
        failJson,
    );
    if (loaded.ok && loaded.value) {
        const normalized = normalizeLegacyUsageIndex(loaded.value);
        return c.json(normalized);
    }

    // Fallback: best-effort DB read for compatibility when artifact is missing/unavailable.
    if (tokenRepo) {
        try {
            const dbResult = tokenRepo.getTokenUsageIndex();
            if (dbResult) {
                return c.json(dbResult);
            }
        } catch (error) {
            console.warn('[TokenUsageIndex] JSON-first fallback to DB failed:', error instanceof Error ? error.message : String(error));
        }
    }

    // Keep prior 404 behavior when no source is available.
    const strictLoaded = await loadArtifactOrFail(
        c,
        {
            filePath: sysCtx.tokenUsageIndexPath,
            artifactName: 'token usage index',
        },
        failJson,
    );
    if (!strictLoaded.ok) return strictLoaded.response;
    const normalized = normalizeLegacyUsageIndex(strictLoaded.value);
    return c.json(normalized);
}

export async function handleTokenGraphRoute(
    c: Context,
    deps: TokenGraphRouteHandlerDeps,
): Promise<unknown> {
    const { failJson, getSystemContext } = deps;
    const sysCtx = getSystemContext(c.req.header('x-ds-system') ?? '') as SystemContext;
    const loaded = await loadArtifactOrFail(
        c,
        {
            filePath: sysCtx.tokenGraphVizPath,
            artifactName: 'token graph',
        },
        failJson,
    );
    if (!loaded.ok) return loaded.response;
    return c.json(loaded.value);
}

export async function handleTokenGraphQueryRoute(
    c: Context,
    deps: TokenGraphRouteHandlerDeps,
): Promise<unknown> {
    const { failJson, getSystemContext } = deps;
    const sysCtx = getSystemContext(c.req.header('x-ds-system') ?? '') as SystemContext;
    const token = String(c.req.query('token') ?? c.req.query('tokenPath') ?? '').trim();
    if (!token) {
        return failJson(c, 400, {
            code: 'validation.token_required',
            userMessage: 'token query param is required.',
            recoverable: true,
            context: { field: 'token' },
        });
    }

    const direction = normalizeTokenGraphDirection(c.req.query('direction'));
    const depth = normalizeTokenGraphDepth(c.req.query('depth'));
    const loaded = await loadArtifactOrFail(
        c,
        {
            filePath: sysCtx.tokenGraphVizPath,
            artifactName: 'token graph',
        },
        failJson,
    );
    if (!loaded.ok) return loaded.response;
    const graph = loaded.value;
    const payload = buildTokenGraphQueryPayload({ graph, token, direction, depth });
    if (!payload) {
        return failJson(c, 404, {
            code: 'token_graph.token_not_found',
            userMessage: `Token '${token}' not found in token graph.`,
            recoverable: true,
            context: { token },
        });
    }
    return c.json(payload);
}
