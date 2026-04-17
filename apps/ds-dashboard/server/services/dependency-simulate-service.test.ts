import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Sql } from 'postgres';
import { DependencyRepository } from '../db/dependency-repository.js';
import { DependencySimulateService } from './dependency-simulate-service.js';
import { createTestDatabase } from '../db/test-db-helpers.js';

describe('DependencySimulateService', () => {
  let sql: Sql;
  let cleanup: () => Promise<void>;
  let repository: DependencyRepository;
  let simulateService: DependencySimulateService;

  before(async () => {
    ({ sql, cleanup } = await createTestDatabase());
    repository = new DependencyRepository(sql);
    simulateService = new DependencySimulateService(repository);
  });

  after(async () => {
    await cleanup();
  });

  test('simulateVariableChange returns warning for unknown variable', async () => {
    const result = await simulateService.simulateVariableChange(
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

  test('simulateVariableChange returns correct impact for known variable', async () => {
    const consumer = await repository.addConsumer({
      ds_file_key: 'test-ds-2',
      consumer_file_key: 'test-consumer-2',
      consumer_name: 'Test Consumer 2',
    });

    await repository.saveSyncRun({
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

    const result = await simulateService.simulateVariableChange(
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

  test('simulateVariableChange calculates high impact correctly', async () => {
    const consumer = await repository.addConsumer({
      ds_file_key: 'test-ds-3',
      consumer_file_key: 'test-consumer-3',
      consumer_name: 'High Usage Consumer',
    });

    await repository.saveSyncRun({
      consumer_id: consumer.id,
      duration_ms: 1000,
      status: 'ok',
      component_usage: [],
      variable_usage: [
        {
          variable_key: 'VariableID:789:012',
          variable_name: 'spacing-lg',
          variable_type: 'FLOAT',
          node_count: 25,
          sample_node_ids_json: JSON.stringify(['node1', 'node2']),
        },
      ],
      warnings: [],
    });

    const result = await simulateService.simulateVariableChange(
      'test-ds-3',
      'VariableID:789:012',
      '24'
    );

    assert.strictEqual(result.impactLevel, 'HIGH');
    assert.strictEqual(result.totalNodes, 25);
  });

  test('simulateVariableChange handles multiple consumers', async () => {
    const consumer1 = await repository.addConsumer({
      ds_file_key: 'test-ds-4',
      consumer_file_key: 'test-consumer-4',
      consumer_name: 'Consumer 1',
    });

    const consumer2 = await repository.addConsumer({
      ds_file_key: 'test-ds-4',
      consumer_file_key: 'test-consumer-5',
      consumer_name: 'Consumer 2',
    });

    await repository.saveSyncRun({
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

    await repository.saveSyncRun({
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

    const result = await simulateService.simulateVariableChange(
      'test-ds-4',
      'VariableID:global:font-size',
      '16'
    );

    assert.strictEqual(result.totalNodes, 7); // 3 + 4
    assert.strictEqual(result.totalConsumers, 2);
    assert.strictEqual(result.affectedConsumers.length, 2);
    assert.strictEqual(result.impactLevel, 'MEDIUM'); // 7 nodes > medium threshold (5)

    const consumerNames = result.affectedConsumers.map(c => c.consumerName).sort();
    assert.deepStrictEqual(consumerNames, ['Consumer 1', 'Consumer 2']);
  });

  test('simulateVariableChange respects custom thresholds', async () => {
    const consumer = await repository.addConsumer({
      ds_file_key: 'test-ds-5',
      consumer_file_key: 'test-consumer-5',
      consumer_name: 'Custom Threshold Consumer',
    });

    await repository.saveSyncRun({
      consumer_id: consumer.id,
      duration_ms: 1000,
      status: 'ok',
      component_usage: [],
      variable_usage: [
        {
          variable_key: 'VariableID:custom:color',
          variable_name: 'accent-color',
          variable_type: 'COLOR',
          node_count: 25,
          sample_node_ids_json: JSON.stringify(['node1']),
        },
      ],
      warnings: [],
    });

    const defaultResult = await simulateService.simulateVariableChange(
      'test-ds-5',
      'VariableID:custom:color',
      '#purple'
    );
    assert.strictEqual(defaultResult.impactLevel, 'HIGH');

    const customResult = await simulateService.simulateVariableChange(
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

  test('simulateVariableChange limits sample links', async () => {
    const consumer = await repository.addConsumer({
      ds_file_key: 'test-ds-6',
      consumer_file_key: 'test-consumer-6',
      consumer_name: 'Many Samples Consumer',
    });

    const manyNodeIds = Array.from({ length: 10 }, (_, i) => `node${i + 1}`);

    await repository.saveSyncRun({
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

    const result = await simulateService.simulateVariableChange(
      'test-ds-6',
      'VariableID:many:samples',
      '8',
      { maxSampleLinks: 3 }
    );

    assert.strictEqual(result.affectedConsumers[0].sampleLinks.length, 3);
    assert.strictEqual(result.affectedConsumers[0].sampleNodeIds.length, 10);
  });

  test('simulateVariableChange handles JSONB arrays from postgres.js', async () => {
    const consumer = await repository.addConsumer({
      ds_file_key: 'test-ds-jsonb-array',
      consumer_file_key: 'test-consumer-jsonb-array',
      consumer_name: 'JSONB Array Consumer',
    });

    await repository.saveSyncRun({
      consumer_id: consumer.id,
      duration_ms: 1000,
      status: 'ok',
      component_usage: [],
      variable_usage: [
        {
          variable_key: 'VariableID:jsonb:array',
          variable_name: 'jsonb-array',
          variable_type: 'COLOR',
          node_count: 2,
          sample_node_ids_json: ['node-a', 'node-b'],
        },
      ],
      warnings: [],
    });

    const result = await simulateService.simulateVariableChange(
      'test-ds-jsonb-array',
      'VariableID:jsonb:array',
      '#000000',
    );

    assert.strictEqual(result.totalNodes, 2);
    assert.strictEqual(result.affectedConsumers.length, 1);
    assert.deepStrictEqual(result.affectedConsumers[0].sampleNodeIds, ['node-a', 'node-b']);
    assert.strictEqual(result.affectedConsumers[0].sampleLinks.length, 2);
  });
});
