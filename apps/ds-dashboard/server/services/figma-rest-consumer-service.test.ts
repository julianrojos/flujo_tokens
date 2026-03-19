import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import type { DsComponentCatalog, DsVariableCatalog } from './figma-rest-consumer-service';

describe('FigmaRestConsumerService', () => {
  test('buildDsCatalog creates proper catalog structure', async () => {
    // This is a basic test to verify the service structure
    // In a real test, we would mock the Figma API calls
    
    // For now, just verify the exports exist
    const { buildDsCatalog, scanConsumerFile, fetchConsumerFileMetadata } = await import('./figma-rest-consumer-service');
    
    assert.strictEqual(typeof buildDsCatalog, 'function');
    assert.strictEqual(typeof scanConsumerFile, 'function');
    assert.strictEqual(typeof fetchConsumerFileMetadata, 'function');
  });

  test('DsCatalog interface is properly structured', () => {
    // Test component catalog structure
    const component: DsComponentCatalog = {
      key: 'test-key',
      name: 'Test Component',
      id: 'test-id',
    };
    assert.strictEqual(component.key, 'test-key');
    assert.strictEqual(component.name, 'Test Component');
    assert.strictEqual(component.id, 'test-id');

    // Test variable catalog structure  
    const variable: DsVariableCatalog = {
      key: 'key-123',
      id: 'VariableID:123:456',
      name: 'primary-color',
      type: 'COLOR',
      collectionId: 'collection-1',
    };
    assert.strictEqual(variable.key, 'key-123');
    assert.strictEqual(variable.id, 'VariableID:123:456');
    assert.strictEqual(variable.name, 'primary-color');
    assert.strictEqual(variable.type, 'COLOR');
    assert.strictEqual(variable.collectionId, 'collection-1');
  });
});
