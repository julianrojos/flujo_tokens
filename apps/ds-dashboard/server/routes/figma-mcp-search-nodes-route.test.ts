/**
 * Tests for Figma MCP Search Nodes Route
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import type { Context } from 'hono';
import { Hono } from 'hono';

import {
  registerFigmaMcpSearchNodesRoute,
  type FigmaMcpSearchNodesRouteDeps,
} from './figma-mcp-search-nodes-route.ts';
import type {
  SearchFigmaNodesOptions,
  SearchFigmaNodesResult,
  SearchFigmaNodesError,
} from '../../../../tooling/src/services/figma-mcp-search-nodes.js';

function createTestApp(overrides: Partial<FigmaMcpSearchNodesRouteDeps> = {}): Hono {
  const app = new Hono();
  registerFigmaMcpSearchNodesRoute(app, {
    getConnInfoFn: () => ({ remote: { address: '127.0.0.1' } }),
    internalToken: 'test-token',
    ...overrides,
  });
  return app;
}

test('figma-mcp-search-nodes-route: POST blocks unauthenticated request', async () => {
  const app = createTestApp({
    getConnInfoFn: () => ({ remote: { address: '10.20.30.40' } }),
  });

  const response = await app.request('/api/figma-mcp/search-nodes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nameContains: 'color' }),
  });

  assert.equal(response.status, 403);
  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.code, 'search.forbidden_remote');
});

test('figma-mcp-search-nodes-route: POST allows with valid token and returns search result', async () => {
  const mockResult: SearchFigmaNodesResult = {
    ok: true,
    source: 'search_tool',
    nodes: [
      { id: '1:1', name: 'color/primary', type: 'FRAME', parentId: '0:1' },
      { id: '1:2', name: 'color/secondary', type: 'FRAME', parentId: '0:1' },
    ],
    count: 2,
    truncated: false,
    query: {
      nameContains: 'color',
      limit: 20,
      exactMatch: false,
    },
    elapsedMs: 100,
  };

  const app = createTestApp({
    getConnInfoFn: () => ({ remote: { address: '10.20.30.40' } }),
    searchFigmaNodesViaMcpFn: async () => mockResult,
  });

  const response = await app.request('/api/figma-mcp/search-nodes', {
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
  assert.equal(payload.source, 'search_tool');
  assert.equal(payload.nodes.length, 2);
  assert.equal(payload.nodes[0].name, 'color/primary');
});

test('figma-mcp-search-nodes-route: POST rejects missing nameContains', async () => {
  const app = createTestApp();

  const response = await app.request('/api/figma-mcp/search-nodes', {
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
  assert.equal(payload.code, 'search.name_missing');
});

test('figma-mcp-search-nodes-route: POST rejects short nameContains', async () => {
  const app = createTestApp();

  const response = await app.request('/api/figma-mcp/search-nodes', {
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
  assert.equal(payload.code, 'search.name_too_short');
});

test('figma-mcp-search-nodes-route: POST rejects invalid limit', async () => {
  const app = createTestApp();

  const response = await app.request('/api/figma-mcp/search-nodes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-ds-dashboard-internal-token': 'test-token',
    },
    body: JSON.stringify({ nameContains: 'color', limit: 999 }),
  });

  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.code, 'search.invalid_limit');
});

test('figma-mcp-search-nodes-route: POST blocks empty remoteAddress without token (fail-closed)', async () => {
  const app = createTestApp({
    getConnInfoFn: () => ({ remote: { address: '' } }),
  });

  const response = await app.request('/api/figma-mcp/search-nodes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nameContains: 'color' }),
  });

  assert.equal(response.status, 403);
  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.code, 'search.forbidden_remote');
});

test('figma-mcp-search-nodes-route: POST returns search error from service', async () => {
  const mockError: SearchFigmaNodesError = {
    ok: false,
    code: 'search.not_connected',
    message: 'MCP client not connected.',
  };

  const app = createTestApp({
    searchFigmaNodesViaMcpFn: async () => mockError,
  });

  const response = await app.request('/api/figma-mcp/search-nodes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-ds-dashboard-internal-token': 'test-token',
    },
    body: JSON.stringify({ nameContains: 'color' }),
  });

  assert.equal(response.status, 500);
  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.code, 'search.not_connected');
});

test('figma-mcp-search-nodes-route: POST respects exactMatch parameter', async () => {
  let capturedOptions: SearchFigmaNodesOptions | null = null;

  const app = createTestApp({
    searchFigmaNodesViaMcpFn: async (options) => {
      capturedOptions = options;
      return {
        ok: true,
        source: 'search_tool',
        nodes: [],
        count: 0,
        truncated: false,
        query: { nameContains: 'color', limit: 20, exactMatch: true },
        elapsedMs: 50,
      };
    },
  });

  const response = await app.request('/api/figma-mcp/search-nodes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-ds-dashboard-internal-token': 'test-token',
    },
    body: JSON.stringify({ nameContains: 'color', exactMatch: true }),
  });

  assert.equal(response.status, 200);
  assert.ok(capturedOptions);
  assert.equal(capturedOptions?.exactMatch, true);
});
