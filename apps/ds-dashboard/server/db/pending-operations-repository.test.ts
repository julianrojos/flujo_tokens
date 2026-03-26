/**
 * Pending Operations Repository Tests
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { PendingOperationsRepository } from './pending-operations-repository.js';
import { bootstrapDatabase } from './db-service.js';

function createTestDb() {
  const db = bootstrapDatabase({ dbPath: ':memory:' });
  return db;
}

test('PendingOperationsRepository: insert and listIncomplete', () => {
  const db = createTestDb();
  try {
    const repo = new PendingOperationsRepository(db);

    // Insert two operations
    repo.insert({
      id: 'op-1',
      type: 'delete_design_system',
      payload: { systemId: 'test-ds', figmaFileId: 'figma123' },
    });
    repo.insert({
      id: 'op-2',
      type: 'delete_design_system',
      payload: { systemId: 'test-ds-2', figmaFileId: 'figma456' },
    });

    // List all incomplete
    const ops = repo.listIncomplete();
    assert.equal(ops.length, 2);
    assert.equal(ops[0].id, 'op-1');
    assert.equal(ops[1].id, 'op-2');
    assert.equal(ops[0].status, 'in_progress');

    // Parse payload
    const payload = JSON.parse(ops[0].payload) as { systemId: string; figmaFileId: string };
    assert.equal(payload.systemId, 'test-ds');
    assert.equal(payload.figmaFileId, 'figma123');
  } finally {
    db.close();
  }
});

test('PendingOperationsRepository: complete marks operation as completed', () => {
  const db = createTestDb();
  try {
    const repo = new PendingOperationsRepository(db);

    repo.insert({
      id: 'op-1',
      type: 'delete_design_system',
      payload: { systemId: 'test-ds' },
    });

    repo.complete('op-1');

    const ops = repo.listIncomplete();
    assert.equal(ops.length, 0);

    // Verify status changed
    const row = db.prepare('SELECT status, completed_at FROM pending_operations WHERE id = ?').get('op-1') as {
      status: string;
      completed_at: string;
    };
    assert.equal(row.status, 'completed');
    assert.ok(row.completed_at);
  } finally {
    db.close();
  }
});

test('PendingOperationsRepository: abandon marks operation as abandoned', () => {
  const db = createTestDb();
  try {
    const repo = new PendingOperationsRepository(db);

    repo.insert({
      id: 'op-1',
      type: 'delete_design_system',
      payload: { systemId: 'test-ds' },
    });

    repo.abandon('op-1');

    const ops = repo.listIncomplete();
    assert.equal(ops.length, 0);

    // Verify status changed
    const row = db.prepare('SELECT status, completed_at FROM pending_operations WHERE id = ?').get('op-1') as {
      status: string;
      completed_at: string;
    };
    assert.equal(row.status, 'abandoned');
    assert.ok(row.completed_at);
  } finally {
    db.close();
  }
});

test('PendingOperationsRepository: listIncomplete filters by type', () => {
  const db = createTestDb();
  try {
    const repo = new PendingOperationsRepository(db);

    repo.insert({
      id: 'op-1',
      type: 'delete_design_system',
      payload: { systemId: 'test-ds' },
    });
    repo.insert({
      id: 'op-2',
      type: 'other_type',
      payload: { data: 'test' },
    });

    // Filter by type
    const deleteOps = repo.listIncomplete('delete_design_system');
    assert.equal(deleteOps.length, 1);
    assert.equal(deleteOps[0].id, 'op-1');

    const otherOps = repo.listIncomplete('other_type');
    assert.equal(otherOps.length, 1);
    assert.equal(otherOps[0].id, 'op-2');
  } finally {
    db.close();
  }
});

test('PendingOperationsRepository: complete is idempotent', () => {
  const db = createTestDb();
  try {
    const repo = new PendingOperationsRepository(db);

    repo.insert({
      id: 'op-1',
      type: 'delete_design_system',
      payload: { systemId: 'test-ds' },
    });

    repo.complete('op-1');
    repo.complete('op-1'); // Should not throw

    const row = db.prepare('SELECT status FROM pending_operations WHERE id = ?').get('op-1') as {
      status: string;
    };
    assert.equal(row.status, 'completed');
  } finally {
    db.close();
  }
});

test('PendingOperationsRepository: listIncomplete returns empty when no ops', () => {
  const db = createTestDb();
  try {
    const repo = new PendingOperationsRepository(db);

    const ops = repo.listIncomplete();
    assert.equal(ops.length, 0);
  } finally {
    db.close();
  }
});
