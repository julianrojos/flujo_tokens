/**
 * Token Graph Routes Tests
 *
 * Tests for token graph routes.
 * Migrated from apps/ds-dashboard/server/routes/token-graph-routes.test.mjs
 */

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { Hono } from 'hono';

import { registerTokenGraphRoutes } from './token-graph-routes.ts';
import type { SystemContext } from '../lib/analysis-route-service.ts';

function createFailJson() {
    return (c: unknown, statusCode: number, args: Record<string, unknown>) => {
        const honoC = c as { json: (body: unknown, status?: number) => unknown };
        return honoC.json(
            {
                ok: false,
                code: args.code,
                message: args.userMessage,
            },
            statusCode,
        );
    };
}

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ds-token-graph-routes-'));
    try {
        await run(dir);
    } finally {
        await fs.rm(dir, { recursive: true, force: true });
    }
}

function createTestApp(
    sysCtx: SystemContext,
    overrides?: { tokenRepo?: import('../db/token-repository.js').TokenRepository },
): Hono {
    const app = new Hono();
    registerTokenGraphRoutes(app, {
        failJson: createFailJson(),
        getSystemContext: () => sysCtx,
        tokenRepo: overrides?.tokenRepo,
    });
    return app;
}

test('token-graph-routes: /api/token-usage-index returns 404 when artifact is missing', async () => {
    await withTempDir(async (dir) => {
        const app = createTestApp({
            tokenUsageIndexPath: path.join(dir, 'missing-token-usage.json'),
            tokenGraphVizPath: path.join(dir, 'token-graph-viz.json'),
            tokenRegistryPath: '',
            tokenHealthPath: '',
            componentRegistryPath: '',
            wcagPairsPath: '',
        });
        const res = await app.request('/api/token-usage-index');
        assert.equal(res.status, 404);
        const payload = await res.json() as { code: string };
        assert.equal(payload.code, 'file.not_found');
    });
});

test('token-graph-routes: /api/token-graph-query requires token parameter', async () => {
    await withTempDir(async (dir) => {
        const graphPath = path.join(dir, 'token-graph-viz.json');
        await fs.writeFile(graphPath, JSON.stringify({ nodes: [], edges: [] }), 'utf8');
        const app = createTestApp({
            tokenUsageIndexPath: path.join(dir, 'token-usage-index.json'),
            tokenGraphVizPath: graphPath,
            tokenRegistryPath: '',
            tokenHealthPath: '',
            componentRegistryPath: '',
            wcagPairsPath: '',
        });
        const res = await app.request('/api/token-graph-query');
        assert.equal(res.status, 400);
        const payload = await res.json() as { code: string };
        assert.equal(payload.code, 'validation.token_required');
    });
});

test('token-graph-routes: /api/token-graph-query returns 404 when token is unknown', async () => {
    await withTempDir(async (dir) => {
        const graphPath = path.join(dir, 'token-graph-viz.json');
        await fs.writeFile(
            graphPath,
            JSON.stringify({
                nodes: [{ id: 'n1', path: 'color.primary', displayKey: 'color.primary' }],
                edges: [],
            }),
            'utf8',
        );
        const app = createTestApp({
            tokenUsageIndexPath: path.join(dir, 'token-usage-index.json'),
            tokenGraphVizPath: graphPath,
            tokenRegistryPath: '',
            tokenHealthPath: '',
            componentRegistryPath: '',
            wcagPairsPath: '',
        });
        const res = await app.request('/api/token-graph-query?token=color.missing');
        assert.equal(res.status, 404);
        const payload = await res.json() as { code: string };
        assert.equal(payload.code, 'token_graph.token_not_found');
    });
});

test('token-graph-routes: /api/token-graph-query returns resolved graph payload', async () => {
    await withTempDir(async (dir) => {
        const graphPath = path.join(dir, 'token-graph-viz.json');
        const usageIndexPath = path.join(dir, 'token-usage-index.json');
        await fs.writeFile(
            graphPath,
            JSON.stringify({
                nodes: [
                    {
                        id: 'n1',
                        path: 'color.primary',
                        slashPath: 'color/primary',
                        cssVar: '--color-primary',
                        displayKey: 'color.primary',
                        type: 'color',
                        collection: 'Primitives',
                        isCycleMember: false,
                    },
                    {
                        id: 'n2',
                        path: 'color.secondary',
                        slashPath: 'color/secondary',
                        cssVar: '--color-secondary',
                        displayKey: 'color.secondary',
                        type: 'color',
                        collection: 'Primitives',
                        isCycleMember: false,
                    },
                ],
                edges: [{ source: 'n1', target: 'n2' }],
            }),
            'utf8',
        );
        await fs.writeFile(usageIndexPath, JSON.stringify({ ok: true, tokens: [] }), 'utf8');

        const app = createTestApp({
            tokenUsageIndexPath: usageIndexPath,
            tokenGraphVizPath: graphPath,
            tokenRegistryPath: '',
            tokenHealthPath: '',
            componentRegistryPath: '',
            wcagPairsPath: '',
        });
        const res = await app.request('/api/token-graph-query?token=color.primary&direction=both&depth=2');
        assert.equal(res.status, 200);
        const payload = await res.json() as { ok: boolean; root: { id: string }; query: { resolved_id: string }; summary: { direct_dependencies: number } };
        assert.equal(payload.ok, true);
        assert.equal(payload.root.id, 'n1');
        assert.equal(payload.query.resolved_id, 'n1');
        assert.equal(payload.summary.direct_dependencies, 1);
    });
});

