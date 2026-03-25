import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import { DependencyRepository } from './dependency-repository';
import { randomUUID } from 'node:crypto';

describe('DependencyRepository', () => {
  let db: DatabaseType;
  let repo: DependencyRepository;

  beforeEach(() => {
    db = new Database(':memory:');

    // Enable foreign keys for cascade deletes
    db.exec('PRAGMA foreign_keys = ON');

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
        local_component_defined_count INTEGER DEFAULT NULL,
        local_component_used_count INTEGER DEFAULT NULL,
        local_variable_defined_count INTEGER DEFAULT NULL,
        local_variable_used_count INTEGER DEFAULT NULL,
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

      CREATE TABLE ds_parent_variable_usage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ds_file_key TEXT NOT NULL,
        variable_key TEXT NOT NULL,
        variable_name TEXT NOT NULL,
        variable_type TEXT NOT NULL,
        node_count INTEGER NOT NULL,
        sample_node_ids_json TEXT,
        captured_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        UNIQUE (ds_file_key, variable_key)
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

    repo = new DependencyRepository(db);
  });

  test('addConsumer creates a consumer', () => {
    const consumer = repo.addConsumer({
      ds_file_key: 'ds123',
      consumer_file_key: 'consumer456',
      consumer_name: 'Test App',
    });

    assert.strictEqual(consumer.ds_file_key, 'ds123');
    assert.strictEqual(consumer.consumer_file_key, 'consumer456');
    assert.strictEqual(consumer.consumer_name, 'Test App');
    assert.strictEqual(consumer.enabled, true);
    assert(typeof consumer.id === 'string');
    assert(typeof consumer.created_at === 'string');
  });

  test('constructor enables foreign_keys pragma on the active connection', () => {
    db.pragma('foreign_keys = OFF');
    repo = new DependencyRepository(db);
    const result = db.pragma('foreign_keys') as Array<{ foreign_keys: number }>;
    assert.strictEqual(result[0].foreign_keys, 1);
  });

  test('addConsumer rejects duplicates', () => {
    repo.addConsumer({
      ds_file_key: 'ds789',
      consumer_file_key: 'consumer101',
      consumer_name: 'Test App 2',
    });

    assert.throws(() => {
      repo.addConsumer({
        ds_file_key: 'ds789',
        consumer_file_key: 'consumer101',
        consumer_name: 'Test App 2 Duplicate',
      });
    }, {
      code: 'deps.consumer.duplicate'
    });
  });

  test('getConsumer returns null for non-existent consumer', () => {
    const consumer = repo.getConsumer('non-existent');
    assert.strictEqual(consumer, null);
  });

  test('getConsumer returns existing consumer', () => {
    const created = repo.addConsumer({
      ds_file_key: 'ds111',
      consumer_file_key: 'consumer222',
      consumer_name: 'Test App 3',
    });

    const retrieved = repo.getConsumer(created.id);
    assert.deepStrictEqual(retrieved, created);
  });

  test('updateConsumerEnabled updates enabled flag', () => {
    const created = repo.addConsumer({
      ds_file_key: 'ds-update-enabled',
      consumer_file_key: 'consumer-update-enabled',
      consumer_name: 'Toggle App',
      enabled: true,
    });

    const updated = repo.updateConsumerEnabled(created.id, false);
    assert.ok(updated);
    assert.strictEqual(updated?.enabled, false);

    const fetched = repo.getConsumer(created.id);
    assert.strictEqual(fetched?.enabled, false);
  });

  test('getConsumerByFileKeys returns existing consumer', () => {
    const created = repo.addConsumer({
      ds_file_key: 'ds-by-key',
      consumer_file_key: 'consumer-by-key',
      consumer_name: 'Lookup App',
    });

    const retrieved = repo.getConsumerByFileKeys('ds-by-key', 'consumer-by-key');
    assert.deepStrictEqual(retrieved, created);
  });

  test('getConsumerByFileKeys returns null for missing pair', () => {
    repo.addConsumer({
      ds_file_key: 'ds-present',
      consumer_file_key: 'consumer-present',
      consumer_name: 'Present App',
    });

    const missingConsumer = repo.getConsumerByFileKeys('ds-present', 'consumer-missing');
    assert.strictEqual(missingConsumer, null);
  });

  test('listConsumers returns consumers with latest sync', () => {
    const consumer = repo.addConsumer({
      ds_file_key: 'ds333',
      consumer_file_key: 'consumer444',
      consumer_name: 'Test App 4',
    });

    const consumers = repo.listConsumers('ds333');
    assert.strictEqual(consumers.length, 1);
    assert.strictEqual(consumers[0].id, consumer.id);
    assert.strictEqual(consumers[0].latest_sync, undefined);
  });

  test('saveSyncRun stores complete sync data', () => {
    const consumer = repo.addConsumer({
      ds_file_key: 'ds555',
      consumer_file_key: 'consumer666',
      consumer_name: 'Test App 5',
    });

    const syncRun = repo.saveSyncRun({
      consumer_id: consumer.id,
      duration_ms: 1500,
      status: 'ok',
      component_usage: [
        {
          component_key: 'comp1',
          component_name: 'Button',
          instance_count: 5,
          sample_node_ids_json: JSON.stringify(['node1', 'node2']),
        },
        {
          component_key: 'comp2',
          component_name: 'Card',
          instance_count: 3,
        },
      ],
      variable_usage: [
        {
          variable_key: 'var1',
          variable_name: 'primary-color',
          variable_type: 'COLOR',
          node_count: 8,
          sample_node_ids_json: JSON.stringify(['node3', 'node4']),
        },
      ],
      warnings: [
        {
          code: 'component_missing',
          message: 'Component not found in DS',
          node_id: 'node5',
        },
      ],
    });

    assert.strictEqual(syncRun.consumer_id, consumer.id);
    assert.strictEqual(syncRun.status, 'ok');
    assert.strictEqual(syncRun.duration_ms, 1500);
    assert.strictEqual(syncRun.component_count, 2);
    assert.strictEqual(syncRun.variable_count, 1);
    assert.strictEqual(syncRun.warning_count, 1);

    // Verify related data was saved
    const componentUsage = db.prepare('SELECT * FROM ds_component_usage WHERE run_id = ?').all(syncRun.id);
    assert.strictEqual(componentUsage.length, 2);

    const variableUsage = db.prepare('SELECT * FROM ds_variable_usage WHERE run_id = ?').all(syncRun.id);
    assert.strictEqual(variableUsage.length, 1);

    const warnings = db.prepare('SELECT * FROM ds_sync_warnings WHERE run_id = ?').all(syncRun.id);
    assert.strictEqual(warnings.length, 1);
  });

  test('getLatestSyncRun returns most recent sync', () => {
    const consumer = repo.addConsumer({
      ds_file_key: 'ds777',
      consumer_file_key: 'consumer888',
      consumer_name: 'Test App 6',
    });

    // First sync
    repo.saveSyncRun({
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

    // Second sync
    const latestSync = repo.saveSyncRun({
      consumer_id: consumer.id,
      duration_ms: 1200,
      status: 'partial',
      component_usage: [],
      variable_usage: [],
      warnings: [],
    });

    const retrieved = repo.getLatestSyncRun(consumer.id);
    assert.strictEqual(retrieved?.id, latestSync.id);
    assert.strictEqual(retrieved?.status, 'partial');
  });

  test('getLatestComponentUsage aggregates from latest runs', () => {
    const consumer = repo.addConsumer({
      ds_file_key: 'ds999',
      consumer_file_key: 'consumer000',
      consumer_name: 'Test App 7',
    });

    const syncRun = repo.saveSyncRun({
      consumer_id: consumer.id,
      duration_ms: 1000,
      status: 'ok',
      component_usage: [
        {
          component_key: 'comp1',
          component_name: 'Button',
          instance_count: 5,
        },
      ],
      variable_usage: [],
      warnings: [],
    });

    const usage = repo.getLatestComponentUsage('ds999');
    assert.strictEqual(usage.length, 1);
    assert.strictEqual(usage[0].component_key, 'comp1');
    assert.strictEqual(usage[0].component_name, 'Button');
    assert.strictEqual(usage[0].instance_count, 5);
    assert.strictEqual(usage[0].consumer_name, 'Test App 7');
  });

  test('getLatestVariableUsage aggregates from latest runs', () => {
    const consumer = repo.addConsumer({
      ds_file_key: 'ds1111',
      consumer_file_key: 'consumer2222',
      consumer_name: 'Test App 8',
    });

    const syncRun = repo.saveSyncRun({
      consumer_id: consumer.id,
      duration_ms: 1000,
      status: 'ok',
      component_usage: [],
      variable_usage: [
        {
          variable_key: 'var1',
          variable_name: 'primary-color',
          variable_type: 'COLOR',
          node_count: 8,
        },
      ],
      warnings: [],
    });

    const usage = repo.getLatestVariableUsage('ds1111');
    assert.strictEqual(usage.length, 1);
    assert.strictEqual(usage[0].variable_key, 'var1');
    assert.strictEqual(usage[0].variable_name, 'primary-color');
    assert.strictEqual(usage[0].variable_type, 'COLOR');
    assert.strictEqual(usage[0].node_count, 8);
    assert.strictEqual(usage[0].consumer_name, 'Test App 8');
  });

  test('replaceParentVariableUsage replaces snapshot and getParentVariableUsage returns ordered rows', () => {
    repo.replaceParentVariableUsage('ds-parent', [
      {
        variable_key: 'var/a',
        variable_name: 'A',
        variable_type: 'COLOR',
        node_count: 2,
        sample_node_ids_json: JSON.stringify(['1:1']),
      },
      {
        variable_key: 'var/b',
        variable_name: 'B',
        variable_type: 'FLOAT',
        node_count: 5,
        sample_node_ids_json: JSON.stringify(['1:2', '1:3']),
      },
    ]);

    // Replace snapshot for same ds_file_key; previous rows should be removed.
    repo.replaceParentVariableUsage('ds-parent', [
      {
        variable_key: 'var/c',
        variable_name: 'C',
        variable_type: 'STRING',
        node_count: 3,
        sample_node_ids_json: JSON.stringify(['2:1']),
      },
    ]);

    const rows = repo.getParentVariableUsage('ds-parent');
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].variable_key, 'var/c');
    assert.strictEqual(rows[0].node_count, 3);
  });

  test('replaceParentVariableUsage validates required fields', () => {
    assert.throws(
      () =>
        repo.replaceParentVariableUsage('', [
          {
            variable_key: 'var/x',
            variable_name: 'X',
            variable_type: 'COLOR',
            node_count: 1,
          },
        ]),
      /non-empty dsFileKey/,
    );

    assert.throws(
      () =>
        repo.replaceParentVariableUsage('ds-parent', [
          {
            variable_key: '',
            variable_name: 'X',
            variable_type: 'COLOR',
            node_count: 1,
          },
        ]),
      /non-empty variable_key/,
    );

    assert.throws(
      () =>
        repo.replaceParentVariableUsage('ds-parent', [
          {
            variable_key: 'var/x',
            variable_name: 'X',
            variable_type: 'COLOR',
            node_count: -1,
          },
        ]),
      /node_count to be a non-negative number/,
    );
  });

  test('removeConsumer cascades deletes all related data', () => {
    const consumer = repo.addConsumer({
      ds_file_key: 'ds3333',
      consumer_file_key: 'consumer4444',
      consumer_name: 'Test App 9',
    });

    // Add sync data
    repo.saveSyncRun({
      consumer_id: consumer.id,
      duration_ms: 1000,
      status: 'ok',
      component_usage: [
        {
          component_key: 'comp1',
          component_name: 'Button',
          instance_count: 5,
          sample_node_ids_json: undefined,
        },
      ],
      variable_usage: [
        {
          variable_key: 'var1',
          variable_name: 'primary-color',
          variable_type: 'COLOR',
          node_count: 8,
          sample_node_ids_json: undefined,
        },
      ],
      warnings: [
        {
          code: 'test_warning',
          message: 'Test warning',
          node_id: undefined,
        },
      ],
    });

    // Verify data exists
    const syncRunCount = db.prepare('SELECT COUNT(*) as count FROM ds_sync_runs WHERE consumer_id = ?').get(consumer.id) as { count: number };
    assert.strictEqual(syncRunCount.count, 1);

    const componentCount = db.prepare('SELECT COUNT(*) as count FROM ds_component_usage WHERE run_id IN (SELECT id FROM ds_sync_runs WHERE consumer_id = ?)').get(consumer.id) as { count: number };
    assert.strictEqual(componentCount.count, 1);

    const variableCount = db.prepare('SELECT COUNT(*) as count FROM ds_variable_usage WHERE run_id IN (SELECT id FROM ds_sync_runs WHERE consumer_id = ?)').get(consumer.id) as { count: number };
    assert.strictEqual(variableCount.count, 1);

    const warningCount = db.prepare('SELECT COUNT(*) as count FROM ds_sync_warnings WHERE run_id IN (SELECT id FROM ds_sync_runs WHERE consumer_id = ?)').get(consumer.id) as { count: number };
    assert.strictEqual(warningCount.count, 1);

    // Remove consumer
    repo.removeConsumer(consumer.id);

    // Verify all data is gone
    const consumerCount = db.prepare('SELECT COUNT(*) as count FROM ds_consumers WHERE id = ?').get(consumer.id) as { count: number };
    assert.strictEqual(consumerCount.count, 0);

    const syncRunCountAfter = db.prepare('SELECT COUNT(*) as count FROM ds_sync_runs WHERE consumer_id = ?').get(consumer.id) as { count: number };
    assert.strictEqual(syncRunCountAfter.count, 0);

    const componentCountAfter = db.prepare('SELECT COUNT(*) as count FROM ds_component_usage WHERE run_id IN (SELECT id FROM ds_sync_runs WHERE consumer_id = ?)').get(consumer.id) as { count: number };
    assert.strictEqual(componentCountAfter.count, 0);

    const variableCountAfter = db.prepare('SELECT COUNT(*) as count FROM ds_variable_usage WHERE run_id IN (SELECT id FROM ds_sync_runs WHERE consumer_id = ?)').get(consumer.id) as { count: number };
    assert.strictEqual(variableCountAfter.count, 0);

    const warningCountAfter = db.prepare('SELECT COUNT(*) as count FROM ds_sync_warnings WHERE run_id IN (SELECT id FROM ds_sync_runs WHERE consumer_id = ?)').get(consumer.id) as { count: number };
    assert.strictEqual(warningCountAfter.count, 0);
  });

  test('pruneOldRuns keeps only specified count', () => {
    const consumer = repo.addConsumer({
      ds_file_key: 'ds5555',
      consumer_file_key: 'consumer6666',
      consumer_name: 'Test App 10',
    });

    // Create 5 sync runs with small delays to ensure different timestamps
    const runIds = [];
    for (let i = 0; i < 5; i++) {
      const run = repo.saveSyncRun({
        consumer_id: consumer.id,
        duration_ms: 1000 + i * 100,
        status: 'ok',
        component_usage: [],
        variable_usage: [],
        warnings: [],
      });
      runIds.push(run.id);
      // Small delay to ensure different timestamps
      if (i < 4) {
        const start = Date.now();
        while (Date.now() - start < 1) { /* wait */ }
      }
    }

    // Verify all runs exist
    const initialCount = db.prepare('SELECT COUNT(*) as count FROM ds_sync_runs WHERE consumer_id = ?').get(consumer.id) as { count: number };
    assert.strictEqual(initialCount.count, 5);

    // Prune to keep only 3
    const prunedCount = repo.pruneOldRuns(consumer.id, 3);
    assert.strictEqual(prunedCount, 2);

    // Verify only 3 remain (the latest ones by duration_ms which correlates with time)
    const remainingRuns = db.prepare('SELECT id, duration_ms FROM ds_sync_runs WHERE consumer_id = ? ORDER BY duration_ms DESC').all(consumer.id);
    assert.strictEqual(remainingRuns.length, 3);

    // Should keep the 3 with highest duration_ms (latest created)
    const expectedDurations = [1400, 1300, 1200];
    const actualDurations = remainingRuns.map((r: any) => r.duration_ms);
    assert.deepStrictEqual(actualDurations, expectedDurations);
  });

  test('pruneOldRuns rejects negative keepCount', () => {
    const consumer = repo.addConsumer({
      ds_file_key: 'ds-invalid-prune',
      consumer_file_key: 'consumer-invalid-prune',
      consumer_name: 'Invalid Prune App',
    });

    assert.throws(
      () => repo.pruneOldRuns(consumer.id, -1),
      /keepCount must be a non-negative integer/
    );
  });

  test('listSyncRuns returns sync runs ordered by synced_at DESC', () => {
    const consumer = repo.addConsumer({
      ds_file_key: 'ds-list-runs',
      consumer_file_key: 'consumer-list-runs',
      consumer_name: 'List Runs App',
    });

    // Create 5 sync runs
    const runIds = [];
    for (let i = 0; i < 5; i++) {
      const run = repo.saveSyncRun({
        consumer_id: consumer.id,
        duration_ms: 1000 + i * 100,
        status: i % 2 === 0 ? 'ok' : 'partial',
        component_usage: [],
        variable_usage: [],
        warnings: [],
      });
      runIds.push(run.id);
      if (i < 4) {
        const start = Date.now();
        while (Date.now() - start < 1) { /* wait */ }
      }
    }

    // List all runs
    const runs = repo.listSyncRuns(consumer.id, 10);
    assert.strictEqual(runs.length, 5);
    // Should be ordered by synced_at DESC (most recent first)
    assert.strictEqual(runs[0].duration_ms, 1400);
    assert.strictEqual(runs[4].duration_ms, 1000);

    // Test limit
    const limitedRuns = repo.listSyncRuns(consumer.id, 3);
    assert.strictEqual(limitedRuns.length, 3);
    assert.strictEqual(limitedRuns[0].duration_ms, 1400);
    assert.strictEqual(limitedRuns[2].duration_ms, 1200);
  });

  test('listSyncRuns rejects invalid limit', () => {
    const consumer = repo.addConsumer({
      ds_file_key: 'ds-invalid-limit',
      consumer_file_key: 'consumer-invalid-limit',
      consumer_name: 'Invalid Limit App',
    });

    assert.throws(
      () => repo.listSyncRuns(consumer.id, 0),
      /limit must be a positive integer/
    );

    assert.throws(
      () => repo.listSyncRuns(consumer.id, -5),
      /limit must be a positive integer/
    );
  });

  test('teardown', () => {
    db.close();
  });

  describe('removeAllByDsFileKey', () => {
    test('removes all consumers and associated data for dsFileKey', () => {
      // Setup: Create DS with multiple consumers and their data
      const dsFileKey = 'test-ds-key';
      const consumer1 = repo.addConsumer({
        ds_file_key: dsFileKey,
        consumer_file_key: 'consumer-1',
        consumer_name: 'Consumer 1',
      });
      const consumer2 = repo.addConsumer({
        ds_file_key: dsFileKey,
        consumer_file_key: 'consumer-2',
        consumer_name: 'Consumer 2',
      });
      const otherDsConsumer = repo.addConsumer({
        ds_file_key: 'other-ds-key',
        consumer_file_key: 'other-consumer',
        consumer_name: 'Other DS Consumer',
      });

      // Add sync runs and usage data
      repo.saveSyncRun({
        consumer_id: consumer1.id,
        status: 'ok',
        duration_ms: 1000,
        component_usage: [],
        variable_usage: [],
        warnings: []
      });
      repo.saveSyncRun({
        consumer_id: consumer2.id,
        status: 'error',
        duration_ms: 2000,
        component_usage: [],
        variable_usage: [],
        warnings: []
      });
      repo.saveSyncRun({
        consumer_id: otherDsConsumer.id,
        status: 'ok',
        duration_ms: 500,
        component_usage: [],
        variable_usage: [],
        warnings: []
      });

      // Add component and variable usage
      const run1 = db.prepare('SELECT id FROM ds_sync_runs WHERE consumer_id = ?').get(consumer1.id) as { id: string };
      const run2 = db.prepare('SELECT id FROM ds_sync_runs WHERE consumer_id = ?').get(consumer2.id) as { id: string };

      db.prepare('INSERT INTO ds_component_usage (run_id, component_key, component_name, instance_count) VALUES (?, ?, ?, ?)')
        .run(run1.id, 'comp-1', 'Component 1', 3);
      db.prepare('INSERT INTO ds_variable_usage (run_id, variable_key, variable_name, variable_type, node_count) VALUES (?, ?, ?, ?, ?)')
        .run(run1.id, 'var-1', 'Variable 1', 'COLOR', 5);

      // Add parent variable usage
      db.prepare('INSERT INTO ds_parent_variable_usage (ds_file_key, variable_key, variable_name, variable_type, node_count, captured_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(dsFileKey, 'parent-var-1', 'Parent Var 1', 'COLOR', 10, '2024-01-01T00:00:00.000Z');

      // Execute cascade delete
      const result = repo.removeAllByDsFileKey(dsFileKey);

      // Verify results
      assert.equal(result.deletedConsumerCount, 2);
      assert.deepEqual(result.deletedConsumerIds.sort(), [consumer1.id, consumer2.id].sort());

      // Verify all related data is deleted
      const remainingConsumers = db.prepare('SELECT COUNT(*) as count FROM ds_consumers WHERE ds_file_key = ?').get(dsFileKey) as { count: number };
      assert.equal(remainingConsumers.count, 0);

      const remainingRuns = db.prepare('SELECT COUNT(*) as count FROM ds_sync_runs WHERE consumer_id IN (?, ?)').get(consumer1.id, consumer2.id) as { count: number };
      assert.equal(remainingRuns.count, 0);

      const remainingComponentUsage = db.prepare('SELECT COUNT(*) as count FROM ds_component_usage WHERE run_id IN (?, ?)').get(run1.id, run2.id) as { count: number };
      assert.equal(remainingComponentUsage.count, 0);

      const remainingVariableUsage = db.prepare('SELECT COUNT(*) as count FROM ds_variable_usage WHERE run_id IN (?, ?)').get(run1.id, run2.id) as { count: number };
      assert.equal(remainingVariableUsage.count, 0);

      const remainingParentUsage = db.prepare('SELECT COUNT(*) as count FROM ds_parent_variable_usage WHERE ds_file_key = ?').get(dsFileKey) as { count: number };
      assert.equal(remainingParentUsage.count, 0);

      // Verify other DS data is intact
      const otherDsConsumers = db.prepare('SELECT COUNT(*) as count FROM ds_consumers WHERE ds_file_key = ?').get('other-ds-key') as { count: number };
      assert.equal(otherDsConsumers.count, 1);
    });

    test('handles empty dsFileKey gracefully', () => {
      assert.throws(
        () => repo.removeAllByDsFileKey(''),
        /dsFileKey is required and cannot be empty/
      );

      assert.throws(
        () => repo.removeAllByDsFileKey('   '),
        /dsFileKey is required and cannot be empty/
      );
    });

    test('returns empty result for dsFileKey with no consumers', () => {
      const result = repo.removeAllByDsFileKey('non-existent-ds');
      assert.equal(result.deletedConsumerCount, 0);
      assert.deepEqual(result.deletedConsumerIds, []);
    });
  });

  describe('getDeletePreview', () => {
    test('returns consumers and counts for dsFileKey', () => {
      const dsFileKey = 'preview-test-ds';

      // Setup consumers
      const consumer1 = repo.addConsumer({
        ds_file_key: dsFileKey,
        consumer_file_key: 'preview-consumer-1',
        consumer_name: 'Preview Consumer 1',
      });
      const consumer2 = repo.addConsumer({
        ds_file_key: dsFileKey,
        consumer_file_key: 'preview-consumer-2',
        consumer_name: 'Preview Consumer 2',
      });

      // Add sync runs and usage data
      repo.saveSyncRun({
        consumer_id: consumer1.id,
        status: 'ok',
        duration_ms: 1000,
        component_usage: [],
        variable_usage: [],
        warnings: []
      });
      repo.saveSyncRun({
        consumer_id: consumer2.id,
        status: 'error',
        duration_ms: 2000,
        component_usage: [],
        variable_usage: [],
        warnings: []
      });
      repo.saveSyncRun({
        consumer_id: consumer1.id,
        status: 'partial',
        duration_ms: 300,
        component_usage: [],
        variable_usage: [],
        warnings: []
      });

      const run1 = db.prepare('SELECT id FROM ds_sync_runs WHERE consumer_id = ?').get(consumer1.id) as { id: string };
      const run2 = db.prepare('SELECT id FROM ds_sync_runs WHERE consumer_id = ?').get(consumer2.id) as { id: string };

      db.prepare('INSERT INTO ds_component_usage (run_id, component_key, component_name, instance_count) VALUES (?, ?, ?, ?)')
        .run(run1.id, 'comp-1', 'Component 1', 3);
      db.prepare('INSERT INTO ds_variable_usage (run_id, variable_key, variable_name, variable_type, node_count) VALUES (?, ?, ?, ?, ?)')
        .run(run1.id, 'var-1', 'Variable 1', 'COLOR', 5);
      db.prepare('INSERT INTO ds_parent_variable_usage (ds_file_key, variable_key, variable_name, variable_type, node_count, captured_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(dsFileKey, 'parent-var-1', 'Parent Var 1', 'COLOR', 10, '2024-01-01T00:00:00.000Z');

      const preview = repo.getDeletePreview(dsFileKey);

      // Verify consumers
      assert.equal(preview.consumers.length, 2);
      assert.equal(preview.totalConsumerCount, 2);
      const consumerNames = preview.consumers.map(c => c.name).sort();
      assert.deepEqual(consumerNames, ['Preview Consumer 1', 'Preview Consumer 2']);

      // Verify counts
      assert.equal(preview.counts.syncRuns, 3);
      assert.equal(preview.counts.componentUsage, 1);
      assert.equal(preview.counts.variableUsage, 1);
      assert.equal(preview.counts.parentVariableUsage, 1);
    });

    test('returns empty result for dsFileKey with no consumers', () => {
      const preview = repo.getDeletePreview('non-existent-ds');

      assert.equal(preview.consumers.length, 0);
      assert.equal(preview.totalConsumerCount, 0);
      assert.equal(preview.counts.syncRuns, 0);
      assert.equal(preview.counts.componentUsage, 0);
      assert.equal(preview.counts.variableUsage, 0);
      assert.equal(preview.counts.parentVariableUsage, 0);
    });

    test('handles empty dsFileKey gracefully', () => {
      const preview = repo.getDeletePreview('');

      assert.equal(preview.consumers.length, 0);
      assert.equal(preview.totalConsumerCount, 0);
      assert.equal(preview.counts.syncRuns, 0);
      assert.equal(preview.counts.componentUsage, 0);
      assert.equal(preview.counts.variableUsage, 0);
      assert.equal(preview.counts.parentVariableUsage, 0);
    });
  });
});
