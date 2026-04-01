/**
 * Pending Operations Service Tests
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import Database from 'better-sqlite3';

import { PendingOperationsRepository } from '../db/pending-operations-repository.js';
import { reconcileDeleteDesignSystemOps } from './pending-operations-service.js';
import { bootstrapDatabase } from '../db/db-service.js';
import { DependencyRepository } from '../db/dependency-repository.js';

interface TestContext {
  db: Database.Database;
  pendingOpsRepo: PendingOperationsRepository;
  config: { systems: Array<{ id: string; name: string; figmaFileId: string }>; defaultSystem: string };
  designSystemRepository: {
    getConfig(): { systems: Array<{ id: string; name: string; figmaFileId: string }>; defaultSystem: string };
    delete(id: string): boolean;
    setDefaultSystemId(id: string | null): void;
  };
}

function createTestContext(): TestContext {
  const db = bootstrapDatabase({ dbPath: ':memory:' });
  const config = {
    systems: [
      { id: 'test-ds', name: 'Test DS', figmaFileId: 'figma123' },
    ],
    defaultSystem: 'test-ds',
  };

  return {
    db,
    pendingOpsRepo: new PendingOperationsRepository(db),
    config,
    designSystemRepository: {
      getConfig: () => ({ ...config }),
      delete: (id) => {
        const before = config.systems.length;
        config.systems = config.systems.filter((system) => system.id !== id);
        return config.systems.length < before;
      },
      setDefaultSystemId: (id) => {
        config.defaultSystem = id ?? '';
      },
    },
  };
}

test('reconcileDeleteDesignSystemOps: Y+N (consumers gone, config intact) → complete', () => {
  const ctx = createTestContext();
  try {
    // Setup: Add consumer then delete it (simulating crash after cascade)
    const depRepo = new DependencyRepository(ctx.db);
    depRepo.addConsumer({
      ds_file_key: 'figma123',
      consumer_file_key: 'consumer-1',
      consumer_name: 'Consumer One',
    });
    depRepo.removeAllByDsFileKey('figma123');

    // Insert pending op
    ctx.pendingOpsRepo.insert({
      id: 'op-1',
      type: 'delete_design_system',
      payload: { systemId: 'test-ds', figmaFileId: 'figma123' },
    });

    // Reconcile
    const result = reconcileDeleteDesignSystemOps({
      db: ctx.db,
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
    ctx.db.close();
  }
});

test('reconcileDeleteDesignSystemOps: Y+Y (nothing done) → abandon', () => {
  const ctx = createTestContext();
  try {
    // Setup: Add consumer (simulating crash pre-FS)
    const depRepo = new DependencyRepository(ctx.db);
    depRepo.addConsumer({
      ds_file_key: 'figma123',
      consumer_file_key: 'consumer-1',
      consumer_name: 'Consumer One',
    });

    // Insert pending op
    ctx.pendingOpsRepo.insert({
      id: 'op-1',
      type: 'delete_design_system',
      payload: { systemId: 'test-ds', figmaFileId: 'figma123' },
    });

    // Reconcile
    const result = reconcileDeleteDesignSystemOps({
      db: ctx.db,
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
    ctx.db.close();
  }
});

test('reconcileDeleteDesignSystemOps: N+Y (config clean, consumers remain) → complete', () => {
  const ctx = createTestContext();
  try {
    // Setup: Remove DS from config but add consumer (simulating crash between config save and cascade)
    ctx.config.systems = [];

    const depRepo = new DependencyRepository(ctx.db);
    depRepo.addConsumer({
      ds_file_key: 'figma123',
      consumer_file_key: 'consumer-1',
      consumer_name: 'Consumer One',
    });

    // Insert pending op
    ctx.pendingOpsRepo.insert({
      id: 'op-1',
      type: 'delete_design_system',
      payload: { systemId: 'test-ds', figmaFileId: 'figma123' },
    });

    // Reconcile
    const result = reconcileDeleteDesignSystemOps({
      db: ctx.db,
      pendingOpsRepo: ctx.pendingOpsRepo,
      designSystemRepository: ctx.designSystemRepository,
    });

    assert.equal(result.errors.length, 0);
    assert.equal(result.abandoned.length, 0);
    assert.equal(result.completed.length, 1);

    // Consumers should be deleted
    const remaining = depRepo.listConsumers('figma123');
    assert.equal(remaining.length, 0);
  } finally {
    ctx.db.close();
  }
});

test('reconcileDeleteDesignSystemOps: N+N (already complete) → complete', () => {
  const ctx = createTestContext();
  try {
    // Setup: Remove DS from config and no consumers
    ctx.config.systems = [];

    // Insert pending op
    ctx.pendingOpsRepo.insert({
      id: 'op-1',
      type: 'delete_design_system',
      payload: { systemId: 'test-ds', figmaFileId: 'figma123' },
    });

    // Reconcile
    const result = reconcileDeleteDesignSystemOps({
      db: ctx.db,
      pendingOpsRepo: ctx.pendingOpsRepo,
      designSystemRepository: ctx.designSystemRepository,
    });

    assert.equal(result.errors.length, 0);
    assert.equal(result.abandoned.length, 0);
    assert.equal(result.completed.length, 1);
  } finally {
    ctx.db.close();
  }
});

test('reconcileDeleteDesignSystemOps: uses injected dependency repo when provided', () => {
  const ctx = createTestContext();
  try {
    ctx.pendingOpsRepo.insert({
      id: 'op-1',
      type: 'delete_design_system',
      payload: { systemId: 'test-ds', figmaFileId: 'figma123' },
    });

    let removeCalled = false;
    const injectedDependencyRepo = {
      listConsumers: (_dsFileKey: string) => [],
      removeAllByDsFileKey: (_dsFileKey: string) => {
        removeCalled = true;
        return { deletedConsumerCount: 0, deletedConsumerIds: [] };
      },
    };

    const result = reconcileDeleteDesignSystemOps({
      db: ctx.db,
      pendingOpsRepo: ctx.pendingOpsRepo,
      designSystemRepository: ctx.designSystemRepository,
      dependencyRepo: injectedDependencyRepo,
    });

    assert.equal(result.errors.length, 0);
    assert.equal(result.completed.length, 1);
    assert.equal(result.abandoned.length, 0);
    assert.equal(removeCalled, false);
  } finally {
    ctx.db.close();
  }
});

test('reconcileDeleteDesignSystemOps: malformed payload → abandon', () => {
  const ctx = createTestContext();
  try {
    // Insert pending op with invalid JSON
    ctx.db.prepare(`
      INSERT INTO pending_operations (id, type, payload, status)
      VALUES (?, ?, ?, 'in_progress')
    `).run('op-bad', 'delete_design_system', 'not-valid-json');

    // Reconcile
    const result = reconcileDeleteDesignSystemOps({
      db: ctx.db,
      pendingOpsRepo: ctx.pendingOpsRepo,
      designSystemRepository: ctx.designSystemRepository,
    });

    assert.equal(result.errors.length, 0);
    assert.equal(result.abandoned.length, 1);
    assert.equal(result.completed.length, 0);
  } finally {
    ctx.db.close();
  }
});

test('reconcileDeleteDesignSystemOps: empty figmaFileId → abandon', () => {
  const ctx = createTestContext();
  try {
    // Insert pending op with empty figmaFileId
    ctx.pendingOpsRepo.insert({
      id: 'op-empty',
      type: 'delete_design_system',
      payload: { systemId: 'test-ds', figmaFileId: '' },
    });

    // Reconcile
    const result = reconcileDeleteDesignSystemOps({
      db: ctx.db,
      pendingOpsRepo: ctx.pendingOpsRepo,
      designSystemRepository: ctx.designSystemRepository,
    });

    assert.equal(result.abandoned.length, 1);
    assert.equal(result.completed.length, 0);
  } finally {
    ctx.db.close();
  }
});

test('reconcileDeleteDesignSystemOps: error in repository delete → push to errors, continue', () => {
  const ctx = createTestContext();
  try {
    // Setup: consumers deleted (Y+N case)
    const depRepo = new DependencyRepository(ctx.db);
    depRepo.addConsumer({
      ds_file_key: 'figma123',
      consumer_file_key: 'consumer-1',
      consumer_name: 'Consumer One',
    });
    depRepo.removeAllByDsFileKey('figma123');

    // Insert pending op
    ctx.pendingOpsRepo.insert({
      id: 'op-1',
      type: 'delete_design_system',
      payload: { systemId: 'test-ds', figmaFileId: 'figma123' },
    });

    // Mock delete to throw
    const erroringRepo: TestContext['designSystemRepository'] = {
      getConfig: () => ctx.config,
      delete: () => {
        throw new Error('delete failed');
      },
      setDefaultSystemId: () => {},
    };

    // Reconcile
    const result = reconcileDeleteDesignSystemOps({
      db: ctx.db,
      pendingOpsRepo: ctx.pendingOpsRepo,
      designSystemRepository: erroringRepo,
    });

    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0].id, 'op-1');
    assert.ok(result.errors[0].error.includes('delete failed'));
  } finally {
    ctx.db.close();
  }
});

test('reconcileDeleteDesignSystemOps: error in cascade delete → push to errors and keep op in_progress', () => {
  const ctx = createTestContext();
  try {
    // Setup N+Y state: config already clean, but consumers still present in DB.
    ctx.config.systems = [];

    const depRepo = new DependencyRepository(ctx.db);
    const consumer = depRepo.addConsumer({
      ds_file_key: 'figma123',
      consumer_file_key: 'consumer-1',
      consumer_name: 'Consumer One',
    });

    depRepo.saveSyncRun({
      consumer_id: consumer.id,
      duration_ms: 100,
      status: 'ok',
      component_usage: [],
      variable_usage: [],
      warnings: [],
    });

    ctx.pendingOpsRepo.insert({
      id: 'op-1',
      type: 'delete_design_system',
      payload: { systemId: 'test-ds', figmaFileId: 'figma123' },
    });

    ctx.db.exec(`
      CREATE TRIGGER ds_sync_runs_force_abort
      BEFORE DELETE ON ds_sync_runs
      BEGIN
        SELECT RAISE(ABORT, 'forced reconcile cascade failure');
      END;
    `);

    const result = reconcileDeleteDesignSystemOps({
      db: ctx.db,
      pendingOpsRepo: ctx.pendingOpsRepo,
      designSystemRepository: ctx.designSystemRepository,
    });

    assert.equal(result.completed.length, 0);
    assert.equal(result.abandoned.length, 0);
    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0].id, 'op-1');
    assert.ok(result.errors[0].error.includes('forced reconcile cascade failure'));

    const remainingOps = ctx.pendingOpsRepo.listIncomplete('delete_design_system');
    assert.equal(remainingOps.length, 1);
    assert.equal(remainingOps[0].id, 'op-1');

    const remainingConsumers = depRepo.listConsumers('figma123');
    assert.equal(remainingConsumers.length, 1);
  } finally {
    ctx.db.close();
  }
});
