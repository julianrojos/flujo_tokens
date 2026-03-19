/**
 * Figma MCP Dependencies Route Tests
 */

import assert from 'node:assert/strict';
import { test, describe, beforeEach, afterEach } from 'node:test';
import Database from 'better-sqlite3';
import { Hono } from 'hono';

import { registerFigmaMcpDependenciesRoutes } from './figma-mcp-dependencies-route.ts';
import { DependencyRepository } from '../db/dependency-repository.js';
import { DependencySyncService } from '../services/dependency-sync-service.js';
import { DependencyAnalysisService } from '../services/dependency-analysis-service.js';
import { DependencySimulateService } from '../services/dependency-simulate-service.js';

describe('figma-mcp-dependencies-route', () => {
  let db: Database.Database;
  let repository: DependencyRepository;
  let syncService: DependencySyncService;
  let analysisService: DependencyAnalysisService;
  let simulateService: DependencySimulateService;
  let app: Hono;

  beforeEach(() => {
    db = new Database(':memory:');

    // Apply migrations to create tables
    db.exec(`
      CREATE TABLE ds_consumers (
        id TEXT PRIMARY KEY,
        ds_file_key TEXT NOT NULL,
        consumer_file_key TEXT NOT NULL,
        consumer_name TEXT NOT NULL,
        sync_interval_hours INTEGER NOT NULL DEFAULT 24,
        max_stale_hours INTEGER NOT NULL DEFAULT 72,
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        UNIQUE (ds_file_key, consumer_file_key)
      );

      CREATE TABLE ds_sync_runs (
        id TEXT PRIMARY KEY,
        consumer_id TEXT NOT NULL,
        synced_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        duration_ms INTEGER NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('ok', 'error', 'partial', 'skipped')),
        error_message TEXT,
        ds_last_modified TEXT,
        consumer_last_modified TEXT,
        component_count INTEGER NOT NULL DEFAULT 0,
        variable_count INTEGER NOT NULL DEFAULT 0,
        warning_count INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (consumer_id) REFERENCES ds_consumers(id) ON DELETE CASCADE
      );

      CREATE TABLE ds_component_usage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL,
        component_key TEXT NOT NULL,
        component_name TEXT NOT NULL,
        instance_count INTEGER NOT NULL,
        sample_node_ids_json TEXT,
        FOREIGN KEY (run_id) REFERENCES ds_sync_runs(id) ON DELETE CASCADE
      );

      CREATE TABLE ds_variable_usage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL,
        variable_key TEXT NOT NULL,
        variable_name TEXT NOT NULL,
        variable_type TEXT NOT NULL,
        node_count INTEGER NOT NULL,
        sample_node_ids_json TEXT,
        FOREIGN KEY (run_id) REFERENCES ds_sync_runs(id) ON DELETE CASCADE
      );

      CREATE TABLE ds_sync_warnings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL,
        code TEXT NOT NULL,
        message TEXT NOT NULL,
        node_id TEXT,
        FOREIGN KEY (run_id) REFERENCES ds_sync_runs(id) ON DELETE CASCADE
      );
    `);

    repository = new DependencyRepository(db);

    // Mock system config
    const mockSystemConfig = () => ({
      figmaApiToken: 'mock-token',
    });

    // Mock getConnInfo to return loopback address for authorization
    const mockGetConnInfo = () => ({
      remote: {
        address: '127.0.0.1',
      },
    });

    syncService = new DependencySyncService(repository, mockSystemConfig);
    analysisService = new DependencyAnalysisService(repository);
    simulateService = new DependencySimulateService(repository);

    app = new Hono();
    registerFigmaMcpDependenciesRoutes(app, {
      readJsonBody: async (c: any) => await c.req.json(),
      db,
      getSystemConfig: (_c: any) => mockSystemConfig(),
      getConnInfoFn: mockGetConnInfo as any,
    });
  });

  afterEach(() => {
    db.close();
  });

  test('POST /api/figma-mcp/dependencies/consumers - valid request', async () => {
    const response = await app.request('/api/figma-mcp/dependencies/consumers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dsFileKey: 'ds123',
        consumerName: 'Test Consumer',
        consumerFileKey: 'consumer456',
      }),
    });

    assert.strictEqual(response.status, 200);
    const body = await response.json();
    assert.strictEqual(body.ok, true);
    assert.ok(body.data);
    assert.strictEqual(body.data.consumer_name, 'Test Consumer');
  });

  test('POST /api/figma-mcp/dependencies/consumers - missing required fields', async () => {
    const response = await app.request('/api/figma-mcp/dependencies/consumers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        consumerName: 'Test Consumer',
        // Missing dsFileKey and consumerFileKey
      }),
    });

    assert.strictEqual(response.status, 400);
    const body = await response.json();
    assert.strictEqual(body.ok, false);
    assert.ok(body.code);
    assert.ok(body.message);
    assert.ok(Array.isArray(body.errors));
  });

  test('GET /api/figma-mcp/dependencies/consumers - list consumers', async () => {
    // Add a consumer first
    repository.addConsumer({
      ds_file_key: 'ds123',
      consumer_file_key: 'consumer456',
      consumer_name: 'Test Consumer',
      enabled: true,
    });

    const response = await app.request('/api/figma-mcp/dependencies/consumers?dsFileKey=ds123');

    assert.strictEqual(response.status, 200);
    const body = await response.json();
    assert.strictEqual(body.ok, true);
    assert.ok(Array.isArray(body.data));
    assert.strictEqual(body.data.length, 1);
  });

  test('DELETE /api/figma-mcp/dependencies/consumers/:consumerId - remove consumer', async () => {
    // Add a consumer first
    const consumer = repository.addConsumer({
      ds_file_key: 'ds123',
      consumer_file_key: 'consumer456',
      consumer_name: 'Test Consumer',
      enabled: true,
    });

    const response = await app.request(`/api/figma-mcp/dependencies/consumers/${consumer.id}`, {
      method: 'DELETE',
    });

    assert.strictEqual(response.status, 200);
    const body = await response.json();
    assert.strictEqual(body.ok, true);
    assert.strictEqual(body.data.consumerId, consumer.id);
  });

  test('POST /api/figma-mcp/dependencies/sync - trigger sync', async () => {
    const response = await app.request('/api/figma-mcp/dependencies/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dsFileKey: 'ds123',
      }),
    });

    // Sync returns successfully with empty result (no consumers registered)
    assert.strictEqual(response.status, 200);
    const body = await response.json();
    assert.strictEqual(body.ok, true);
    assert.ok(body.data);
    assert.strictEqual(body.data.synced, 0);
    assert.strictEqual(body.data.skipped, 0);
    assert.strictEqual(body.data.errored, 0);
  });

  test('POST /api/figma-mcp/dependencies/sync - returns no_token when token is unresolved', async () => {
    const appWithoutToken = new Hono();
    registerFigmaMcpDependenciesRoutes(appWithoutToken, {
      readJsonBody: async (c: any) => await c.req.json(),
      db,
      getSystemConfig: (_c: any) => ({ figmaApiToken: '${FIGMA_TOKEN_MISSING_FOR_TEST}' }),
      getConnInfoFn: (() => ({ remote: { address: '127.0.0.1' } })) as any,
    });

    const response = await appWithoutToken.request('/api/figma-mcp/dependencies/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dsFileKey: 'ds123',
      }),
    });

    assert.strictEqual(response.status, 500);
    const body = await response.json();
    assert.strictEqual(body.ok, false);
    assert.strictEqual(body.code, 'deps.sync.no_token');
  });

  test('GET /api/figma-mcp/dependencies/report/by-file - file report', async () => {
    const response = await app.request('/api/figma-mcp/dependencies/report/by-file?dsFileKey=ds123');

    assert.strictEqual(response.status, 200);
    const body = await response.json();
    assert.strictEqual(body.ok, true);
    assert.ok(Array.isArray(body.data));
  });

  test('GET /api/figma-mcp/dependencies/report/by-component - component report', async () => {
    const response = await app.request('/api/figma-mcp/dependencies/report/by-component?dsFileKey=ds123&componentKey=button');

    assert.strictEqual(response.status, 200);
    const body = await response.json();
    assert.strictEqual(body.ok, true);
    assert.ok(Array.isArray(body.data));
  });

  test('GET /api/figma-mcp/dependencies/report/by-variable - variable report', async () => {
    const response = await app.request('/api/figma-mcp/dependencies/report/by-variable?dsFileKey=ds123&variableKey=color-primary');

    assert.strictEqual(response.status, 200);
    const body = await response.json();
    assert.strictEqual(body.ok, true);
    assert.ok(Array.isArray(body.data));
  });

  test('POST /api/figma-mcp/dependencies/simulate-change - simulate change', async () => {
    const response = await app.request('/api/figma-mcp/dependencies/simulate-change', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dsFileKey: 'ds123',
        variableKey: 'color-primary',
        proposedValue: '#ff0000',
      }),
    });

    assert.strictEqual(response.status, 200);
    const body = await response.json();
    assert.strictEqual(body.ok, true);
    assert.ok(body.data);
    assert.ok(body.data.totalNodes !== undefined);
    assert.ok(body.data.impactLevel !== undefined);
    assert.ok(Array.isArray(body.data.affectedConsumers));
  });

  test('Invalid JSON body - returns validation error', async () => {
    const response = await app.request('/api/figma-mcp/dependencies/consumers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'invalid json',
    });

    assert.strictEqual(response.status, 400);
    const body = await response.json();
    assert.strictEqual(body.ok, false);
    assert.strictEqual(body.code, 'deps.validation.invalid_json');
  });

  test('Missing dsFileKey in query - returns validation error', async () => {
    const response = await app.request('/api/figma-mcp/dependencies/consumers');

    assert.strictEqual(response.status, 400);
    const body = await response.json();
    assert.strictEqual(body.ok, false);
    assert.ok(body.errors);
    assert.ok(body.errors.some((e: string) => e.includes('DS file key')));
  });
});
