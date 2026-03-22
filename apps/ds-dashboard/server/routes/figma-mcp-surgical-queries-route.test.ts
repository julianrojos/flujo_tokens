/**
 * Tests for Figma MCP Surgical Queries Routes
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import type { Context } from 'hono';
import { Hono } from 'hono';

import {
  registerFigmaMcpSurgicalQueriesRoutes,
  type FigmaMcpSurgicalQueriesRouteDeps,
} from './figma-mcp-surgical-queries-route.ts';
import type {
  SurgicalQueryResult,
  SurgicalQueryError,
  ChildNodeResult,
  StyleResult,
  VariableResult,
} from '../../../../tooling/src/services/figma-mcp-surgical-queries.js';

function createTestApp(overrides: Partial<FigmaMcpSurgicalQueriesRouteDeps> = {}): Hono {
  const app = new Hono();
  registerFigmaMcpSurgicalQueriesRoutes(app, {
    getConnInfoFn: () => ({ remote: { address: '127.0.0.1' } }),
    internalToken: 'test-token',
    ...overrides,
  });
  return app;
}

// ============================================================================
// GET /api/figma-mcp/get-children Tests
// ============================================================================

test('get-children: POST blocks unauthenticated request', async () => {
  const app = createTestApp({
    getConnInfoFn: () => ({ remote: { address: '10.20.30.40' } }),
  });

  const response = await app.request('/api/figma-mcp/get-children', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ parentId: '0:1' }),
  });

  assert.equal(response.status, 403);
  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.code, 'get_children.forbidden_remote');
});

test('get-children: POST rejects missing parentId', async () => {
  const app = createTestApp();

  const response = await app.request('/api/figma-mcp/get-children', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-ds-dashboard-internal-token': 'test-token',
    },
    body: JSON.stringify({}),
  });

  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.code, 'get_children.parent_missing');
});

test('get-children: POST returns children with mock', async () => {
  const mockResult: SurgicalQueryResult<ChildNodeResult> = {
    ok: true,
    source: 'mcp_tool',
    items: [
      { id: '1:1', name: 'Frame 1', type: 'FRAME', parentId: '0:1' },
      { id: '1:2', name: 'Frame 2', type: 'FRAME', parentId: '0:1' },
    ],
    count: 2,
    truncated: false,
    query: { parentId: '0:1', limit: 50 },
    elapsedMs: 50,
  };

  const app = createTestApp({
    getChildrenViaMcpFn: async () => mockResult,
  });

  const response = await app.request('/api/figma-mcp/get-children', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-ds-dashboard-internal-token': 'test-token',
    },
    body: JSON.stringify({ parentId: '0:1' }),
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.items.length, 2);
  assert.equal(payload.items[0].name, 'Frame 1');
});

// ============================================================================
// POST /api/figma-mcp/search-styles Tests
// ============================================================================

test('search-styles: POST blocks unauthenticated request', async () => {
  const app = createTestApp({
    getConnInfoFn: () => ({ remote: { address: '10.20.30.40' } }),
  });

  const response = await app.request('/api/figma-mcp/search-styles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nameContains: 'color' }),
  });

  assert.equal(response.status, 403);
  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.code, 'search_styles.forbidden_remote');
});

test('search-styles: POST rejects missing nameContains', async () => {
  const app = createTestApp();

  const response = await app.request('/api/figma-mcp/search-styles', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-ds-dashboard-internal-token': 'test-token',
    },
    body: JSON.stringify({}),
  });

  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.code, 'search_styles.name_missing');
});

test('search-styles: POST rejects short nameContains', async () => {
  const app = createTestApp();

  const response = await app.request('/api/figma-mcp/search-styles', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-ds-dashboard-internal-token': 'test-token',
    },
    body: JSON.stringify({ nameContains: 'a' }),
  });

  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.code, 'search_styles.name_too_short');
});

test('search-styles: POST returns styles with mock', async () => {
  const mockResult: SurgicalQueryResult<StyleResult> = {
    ok: true,
    source: 'fallback',
    items: [
      { id: 's:1', name: 'Color/Primary', styleType: 'FILL' },
      { id: 's:2', name: 'Color/Secondary', styleType: 'FILL' },
    ],
    count: 2,
    truncated: false,
    query: { nameContains: 'color', limit: 50 },
    elapsedMs: 100,
  };

  const app = createTestApp({
    searchStylesViaMcpFn: async () => mockResult,
  });

  const response = await app.request('/api/figma-mcp/search-styles', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-ds-dashboard-internal-token': 'test-token',
    },
    body: JSON.stringify({ nameContains: 'color' }),
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.items.length, 2);
  assert.equal(payload.items[0].styleType, 'FILL');
});

// ============================================================================
// POST /api/figma-mcp/search-variables Tests
// ============================================================================

test('search-variables: POST blocks unauthenticated request', async () => {
  const app = createTestApp({
    getConnInfoFn: () => ({ remote: { address: '10.20.30.40' } }),
  });

  const response = await app.request('/api/figma-mcp/search-variables', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nameContains: 'color' }),
  });

  assert.equal(response.status, 403);
  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.code, 'search_variables.forbidden_remote');
});

test('search-variables: POST rejects missing nameContains', async () => {
  const app = createTestApp();

  const response = await app.request('/api/figma-mcp/search-variables', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-ds-dashboard-internal-token': 'test-token',
    },
    body: JSON.stringify({}),
  });

  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.code, 'search_variables.name_missing');
});

test('search-variables: POST rejects short nameContains', async () => {
  const app = createTestApp();

  const response = await app.request('/api/figma-mcp/search-variables', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-ds-dashboard-internal-token': 'test-token',
    },
    body: JSON.stringify({ nameContains: 'x' }),
  });

  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.code, 'search_variables.name_too_short');
});

test('search-variables: POST returns variables with mock', async () => {
  const mockResult: SurgicalQueryResult<VariableResult> = {
    ok: true,
    source: 'fallback',
    items: [
      { id: 'v:1', name: 'color/primary', resolvedType: 'COLOR' },
      { id: 'v:2', name: 'color/secondary', resolvedType: 'COLOR' },
    ],
    count: 2,
    truncated: false,
    query: { nameContains: 'color', limit: 50 },
    elapsedMs: 150,
  };

  const app = createTestApp({
    searchVariablesViaMcpFn: async () => mockResult,
  });

  const response = await app.request('/api/figma-mcp/search-variables', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-ds-dashboard-internal-token': 'test-token',
    },
    body: JSON.stringify({ nameContains: 'color' }),
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.items.length, 2);
  assert.equal(payload.items[0].resolvedType, 'COLOR');
});

test('search-variables: POST respects collection filter', async () => {
  let capturedCollection: string | undefined;

  const app = createTestApp({
    searchVariablesViaMcpFn: async (options) => {
      capturedCollection = options.collection;
      return {
        ok: true,
        source: 'fallback',
        items: [],
        count: 0,
        truncated: false,
        query: { nameContains: 'color', limit: 50 },
        elapsedMs: 50,
      };
    },
  });

  const response = await app.request('/api/figma-mcp/search-variables', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-ds-dashboard-internal-token': 'test-token',
    },
    body: JSON.stringify({ nameContains: 'color', collection: 'Collection:1' }),
  });

  assert.equal(response.status, 200);
  assert.equal(capturedCollection, 'Collection:1');
});
