import assert from 'node:assert/strict';
import test from 'node:test';

import {
  fetchVariablesDirect,
  fetchDesignSystemKitDirect,
  type GetVariablesDataResult,
  type GetStylesResult,
} from './figma-direct-bridge-service.ts';
import { getPluginConnectionManager, resetPluginConnectionManager, type PluginWebSocket } from './plugin-connection-manager.ts';
import { getSharedResponseCache } from './response-cache.ts';

function makeSocket(onSend: (data: string) => void): PluginWebSocket {
  return {
    readyState: 1,
    protocol: '',
    send(data: string) {
      onSend(data);
    },
    close() { },
    onopen: null,
    onclose: null,
    onerror: null,
    onmessage: null,
  };
}

test('figma-direct-bridge-service: fetchVariablesDirect normalizes arrays into meta maps', async () => {
  resetPluginConnectionManager();
  const manager = getPluginConnectionManager();
  let socketId = '';

  const socket = makeSocket((data) => {
    const request = JSON.parse(data) as { id: string; method: string };
    const variablesResult: GetVariablesDataResult = {
      success: true,
      timestamp: Date.now(),
      fileKey: 'FILE_1',
      variables: [
        {
          id: 'var_1',
          name: 'color/primary',
          key: 'k1',
          resolvedType: 'COLOR',
          valuesByMode: { light: '#ffffff' },
          variableCollectionId: 'col_1',
          scopes: [],
          description: '',
          hiddenFromPublishing: false,
        },
      ],
      variableCollections: [
        {
          id: 'col_1',
          name: 'Primitives',
          key: 'c1',
          modes: [{ modeId: 'light', name: 'Light' }],
          defaultModeId: 'light',
          variableIds: ['var_1'],
        },
      ],
    };

    manager.handleMessage(socketId, JSON.stringify({ id: request.id, result: variablesResult }));
  });

  socketId = manager.register(socket, {
    fileKey: 'FILE_1',
    docName: 'Doc',
    pluginVersion: '1.0.0',
    pluginBuild: 'test',
    timestamp: Date.now(),
  });

  const result = await fetchVariablesDirect('FILE_1');
  assert.equal(result.meta.variables.var_1?.name, 'color/primary');
  assert.equal(result.meta.variableCollections.col_1?.name, 'Primitives');
});

test('figma-direct-bridge-service: fetchDesignSystemKitDirect aggregates variables and styles', async () => {
  resetPluginConnectionManager();
  const manager = getPluginConnectionManager();
  let socketId = '';

  const socket = makeSocket((data) => {
    const request = JSON.parse(data) as { id: string; method: string };

    if (request.method === 'GET_VARIABLES_DATA') {
      const variablesResult: GetVariablesDataResult = {
        success: true,
        timestamp: Date.now(),
        fileKey: 'FILE_2',
        variables: [],
        variableCollections: [],
      };
      manager.handleMessage(socketId, JSON.stringify({ id: request.id, result: variablesResult }));
      return;
    }

    const stylesResult: GetStylesResult = {
      success: true,
      timestamp: Date.now(),
      fileKey: 'FILE_2',
      styles: [{ id: 's1', name: 'Heading', styleType: 'TEXT', description: 'title' }],
    };
    manager.handleMessage(socketId, JSON.stringify({ id: request.id, result: stylesResult }));
  });

  socketId = manager.register(socket, {
    fileKey: 'FILE_2',
    docName: 'Doc',
    pluginVersion: '1.0.0',
    pluginBuild: 'test',
    timestamp: Date.now(),
  });

  const result = await fetchDesignSystemKitDirect('FILE_2');
  assert.equal(result.ok, true);
  assert.equal(result.styles?.[0]?.name, 'Heading');
});

test('figma-direct-bridge-service: fetchDesignSystemKitDirect respects include filter', async () => {
  resetPluginConnectionManager();
  const manager = getPluginConnectionManager();
  let socketId = '';

  const socket = makeSocket((data) => {
    const request = JSON.parse(data) as { id: string; method: string };

    if (request.method === 'GET_VARIABLES_DATA') {
      const variablesResult: GetVariablesDataResult = {
        success: true,
        timestamp: Date.now(),
        fileKey: 'FILE_3',
        variables: [],
        variableCollections: [],
      };
      manager.handleMessage(socketId, JSON.stringify({ id: request.id, result: variablesResult }));
      return;
    }

    const stylesResult: GetStylesResult = {
      success: true,
      timestamp: Date.now(),
      fileKey: 'FILE_3',
      styles: [{ id: 's2', name: 'Body', styleType: 'TEXT', description: 'body text' }],
    };
    manager.handleMessage(socketId, JSON.stringify({ id: request.id, result: stylesResult }));
  });

  socketId = manager.register(socket, {
    fileKey: 'FILE_3',
    docName: 'Doc',
    pluginVersion: '1.0.0',
    pluginBuild: 'test',
    timestamp: Date.now(),
  });

  const stylesOnlyResult = await fetchDesignSystemKitDirect('FILE_3', {
    include: ['styles'],
  });
  assert.equal(stylesOnlyResult.ok, true);
  assert.equal('tokens' in stylesOnlyResult, false);
  assert.equal(stylesOnlyResult.styles?.[0]?.name, 'Body');
});

