import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Sql } from 'postgres';
import { DependencyRepository } from './dependency-repository.js';
import { createTestDatabase } from './test-db-helpers.js';

describe('DependencyRepository', () => {
  let sql: Sql;
  let cleanup: () => Promise<void>;
  let repo: DependencyRepository;

  before(async () => {
    ({ sql, cleanup } = await createTestDatabase());
    repo = new DependencyRepository(sql);
  });

  after(async () => {
    await cleanup();
  });

  test('addConsumer creates a consumer', async () => {
    const consumer = await repo.addConsumer({
      ds_file_key: 'ds123',
      consumer_file_key: 'consumer456',
      consumer_name: 'Test App',
    });

    assert.strictEqual(consumer.ds_file_key, 'ds123');
    assert.strictEqual(consumer.consumer_file_key, 'consumer456');
    assert.strictEqual(consumer.consumer_name, 'Test App');
    assert.strictEqual(consumer.enabled, true);
    assert(typeof consumer.id === 'string');
    assert(consumer.created_at instanceof Date);
  });

  test('addConsumer rejects duplicates', async () => {
    await repo.addConsumer({
      ds_file_key: 'ds789',
      consumer_file_key: 'consumer101',
      consumer_name: 'Test App 2',
    });

    await assert.rejects(
      () => repo.addConsumer({
        ds_file_key: 'ds789',
        consumer_file_key: 'consumer101',
        consumer_name: 'Test App 2 Duplicate',
      }),
      { code: 'deps.consumer.duplicate' }
    );
  });

  test('getConsumer returns null for non-existent consumer', async () => {
    const consumer = await repo.getConsumer('non-existent');
    assert.strictEqual(consumer, null);
  });

  test('getConsumer returns existing consumer', async () => {
    const created = await repo.addConsumer({
      ds_file_key: 'ds111',
      consumer_file_key: 'consumer222',
      consumer_name: 'Test App 3',
    });

    const retrieved = await repo.getConsumer(created.id);
    assert.deepStrictEqual(retrieved, created);
  });

  test('updateConsumerEnabled updates enabled flag', async () => {
    const created = await repo.addConsumer({
      ds_file_key: 'ds-update-enabled',
      consumer_file_key: 'consumer-update-enabled',
      consumer_name: 'Toggle App',
      enabled: true,
    });

    const updated = await repo.updateConsumerEnabled(created.id, false);
    assert.ok(updated);
    assert.strictEqual(updated?.enabled, false);

    const fetched = await repo.getConsumer(created.id);
    assert.strictEqual(fetched?.enabled, false);
  });

  test('getConsumerByFileKeys returns existing consumer', async () => {
    const created = await repo.addConsumer({
      ds_file_key: 'ds-by-key',
      consumer_file_key: 'consumer-by-key',
      consumer_name: 'Lookup App',
    });

    const retrieved = await repo.getConsumerByFileKeys('ds-by-key', 'consumer-by-key');
    assert.deepStrictEqual(retrieved, created);
  });

  test('getConsumerByFileKeys returns null for missing pair', async () => {
    await repo.addConsumer({
      ds_file_key: 'ds-present',
      consumer_file_key: 'consumer-present',
      consumer_name: 'Present App',
    });

    const missingConsumer = await repo.getConsumerByFileKeys('ds-present', 'consumer-missing');
    assert.strictEqual(missingConsumer, null);
  });

  test('listConsumers returns consumers with latest sync', async () => {
    const consumer = await repo.addConsumer({
      ds_file_key: 'ds333',
      consumer_file_key: 'consumer444',
      consumer_name: 'Test App 4',
    });

    const consumers = await repo.listConsumers('ds333');
    assert.strictEqual(consumers.length, 1);
    assert.strictEqual(consumers[0].id, consumer.id);
    assert.strictEqual(consumers[0].latest_sync, undefined);
  });

  test('saveSyncRun stores complete sync data', async () => {
    const consumer = await repo.addConsumer({
      ds_file_key: 'ds555',
      consumer_file_key: 'consumer666',
      consumer_name: 'Test App 5',
    });

    const syncRun = await repo.saveSyncRun({
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
    const componentUsage = await sql`SELECT * FROM ds_component_usage WHERE run_id = ${syncRun.id}`;
    assert.strictEqual(componentUsage.length, 2);

    const variableUsage = await sql`SELECT * FROM ds_variable_usage WHERE run_id = ${syncRun.id}`;
    assert.strictEqual(variableUsage.length, 1);

    const warnings = await sql`SELECT * FROM ds_sync_warnings WHERE run_id = ${syncRun.id}`;
    assert.strictEqual(warnings.length, 1);
  });

  test('getLatestSyncRun returns most recent sync', async () => {
    const consumer = await repo.addConsumer({
      ds_file_key: 'ds777',
      consumer_file_key: 'consumer888',
      consumer_name: 'Test App 6',
    });

    await repo.saveSyncRun({
      consumer_id: consumer.id,
      duration_ms: 1000,
      status: 'ok',
      component_usage: [],
      variable_usage: [],
      warnings: [],
    });

    const latestSync = await repo.saveSyncRun({
      consumer_id: consumer.id,
      duration_ms: 1200,
      status: 'partial',
      component_usage: [],
      variable_usage: [],
      warnings: [],
    });

    const retrieved = await repo.getLatestSyncRun(consumer.id);
    assert.strictEqual(retrieved?.id, latestSync.id);
    assert.strictEqual(retrieved?.status, 'partial');
  });

  test('removeAllByDsFileKey runs parent-variable and consumer cleanup inside a transaction', async () => {
    const committedStatements: string[] = [];
    const pendingStatements: string[] = [];
    let beginCalls = 0;

    const tx = async (strings: TemplateStringsArray) => {
      const statement = String(strings[0] || '').trim().replace(/\s+/g, ' ');
      pendingStatements.push(statement);

      if (statement.startsWith('SELECT id FROM ds_consumers')) {
        return [{ id: 'consumer-1' }];
      }

      if (statement.startsWith('DELETE FROM ds_sync_warnings')) {
        throw new Error('boom');
      }

      return { count: 1 };
    };

    const sql = Object.assign(
      async () => {
        throw new Error('top-level sql should not be used by removeAllByDsFileKey');
      },
      {
        begin: async (callback: (tx: typeof tx) => Promise<void>) => {
          beginCalls += 1;
          try {
            await callback(tx);
            committedStatements.push(...pendingStatements);
          } catch (error) {
            pendingStatements.length = 0;
            throw error;
          }
        },
      },
    ) as unknown as Sql;

    const transactionalRepo = new DependencyRepository(sql);

    await assert.rejects(
      () => transactionalRepo.removeAllByDsFileKey('ds-transaction'),
      /boom/,
    );

    assert.strictEqual(beginCalls, 1);
    assert.deepStrictEqual(committedStatements, []);
    assert.deepStrictEqual(pendingStatements, []);
  });

  test('removeAllByDsFileKey returns early without consumer deletes when there are no consumers', async () => {
    const committedStatements: string[] = [];
    let beginCalls = 0;

    const tx = async (strings: TemplateStringsArray) => {
      const statement = String(strings[0] || '').trim().replace(/\s+/g, ' ');
      committedStatements.push(statement);

      if (statement.startsWith('DELETE FROM ds_parent_variable_usage')) {
        return { count: 1 };
      }

      if (statement.startsWith('SELECT id FROM ds_consumers')) {
        return [];
      }

      throw new Error(`Unexpected statement: ${statement}`);
    };

    const sql = Object.assign(
      async () => {
        throw new Error('top-level sql should not be used by removeAllByDsFileKey');
      },
      {
        begin: async (callback: (tx: typeof tx) => Promise<void>) => {
          beginCalls += 1;
          await callback(tx);
        },
      },
    ) as unknown as Sql;

    const transactionalRepo = new DependencyRepository(sql);

    const result = await transactionalRepo.removeAllByDsFileKey('ds-transaction-empty');

    assert.deepStrictEqual(result, {
      deletedConsumerIds: [],
      deletedConsumerCount: 0,
    });
    assert.strictEqual(beginCalls, 1);
    assert.equal(committedStatements.length, 2);
    assert.ok(committedStatements[0].startsWith('DELETE FROM ds_parent_variable_usage'));
    assert.ok(committedStatements[1].startsWith('SELECT id FROM ds_consumers'));
  });

  test('getLatestComponentUsage aggregates from latest runs', async () => {
    const consumer = await repo.addConsumer({
      ds_file_key: 'ds999',
      consumer_file_key: 'consumer000',
      consumer_name: 'Test App 7',
    });

    await repo.saveSyncRun({
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

    const usage = await repo.getLatestComponentUsage('ds999');
    assert.strictEqual(usage.length, 1);
    assert.strictEqual(usage[0].component_key, 'comp1');
    assert.strictEqual(usage[0].component_name, 'Button');
    assert.strictEqual(usage[0].instance_count, 5);
    assert.strictEqual(usage[0].consumer_name, 'Test App 7');
  });

  test('getLatestVariableUsage aggregates from latest runs', async () => {
    const consumer = await repo.addConsumer({
      ds_file_key: 'ds1111',
      consumer_file_key: 'consumer2222',
      consumer_name: 'Test App 8',
    });

    await repo.saveSyncRun({
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

    const usage = await repo.getLatestVariableUsage('ds1111');
    assert.strictEqual(usage.length, 1);
    assert.strictEqual(usage[0].variable_key, 'var1');
    assert.strictEqual(usage[0].variable_name, 'primary-color');
    assert.strictEqual(usage[0].variable_type, 'COLOR');
    assert.strictEqual(usage[0].node_count, 8);
    assert.strictEqual(usage[0].consumer_name, 'Test App 8');
  });

  test('replaceParentVariableUsage replaces snapshot and getParentVariableUsage returns ordered rows', async () => {
    await repo.replaceParentVariableUsage('ds-parent', [
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
    await repo.replaceParentVariableUsage('ds-parent', [
      {
        variable_key: 'var/c',
        variable_name: 'C',
        variable_type: 'STRING',
        node_count: 3,
        sample_node_ids_json: JSON.stringify(['2:1']),
      },
    ]);

    const rows = await repo.getParentVariableUsage('ds-parent');
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].variable_key, 'var/c');
    assert.strictEqual(rows[0].node_count, 3);
  });

  test('replaceParentVariableUsage validates required fields', async () => {
    await assert.rejects(
      () => repo.replaceParentVariableUsage('', [
        { variable_key: 'var/x', variable_name: 'X', variable_type: 'COLOR', node_count: 1 },
      ]),
      /non-empty dsFileKey/,
    );

    await assert.rejects(
      () => repo.replaceParentVariableUsage('ds-parent', [
        { variable_key: '', variable_name: 'X', variable_type: 'COLOR', node_count: 1 },
      ]),
      /non-empty variable_key/,
    );

    await assert.rejects(
      () => repo.replaceParentVariableUsage('ds-parent', [
        { variable_key: 'var/x', variable_name: 'X', variable_type: 'COLOR', node_count: -1 },
      ]),
      /node_count to be a non-negative number/,
    );
  });

  test('removeConsumer cascades deletes all related data', async () => {
    const consumer = await repo.addConsumer({
      ds_file_key: 'ds3333',
      consumer_file_key: 'consumer4444',
      consumer_name: 'Test App 9',
    });

    await repo.saveSyncRun({
      consumer_id: consumer.id,
      duration_ms: 1000,
      status: 'ok',
      component_usage: [
        { component_key: 'comp1', component_name: 'Button', instance_count: 5, sample_node_ids_json: undefined },
      ],
      variable_usage: [
        { variable_key: 'var1', variable_name: 'primary-color', variable_type: 'COLOR', node_count: 8, sample_node_ids_json: undefined },
      ],
      warnings: [
        { code: 'test_warning', message: 'Test warning', node_id: undefined },
      ],
    });

    const [syncRunCount] = await sql`SELECT COUNT(*)::int as count FROM ds_sync_runs WHERE consumer_id = ${consumer.id}`;
    assert.strictEqual(syncRunCount.count, 1);

    const [componentCount] = await sql`
      SELECT COUNT(*)::int as count FROM ds_component_usage
      WHERE run_id IN (SELECT id FROM ds_sync_runs WHERE consumer_id = ${consumer.id})
    `;
    assert.strictEqual(componentCount.count, 1);

    await repo.removeConsumer(consumer.id);

    const [consumerCount] = await sql`SELECT COUNT(*)::int as count FROM ds_consumers WHERE id = ${consumer.id}`;
    assert.strictEqual(consumerCount.count, 0);

    const [syncRunCountAfter] = await sql`SELECT COUNT(*)::int as count FROM ds_sync_runs WHERE consumer_id = ${consumer.id}`;
    assert.strictEqual(syncRunCountAfter.count, 0);
  });

  test('pruneOldRuns keeps only specified count', async () => {
    const consumer = await repo.addConsumer({
      ds_file_key: 'ds5555',
      consumer_file_key: 'consumer6666',
      consumer_name: 'Test App 10',
    });

    for (let i = 0; i < 5; i++) {
      await repo.saveSyncRun({
        consumer_id: consumer.id,
        duration_ms: 1000 + i * 100,
        status: 'ok',
        component_usage: [],
        variable_usage: [],
        warnings: [],
      });
    }

    const [initialCount] = await sql`SELECT COUNT(*)::int as count FROM ds_sync_runs WHERE consumer_id = ${consumer.id}`;
    assert.strictEqual(initialCount.count, 5);

    const prunedCount = await repo.pruneOldRuns(consumer.id, 3);
    assert.strictEqual(prunedCount, 2);

    const [remainingCount] = await sql`SELECT COUNT(*)::int as count FROM ds_sync_runs WHERE consumer_id = ${consumer.id}`;
    assert.strictEqual(remainingCount.count, 3);
  });

  test('pruneOldRuns rejects negative keepCount', async () => {
    const consumer = await repo.addConsumer({
      ds_file_key: 'ds-invalid-prune',
      consumer_file_key: 'consumer-invalid-prune',
      consumer_name: 'Invalid Prune App',
    });

    await assert.rejects(
      () => repo.pruneOldRuns(consumer.id, -1),
      /keepCount must be a non-negative integer/
    );
  });

  test('listSyncRuns returns sync runs ordered by synced_at DESC', async () => {
    const consumer = await repo.addConsumer({
      ds_file_key: 'ds-list-runs',
      consumer_file_key: 'consumer-list-runs',
      consumer_name: 'List Runs App',
    });

    for (let i = 0; i < 5; i++) {
      await repo.saveSyncRun({
        consumer_id: consumer.id,
        duration_ms: 1000 + i * 100,
        status: i % 2 === 0 ? 'ok' : 'partial',
        component_usage: [],
        variable_usage: [],
        warnings: [],
      });
    }

    const runs = await repo.listSyncRuns(consumer.id, 10);
    assert.strictEqual(runs.length, 5);

    const limitedRuns = await repo.listSyncRuns(consumer.id, 3);
    assert.strictEqual(limitedRuns.length, 3);
  });

  test('listSyncRuns rejects invalid limit', async () => {
    const consumer = await repo.addConsumer({
      ds_file_key: 'ds-invalid-limit',
      consumer_file_key: 'consumer-invalid-limit',
      consumer_name: 'Invalid Limit App',
    });

    await assert.rejects(
      () => repo.listSyncRuns(consumer.id, 0),
      /limit must be a positive integer/
    );

    await assert.rejects(
      () => repo.listSyncRuns(consumer.id, -5),
      /limit must be a positive integer/
    );
  });

  describe('removeAllByDsFileKey', () => {
    test('removes all consumers and associated data for dsFileKey', async () => {
      const dsFileKey = 'test-ds-key';
      const consumer1 = await repo.addConsumer({
        ds_file_key: dsFileKey,
        consumer_file_key: 'consumer-1',
        consumer_name: 'Consumer 1',
      });
      const consumer2 = await repo.addConsumer({
        ds_file_key: dsFileKey,
        consumer_file_key: 'consumer-2',
        consumer_name: 'Consumer 2',
      });
      const otherDsConsumer = await repo.addConsumer({
        ds_file_key: 'other-ds-key',
        consumer_file_key: 'other-consumer',
        consumer_name: 'Other DS Consumer',
      });

      await repo.saveSyncRun({ consumer_id: consumer1.id, status: 'ok', duration_ms: 1000, component_usage: [], variable_usage: [], warnings: [] });
      await repo.saveSyncRun({ consumer_id: consumer2.id, status: 'error', duration_ms: 2000, component_usage: [], variable_usage: [], warnings: [] });
      await repo.saveSyncRun({ consumer_id: otherDsConsumer.id, status: 'ok', duration_ms: 500, component_usage: [], variable_usage: [], warnings: [] });

      const [run1] = await sql`SELECT id FROM ds_sync_runs WHERE consumer_id = ${consumer1.id}`;
      const [run2] = await sql`SELECT id FROM ds_sync_runs WHERE consumer_id = ${consumer2.id}`;

      await sql`INSERT INTO ds_component_usage (run_id, component_key, component_name, instance_count) VALUES (${run1.id}, 'comp-1', 'Component 1', 3)`;
      await sql`INSERT INTO ds_variable_usage (run_id, variable_key, variable_name, variable_type, node_count) VALUES (${run1.id}, 'var-1', 'Variable 1', 'COLOR', 5)`;
      await sql`INSERT INTO ds_parent_variable_usage (ds_file_key, variable_key, variable_name, variable_type, node_count) VALUES (${dsFileKey}, 'parent-var-1', 'Parent Var 1', 'COLOR', 10)`;

      const result = await repo.removeAllByDsFileKey(dsFileKey);

      assert.equal(result.deletedConsumerCount, 2);
      assert.deepEqual(result.deletedConsumerIds.sort(), [consumer1.id, consumer2.id].sort());

      const [remainingConsumers] = await sql`SELECT COUNT(*)::int as count FROM ds_consumers WHERE ds_file_key = ${dsFileKey}`;
      assert.equal(remainingConsumers.count, 0);

      const [remainingRuns] = await sql`SELECT COUNT(*)::int as count FROM ds_sync_runs WHERE consumer_id IN (${consumer1.id}, ${consumer2.id})`;
      assert.equal(remainingRuns.count, 0);

      const [remainingComponentUsage] = await sql`SELECT COUNT(*)::int as count FROM ds_component_usage WHERE run_id IN (${run1.id}, ${run2.id})`;
      assert.equal(remainingComponentUsage.count, 0);

      const [remainingParentUsage] = await sql`SELECT COUNT(*)::int as count FROM ds_parent_variable_usage WHERE ds_file_key = ${dsFileKey}`;
      assert.equal(remainingParentUsage.count, 0);

      const [otherDsConsumers] = await sql`SELECT COUNT(*)::int as count FROM ds_consumers WHERE ds_file_key = 'other-ds-key'`;
      assert.equal(otherDsConsumers.count, 1);
    });

    test('handles empty dsFileKey gracefully', async () => {
      await assert.rejects(
        () => repo.removeAllByDsFileKey(''),
        /dsFileKey is required and cannot be empty/
      );

      await assert.rejects(
        () => repo.removeAllByDsFileKey('   '),
        /dsFileKey is required and cannot be empty/
      );
    });

    test('returns empty result for dsFileKey with no consumers', async () => {
      const result = await repo.removeAllByDsFileKey('non-existent-ds');
      assert.equal(result.deletedConsumerCount, 0);
      assert.deepEqual(result.deletedConsumerIds, []);
    });

    test('rolls back when transactional cascade fails (PG trigger)', async () => {
      const dsFileKey = 'rollback-ds-key-pg';
      const consumer = await repo.addConsumer({
        ds_file_key: dsFileKey,
        consumer_file_key: 'rollback-consumer-pg',
        consumer_name: 'Rollback Consumer',
      });

      await repo.saveSyncRun({
        consumer_id: consumer.id,
        status: 'ok',
        duration_ms: 123,
        component_usage: [{ component_key: 'comp-rollback', component_name: 'Comp Rollback', instance_count: 1 }],
        variable_usage: [{ variable_key: 'var-rollback', variable_name: 'Var Rollback', variable_type: 'COLOR', node_count: 1 }],
        warnings: [{ code: 'warn-rollback', message: 'warn rollback' }],
      });

      // Create a PG trigger that forces an error on DELETE of ds_sync_runs
      await sql.unsafe(`
        CREATE OR REPLACE FUNCTION force_sync_run_delete_error()
        RETURNS TRIGGER LANGUAGE plpgsql AS $$
        BEGIN
          RAISE EXCEPTION 'forced sync run delete failure';
        END;
        $$;
        CREATE TRIGGER ds_sync_runs_force_abort
        BEFORE DELETE ON ds_sync_runs
        FOR EACH ROW EXECUTE FUNCTION force_sync_run_delete_error();
      `);

      try {
        await assert.rejects(
          () => repo.removeAllByDsFileKey(dsFileKey),
          /forced sync run delete failure/,
        );

        const [remainingConsumers] = await sql`SELECT COUNT(*)::int as count FROM ds_consumers WHERE ds_file_key = ${dsFileKey}`;
        assert.equal(remainingConsumers.count, 1);

        const [remainingRuns] = await sql`SELECT COUNT(*)::int as count FROM ds_sync_runs WHERE consumer_id = ${consumer.id}`;
        assert.equal(remainingRuns.count, 1);
      } finally {
        // Clean up the trigger
        await sql.unsafe(`
          DROP TRIGGER IF EXISTS ds_sync_runs_force_abort ON ds_sync_runs;
          DROP FUNCTION IF EXISTS force_sync_run_delete_error();
        `);
        // Clean up test data
        await sql`DELETE FROM ds_consumers WHERE ds_file_key = ${dsFileKey}`;
      }
    });
  });

  describe('getDeletePreview', () => {
    test('returns consumers and counts for dsFileKey', async () => {
      const dsFileKey = 'preview-test-ds';

      const consumer1 = await repo.addConsumer({
        ds_file_key: dsFileKey,
        consumer_file_key: 'preview-consumer-1',
        consumer_name: 'Preview Consumer 1',
      });
      const consumer2 = await repo.addConsumer({
        ds_file_key: dsFileKey,
        consumer_file_key: 'preview-consumer-2',
        consumer_name: 'Preview Consumer 2',
      });

      await repo.saveSyncRun({ consumer_id: consumer1.id, status: 'ok', duration_ms: 1000, component_usage: [], variable_usage: [], warnings: [] });
      await repo.saveSyncRun({ consumer_id: consumer2.id, status: 'error', duration_ms: 2000, component_usage: [], variable_usage: [], warnings: [] });
      await repo.saveSyncRun({ consumer_id: consumer1.id, status: 'partial', duration_ms: 300, component_usage: [], variable_usage: [], warnings: [] });

      const [run1] = await sql`SELECT id FROM ds_sync_runs WHERE consumer_id = ${consumer1.id} LIMIT 1`;
      await sql`INSERT INTO ds_component_usage (run_id, component_key, component_name, instance_count) VALUES (${run1.id}, 'comp-1', 'Component 1', 3)`;
      await sql`INSERT INTO ds_variable_usage (run_id, variable_key, variable_name, variable_type, node_count) VALUES (${run1.id}, 'var-1', 'Variable 1', 'COLOR', 5)`;
      await sql`INSERT INTO ds_parent_variable_usage (ds_file_key, variable_key, variable_name, variable_type, node_count) VALUES (${dsFileKey}, 'parent-var-1', 'Parent Var 1', 'COLOR', 10)`;

      const preview = await repo.getDeletePreview(dsFileKey);

      assert.equal(preview.consumers.length, 2);
      assert.equal(preview.totalConsumerCount, 2);
      const consumerNames = preview.consumers.map((c) => c.name).sort();
      assert.deepEqual(consumerNames, ['Preview Consumer 1', 'Preview Consumer 2']);

      assert.equal(preview.counts.syncRuns, 3);
      assert.equal(preview.counts.componentUsage, 1);
      assert.equal(preview.counts.variableUsage, 1);
      assert.equal(preview.counts.parentVariableUsage, 1);
    });

    test('returns empty result for dsFileKey with no consumers', async () => {
      const preview = await repo.getDeletePreview('non-existent-ds');

      assert.equal(preview.consumers.length, 0);
      assert.equal(preview.totalConsumerCount, 0);
      assert.equal(preview.counts.syncRuns, 0);
      assert.equal(preview.counts.componentUsage, 0);
      assert.equal(preview.counts.variableUsage, 0);
      assert.equal(preview.counts.parentVariableUsage, 0);
    });

    test('handles empty dsFileKey gracefully', async () => {
      const preview = await repo.getDeletePreview('');

      assert.equal(preview.consumers.length, 0);
      assert.equal(preview.totalConsumerCount, 0);
      assert.equal(preview.counts.syncRuns, 0);
    });
  });
});
