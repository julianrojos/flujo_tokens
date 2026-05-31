/**
 * Pending Operations Repository Tests
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import type { Sql } from 'postgres';
import { PendingOperationsRepository } from './pending-operations-repository.js';
import { createTestDatabase } from './test-db-helpers.js';

test('PendingOperationsRepository: insert and listIncomplete', async () => {
  const { sql, cleanup } = await createTestDatabase();
  try {
    const repo = new PendingOperationsRepository(sql);

    // Insert two operations
    await repo.insert({
      id: 'op-1',
      type: 'delete_design_system',
      payload: { systemId: 'test-ds', figmaFileId: 'figma123' },
    });
    await repo.insert({
      id: 'op-2',
      type: 'delete_design_system',
      payload: { systemId: 'test-ds-2', figmaFileId: 'figma456' },
    });
    await repo.insert({
      id: 'op-2',
      type: 'delete_design_system',
      payload: { systemId: 'test-ds-2', figmaFileId: 'figma456' },
    });

    // List all incomplete
    const ops = await repo.listIncomplete();
    assert.equal(ops.length, 2);
    assert.equal(ops[0].id, 'op-1');
    assert.equal(ops[1].id, 'op-2');
    assert.equal(ops[0].status, 'in_progress');

    // Parse payload
    const payload = ops[0].payload as {
      systemId: string;
      figmaFileId: string;
    };
    assert.equal(payload.systemId, 'test-ds');
    assert.equal(payload.figmaFileId, 'figma123');
  } finally {
    await cleanup();
  }
});

test('PendingOperationsRepository: complete marks operation as completed', async () => {
  const { sql, cleanup } = await createTestDatabase();
  try {
    const repo = new PendingOperationsRepository(sql);

    await repo.insert({
      id: 'op-1',
      type: 'delete_design_system',
      payload: { systemId: 'test-ds' },
    });

    await repo.complete('op-1');

    const ops = await repo.listIncomplete();
    assert.equal(ops.length, 0);

    // Verify status changed
    const rows = await sql`
      SELECT status, completed_at FROM pending_operations WHERE id = ${'op-1'}
    `;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].status, 'completed');
    assert.ok(rows[0].completed_at);
  } finally {
    await cleanup();
  }
});

test('PendingOperationsRepository: abandon marks operation as abandoned', async () => {
  const { sql, cleanup } = await createTestDatabase();
  try {
    const repo = new PendingOperationsRepository(sql);

    await repo.insert({
      id: 'op-1',
      type: 'delete_design_system',
      payload: { systemId: 'test-ds' },
    });

    await repo.abandon('op-1');

    const ops = await repo.listIncomplete();
    assert.equal(ops.length, 0);

    // Verify status changed
    const rows = await sql`
      SELECT status, completed_at FROM pending_operations WHERE id = ${'op-1'}
    `;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].status, 'abandoned');
    assert.ok(rows[0].completed_at);
  } finally {
    await cleanup();
  }
});

test('PendingOperationsRepository: listIncomplete filters by type', async () => {
  const { sql, cleanup } = await createTestDatabase();
  try {
    const repo = new PendingOperationsRepository(sql);

    await repo.insert({
      id: 'op-1',
      type: 'delete_design_system',
      payload: { systemId: 'test-ds' },
    });
    await repo.insert({
      id: 'op-2',
      type: 'other_type',
      payload: { data: 'test' },
    });

    // Filter by type
    const deleteOps = await repo.listIncomplete('delete_design_system');
    assert.equal(deleteOps.length, 1);
    assert.equal(deleteOps[0].id, 'op-1');

    const otherOps = await repo.listIncomplete('other_type');
    assert.equal(otherOps.length, 1);
    assert.equal(otherOps[0].id, 'op-2');
  } finally {
    await cleanup();
  }
});

test('PendingOperationsRepository: complete is idempotent', async () => {
  const { sql, cleanup } = await createTestDatabase();
  try {
    const repo = new PendingOperationsRepository(sql);

    await repo.insert({
      id: 'op-1',
      type: 'delete_design_system',
      payload: { systemId: 'test-ds' },
    });

    await repo.complete('op-1');
    await repo.complete('op-1'); // Should not throw

    const rows = await sql`
      SELECT status FROM pending_operations WHERE id = ${'op-1'}
    `;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].status, 'completed');
  } finally {
    await cleanup();
  }
});

test('PendingOperationsRepository: listIncomplete returns empty when no ops', async () => {
  const { sql, cleanup } = await createTestDatabase();
  try {
    const repo = new PendingOperationsRepository(sql);

    const ops = await repo.listIncomplete();
    assert.equal(ops.length, 0);
  } finally {
    await cleanup();
  }
});
