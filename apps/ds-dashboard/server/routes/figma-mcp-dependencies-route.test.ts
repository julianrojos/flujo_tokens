/**
 * Figma MCP Dependencies Route Tests
 */

import assert from 'node:assert/strict';
import { test, describe, beforeEach, afterEach } from 'node:test';
import type { Sql } from 'postgres';
import { Hono } from 'hono';

import { registerFigmaMcpDependenciesRoutes } from './figma-mcp-dependencies-route.js';
import { DependencyRepository } from '../db/dependency-repository.js';
import { DependencySyncService } from '../services/dependency-sync-service.js';
import { DependencyAnalysisService } from '../services/dependency-analysis-service.js';
import { DependencySimulateService } from '../services/dependency-simulate-service.js';
import { createTestDatabase } from '../db/test-db-helpers.js';

describe('figma-mcp-dependencies-route', () => {
  let sql: Sql;
  let cleanup: () => Promise<void>;
  let repository: DependencyRepository;
  let syncService: DependencySyncService;
  let analysisService: DependencyAnalysisService;
  let simulateService: DependencySimulateService;
  let app: Hono;

  beforeEach(async () => {
    ({ sql, cleanup } = await createTestDatabase());

    repository = new DependencyRepository(sql);

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
      db: sql,
      getSystemConfig: (_c: any) => mockSystemConfig(),
      getConnInfoFn: mockGetConnInfo as any,
    });
  });

  afterEach(async () => {
    await cleanup();
  });

  test('POST /api/figma-mcp/dependencies/consumers - valid request', async () => {
    const response = await app.request('/api/figma-mcp/dependencies/consumers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dsFileKey: 'ds123',
        consumerName: 'Test Consumer',
        consumerFileUrl: 'https://www.figma.com/design/consumer456/Test-Consumer',
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
        // Missing dsFileKey and consumerFileUrl
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
    await repository.addConsumer({
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

  test('GET /api/figma-mcp/dependencies/consumers/:consumerId - get single consumer', async () => {
    const consumer = await repository.addConsumer({
      ds_file_key: 'ds123',
      consumer_file_key: 'consumer-single',
      consumer_name: 'Single Consumer',
      enabled: true,
    });

    const response = await app.request(`/api/figma-mcp/dependencies/consumers/${consumer.id}`);

    assert.strictEqual(response.status, 200);
    const body = await response.json();
    assert.strictEqual(body.ok, true);
    assert.ok(body.data);
    assert.strictEqual(body.data.id, consumer.id);
    assert.strictEqual(body.data.consumer_name, 'Single Consumer');
  });

  test('DELETE /api/figma-mcp/dependencies/consumers/:consumerId - remove consumer', async () => {
    // Add a consumer first
    const consumer = await repository.addConsumer({
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

  test('PATCH /api/figma-mcp/dependencies/consumers/:consumerId - update enabled state', async () => {
    const consumer = await repository.addConsumer({
      ds_file_key: 'ds123',
      consumer_file_key: 'consumer-enable',
      consumer_name: 'Enable Toggle',
      enabled: true,
    });

    const response = await app.request(`/api/figma-mcp/dependencies/consumers/${consumer.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: false }),
    });

    assert.strictEqual(response.status, 200);
    const body = await response.json();
    assert.strictEqual(body.ok, true);
    assert.strictEqual(body.data.enabled, false);
  });

  test('PATCH /api/figma-mcp/dependencies/consumers/:consumerId - invalid JSON', async () => {
    const consumer = await repository.addConsumer({
      ds_file_key: 'ds123',
      consumer_file_key: 'consumer-invalid-json',
      consumer_name: 'Invalid JSON',
      enabled: true,
    });

    const response = await app.request(`/api/figma-mcp/dependencies/consumers/${consumer.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: 'invalid json',
    });

    assert.strictEqual(response.status, 400);
    const body = await response.json();
    assert.strictEqual(body.ok, false);
    assert.strictEqual(body.code, 'deps.validation.invalid_json');
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

  test('POST /api/figma-mcp/dependencies/sync - validates non-empty dsFileKey', async () => {
    const response = await app.request('/api/figma-mcp/dependencies/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dsFileKey: '   ',
      }),
    });

    assert.strictEqual(response.status, 400);
    const body = await response.json();
    assert.strictEqual(body.ok, false);
    assert.strictEqual(body.code, 'deps.validation.failed');
    assert.ok(Array.isArray(body.errors));
  });

  test('POST /api/figma-mcp/dependencies/sync - returns no_token when token is unresolved', async () => {
    const appWithoutToken = new Hono();
    registerFigmaMcpDependenciesRoutes(appWithoutToken, {
      readJsonBody: async (c: any) => await c.req.json(),
      db: sql,
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

  test('POST /api/figma-mcp/dependencies/sync - resolves token by dsFileKey when header context token is empty', async () => {
    const appWithDsFileResolver = new Hono();
    registerFigmaMcpDependenciesRoutes(appWithDsFileResolver, {
      readJsonBody: async (c: any) => await c.req.json(),
      db: sql,
      getSystemConfig: (_c: any) => ({ figmaApiToken: '' }),
      getSystemConfigByDsFileKey: (dsFileKey: string) =>
        dsFileKey === 'ds123' ? { figmaApiToken: 'mock-token' } : null,
      getConnInfoFn: (() => ({ remote: { address: '127.0.0.1' } })) as any,
    });

    const response = await appWithDsFileResolver.request('/api/figma-mcp/dependencies/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dsFileKey: 'ds123',
      }),
    });

    assert.strictEqual(response.status, 200);
    const body = await response.json();
    assert.strictEqual(body.ok, true);
    assert.ok(body.data);
    assert.strictEqual(body.data.dsFileKey, 'ds123');
  });

  test('POST /api/figma-mcp/dependencies/sync - returns no_token when dsFileKey resolver returns null and context token is empty', async () => {
    const appWithNullDsFileResolver = new Hono();
    registerFigmaMcpDependenciesRoutes(appWithNullDsFileResolver, {
      readJsonBody: async (c: any) => await c.req.json(),
      db: sql,
      getSystemConfig: (_c: any) => ({ figmaApiToken: '' }),
      getSystemConfigByDsFileKey: () => null,
      getConnInfoFn: (() => ({ remote: { address: '127.0.0.1' } })) as any,
    });

    const response = await appWithNullDsFileResolver.request('/api/figma-mcp/dependencies/sync', {
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

  test('GET /api/figma-mcp/dependencies/report/by-file - supports stale filter', async () => {
    const staleConsumer = await repository.addConsumer({
      ds_file_key: 'ds-stale',
      consumer_file_key: 'consumer-stale',
      consumer_name: 'Stale Consumer',
      enabled: true,
    });
    const freshConsumer = await repository.addConsumer({
      ds_file_key: 'ds-stale',
      consumer_file_key: 'consumer-fresh',
      consumer_name: 'Fresh Consumer',
      enabled: true,
    });

    const staleRun = await repository.saveSyncRun({
      consumer_id: staleConsumer.id,
      duration_ms: 1000,
      status: 'ok',
      component_usage: [],
      variable_usage: [],
      warnings: [],
    });
    await repository.saveSyncRun({
      consumer_id: freshConsumer.id,
      duration_ms: 900,
      status: 'ok',
      component_usage: [],
      variable_usage: [],
      warnings: [],
    });

    // Force first consumer to be stale (>72h)
    await sql`UPDATE ds_sync_runs SET synced_at = ${new Date(Date.now() - 96 * 60 * 60 * 1000).toISOString()} WHERE id = ${staleRun.id}`;

    const response = await app.request('/api/figma-mcp/dependencies/report/by-file?dsFileKey=ds-stale&stale=true');

    assert.strictEqual(response.status, 200);
    const body = await response.json();
    assert.strictEqual(body.ok, true);
    assert.ok(Array.isArray(body.data));
    assert.strictEqual(body.data.length, 1);
    assert.strictEqual(body.data[0].consumerId, staleConsumer.id);
  });

  test('GET /api/figma-mcp/dependencies/report/by-file - stale filter boundary at 72h', async () => {
    const nearThresholdConsumer = await repository.addConsumer({
      ds_file_key: 'ds-stale-boundary',
      consumer_file_key: 'consumer-71h',
      consumer_name: 'Near Threshold Consumer',
      enabled: true,
    });
    const pastThresholdConsumer = await repository.addConsumer({
      ds_file_key: 'ds-stale-boundary',
      consumer_file_key: 'consumer-73h',
      consumer_name: 'Past Threshold Consumer',
      enabled: true,
    });

    const nearThresholdRun = await repository.saveSyncRun({
      consumer_id: nearThresholdConsumer.id,
      duration_ms: 1000,
      status: 'ok',
      component_usage: [],
      variable_usage: [],
      warnings: [],
    });
    const pastThresholdRun = await repository.saveSyncRun({
      consumer_id: pastThresholdConsumer.id,
      duration_ms: 1000,
      status: 'ok',
      component_usage: [],
      variable_usage: [],
      warnings: [],
    });

    // Stale threshold is 72h: 71h should be excluded, 73h should be included.
    await sql`UPDATE ds_sync_runs SET synced_at = ${new Date(Date.now() - 71 * 60 * 60 * 1000).toISOString()} WHERE id = ${nearThresholdRun.id}`;
    await sql`UPDATE ds_sync_runs SET synced_at = ${new Date(Date.now() - 73 * 60 * 60 * 1000).toISOString()} WHERE id = ${pastThresholdRun.id}`;

    const response = await app.request('/api/figma-mcp/dependencies/report/by-file?dsFileKey=ds-stale-boundary&stale=true');

    assert.strictEqual(response.status, 200);
    const body = await response.json();
    assert.strictEqual(body.ok, true);
    assert.ok(Array.isArray(body.data));
    assert.strictEqual(body.data.length, 1);
    assert.strictEqual(body.data[0].consumerId, pastThresholdConsumer.id);
  });

  test('GET /api/figma-mcp/dependencies/report/by-file - ignores legacy staleHours query param', async () => {
    const staleConsumer = await repository.addConsumer({
      ds_file_key: 'ds-stale-legacy-param',
      consumer_file_key: 'consumer-stale-legacy',
      consumer_name: 'Legacy Param Consumer',
      enabled: true,
    });

    const staleRun = await repository.saveSyncRun({
      consumer_id: staleConsumer.id,
      duration_ms: 1000,
      status: 'ok',
      component_usage: [],
      variable_usage: [],
      warnings: [],
    });

    await sql`UPDATE ds_sync_runs SET synced_at = ${new Date(Date.now() - 96 * 60 * 60 * 1000).toISOString()} WHERE id = ${staleRun.id}`;

    const response = await app.request('/api/figma-mcp/dependencies/report/by-file?dsFileKey=ds-stale-legacy-param&stale=true&staleHours=12abc');

    assert.strictEqual(response.status, 200);
    const body = await response.json();
    assert.strictEqual(body.ok, true);
    assert.ok(Array.isArray(body.data));
    assert.strictEqual(body.data.length, 1);
    assert.strictEqual(body.data[0].consumerId, staleConsumer.id);
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

  test('GET /api/figma-mcp/dependencies/consumers/:id/runs - list sync runs', async () => {
    // Add a consumer first
    const consumer = await repository.addConsumer({
      ds_file_key: 'ds123',
      consumer_file_key: 'consumer456',
      consumer_name: 'Test Consumer',
      enabled: true,
    });

    // Add some sync runs
    await repository.saveSyncRun({
      consumer_id: consumer.id,
      duration_ms: 1000,
      status: 'ok',
      component_usage: [],
      variable_usage: [],
      warnings: [],
    });

    // Small delay to ensure different timestamps
    const start = Date.now();
    while (Date.now() - start < 2) { /* wait */ }

    await repository.saveSyncRun({
      consumer_id: consumer.id,
      duration_ms: 1500,
      status: 'partial',
      component_usage: [],
      variable_usage: [],
      warnings: [],
    });

    const response = await app.request(`/api/figma-mcp/dependencies/consumers/${consumer.id}/runs`);

    assert.strictEqual(response.status, 200);
    const body = await response.json();
    assert.strictEqual(body.ok, true);
    assert.ok(Array.isArray(body.data));
    assert.strictEqual(body.data.length, 2);
    // Should be ordered by synced_at DESC
    assert.strictEqual(body.data[0].duration_ms, 1500);
    assert.strictEqual(body.data[0].status, 'partial');
  });

  test('GET /api/figma-mcp/dependencies/consumers/:id/runs - with limit', async () => {
    const consumer = await repository.addConsumer({
      ds_file_key: 'ds123',
      consumer_file_key: 'consumer456',
      consumer_name: 'Test Consumer',
      enabled: true,
    });

    // Add 5 sync runs
    for (let i = 0; i < 5; i++) {
      await repository.saveSyncRun({
        consumer_id: consumer.id,
        duration_ms: 1000 + i * 100,
        status: 'ok',
        component_usage: [],
        variable_usage: [],
        warnings: [],
      });
      if (i < 4) {
        const start = Date.now();
        while (Date.now() - start < 1) { /* wait */ }
      }
    }

    const response = await app.request(`/api/figma-mcp/dependencies/consumers/${consumer.id}/runs?limit=3`);

    assert.strictEqual(response.status, 200);
    const body = await response.json();
    assert.strictEqual(body.ok, true);
    assert.strictEqual(body.data.length, 3);
  });

  test('GET /api/figma-mcp/dependencies/consumers/:id/runs - consumer not found', async () => {
    const response = await app.request('/api/figma-mcp/dependencies/consumers/non-existent-id/runs');

    assert.strictEqual(response.status, 404);
    const body = await response.json();
    assert.strictEqual(body.ok, false);
    assert.strictEqual(body.code, 'deps.consumer.not_found');
  });

  test('GET /api/figma-mcp/dependencies/consumers/:id/runs - invalid limit', async () => {
    const consumer = await repository.addConsumer({
      ds_file_key: 'ds123',
      consumer_file_key: 'consumer456',
      consumer_name: 'Test Consumer',
      enabled: true,
    });

    const response = await app.request(`/api/figma-mcp/dependencies/consumers/${consumer.id}/runs?limit=0`);

    assert.strictEqual(response.status, 400);
    const body = await response.json();
    assert.strictEqual(body.ok, false);
    assert.strictEqual(body.code, 'deps.validation.invalid_limit');
  });

  test('POST /api/figma-mcp/dependencies/consumers - accepts minimal payload without legacy fields', async () => {
    const response = await app.request('/api/figma-mcp/dependencies/consumers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dsFileKey: 'ds-minimal',
        consumerName: 'Minimal Consumer',
        consumerFileUrl: 'https://www.figma.com/design/min-consumer/Minimal',
      }),
    });

    assert.strictEqual(response.status, 200);
    const body = await response.json();
    assert.strictEqual(body.ok, true);
    assert.ok(body.data);
    assert.strictEqual(body.data.consumer_name, 'Minimal Consumer');
    // Verify legacy fields are not present in response
    assert.ok(!('sync_interval_hours' in body.data));
    assert.ok(!('max_stale_hours' in body.data));
  });

  test('POST /api/figma-mcp/dependencies/consumers - ignores legacy fields if sent by old client', async () => {
    const response = await app.request('/api/figma-mcp/dependencies/consumers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dsFileKey: 'ds-legacy-fields',
        consumerName: 'Legacy Fields Consumer',
        consumerFileUrl: 'https://www.figma.com/design/legacy-consumer/Legacy',
        syncIntervalHours: 48,
        maxStaleHours: 96,
      }),
    });

    // Should not fail validation - fields are simply ignored
    assert.strictEqual(response.status, 200);
    const body = await response.json();
    assert.strictEqual(body.ok, true);
    assert.strictEqual(body.data.consumer_name, 'Legacy Fields Consumer');
  });
});
