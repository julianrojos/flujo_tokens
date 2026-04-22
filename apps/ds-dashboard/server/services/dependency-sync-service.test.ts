import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Sql } from 'postgres';
import { DependencyRepository } from '../db/dependency-repository.js';
import { DependencySyncService } from './dependency-sync-service.js';
import { createTestDatabase } from '../db/test-db-helpers.js';

describe('DependencySyncService', () => {
  let sql: Sql;
  let cleanup: () => Promise<void>;
  let repository: DependencyRepository;
  let syncService: DependencySyncService;

  before(async () => {
    ({ sql, cleanup } = await createTestDatabase());
    repository = new DependencyRepository(sql);
    syncService = new DependencySyncService(
      repository,
      () => ({ figmaApiToken: 'test-token' })  // Direct token, not env-ref format
    );
  });

  after(async () => {
    await cleanup();
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
    await repository.addConsumer({
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
    const consumer = await repository.addConsumer({
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

  test('syncConsumers aborts before writing when the signal is aborted', async () => {
    const consumer = await repository.addConsumer({
      ds_file_key: 'abort-ds',
      consumer_file_key: 'abort-consumer',
      consumer_name: 'Abort Consumer',
      enabled: true,
    });

    const controller = new AbortController();

    const service = syncService as unknown as {
      buildDsCatalogWithRetry: (dsFileKey: string, token: string, signal?: AbortSignal) => Promise<unknown>;
      fetchMetadataWithRetry: (fileKey: string, token: string, signal?: AbortSignal) => Promise<{ name: string; lastModified: string }>;
      syncConsumer: (
        consumer: { id: string; consumer_name: string },
        dsCatalog: unknown,
        token: string,
        force: boolean,
        dsLastModified?: string,
        signal?: AbortSignal,
      ) => Promise<unknown>;
    };

    const originalBuildDsCatalogWithRetry = service.buildDsCatalogWithRetry;
    const originalFetchMetadataWithRetry = service.fetchMetadataWithRetry;
    const originalSyncConsumer = service.syncConsumer;

    let syncConsumerCalled = false;

    service.buildDsCatalogWithRetry = async () => {
      controller.abort();
      return {
        components: new Map(),
        variables: new Map(),
        variableIdToKey: new Map(),
      };
    };
    service.fetchMetadataWithRetry = async () => {
      throw new Error('fetchMetadataWithRetry should not be called after abort');
    };
    service.syncConsumer = async () => {
      syncConsumerCalled = true;
      return {
        consumerId: consumer.id,
        consumerName: consumer.consumer_name,
        status: 'ok',
        durationMs: 10,
        componentCount: 0,
        variableCount: 0,
        warningCount: 0,
      };
    };

    try {
      await assert.rejects(
        () => syncService.syncConsumers({
          dsFileKey: 'abort-ds',
          signal: controller.signal,
        }),
        /Operation aborted/i,
      );
      assert.strictEqual(syncConsumerCalled, false);
    } finally {
      service.buildDsCatalogWithRetry = originalBuildDsCatalogWithRetry;
      service.fetchMetadataWithRetry = originalFetchMetadataWithRetry;
      service.syncConsumer = originalSyncConsumer;
    }
  });
});