test('token-graph-routes: /api/token-usage-index bypasses DB cache for multi-system paths', async () => {
    await withTempDir(async (dir) => {
        const usageIndexPath = path.join(
            dir,
            'design-systems',
            'sys-01',
            'docs',
            '_generated',
            'token-usage-index.json',
        );
        await fs.mkdir(path.dirname(usageIndexPath), { recursive: true });
        await fs.writeFile(
            usageIndexPath,
            JSON.stringify({
                ok: true,
                summary: {
                    generatedAt: '2026-03-20T00:00:00.000Z',
                    tokens_total: 1,
                    tokens_with_usage: 1,
                    tokens_without_usage: 0,
                    usage_links_total: 1,
                    usage_links_by_kind: { 'component-spec': 1 },
                    unresolved_total: 0,
                },
                warnings: [],
                unresolved: [],
                entries: [
                    {
                        path: 'color.primary',
                        slashPath: 'color/primary',
                        cssVar: '--color-primary',
                        type: 'color',
                        collection: 'semantic',
                        usageCount: 1,
                        usageByKind: { 'component-spec': 1 },
                        usedIn: [
                            {
                                kind: 'component-spec',
                                source: 'design-systems/sys-01/docs/_spec/components/button.yml',
                                owner: 'button',
                                detail: 'token_mapping.container.fill',
                            },
                        ],
                    },
                ],
                byPath: {},
                bySlashPath: {},
                byCssVar: {},
            }),
            'utf8',
        );

        const tokenRepoStub = {
            getTokenUsageIndex: () => ({
                ok: true,
                summary: {
                    generatedAt: '2026-03-20T00:00:00.000Z',
                    tokens_total: 0,
                    tokens_with_usage: 0,
                    tokens_without_usage: 0,
                    usage_links_total: 0,
                    usage_links_by_kind: {},
                    unresolved_total: 0,
                },
                warnings: [],
                unresolved: [],
                entries: [],
                byPath: {},
                bySlashPath: {},
                byCssVar: {},
            }),
        } as unknown as import('../db/token-repository.js').TokenRepository;

        const app = createTestApp(
            {
                tokenUsageIndexPath: usageIndexPath,
                tokenGraphVizPath: path.join(dir, 'token-graph-viz.json'),
                tokenRegistryPath: '',
                tokenHealthPath: '',
                componentRegistryPath: '',
                wcagPairsPath: '',
            },
            { tokenRepo: tokenRepoStub },
        );

        const res = await app.request('/api/token-usage-index');
        assert.equal(res.status, 200);
        const payload = await res.json() as { summary: { tokens_with_usage: number } };
        assert.equal(payload.summary.tokens_with_usage, 1);
    });
});

test('token-graph-routes: /api/token-usage-index prefers JSON over DB for docs/_generated paths', async () => {
    await withTempDir(async (dir) => {
        const usageIndexPath = path.join(dir, 'docs', '_generated', 'token-usage-index.json');
        await fs.mkdir(path.dirname(usageIndexPath), { recursive: true });
        await fs.writeFile(
            usageIndexPath,
            JSON.stringify({
                ok: true,
                summary: {
                    generatedAt: '2026-03-20T00:00:00.000Z',
                    tokens_total: 2,
                    tokens_with_usage: 1,
                    tokens_without_usage: 1,
                    usage_links_total: 3,
                    usage_links_by_kind: { 'component-spec': 3 },
                    unresolved_total: 0,
                },
                warnings: [],
                unresolved: [],
                entries: [
                    {
                        path: 'color.primary',
                        slashPath: 'color/primary',
                        cssVar: '--color-primary',
                        type: 'color',
                        collection: 'semantic',
                        usageCount: 3,
                        usageByKind: { 'component-spec': 3 },
                        usedIn: [],
                    },
                    {
                        path: 'color.secondary',
                        slashPath: 'color/secondary',
                        cssVar: '--color-secondary',
                        type: 'color',
                        collection: 'semantic',
                        usageCount: 0,
                        usageByKind: {},
                        usedIn: [],
                    },
                ],
                byPath: {},
                bySlashPath: {},
                byCssVar: {},
            }),
            'utf8',
        );

        const tokenRepoStub = {
            getTokenUsageIndex: () => ({
                ok: true,
                summary: {
                    generatedAt: '2026-03-20T00:00:00.000Z',
                    tokens_total: 2,
                    tokens_with_usage: 0,
                    tokens_without_usage: 2,
                    usage_links_total: 0,
                    usage_links_by_kind: {},
                    unresolved_total: 0,
                },
                warnings: [],
                unresolved: [],
                entries: [
                    {
                        path: 'color.primary',
                        slashPath: 'color/primary',
                        cssVar: '--color-primary',
                        type: 'color',
                        collection: 'semantic',
                        usageCount: 0,
                        usageByKind: {},
                        usedIn: [],
                    },
                    {
                        path: 'color.secondary',
                        slashPath: 'color/secondary',
                        cssVar: '--color-secondary',
                        type: 'color',
                        collection: 'semantic',
                        usageCount: 0,
                        usageByKind: {},
                        usedIn: [],
                    },
                ],
                byPath: {},
                bySlashPath: {},
                byCssVar: {},
            }),
        } as unknown as import('../db/token-repository.js').TokenRepository;

        const app = createTestApp(
            {
                tokenUsageIndexPath: usageIndexPath,
                tokenGraphVizPath: path.join(dir, 'token-graph-viz.json'),
                tokenRegistryPath: '',
                tokenHealthPath: '',
                componentRegistryPath: '',
                wcagPairsPath: '',
            },
            { tokenRepo: tokenRepoStub },
        );

        const res = await app.request('/api/token-usage-index');
        assert.equal(res.status, 200);
        const payload = await res.json() as { summary: { tokens_with_usage: number; usage_links_total: number } };
        assert.equal(payload.summary.tokens_with_usage, 1);
        assert.equal(payload.summary.usage_links_total, 3);
    });
});
