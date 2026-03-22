import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import { DependencyRepository } from '../db/dependency-repository';
import { DependencySyncService } from './dependency-sync-service.js';

describe('DependencySyncService', () => {
  let db: DatabaseType;
  let repository: DependencyRepository;
  let syncService: DependencySyncService;

  test('setup', () => {
    db = new Database(':memory:');

    // Create tables manually for testing
    db.exec(`
      CREATE TABLE ds_consumers (
        id TEXT PRIMARY KEY,
        ds_file_key TEXT NOT NULL,
        consumer_file_key TEXT NOT NULL,
        consumer_name TEXT NOT NULL,
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
    syncService = new DependencySyncService(
      repository,
      () => ({ figmaApiToken: 'test-token' })  // Direct token, not env-ref format
    );
  });

  test('syncConsumers returns empty result for no consumers', async () => {
    const result = await syncService.syncConsumers({
      dsFileKey: 'non-existent-ds',
    });

    assert.strictEqual(result.synced, 0);
    assert.strictEqual(result.skipped, 0);
    assert.strictEqual(result.errored, 0);
    assert.strictEqual(result.runs.length, 0);
    assert.strictEqual(result.dsFileKey, 'non-existent-ds');
  });

  test('syncConsumers filters disabled consumers', async () => {
    // Add a disabled consumer
    repository.addConsumer({
      ds_file_key: 'test-ds',
      consumer_file_key: 'test-consumer',
      consumer_name: 'Test Consumer',
      enabled: false,
    });

    const result = await syncService.syncConsumers({
      dsFileKey: 'test-ds',
    });

    assert.strictEqual(result.synced, 0);
    assert.strictEqual(result.skipped, 0);
    assert.strictEqual(result.errored, 0);
    assert.strictEqual(result.runs.length, 0);
  });

  test('syncConsumers filters by consumerIds', () => {
    // Skip: Requires mocking Figma REST API calls
    // This test would need sinon/mock to stub fetchFigmaFile
  });

  test('syncConsumers counts partial runs as synced (not errored)', async () => {
    const consumer = repository.addConsumer({
      ds_file_key: 'test-ds',
      consumer_file_key: 'test-consumer-partial',
      consumer_name: 'Partial Consumer',
      enabled: true,
    });

    const service = syncService as unknown as {
      buildDsCatalogWithRetry: (dsFileKey: string, token: string) => Promise<unknown>;
      fetchMetadataWithRetry: (fileKey: string, token: string) => Promise<{ name: string; lastModified: string }>;
      syncConsumer: (
        consumer: { id: string; consumer_name: string },
        dsCatalog: unknown,
        token: string,
        force: boolean,
        dsLastModified?: string
      ) => Promise<{
        consumerId: string;
        consumerName: string;
        status: 'ok' | 'error' | 'partial' | 'skipped';
        durationMs: number;
        componentCount: number;
        variableCount: number;
        warningCount: number;
      }>;
    };

    const originalBuildDsCatalogWithRetry = service.buildDsCatalogWithRetry;
    const originalFetchMetadataWithRetry = service.fetchMetadataWithRetry;
    const originalSyncConsumer = service.syncConsumer;

    service.buildDsCatalogWithRetry = async () => ({
      components: new Map(),
      variables: new Map(),
      variableIdToKey: new Map(),
    });
    service.fetchMetadataWithRetry = async () => ({
      name: 'DS',
      lastModified: '2026-03-19T00:00:00.000Z',
    });
    service.syncConsumer = async () => ({
      consumerId: consumer.id,
      consumerName: consumer.consumer_name,
      status: 'partial',
      durationMs: 10,
      componentCount: 1,
      variableCount: 1,
      warningCount: 1,
    });

    try {
      const result = await syncService.syncConsumers({
        dsFileKey: 'test-ds',
      });

      assert.strictEqual(result.synced, 1);
      assert.strictEqual(result.errored, 0);
      assert.strictEqual(result.skipped, 0);
      assert.strictEqual(result.runs[0]?.status, 'partial');
    } finally {
      service.buildDsCatalogWithRetry = originalBuildDsCatalogWithRetry;
      service.fetchMetadataWithRetry = originalFetchMetadataWithRetry;
      service.syncConsumer = originalSyncConsumer;
    }
  });

  test('teardown', () => {
    db.close();
  });
});