test('figma-direct-bridge-service: fetchDesignSystemKitDirect treats format as compatibility no-op', async () => {
  resetPluginConnectionManager();
  const manager = getPluginConnectionManager();
  let socketId = '';

  const socket = makeSocket((data) => {
    const request = JSON.parse(data) as { id: string; method: string };

    if (request.method === 'GET_VARIABLES_DATA') {
      const variablesResult: GetVariablesDataResult = {
        success: true,
        timestamp: Date.now(),
        fileKey: 'FILE_4',
        variables: [],
        variableCollections: [],
      };
      manager.handleMessage(socketId, JSON.stringify({ id: request.id, result: variablesResult }));
      return;
    }

    const stylesResult: GetStylesResult = {
      success: true,
      timestamp: Date.now(),
      fileKey: 'FILE_4',
      styles: [{ id: 's3', name: 'Caption', styleType: 'TEXT', description: 'caption' }],
    };
    manager.handleMessage(socketId, JSON.stringify({ id: request.id, result: stylesResult }));
  });

  socketId = manager.register(socket, {
    fileKey: 'FILE_4',
    docName: 'Doc',
    pluginVersion: '1.0.0',
    pluginBuild: 'test',
    timestamp: Date.now(),
  });

  const result = await fetchDesignSystemKitDirect('FILE_4', {
    format: 'summary',
    include: ['tokens', 'styles'],
  });

  assert.equal(result.ok, true);
  assert.equal(typeof result.tokens, 'object');
  assert.equal(result.styles?.[0]?.name, 'Caption');
});

test('figma-direct-bridge-service: fetchVariablesDirect falls back to single unkeyed socket when requested fileKey is unavailable', async () => {
  resetPluginConnectionManager();
  const manager = getPluginConnectionManager();
  let socketId = '';
  let requestCount = 0;

  const socket = makeSocket((data) => {
    const request = JSON.parse(data) as { id: string; method: string };
    requestCount += 1;
    assert.equal(request.method, 'GET_VARIABLES_DATA');

    const variablesResult: GetVariablesDataResult = {
      success: true,
      timestamp: Date.now(),
      fileKey: null,
      variables: [
        {
          id: 'var_draft_1',
          name: 'color/draft-primary',
          key: 'kd1',
          resolvedType: 'COLOR',
          valuesByMode: { light: '#111111' },
          variableCollectionId: 'col_draft_1',
          scopes: [],
          description: '',
          hiddenFromPublishing: false,
        },
      ],
      variableCollections: [
        {
          id: 'col_draft_1',
          name: 'Draft Tokens',
          key: 'cd1',
          modes: [{ modeId: 'light', name: 'Light' }],
          defaultModeId: 'light',
          variableIds: ['var_draft_1'],
        },
      ],
    };

    manager.handleMessage(socketId, JSON.stringify({ id: request.id, result: variablesResult }));
  });

  socketId = manager.register(socket, {
    fileKey: null,
    docName: 'Draft Doc',
    pluginVersion: '1.0.0',
    pluginBuild: 'test',
    timestamp: Date.now(),
  });

  const result = await fetchVariablesDirect('FILE_KEY_FROM_URL');
  assert.equal(result.meta.variables.var_draft_1?.name, 'color/draft-primary');
  assert.equal(requestCount, 1);
});

// Test S-06: cache-hit on second call
test('figma-direct-bridge-service: fetchVariablesDirect uses cache on second call with same fileKey', async () => {
  resetPluginConnectionManager();
  // Clear cache before test
  getSharedResponseCache().clear();

  const manager = getPluginConnectionManager();
  let socketId = '';
  let requestCount = 0;

  const socket = makeSocket((data) => {
    const request = JSON.parse(data) as { id: string; method: string };
    requestCount += 1;
    assert.equal(request.method, 'GET_VARIABLES_DATA');

    const variablesResult: GetVariablesDataResult = {
      success: true,
      timestamp: Date.now(),
      fileKey: 'FILE_CACHE_TEST',
      variables: [
        {
          id: 'var_cache_1',
          name: 'color/cached',
          key: 'kc1',
          resolvedType: 'COLOR',
          valuesByMode: { light: '#cccccc' },
          variableCollectionId: 'col_cache_1',
          scopes: [],
          description: '',
          hiddenFromPublishing: false,
        },
      ],
      variableCollections: [
        {
          id: 'col_cache_1',
          name: 'Cached Tokens',
          key: 'cc1',
          modes: [{ modeId: 'light', name: 'Light' }],
          defaultModeId: 'light',
          variableIds: ['var_cache_1'],
        },
      ],
    };

    manager.handleMessage(socketId, JSON.stringify({ id: request.id, result: variablesResult }));
  });

  socketId = manager.register(socket, {
    fileKey: 'FILE_CACHE_TEST',
    docName: 'Cache Test Doc',
    pluginVersion: '1.0.0',
    pluginBuild: 'test',
    timestamp: Date.now(),
  });

  // First call - should hit the plugin
  const result1 = await fetchVariablesDirect('FILE_CACHE_TEST');
  assert.equal(result1.meta.variables.var_cache_1?.name, 'color/cached');
  assert.equal(requestCount, 1);

  // Second call - should use cache, not hit the plugin again
  const result2 = await fetchVariablesDirect('FILE_CACHE_TEST');
  assert.equal(result2.meta.variables.var_cache_1?.name, 'color/cached');
  assert.equal(requestCount, 1); // Should still be 1, not 2

  // Cleanup
  getSharedResponseCache().clear();
});
