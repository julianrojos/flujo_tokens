/**
 * Figma MCP Variables V2 Route
 *
 * Handles enhanced variable operations using direct plugin WebSocket bridge.
 * Direct-only mode: no legacy MCP stdio fallback.
 *
 * Methods:
 * - POST /api/figma-mcp/search-variables-direct - Search variables with enhanced filters
 * - POST /api/figma-mcp/batch-create-variables - Batch create variables
 * - POST /api/figma-mcp/batch-update-variables - Batch update variables
 * - GET  /api/figma-mcp/export-tokens - Export tokens in various formats
 * - POST /api/figma-mcp/sync-tokens/plan - Plan token sync
 * - POST /api/figma-mcp/sync-tokens/apply - Apply token sync
 * - GET  /api/figma-mcp/token-usage - Get token usage (env gated)
 */

import type { Context } from 'hono';
import type { ConnInfo } from '@hono/node-server/conninfo';
import { getConnInfo as getConnInfoImport } from '@hono/node-server/conninfo';
import { isLoopbackAddress } from '../lib/loopback-utils.ts';
import {
    searchVariablesDirect,
    batchCreateVariablesDirect,
    batchUpdateVariablesDirect,
    exportTokensDirect,
    syncTokensPlanDirect,
    syncTokensApplyDirect,
    getTokenUsageDirect,
    type SearchVariablesParams,
    type BatchCreateVariablesParams,
    type BatchUpdateVariablesParams,
    type ExportTokensParams,
    type SyncTokensPlanParams,
    type SyncTokensApplyParams,
    type GetTokenUsageParams,
} from '../services/figma-direct-bridge-service.ts';
import { getPluginConnectionManager } from '../services/plugin-connection-manager.ts';
import { resolveFileKey, isFileKeySuccess } from '../lib/filekey-utils.ts';

export interface FigmaMcpVariablesV2RouteDeps {
    readJsonBody?: (c: Context) => Promise<Record<string, unknown>>;
    getConnInfoFn?: (c: Context) => ConnInfo;
    internalToken?: string;
    searchVariablesDirect?: typeof import('../services/figma-direct-bridge-service').searchVariablesDirect;
    batchCreateVariablesDirect?: typeof import('../services/figma-direct-bridge-service').batchCreateVariablesDirect;
    batchUpdateVariablesDirect?: typeof import('../services/figma-direct-bridge-service').batchUpdateVariablesDirect;
    exportTokensDirect?: typeof import('../services/figma-direct-bridge-service').exportTokensDirect;
    syncTokensPlanDirect?: typeof import('../services/figma-direct-bridge-service').syncTokensPlanDirect;
    syncTokensApplyDirect?: typeof import('../services/figma-direct-bridge-service').syncTokensApplyDirect;
    getTokenUsageDirect?: typeof import('../services/figma-direct-bridge-service').getTokenUsageDirect;
}

/**
 * Check if request is authorized (loopback or internal token)
 */
function isAuthorized(c: Context, deps: FigmaMcpVariablesV2RouteDeps): boolean {
    const getConnInfoFn = deps.getConnInfoFn ?? getConnInfoImport;
    const internalToken = deps.internalToken ?? process.env.DS_DASHBOARD_INTERNAL_TOKEN;

    const connInfo = getConnInfoFn(c);
    const remoteAddress = String(connInfo?.remote?.address || '').trim();
    const trustedInternal = internalToken
        ? String(c.req.header('x-ds-dashboard-internal-token') || '').trim() === internalToken
        : false;
    const isLoopback = remoteAddress ? isLoopbackAddress(remoteAddress) : false;

    return isLoopback || trustedInternal;
}

/**
 * POST /api/figma-mcp/search-variables-direct
 */
