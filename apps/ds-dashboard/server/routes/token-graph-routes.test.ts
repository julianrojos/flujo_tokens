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

function createTestApp(sysCtx: SystemContext): Hono {
    const app = new Hono();
    registerTokenGraphRoutes(app, {
        failJson: createFailJson(),
        getSystemContext: () => sysCtx,
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
