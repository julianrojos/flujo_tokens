/**
 * Pending Operations Service Tests
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import type { Sql } from 'postgres';

import { PendingOperationsRepository } from '../db/pending-operations-repository.js';
import { reconcileDeleteDesignSystemOps } from './pending-operations-service.js';
import { createTestDatabase } from '../db/test-db-helpers.js';
import { DependencyRepository } from '../db/dependency-repository.js';

interface TestContext {
  sql: Sql;
  cleanup: () => Promise<void>;
  pendingOpsRepo: PendingOperationsRepository;
  config: { systems: Array<{ id: string; name: string; figmaFileId: string }>; defaultSystem: string };
  designSystemRepository: {
    getConfig(): Promise<{ systems: Array<{ id: string; name: string; figmaFileId: string }>; defaultSystem: string }>;
    delete(id: string): Promise<boolean>;
    setDefaultSystemId(id: string | null): Promise<void>;
  };
}

async function createTestContext(): Promise<TestContext> {
  const { sql, cleanup } = await createTestDatabase();
  const config = {
    systems: [
      { id: 'test-ds', name: 'Test DS', figmaFileId: 'figma123' },
    ],
    defaultSystem: 'test-ds',
  };

  return {
    sql,
    cleanup,
    pendingOpsRepo: new PendingOperationsRepository(sql),
    config,
    designSystemRepository: {
      getConfig: async () => ({ ...config, systems: [...config.systems] }),
      delete: async (id) => {
        const before = config.systems.length;
        config.systems = config.systems.filter((system) => system.id !== id);
        return config.systems.length < before;
      },
      setDefaultSystemId: async (id) => {
        config.defaultSystem = id ?? '';
      },
    },
  };
}

test('reconcileDeleteDesignSystemOps: Y+N (consumers gone, config intact) → complete', async () => {
  const ctx = await createTestContext();
  try {
    // Setup: Add consumer then delete it (simulating crash after cascade)
    const depRepo = new DependencyRepository(ctx.sql);
    await depRepo.addConsumer({
      ds_file_key: 'figma123',
      consumer_file_key: 'consumer-1',
      consumer_name: 'Consumer One',
    });
    await depRepo.removeAllByDsFileKey('figma123');

    // Insert pending op
    await ctx.pendingOpsRepo.insert({
      id: 'op-1',
      type: 'delete_design_system',
      payload: { systemId: 'test-ds', figmaFileId: 'figma123' },
    });

    // Reconcile
    const result = await reconcileDeleteDesignSystemOps({
      sql: ctx.sql,
      pendingOpsRepo: ctx.pendingOpsRepo,
      designSystemRepository: ctx.designSystemRepository,
    });

    assert.equal(result.errors.length, 0);
    assert.equal(result.abandoned.length, 0);
    assert.equal(result.completed.length, 1);
    assert.equal(result.completed[0], 'op-1');

    // Config should no longer have the DS
    assert.equal(ctx.config.systems.length, 0);
  } finally {
    await ctx.cleanup();
  }
});

test('reconcileDeleteDesignSystemOps: Y+Y (nothing done) → abandon', async () => {
  const ctx = await createTestContext();
  try {
    // Setup: Add consumer (simulating crash pre-FS)
    const depRepo = new DependencyRepository(ctx.sql);
    await depRepo.addConsumer({
      ds_file_key: 'figma123',
      consumer_file_key: 'consumer-1',
      consumer_name: 'Consumer One',
    });

    // Insert pending op
    await ctx.pendingOpsRepo.insert({
      id: 'op-1',
      type: 'delete_design_system',
      payload: { systemId: 'test-ds', figmaFileId: 'figma123' },
    });

    // Reconcile
    const result = await reconcileDeleteDesignSystemOps({
      sql: ctx.sql,
      pendingOpsRepo: ctx.pendingOpsRepo,
      designSystemRepository: ctx.designSystemRepository,
    });

    assert.equal(result.errors.length, 0);
    assert.equal(result.completed.length, 0);
    assert.equal(result.abandoned.length, 1);
    assert.equal(result.abandoned[0], 'op-1');

    // Config should still have the DS
    assert.equal(ctx.config.systems.length, 1);
  } finally {
    await ctx.cleanup();
  }
});

test('reconcileDeleteDesignSystemOps: N+Y (config clean, consumers remain) → complete', async () => {
  const ctx = await createTestContext();
  try {
    // Setup: Remove DS from config but add consumer (simulating crash between config save and cascade)
    ctx.config.systems = [];

    const depRepo = new DependencyRepository(ctx.sql);
    await depRepo.addConsumer({
      ds_file_key: 'figma123',
      consumer_file_key: 'consumer-1',
      consumer_name: 'Consumer One',
    });

    // Insert pending op
    await ctx.pendingOpsRepo.insert({
      id: 'op-1',
      type: 'delete_design_system',
      payload: { systemId: 'test-ds', figmaFileId: 'figma123' },
    });

    // Reconcile
    const result = await reconcileDeleteDesignSystemOps({
      sql: ctx.sql,
      pendingOpsRepo: ctx.pendingOpsRepo,
      designSystemRepository: ctx.designSystemRepository,
    });

    assert.equal(result.errors.length, 0);
    assert.equal(result.abandoned.length, 0);
    assert.equal(result.completed.length, 1);

    // Consumers should be deleted
    const remaining = await depRepo.listConsumers('figma123');
    assert.equal(remaining.length, 0);
  } finally {
    await ctx.cleanup();
  }
});

test('reconcileDeleteDesignSystemOps: N+N (already complete) → complete', async () => {
  const ctx = await createTestContext();
  try {
    // Setup: Remove DS from config and no consumers
    ctx.config.systems = [];

    // Insert pending op
    await ctx.pendingOpsRepo.insert({
      id: 'op-1',
      type: 'delete_design_system',
      payload: { systemId: 'test-ds', figmaFileId: 'figma123' },
    });

    // Reconcile
    const result = await reconcileDeleteDesignSystemOps({
      sql: ctx.sql,
      pendingOpsRepo: ctx.pendingOpsRepo,
      designSystemRepository: ctx.designSystemRepository,
    });

    assert.equal(result.errors.length, 0);
    assert.equal(result.abandoned.length, 0);
    assert.equal(result.completed.length, 1);
  } finally {
    await ctx.cleanup();
  }
});

test('reconcileDeleteDesignSystemOps: uses injected dependency repo when provided', async () => {
  const ctx = await createTestContext();
  try {
    await ctx.pendingOpsRepo.insert({
      id: 'op-1',
      type: 'delete_design_system',
      payload: { systemId: 'test-ds', figmaFileId: 'figma123' },
    });

    let removeCalled = false;
    const injectedDependencyRepo = {
      listConsumers: async (_dsFileKey: string) => [],
      removeAllByDsFileKey: async (_dsFileKey: string) => {
        removeCalled = true;
        return { deletedConsumerCount: 0, deletedConsumerIds: [] };
      },
    };

    const result = await reconcileDeleteDesignSystemOps({
      sql: ctx.sql,
      pendingOpsRepo: ctx.pendingOpsRepo,
      designSystemRepository: ctx.designSystemRepository,
      dependencyRepo: injectedDependencyRepo,
    });

    assert.equal(result.errors.length, 0);
    assert.equal(result.completed.length, 1);
    assert.equal(result.abandoned.length, 0);
    assert.equal(removeCalled, false);
  } finally {
    await ctx.cleanup();
  }
});

test('reconcileDeleteDesignSystemOps: malformed payload → abandon', async () => {
  const ctx = await createTestContext();
  try {
    // Insert pending op with invalid JSON payload (direct SQL)
    await ctx.sql`
      INSERT INTO pending_operations (id, type, payload, status)
      VALUES ('op-bad', 'delete_design_system', 'not-valid-json', 'in_progress')
    `;

    // Reconcile
    const result = await reconcileDeleteDesignSystemOps({
      sql: ctx.sql,
      pendingOpsRepo: ctx.pendingOpsRepo,
      designSystemRepository: ctx.designSystemRepository,
    });

    assert.equal(result.errors.length, 0);
    assert.equal(result.abandoned.length, 1);
    assert.equal(result.completed.length, 0);
  } finally {
    await ctx.cleanup();
  }
});

test('reconcileDeleteDesignSystemOps: empty figmaFileId → abandon', async () => {
  const ctx = await createTestContext();
  try {
    // Insert pending op with empty figmaFileId
    await ctx.pendingOpsRepo.insert({
      id: 'op-empty',
      type: 'delete_design_system',
      payload: { systemId: 'test-ds', figmaFileId: '' },
    });

    // Reconcile
    const result = await reconcileDeleteDesignSystemOps({
      sql: ctx.sql,
      pendingOpsRepo: ctx.pendingOpsRepo,
      designSystemRepository: ctx.designSystemRepository,
    });

    assert.equal(result.abandoned.length, 1);
    assert.equal(result.completed.length, 0);
  } finally {
    await ctx.cleanup();
  }
});

test('reconcileDeleteDesignSystemOps: error in repository delete → push to errors, continue', async () => {
  const ctx = await createTestContext();
  try {
    // Setup: consumers deleted (Y+N case)
    const depRepo = new DependencyRepository(ctx.sql);
    await depRepo.addConsumer({
      ds_file_key: 'figma123',
      consumer_file_key: 'consumer-1',
      consumer_name: 'Consumer One',
    });
    await depRepo.removeAllByDsFileKey('figma123');

    // Insert pending op
    await ctx.pendingOpsRepo.insert({
      id: 'op-1',
      type: 'delete_design_system',
      payload: { systemId: 'test-ds', figmaFileId: 'figma123' },
    });

    // Mock delete to throw
    const erroringRepo: typeof ctx.designSystemRepository = {
      getConfig: ctx.designSystemRepository.getConfig,
      delete: async () => {
        throw new Error('delete failed');
      },
      setDefaultSystemId: async () => {},
    };

    // Reconcile
    const result = await reconcileDeleteDesignSystemOps({
      sql: ctx.sql,
      pendingOpsRepo: ctx.pendingOpsRepo,
      designSystemRepository: erroringRepo,
    });

    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0].id, 'op-1');
    assert.ok(result.errors[0].error.includes('delete failed'));
  } finally {
    await ctx.cleanup();
  }
});

test('reconcileDeleteDesignSystemOps: error in cascade delete → push to errors and keep op in_progress', async () => {
  const ctx = await createTestContext();
  try {
    // Setup N+Y state: config already clean, but consumers still present in DB.
    ctx.config.systems = [];

    const depRepo = new DependencyRepository(ctx.sql);
    const consumer = await depRepo.addConsumer({
      ds_file_key: 'figma123',
      consumer_file_key: 'consumer-1',
      consumer_name: 'Consumer One',
    });

    await depRepo.saveSyncRun({
      consumer_id: consumer.id,
      duration_ms: 100,
      status: 'ok',
      component_usage: [],
      variable_usage: [],
      warnings: [],
    });

    await ctx.pendingOpsRepo.insert({
      id: 'op-1',
      type: 'delete_design_system',
      payload: { systemId: 'test-ds', figmaFileId: 'figma123' },
    });

    // Create a PG trigger to force an error on ds_sync_runs DELETE
    await ctx.sql.unsafe(`
      CREATE OR REPLACE FUNCTION force_reconcile_cascade_error()
      RETURNS TRIGGER LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'forced reconcile cascade failure';
      END;
      $$;
      CREATE TRIGGER ds_sync_runs_force_abort
      BEFORE DELETE ON ds_sync_runs
      FOR EACH ROW EXECUTE FUNCTION force_reconcile_cascade_error();
    `);

    try {
      const result = await reconcileDeleteDesignSystemOps({
        sql: ctx.sql,
        pendingOpsRepo: ctx.pendingOpsRepo,
        designSystemRepository: ctx.designSystemRepository,
      });

      assert.equal(result.completed.length, 0);
      assert.equal(result.abandoned.length, 0);
      assert.equal(result.errors.length, 1);
      assert.equal(result.errors[0].id, 'op-1');
      assert.ok(result.errors[0].error.includes('forced reconcile cascade failure'));

      const remainingOps = await ctx.pendingOpsRepo.listIncomplete('delete_design_system');
      assert.equal(remainingOps.length, 1);
      assert.equal(remainingOps[0].id, 'op-1');

      const remainingConsumers = await depRepo.listConsumers('figma123');
      assert.equal(remainingConsumers.length, 1);
    } finally {
      await ctx.sql.unsafe(`
        DROP TRIGGER IF EXISTS ds_sync_runs_force_abort ON ds_sync_runs;
        DROP FUNCTION IF EXISTS force_reconcile_cascade_error();
      `);
    }
  } finally {
    await ctx.cleanup();
  }
});
