/**
 * Tests for Figma MCP Variables V2 Route
 *
 * Tests for enhanced variable operations using direct plugin WebSocket bridge.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import type { Context } from 'hono';
import { Hono } from 'hono';

import {
    registerFigmaMcpVariablesV2Routes,
    type FigmaMcpVariablesV2RouteDeps,
    handleSearchVariablesDirect,
    handleBatchCreateVariables,
    handleBatchUpdateVariables,
    handleExportTokens,
    handleSyncTokensPlan,
    handleSyncTokensApply,
    handleGetTokenUsage,
} from './figma-mcp-variables-v2-route.ts';
import { getPluginConnectionManager, resetPluginConnectionManager } from '../services/plugin-connection-manager.ts';

// Mock data for testing
const mockVariablesResult = {
    success: true,
    variables: [
        { id: 'var1', name: 'Color/Primary', key: 'key1', resolvedType: 'COLOR', valuesByMode: { 'mode1': { r: 1, g: 0, b: 0, a: 1 } }, variableCollectionId: 'col1', scopes: [], description: '', hiddenFromPublishing: false, remote: false },
    ],
    count: 1,
    total: 1,
    offset: 0,
    hasMore: false,
};

const mockBatchCreateResult = {
    success: true,
    created: [
        { id: 'var1', name: 'Color/Primary', key: 'key1', resolvedType: 'COLOR', valuesByMode: {}, variableCollectionId: 'col1', scopes: [], description: '', hiddenFromPublishing: false, remote: false },
    ],
    errors: [],
};

const mockBatchUpdateResult = {
    success: true,
    updated: [
        { id: 'var1', name: 'Color/Primary', key: 'key1', resolvedType: 'COLOR', valuesByMode: { 'mode1': { r: 0, g: 1, b: 0, a: 1 } }, variableCollectionId: 'col1', scopes: [], description: '', hiddenFromPublishing: false, remote: false },
    ],
    errors: [],
};

const mockExportResult = {
    success: true,
    content: ':root { --color-primary: #ff0000; }',
    format: 'css' as const,
    stats: { variableCount: 1, collectionCount: 1 },
};

const mockSyncPlanResult = {
    success: true,
    plan: [
        { path: 'colors/primary', action: 'add' as const, desiredValue: '#ff0000' },
    ],
    summary: { additions: 1, updates: 0, deletions: 0 },
};

const mockSyncApplyResult = {
    success: true,
    applied: { added: 1, updated: 0, deleted: 0 },
    errors: [],
};

const mockTokenUsageResult = {
    success: true,
    usage: [
        { variableId: 'var1', variableName: 'Color/Primary', nodeCount: 5, nodeIds: ['node1', 'node2', 'node3', 'node4', 'node5'] },
    ],
    unusedVariableIds: ['var2'],
    scannedNodeCount: 100,
    truncated: false,
};

test.beforeEach(() => {
    resetPluginConnectionManager();
});

test.afterEach(() => {
    resetPluginConnectionManager();
});

function createTestApp(overrides: Partial<FigmaMcpVariablesV2RouteDeps> = {}): Hono {
    const app = new Hono();
    registerFigmaMcpVariablesV2Routes(app, {
        readJsonBody: async (c: Context) => await c.req.json(),
        getConnInfoFn: () => ({ remote: { address: '127.0.0.1' } }),
        ...overrides,
    });
    return app;
}

// =============================================================================
// Auth tests
// =============================================================================

test('figma-mcp-variables-v2: blocks non-loopback clients on search-variables-direct', async () => {
    const app = createTestApp({
        getConnInfoFn: () => ({ remote: { address: '10.20.30.40' } }),
    });

    const response = await app.request('/api/figma-mcp/search-variables-direct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileUrl: 'https://www.figma.com/design/abc/Test' }),
    });

    assert.equal(response.status, 403);
    const payload = await response.json();
    assert.equal(payload.ok, false);
    assert.equal(payload.code, 'variables_v2.forbidden_remote');
});

test('figma-mcp-variables-v2: blocks non-loopback clients on batch-create-variables', async () => {
    const app = createTestApp({
        getConnInfoFn: () => ({ remote: { address: '10.20.30.40' } }),
    });

    const response = await app.request('/api/figma-mcp/batch-create-variables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [{ name: 'Test', collectionId: 'col1', resolvedType: 'COLOR' }] }),
    });

    assert.equal(response.status, 403);
});

test('figma-mcp-variables-v2: blocks non-loopback clients on export-tokens', async () => {
    const app = createTestApp({
        getConnInfoFn: () => ({ remote: { address: '10.20.30.40' } }),
    });

    const response = await app.request('/api/figma-mcp/export-tokens?format=css', {
        method: 'GET',
    });

    assert.equal(response.status, 403);
});

test('figma-mcp-variables-v2: blocks non-loopback clients on sync-tokens/plan', async () => {
    const app = createTestApp({
        getConnInfoFn: () => ({ remote: { address: '10.20.30.40' } }),
    });

    const response = await app.request('/api/figma-mcp/sync-tokens/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokens: { color: { primary: '#ff0000' } } }),
    });

    assert.equal(response.status, 403);
});

test('figma-mcp-variables-v2: blocks non-loopback clients on token-usage', async () => {
    const app = createTestApp({
        getConnInfoFn: () => ({ remote: { address: '10.20.30.40' } }),
    });

    const response = await app.request('/api/figma-mcp/token-usage', {
        method: 'GET',
    });

    assert.equal(response.status, 403);
});

// =============================================================================
// Validation tests
// =============================================================================



test('figma-mcp-variables-v2: batch-create-variables returns 400 for empty items array', async () => {
    const app = createTestApp({
        getConnInfoFn: () => ({ remote: { address: '127.0.0.1' } }),
        batchCreateVariablesDirect: async () => mockBatchCreateResult,
    });

    const response = await app.request('/api/figma-mcp/batch-create-variables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [] }),
    });

    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.equal(payload.code, 'variables_v2.invalid_params');
});

test('figma-mcp-variables-v2: batch-update-variables returns 400 for empty items array', async () => {
    const app = createTestApp({
        getConnInfoFn: () => ({ remote: { address: '127.0.0.1' } }),
        batchUpdateVariablesDirect: async () => mockBatchUpdateResult,
    });

    const response = await app.request('/api/figma-mcp/batch-update-variables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [] }),
    });

    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.equal(payload.code, 'variables_v2.invalid_params');
});

test('figma-mcp-variables-v2: export-tokens returns 400 for invalid format', async () => {
    const app = createTestApp({
        getConnInfoFn: () => ({ remote: { address: '127.0.0.1' } }),
    });

    const response = await app.request('/api/figma-mcp/export-tokens?format=invalid', {
        method: 'GET',
    });

    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.equal(payload.code, 'variables_v2.invalid_format');
});

test('figma-mcp-variables-v2: sync-tokens/plan returns 400 when tokens is missing', async () => {
    const app = createTestApp({
        getConnInfoFn: () => ({ remote: { address: '127.0.0.1' } }),
    });

    const response = await app.request('/api/figma-mcp/sync-tokens/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
    });

    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.equal(payload.code, 'variables_v2.invalid_params');
});

test('figma-mcp-variables-v2: sync-tokens/apply returns 400 for empty plan', async () => {
    const app = createTestApp({
        getConnInfoFn: () => ({ remote: { address: '127.0.0.1' } }),
    });

    const response = await app.request('/api/figma-mcp/sync-tokens/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: [] }),
    });

    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.equal(payload.code, 'variables_v2.invalid_params');
});

// =============================================================================
// Success path tests
// =============================================================================

test('figma-mcp-variables-v2: search-variables-direct calls searchVariablesDirect and returns result', async () => {
    const app = createTestApp({
        getConnInfoFn: () => ({ remote: { address: '127.0.0.1' } }),
        searchVariablesDirect: async () => mockVariablesResult,
    });

    const response = await app.request('/api/figma-mcp/search-variables-direct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            fileUrl: 'https://www.figma.com/file/abc123/Test',
            nameContains: 'Primary',
            resolveAliases: true,
        }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.success, true);
    assert.equal(payload.count, 1);
});

test('figma-mcp-variables-v2: batch-create-variables returns created items', async () => {
    const app = createTestApp({
        getConnInfoFn: () => ({ remote: { address: '127.0.0.1' } }),
        batchCreateVariablesDirect: async () => mockBatchCreateResult,
    });

    const response = await app.request('/api/figma-mcp/batch-create-variables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            fileUrl: 'https://www.figma.com/file/abc123/Test',
            items: [{ name: 'Color/Primary', collectionId: 'col1', resolvedType: 'COLOR' }],
        }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.created.length, 1);
});

test('figma-mcp-variables-v2: export-tokens returns CSS content with correct Content-Type', async () => {
    const app = createTestApp({
        getConnInfoFn: () => ({ remote: { address: '127.0.0.1' } }),
        exportTokensDirect: async () => mockExportResult,
    });

    const response = await app.request('/api/figma-mcp/export-tokens?format=css&fileUrl=https://www.figma.com/file/abc123', {
        method: 'GET',
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Content-Type'), 'text/css');
    const content = await response.text();
    assert.equal(content, ':root { --color-primary: #ff0000; }');
});

test('figma-mcp-variables-v2: export-tokens returns plain text for tailwind format', async () => {
    const app = createTestApp({
        getConnInfoFn: () => ({ remote: { address: '127.0.0.1' } }),
        exportTokensDirect: async () => ({ ...mockExportResult, format: 'tailwind' as const, content: 'export default { theme: { extend: {} } }' }),
    });

    const response = await app.request('/api/figma-mcp/export-tokens?format=tailwind&fileUrl=https://www.figma.com/file/abc123', {
        method: 'GET',
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Content-Type'), 'text/plain');
});

test('figma-mcp-variables-v2: sync-tokens/plan returns plan result', async () => {
    const app = createTestApp({
        getConnInfoFn: () => ({ remote: { address: '127.0.0.1' } }),
        syncTokensPlanDirect: async () => mockSyncPlanResult,
    });

    const response = await app.request('/api/figma-mcp/sync-tokens/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            fileUrl: 'https://www.figma.com/file/abc123/Test',
            tokens: { colors: { primary: '#ff0000' } },
        }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.plan.length, 1);
    assert.equal(payload.summary.additions, 1);
});

test('figma-mcp-variables-v2: sync-tokens/apply returns applied result', async () => {
    const app = createTestApp({
        getConnInfoFn: () => ({ remote: { address: '127.0.0.1' } }),
        syncTokensApplyDirect: async () => mockSyncApplyResult,
    });

    const response = await app.request('/api/figma-mcp/sync-tokens/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            fileUrl: 'https://www.figma.com/file/abc123/Test',
            plan: [{ path: 'colors/primary', action: 'add', desiredValue: '#ff0000' }],
        }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.applied.added, 1);
});

// =============================================================================
// GET_TOKEN_USAGE tests
// =============================================================================

test('figma-mcp-variables-v2: token-usage returns 501 when DS_FEATURE_TOKEN_USAGE is not set', async () => {
    const originalEnv = process.env.DS_FEATURE_TOKEN_USAGE;
    delete process.env.DS_FEATURE_TOKEN_USAGE;

    const app = createTestApp({
        getConnInfoFn: () => ({ remote: { address: '127.0.0.1' } }),
        getTokenUsageDirect: async () => mockTokenUsageResult,
    });

    const response = await app.request('/api/figma-mcp/token-usage', {
        method: 'GET',
    });

    assert.equal(response.status, 501);
    const payload = await response.json();
    assert.equal(payload.code, 'variables_v2.not_implemented');

    // Restore env
    if (originalEnv !== undefined) {
        process.env.DS_FEATURE_TOKEN_USAGE = originalEnv;
    }
});

test('figma-mcp-variables-v2: token-usage works when DS_FEATURE_TOKEN_USAGE=1', async () => {
    const originalEnv = process.env.DS_FEATURE_TOKEN_USAGE;
    process.env.DS_FEATURE_TOKEN_USAGE = '1';

    const app = createTestApp({
        getConnInfoFn: () => ({ remote: { address: '127.0.0.1' } }),
        getTokenUsageDirect: async () => mockTokenUsageResult,
    });

    const response = await app.request('/api/figma-mcp/token-usage?fileUrl=https://www.figma.com/file/abc123', {
        method: 'GET',
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.usage.length, 1);

    // Restore env
    if (originalEnv !== undefined) {
        process.env.DS_FEATURE_TOKEN_USAGE = originalEnv;
    } else {
        delete process.env.DS_FEATURE_TOKEN_USAGE;
    }
});

test('figma-mcp-variables-v2: token-usage works with force=true when env not set', async () => {
    const originalEnv = process.env.DS_FEATURE_TOKEN_USAGE;
    delete process.env.DS_FEATURE_TOKEN_USAGE;

    const app = createTestApp({
        getConnInfoFn: () => ({ remote: { address: '127.0.0.1' } }),
        getTokenUsageDirect: async () => mockTokenUsageResult,
    });

    const response = await app.request('/api/figma-mcp/token-usage?force=true', {
        method: 'GET',
    });

    // Note: The force parameter is handled on the plugin side, not server side
    // So this should still return 501 without the env var
    assert.equal(response.status, 501);

    // Restore env
    if (originalEnv !== undefined) {
        process.env.DS_FEATURE_TOKEN_USAGE = originalEnv;
    }
});
