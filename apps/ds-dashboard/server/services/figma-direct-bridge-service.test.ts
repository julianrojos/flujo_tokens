import assert from 'node:assert/strict';
import test from 'node:test';

import {
  fetchVariablesDirect,
  fetchDesignSystemKitDirect,
  type GetVariablesDataResult,
  type GetStylesResult,
} from './figma-direct-bridge-service.ts';
import { getPluginConnectionManager, resetPluginConnectionManager, type PluginWebSocket } from './plugin-connection-manager.ts';

function makeSocket(onSend: (data: string) => void): PluginWebSocket {
  return {
    readyState: 1,
    protocol: '',
    send(data: string) {
      onSend(data);
    },
    close() {},
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
