/**
 * Tests for Map Bridge Methods to Capabilities
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { mapBridgeMethodsToCapabilities } from './map-bridge-methods-to-capabilities.ts';

test('mapBridgeMethodsToCapabilities: returns all false for empty methods', () => {
  const result = mapBridgeMethodsToCapabilities([]);

  // Legacy supports
  assert.equal(result.supports.searchNodes, false);
  assert.equal(result.supports.getChildren, false);
  assert.equal(result.supports.searchStyles, false);
  assert.equal(result.supports.searchVariables, false);
  assert.equal(result.supports.portSwitch, false);

  // V2 supports
  assert.equal(result.supportsV2.hasFileInfo, false);
  assert.equal(result.supportsV2.hasComponent, false);
  assert.equal(result.supportsV2.hasLocalStyles, false);
  assert.equal(result.supportsV2.hasVariablesData, false);
  assert.equal(result.supportsV2.hasPortSwitch, false);
});

test('mapBridgeMethodsToCapabilities: maps all methods correctly', () => {
  const result = mapBridgeMethodsToCapabilities([
    'GET_FILE_INFO',
    'GET_COMPONENT',
    'GET_LOCAL_STYLES',
    'GET_VARIABLES_DATA',
  ]);

  // Legacy supports
  assert.equal(result.supports.searchNodes, true);
  assert.equal(result.supports.getChildren, true);
  assert.equal(result.supports.searchStyles, true);
  assert.equal(result.supports.searchVariables, true);
  assert.equal(result.supports.portSwitch, false);

  // V2 supports
  assert.equal(result.supportsV2.hasFileInfo, true);
  assert.equal(result.supportsV2.hasComponent, true);
  assert.equal(result.supportsV2.hasLocalStyles, true);
  assert.equal(result.supportsV2.hasVariablesData, true);
  assert.equal(result.supportsV2.hasPortSwitch, false);
});

test('mapBridgeMethodsToCapabilities: handles partial methods', () => {
  const result = mapBridgeMethodsToCapabilities(['GET_FILE_INFO', 'GET_VARIABLES_DATA']);

  // Legacy supports
  assert.equal(result.supports.searchNodes, true);
  assert.equal(result.supports.getChildren, false);
  assert.equal(result.supports.searchStyles, false);
  assert.equal(result.supports.searchVariables, true);
  assert.equal(result.supports.portSwitch, false);

  // V2 supports
  assert.equal(result.supportsV2.hasFileInfo, true);
  assert.equal(result.supportsV2.hasComponent, false);
  assert.equal(result.supportsV2.hasLocalStyles, false);
  assert.equal(result.supportsV2.hasVariablesData, true);
  assert.equal(result.supportsV2.hasPortSwitch, false);
});

test('mapBridgeMethodsToCapabilities: legacy and V2 flags are consistent', () => {
  const methods = ['GET_FILE_INFO', 'GET_COMPONENT', 'GET_LOCAL_STYLES', 'GET_VARIABLES_DATA'];
  const result = mapBridgeMethodsToCapabilities(methods);

  // Verify legacy and V2 flags map correctly
  assert.equal(result.supports.searchNodes, result.supportsV2.hasFileInfo);
  assert.equal(result.supports.getChildren, result.supportsV2.hasComponent);
  assert.equal(result.supports.searchStyles, result.supportsV2.hasLocalStyles);
  assert.equal(result.supports.searchVariables, result.supportsV2.hasVariablesData);
  assert.equal(result.supports.portSwitch, result.supportsV2.hasPortSwitch);
});

test('mapBridgeMethodsToCapabilities: ignores unknown methods', () => {
  const result = mapBridgeMethodsToCapabilities(['UNKNOWN_METHOD', 'GET_FILE_INFO']);

  // Only GET_FILE_INFO should be mapped
  assert.equal(result.supports.searchNodes, true);
  assert.equal(result.supports.getChildren, false);
  assert.equal(result.supports.searchStyles, false);
  assert.equal(result.supports.searchVariables, false);
});
