import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Sql } from 'postgres';
import { DependencyRepository } from '../db/dependency-repository.js';
import { DependencyAnalysisService } from './dependency-analysis-service.js';
import { createTestDatabase } from '../db/test-db-helpers.js';

describe('DependencyAnalysisService', () => {
  let sql: Sql;
  let cleanup: () => Promise<void>;
  let repository: DependencyRepository;
  let analysisService: DependencyAnalysisService;

  before(async () => {
    ({ sql, cleanup } = await createTestDatabase());
    repository = new DependencyRepository(sql);
    analysisService = new DependencyAnalysisService(repository);
  });

  after(async () => {
    await cleanup();
  });

  test('reportByFile returns empty for no consumers', async () => {
    const reports = await analysisService.reportByFile('non-existent-ds');
    assert.strictEqual(reports.length, 0);
  });

  test('reportByFile returns consumer with no sync data', async () => {
    await repository.addConsumer({
      ds_file_key: 'test-ds',
      consumer_file_key: 'test-consumer',
      consumer_name: 'Test Consumer',
    });

    const reports = await analysisService.reportByFile('test-ds');

    assert.strictEqual(reports.length, 1);
    assert.strictEqual(reports[0].consumerName, 'Test Consumer');
    assert.strictEqual(reports[0].status, 'skipped');
    assert.strictEqual(reports[0].componentCount, 0);
    assert.strictEqual(reports[0].variableCount, 0);
  });

  test('reportByFile returns consumer with sync data', async () => {
    const consumer = await repository.addConsumer({
      ds_file_key: 'test-ds-2',
      consumer_file_key: 'test-consumer-2',
      consumer_name: 'Test Consumer 2',
    });

    await repository.saveSyncRun({
      consumer_id: consumer.id,
      duration_ms: 1000,
      status: 'ok',
      component_usage: [
        {
          component_key: 'button',
          component_name: 'Button',
          instance_count: 5,
          sample_node_ids_json: JSON.stringify(['node1', 'node2']),
        },
      ],
      variable_usage: [
        {
          variable_key: 'VariableID:123:456',
          variable_name: 'primary-color',
          variable_type: 'COLOR',
          node_count: 3,
          sample_node_ids_json: JSON.stringify(['node3']),
        },
      ],
      warnings: [],
    });

    const reports = await analysisService.reportByFile('test-ds-2');

    assert.strictEqual(reports.length, 1);
    assert.strictEqual(reports[0].consumerName, 'Test Consumer 2');
    assert.strictEqual(reports[0].status, 'ok');
    assert.strictEqual(reports[0].componentCount, 1);
    assert.strictEqual(reports[0].variableCount, 1);
    assert.strictEqual(reports[0].topComponents.length, 1);
    assert.strictEqual(reports[0].topVariables.length, 1);

    const component = reports[0].topComponents[0];
    assert.strictEqual(component.componentKey, 'button');
    assert.strictEqual(component.componentName, 'Button');
    assert.strictEqual(component.instanceCount, 5);
    assert.strictEqual(component.sampleLinks.length, 2);

    const variable = reports[0].topVariables[0];
    assert.strictEqual(variable.variableKey, 'VariableID:123:456');
    assert.strictEqual(variable.variableName, 'primary-color');
    assert.strictEqual(variable.variableType, 'COLOR');
    assert.strictEqual(variable.nodeCount, 3);
    assert.strictEqual(variable.sampleLinks.length, 1);
  });

  test('reportByComponent returns empty for no data', async () => {
    const reports = await analysisService.reportByComponent('non-existent-ds');
    assert.strictEqual(reports.length, 0);
  });

  test('reportByComponent returns component usage', async () => {
    const consumer = await repository.addConsumer({
      ds_file_key: 'test-ds-3',
      consumer_file_key: 'test-consumer-3',
      consumer_name: 'Test Consumer 3',
    });

    await repository.saveSyncRun({
      consumer_id: consumer.id,
      duration_ms: 1000,
      status: 'ok',
      component_usage: [
        {
          component_key: 'card',
          component_name: 'Card',
          instance_count: 10,
          sample_node_ids_json: JSON.stringify(['node1', 'node2', 'node3']),
        },
      ],
      variable_usage: [],
      warnings: [],
    });

    const reports = await analysisService.reportByComponent('test-ds-3');

    assert.strictEqual(reports.length, 1);
    const report = reports[0];
    assert.strictEqual(report.componentKey, 'card');
    assert.strictEqual(report.componentName, 'Card');
    assert.strictEqual(report.totalInstances, 10);
    assert.strictEqual(report.consumers.length, 1);
    assert.strictEqual(report.consumers[0].instanceCount, 10);
    assert.strictEqual(report.sampleLinks.length, 3);
  });

  test('reportByVariable returns empty for no data', async () => {
    const reports = await analysisService.reportByVariable('non-existent-ds');
    assert.strictEqual(reports.length, 0);
  });

  test('reportByVariable returns variable usage', async () => {
    const consumer = await repository.addConsumer({
      ds_file_key: 'test-ds-4',
      consumer_file_key: 'test-consumer-4',
      consumer_name: 'Test Consumer 4',
    });

    await repository.saveSyncRun({
      consumer_id: consumer.id,
      duration_ms: 1000,
      status: 'ok',
      component_usage: [],
      variable_usage: [
        {
          variable_key: 'VariableID:789:012',
          variable_name: 'spacing-md',
          variable_type: 'FLOAT',
          node_count: 7,
          sample_node_ids_json: JSON.stringify(['node1', 'node2']),
        },
      ],
      warnings: [],
    });

    const reports = await analysisService.reportByVariable('test-ds-4');

    assert.strictEqual(reports.length, 1);
    const report = reports[0];
    assert.strictEqual(report.variableKey, 'VariableID:789:012');
    assert.strictEqual(report.variableName, 'spacing-md');
    assert.strictEqual(report.variableType, 'FLOAT');
    assert.strictEqual(report.totalNodes, 7);
    assert.strictEqual(report.consumers.length, 1);
    assert.strictEqual(report.consumers[0].nodeCount, 7);
    assert.strictEqual(report.sampleLinks.length, 2);
  });

  test('reportByVariable includes parent-only variable usage for token reports', async () => {
    await repository.replaceParentVariableUsage('test-ds-parent-only', [
      {
        variable_key: 'VariableID:parent:only',
        variable_name: 'parent-only-color',
        variable_type: 'COLOR',
        node_count: 4,
        sample_node_ids_json: JSON.stringify(['parent-node-1']),
      },
    ]);

    const reports = await analysisService.reportByVariable('test-ds-parent-only');

    assert.strictEqual(reports.length, 1);
    const report = reports[0];
    assert.strictEqual(report.variableKey, 'VariableID:parent:only');
    assert.strictEqual(report.variableName, 'parent-only-color');
    assert.strictEqual(report.variableType, 'COLOR');
    assert.strictEqual(report.totalNodes, 0);
    assert.strictEqual(report.consumers.length, 1);
    assert.strictEqual(
      report.consumers[0].consumerId,
      'parent:test-ds-parent-only',
    );
    assert.strictEqual(report.consumers[0].consumerName, 'Parent file');
    assert.strictEqual(report.consumers[0].nodeCount, 4);
    assert.deepStrictEqual(report.consumers[0].sampleNodeIds, [
      'parent-node-1',
    ]);
    assert.strictEqual(report.sampleLinks.length, 1);
  });

  test('reportByVariable tolerates malformed sample_node_ids_json', async () => {
    const consumer = await repository.addConsumer({
      ds_file_key: 'test-ds-malformed-json',
      consumer_file_key: 'test-consumer-malformed-json',
      consumer_name: 'Malformed Json Consumer',
    });

    await repository.saveSyncRun({
      consumer_id: consumer.id,
      duration_ms: 1000,
      status: 'ok',
      component_usage: [],
      variable_usage: [
        {
          variable_key: 'VariableID:bad:json',
          variable_name: 'bad-json',
          variable_type: 'COLOR',
          node_count: 1,
          sample_node_ids_json: '{"not":"an-array"}',
        },
      ],
      warnings: [],
    });

    const reports = await analysisService.reportByVariable('test-ds-malformed-json');
    assert.strictEqual(reports.length, 1);
    assert.deepStrictEqual(reports[0].consumers[0].sampleNodeIds, []);
    assert.deepStrictEqual(reports[0].sampleLinks, []);
  });

  test('reportByVariable handles JSONB arrays from postgres.js', async () => {
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

    const reports = await analysisService.reportByVariable('test-ds-jsonb-array');
    assert.strictEqual(reports.length, 1);
    assert.deepStrictEqual(reports[0].consumers[0].sampleNodeIds, ['node-a', 'node-b']);
    assert.strictEqual(reports[0].sampleLinks.length, 2);
  });

  test('impact level computation works correctly', async () => {
    // Test LOW impact (test-ds-2 consumer has 1 component + 1 variable = 2 total nodes)
    const lowReports = await analysisService.reportByFile('test-ds-2');
    assert.strictEqual(lowReports[0].impactLevel.level, 'LOW');

    const highConsumer = await repository.addConsumer({
      ds_file_key: 'test-ds-5',
      consumer_file_key: 'test-consumer-5',
      consumer_name: 'High Usage Consumer',
    });

    await repository.saveSyncRun({
      consumer_id: highConsumer.id,
      duration_ms: 1000,
      status: 'ok',
      component_usage: [
        {
          component_key: 'button',
          component_name: 'Button',
          instance_count: 25,
          sample_node_ids_json: JSON.stringify(['node1']),
        },
      ],
      variable_usage: [],
      warnings: [],
    });

    // Get the report - impact is based on component_count + variable_count from latest sync
    const report = (await analysisService.reportByFile('test-ds-5'))[0];
    // With 1 component and 0 variables, impact should be LOW (1 <= 5 medium threshold)
    assert.strictEqual(report.impactLevel.level, 'LOW');
  });
});