export async function handleSearchVariablesDirect(
    c: Context,
    deps: FigmaMcpVariablesV2RouteDeps
): Promise<Response> {
    const readJsonBody = deps.readJsonBody ?? (async (ctx: Context) => await ctx.req.json());

    if (!isAuthorized(c, deps)) {
        return c.json(
            { ok: false, code: 'variables_v2.forbidden_remote', message: 'Endpoint only accessible from loopback or with internal token.' },
            403
        );
    }

    let body: Record<string, unknown> = {};
    try {
        body = await readJsonBody(c);
    } catch {
        return c.json(
            { ok: false, code: 'variables_v2.invalid_body', message: 'Invalid JSON in request body' },
            400
        );
    }

    const fileUrl = String(body.fileUrl || '');
    const manager = getPluginConnectionManager();
    const resolved = resolveFileKey(fileUrl || undefined, manager);

    if (!isFileKeySuccess(resolved)) {
        return c.json(resolved, 400);
    }

    const namePattern = body.namePattern as string | undefined;
    const nameContains = body.nameContains as string | undefined;

    // Validate: at least one search criterion must be provided
    if (!namePattern && !nameContains) {
        return c.json(
            { ok: false, code: 'variables_v2.search_requires_filter', message: 'At least one of namePattern or nameContains is required for search' },
            400
        );
    }

    const params: SearchVariablesParams = {
        namePattern,
        nameContains,
        collectionId: body.collectionId as string | undefined,
        resolvedType: body.resolvedType as SearchVariablesParams['resolvedType'],
        limit: body.limit as number | undefined,
        compact: body.compact as boolean | undefined,
        offset: body.offset as number | undefined,
        collectionName: body.collectionName as string | undefined,
        resolveAliases: body.resolveAliases as boolean | undefined,
        modeId: body.modeId as string | undefined,
    };

    try {
        const result = await (deps.searchVariablesDirect ?? searchVariablesDirect)(resolved.fileKey, params);
        return c.json({ ok: true, ...result });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return c.json({ ok: false, code: 'variables_v2.search_failed', message }, 500);
    }
}

/**
 * POST /api/figma-mcp/batch-create-variables
 */
export async function handleBatchCreateVariables(
    c: Context,
    deps: FigmaMcpVariablesV2RouteDeps
): Promise<Response> {
    const readJsonBody = deps.readJsonBody ?? (async (ctx: Context) => await ctx.req.json());

    if (!isAuthorized(c, deps)) {
        return c.json(
            { ok: false, code: 'variables_v2.forbidden_remote', message: 'Endpoint only accessible from loopback or with internal token.' },
            403
        );
    }

    let body: Record<string, unknown> = {};
    try {
        body = await readJsonBody(c);
    } catch {
        return c.json(
            { ok: false, code: 'variables_v2.invalid_body', message: 'Invalid JSON in request body' },
            400
        );
    }

    const items = body.items as Array<unknown> | undefined;
    if (!items || !Array.isArray(items) || items.length === 0) {
        return c.json(
            { ok: false, code: 'variables_v2.invalid_params', message: 'items array is required and must not be empty' },
            400
        );
    }

    const fileUrl = String(body.fileUrl || '');
    const manager = getPluginConnectionManager();
    const resolved = resolveFileKey(fileUrl || undefined, manager);

    if (!isFileKeySuccess(resolved)) {
        return c.json(resolved, 400);
    }

    const params: BatchCreateVariablesParams = { items: items as BatchCreateVariablesParams['items'] };

    try {
        const result = await (deps.batchCreateVariablesDirect ?? batchCreateVariablesDirect)(resolved.fileKey, params);
        return c.json({ ok: true, ...result });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return c.json({ ok: false, code: 'variables_v2.batch_create_failed', message }, 500);
    }
}

/**
 * POST /api/figma-mcp/batch-update-variables
 */
export async function handleBatchUpdateVariables(
    c: Context,
    deps: FigmaMcpVariablesV2RouteDeps
): Promise<Response> {
    const readJsonBody = deps.readJsonBody ?? (async (ctx: Context) => await ctx.req.json());

    if (!isAuthorized(c, deps)) {
        return c.json(
            { ok: false, code: 'variables_v2.forbidden_remote', message: 'Endpoint only accessible from loopback or with internal token.' },
            403
        );
    }

    let body: Record<string, unknown> = {};
    try {
        body = await readJsonBody(c);
    } catch {
        return c.json(
            { ok: false, code: 'variables_v2.invalid_body', message: 'Invalid JSON in request body' },
            400
        );
    }

    const items = body.items as Array<unknown> | undefined;
    if (!items || !Array.isArray(items) || items.length === 0) {
        return c.json(
            { ok: false, code: 'variables_v2.invalid_params', message: 'items array is required and must not be empty' },
            400
        );
    }

    const fileUrl = String(body.fileUrl || '');
    const manager = getPluginConnectionManager();
    const resolved = resolveFileKey(fileUrl || undefined, manager);

    if (!isFileKeySuccess(resolved)) {
        return c.json(resolved, 400);
    }

    const params: BatchUpdateVariablesParams = { items: items as BatchUpdateVariablesParams['items'] };

    try {
        const result = await (deps.batchUpdateVariablesDirect ?? batchUpdateVariablesDirect)(resolved.fileKey, params);
        return c.json({ ok: true, ...result });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return c.json({ ok: false, code: 'variables_v2.batch_update_failed', message }, 500);
    }
}

