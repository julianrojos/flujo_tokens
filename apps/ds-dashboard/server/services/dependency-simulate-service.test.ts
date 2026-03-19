import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import { DependencyRepository } from '../db/dependency-repository';
import { DependencySimulateService } from './dependency-simulate-service';

describe('DependencySimulateService', () => {
  let db: DatabaseType;
  let repository: DependencyRepository;
  let simulateService: DependencySimulateService;

  test('setup', () => {
    db = new Database(':memory:');

    // Create tables manually for testing
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
    simulateService = new DependencySimulateService(repository);
  });

  test('simulateVariableChange returns warning for unknown variable', () => {
    const result = simulateService.simulateVariableChange(
      'test-ds',
      'VariableID:nonexistent',
      '#ff0000'
    );

    assert.strictEqual(result.variableKey, 'VariableID:nonexistent');
    assert.strictEqual(result.variableName, 'Unknown');
    assert.strictEqual(result.variableType, 'UNKNOWN');
    assert.strictEqual(result.proposedValue, '#ff0000');
    assert.strictEqual(result.totalNodes, 0);
    assert.strictEqual(result.totalConsumers, 0);
    assert.strictEqual(result.impactLevel, 'LOW');
    assert.strictEqual(result.affectedConsumers.length, 0);
    assert.strictEqual(result.warnings.length, 1);
    assert.strictEqual(result.warnings[0].code, 'variable_not_found');
    assert(result.disclaimer.includes('based on the latest sync data'));
  });

  test('simulateVariableChange returns correct impact for known variable', () => {
    // Setup test data
    const consumer = repository.addConsumer({
      ds_file_key: 'test-ds-2',
      consumer_file_key: 'test-consumer-2',
      consumer_name: 'Test Consumer 2',
    });

    repository.saveSyncRun({
      consumer_id: consumer.id,
      duration_ms: 1000,
      status: 'ok',
      component_usage: [],
      variable_usage: [
        {
          variable_key: 'VariableID:123:456',
          variable_name: 'primary-color',
          variable_type: 'COLOR',
          node_count: 8,
          sample_node_ids_json: JSON.stringify(['node1', 'node2', 'node3']),
        },
      ],
      warnings: [],
    });

    const result = simulateService.simulateVariableChange(
      'test-ds-2',
      'VariableID:123:456',
      '#00ff00'
    );

    assert.strictEqual(result.variableKey, 'VariableID:123:456');
    assert.strictEqual(result.variableName, 'primary-color');
    assert.strictEqual(result.variableType, 'COLOR');
    assert.strictEqual(result.proposedValue, '#00ff00');
    assert.strictEqual(result.totalNodes, 8);
    assert.strictEqual(result.totalConsumers, 1);
    assert.strictEqual(result.impactLevel, 'MEDIUM'); // 8 nodes > medium threshold (5)
    assert.strictEqual(result.affectedConsumers.length, 1);

    const affectedConsumer = result.affectedConsumers[0];
    assert.strictEqual(affectedConsumer.consumerName, 'Test Consumer 2');
    assert.strictEqual(affectedConsumer.nodeCount, 8);
    assert.strictEqual(affectedConsumer.sampleNodeIds.length, 3);
    assert.strictEqual(affectedConsumer.sampleLinks.length, 3);
    assert(result.disclaimer.includes('based on the latest sync data'));
  });

  test('simulateVariableChange calculates high impact correctly', () => {
    // Setup test data with high node count
    const consumer = repository.addConsumer({
      ds_file_key: 'test-ds-3',
      consumer_file_key: 'test-consumer-3',
      consumer_name: 'High Usage Consumer',
    });

    repository.saveSyncRun({
      consumer_id: consumer.id,
      duration_ms: 1000,
      status: 'ok',
      component_usage: [],
      variable_usage: [
        {
          variable_key: 'VariableID:789:012',
          variable_name: 'spacing-lg',
          variable_type: 'FLOAT',
          node_count: 25, // High threshold
          sample_node_ids_json: JSON.stringify(['node1', 'node2']),
        },
      ],
      warnings: [],
    });

    const result = simulateService.simulateVariableChange(
      'test-ds-3',
      'VariableID:789:012',
      '24'
    );

    assert.strictEqual(result.impactLevel, 'HIGH');
    assert.strictEqual(result.totalNodes, 25);
  });

  test('simulateVariableChange handles multiple consumers', () => {
    // Setup multiple consumers
    const consumer1 = repository.addConsumer({
      ds_file_key: 'test-ds-4',
      consumer_file_key: 'test-consumer-4',
      consumer_name: 'Consumer 1',
    });

    const consumer2 = repository.addConsumer({
      ds_file_key: 'test-ds-4',
      consumer_file_key: 'test-consumer-5',
      consumer_name: 'Consumer 2',
    });

    // Add sync runs for both consumers with the same variable
    repository.saveSyncRun({
      consumer_id: consumer1.id,
      duration_ms: 1000,
      status: 'ok',
      component_usage: [],
      variable_usage: [
        {
          variable_key: 'VariableID:global:font-size',
          variable_name: 'font-size-md',
          variable_type: 'FLOAT',
          node_count: 3,
          sample_node_ids_json: JSON.stringify(['node1']),
        },
      ],
      warnings: [],
    });

    repository.saveSyncRun({
      consumer_id: consumer2.id,
      duration_ms: 1000,
      status: 'ok',
      component_usage: [],
      variable_usage: [
        {
          variable_key: 'VariableID:global:font-size',
          variable_name: 'font-size-md',
          variable_type: 'FLOAT',
          node_count: 4,
          sample_node_ids_json: JSON.stringify(['node2', 'node3']),
        },
      ],
      warnings: [],
    });

    const result = simulateService.simulateVariableChange(
      'test-ds-4',
      'VariableID:global:font-size',
      '16'
    );

    assert.strictEqual(result.totalNodes, 7); // 3 + 4
    assert.strictEqual(result.totalConsumers, 2);
    assert.strictEqual(result.affectedConsumers.length, 2);
    assert.strictEqual(result.impactLevel, 'MEDIUM'); // 7 nodes > medium threshold (5)

    // Check both consumers are included
    const consumerNames = result.affectedConsumers.map(c => c.consumerName).sort();
    assert.deepStrictEqual(consumerNames, ['Consumer 1', 'Consumer 2']);
  });

  test('simulateVariableChange respects custom thresholds', () => {
    // Setup test data
    const consumer = repository.addConsumer({
      ds_file_key: 'test-ds-5',
      consumer_file_key: 'test-consumer-5',
      consumer_name: 'Custom Threshold Consumer',
    });

    repository.saveSyncRun({
      consumer_id: consumer.id,
      duration_ms: 1000,
      status: 'ok',
      component_usage: [],
      variable_usage: [
        {
          variable_key: 'VariableID:custom:color',
          variable_name: 'accent-color',
          variable_type: 'COLOR',
          node_count: 25,  // Above high threshold (20) for HIGH impact
          sample_node_ids_json: JSON.stringify(['node1']),
        },
      ],
      warnings: [],
    });

    // With default thresholds, 25 nodes would be HIGH (> 20)
    const defaultResult = simulateService.simulateVariableChange(
      'test-ds-5',
      'VariableID:custom:color',
      '#purple'
    );
    assert.strictEqual(defaultResult.impactLevel, 'HIGH');

    // With custom thresholds, 25 nodes should be LOW (< 30 medium threshold)
    const customResult = simulateService.simulateVariableChange(
      'test-ds-5',
      'VariableID:custom:color',
      '#purple',
      {
        nodeCountThresholds: {
          critical: 100,
          high: 50,
          medium: 30,
        },
      }
    );
    assert.strictEqual(customResult.impactLevel, 'LOW');
  });

  test('simulateVariableChange limits sample links', () => {
    // Setup test data with many sample nodes
    const consumer = repository.addConsumer({
      ds_file_key: 'test-ds-6',
      consumer_file_key: 'test-consumer-6',
      consumer_name: 'Many Samples Consumer',
    });

    const manyNodeIds = Array.from({ length: 10 }, (_, i) => `node${i + 1}`);

    repository.saveSyncRun({
      consumer_id: consumer.id,
      duration_ms: 1000,
      status: 'ok',
      component_usage: [],
      variable_usage: [
        {
          variable_key: 'VariableID:many:samples',
          variable_name: 'border-radius',
          variable_type: 'FLOAT',
          node_count: 10,
          sample_node_ids_json: JSON.stringify(manyNodeIds),
        },
      ],
      warnings: [],
    });

    const result = simulateService.simulateVariableChange(
      'test-ds-6',
      'VariableID:many:samples',
      '8',
      { maxSampleLinks: 3 }
    );

    assert.strictEqual(result.affectedConsumers[0].sampleLinks.length, 3);
    assert.strictEqual(result.affectedConsumers[0].sampleNodeIds.length, 10); // All node IDs preserved
  });

  test('teardown', () => {
    db.close();
  });
});