/**
 * GET /api/figma-mcp/export-tokens
 */
export async function handleExportTokens(
    c: Context,
    deps: FigmaMcpVariablesV2RouteDeps
): Promise<Response> {
    if (!isAuthorized(c, deps)) {
        return c.json(
            { ok: false, code: 'variables_v2.forbidden_remote', message: 'Endpoint only accessible from loopback or with internal token.' },
            403
        );
    }

    const fileUrl = c.req.query('fileUrl') ?? undefined;
    const format = c.req.query('format') as ExportTokensParams['format'] | undefined;
    const collection = c.req.query('collection') ?? undefined;
    const mode = c.req.query('mode') ?? undefined;
    const resolveAliasesQuery = c.req.query('resolveAliases');
    const resolveAliases = resolveAliasesQuery === undefined ? undefined : resolveAliasesQuery === 'true';

    if (!format || !['css', 'tailwind', 'typescript'].includes(format)) {
        return c.json(
            { ok: false, code: 'variables_v2.invalid_format', message: 'format must be css, tailwind, or typescript' },
            400
        );
    }

    const manager = getPluginConnectionManager();
    const resolved = resolveFileKey(fileUrl, manager);

    if (!isFileKeySuccess(resolved)) {
        return c.json(resolved, 400);
    }

    const params: ExportTokensParams = { format, collection, mode, resolveAliases };

    try {
        const result = await (deps.exportTokensDirect ?? exportTokensDirect)(resolved.fileKey, params);

        // Set appropriate Content-Type based on format
        const contentType = format === 'css' ? 'text/css' : 'text/plain';

        return new Response(result.content, {
            status: 200,
            headers: {
                'Content-Type': contentType,
                'X-Content-Type-Options': 'nosniff',
            },
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return c.json({ ok: false, code: 'variables_v2.export_failed', message }, 500);
    }
}

/**
 * POST /api/figma-mcp/sync-tokens/plan
 */
export async function handleSyncTokensPlan(
    c: Context,
    deps: FigmaMcpVariablesV2RouteDeps
): Promise<Response> {
    const readJsonBody = deps.readJsonBody ?? (async (ctx: Context) => await ctx.req.json());

    if (!isAuthorized(c, deps)) {
        return c.json(
            { ok: false, code: 'variables_v2.forbidden_remote', message: 'Endpoint only accessible from loopback or with internal token.' },
            403
        );
    }

    let body: Record<string, unknown> = {};
    try {
        body = await readJsonBody(c);
    } catch {
        return c.json(
            { ok: false, code: 'variables_v2.invalid_body', message: 'Invalid JSON in request body' },
            400
        );
    }

    const tokens = body.tokens as Record<string, unknown> | undefined;
    if (!tokens || typeof tokens !== 'object') {
        return c.json(
            { ok: false, code: 'variables_v2.invalid_params', message: 'tokens object is required' },
            400
        );
    }

    const fileUrl = String(body.fileUrl || '');
    const manager = getPluginConnectionManager();
    const resolved = resolveFileKey(fileUrl || undefined, manager);

    if (!isFileKeySuccess(resolved)) {
        return c.json(resolved, 400);
    }

    const params: SyncTokensPlanParams = {
        tokens,
        collection: body.collection as string | undefined,
        pruneMode: body.pruneMode as boolean | undefined,
    };

    try {
        const result = await (deps.syncTokensPlanDirect ?? syncTokensPlanDirect)(resolved.fileKey, params);
        return c.json({ ok: true, ...result });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return c.json({ ok: false, code: 'variables_v2.sync_plan_failed', message }, 500);
    }
}

/**
 * POST /api/figma-mcp/sync-tokens/apply
 */
export async function handleSyncTokensApply(
    c: Context,
    deps: FigmaMcpVariablesV2RouteDeps
): Promise<Response> {
    const readJsonBody = deps.readJsonBody ?? (async (ctx: Context) => await ctx.req.json());

    if (!isAuthorized(c, deps)) {
        return c.json(
            { ok: false, code: 'variables_v2.forbidden_remote', message: 'Endpoint only accessible from loopback or with internal token.' },
            403
        );
    }

    let body: Record<string, unknown> = {};
    try {
        body = await readJsonBody(c);
    } catch {
        return c.json(
            { ok: false, code: 'variables_v2.invalid_body', message: 'Invalid JSON in request body' },
            400
        );
    }

    const plan = body.plan as Array<unknown> | undefined;
    if (!plan || !Array.isArray(plan) || plan.length === 0) {
        return c.json(
            { ok: false, code: 'variables_v2.invalid_params', message: 'plan array is required and must not be empty' },
            400
        );
    }

    const fileUrl = String(body.fileUrl || '');
    const manager = getPluginConnectionManager();
    const resolved = resolveFileKey(fileUrl || undefined, manager);

    if (!isFileKeySuccess(resolved)) {
        return c.json(resolved, 400);
    }

    const params: SyncTokensApplyParams = {
        plan: plan as SyncTokensApplyParams['plan'],
        collection: body.collection as string | undefined,
        abortOnError: body.abortOnError as boolean | undefined,
    };

    try {
        const result = await (deps.syncTokensApplyDirect ?? syncTokensApplyDirect)(resolved.fileKey, params);
        return c.json({ ok: true, ...result });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return c.json({ ok: false, code: 'variables_v2.sync_apply_failed', message }, 500);
    }
}

/**
 * GET /api/figma-mcp/token-usage
 */
export async function handleGetTokenUsage(
    c: Context,
    deps: FigmaMcpVariablesV2RouteDeps
): Promise<Response> {
    if (!isAuthorized(c, deps)) {
        return c.json(
            { ok: false, code: 'variables_v2.forbidden_remote', message: 'Endpoint only accessible from loopback or with internal token.' },
            403
        );
    }

    // Check env gate
    if (process.env.DS_FEATURE_TOKEN_USAGE !== '1') {
        return c.json(
            { ok: false, code: 'variables_v2.not_implemented', message: 'GET_TOKEN_USAGE requires DS_FEATURE_TOKEN_USAGE=1 env var' },
            501
        );
    }

    const fileUrl = c.req.query('fileUrl') ?? undefined;
    const pageId = c.req.query('pageId') ?? undefined;
    const maxNodes = c.req.query('maxNodes') ? parseInt(c.req.query('maxNodes')!, 10) : undefined;
    const force = c.req.query('force') === 'true';

    const manager = getPluginConnectionManager();
    const resolved = resolveFileKey(fileUrl, manager);

    if (!isFileKeySuccess(resolved)) {
        return c.json(resolved, 400);
    }

    const params: GetTokenUsageParams = { pageId, maxNodes, force };

    try {
        const result = await (deps.getTokenUsageDirect ?? getTokenUsageDirect)(resolved.fileKey, params);
        return c.json({ ok: true, ...result });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return c.json({ ok: false, code: 'variables_v2.token_usage_failed', message }, 500);
    }
}

/**
 * Register all v2 routes
 */
export function registerFigmaMcpVariablesV2Routes(
    app: { post: (path: string, handler: (c: Context) => Promise<Response>) => void; get: (path: string, handler: (c: Context) => Promise<Response>) => void },
    deps: FigmaMcpVariablesV2RouteDeps
): void {
    app.post('/api/figma-mcp/search-variables-direct', (c) => handleSearchVariablesDirect(c, deps));
    app.post('/api/figma-mcp/batch-create-variables', (c) => handleBatchCreateVariables(c, deps));
    app.post('/api/figma-mcp/batch-update-variables', (c) => handleBatchUpdateVariables(c, deps));
    app.get('/api/figma-mcp/export-tokens', (c) => handleExportTokens(c, deps));
    app.post('/api/figma-mcp/sync-tokens/plan', (c) => handleSyncTokensPlan(c, deps));
    app.post('/api/figma-mcp/sync-tokens/apply', (c) => handleSyncTokensApply(c, deps));
    app.get('/api/figma-mcp/token-usage', (c) => handleGetTokenUsage(c, deps));
}
