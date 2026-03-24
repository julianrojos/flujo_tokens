import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import type { DsCatalog, DsComponentCatalog, DsVariableCatalog } from './figma-rest-consumer-service';

const originalFetch = globalThis.fetch;
const originalDashboardInternalUrl = process.env.DS_DASHBOARD_INTERNAL_URL;
const originalDashboardInternalToken = process.env.DS_DASHBOARD_INTERNAL_TOKEN;

describe('FigmaRestConsumerService', () => {
  beforeEach(() => {
    (globalThis as { fetch: typeof fetch }).fetch = originalFetch;
    delete process.env.DS_DASHBOARD_INTERNAL_URL;
    delete process.env.DS_DASHBOARD_INTERNAL_TOKEN;
  });

  afterEach(() => {
    (globalThis as { fetch: typeof fetch }).fetch = originalFetch;
    if (originalDashboardInternalUrl === undefined) {
      delete process.env.DS_DASHBOARD_INTERNAL_URL;
    } else {
      process.env.DS_DASHBOARD_INTERNAL_URL = originalDashboardInternalUrl;
    }
    if (originalDashboardInternalToken === undefined) {
      delete process.env.DS_DASHBOARD_INTERNAL_TOKEN;
    } else {
      process.env.DS_DASHBOARD_INTERNAL_TOKEN = originalDashboardInternalToken;
    }
  });

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

  test('buildDsCatalog uses MCP first and falls back to REST variables when MCP fails', async () => {
    process.env.DS_DASHBOARD_INTERNAL_URL = 'http://127.0.0.1:8787';
    const requestLog: string[] = [];

    (globalThis as { fetch: typeof fetch }).fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      requestLog.push(url);

      if (url.includes('/v1/files/ds-file-key/components')) {
        return new Response(
          JSON.stringify({
            status: 200,
            error: false,
            meta: {
              components: [
                { key: 'comp.button.primary', name: 'Button/Primary', node_id: '1:1', description: '' },
              ],
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }

      if (url.includes('/v1/files/ds-file-key/variables/local')) {
        return new Response(
          JSON.stringify({
            meta: {
              variableCollections: {
                'VariableCollectionId:1:1': { id: 'VariableCollectionId:1:1', name: 'Core' },
              },
              variables: {
                'VariableID:1:2': {
                  id: 'VariableID:1:2',
                  key: 'color.primary',
                  name: 'Primary',
                  resolvedType: 'COLOR',
                  variableCollectionId: 'VariableCollectionId:1:1',
                },
              },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }

      if (url.includes('/v1/files/ds-file-key')) {
        return new Response(
          JSON.stringify({
            name: 'DS File',
            lastModified: '2026-03-21T00:00:00Z',
            document: { id: '0:0', name: 'Root', type: 'DOCUMENT' },
            components: {
              '1:1': { key: 'comp.button.primary', name: 'Button/Primary' },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }

      if (url.endsWith('/api/figma-mcp-variables')) {
        return new Response('mcp unavailable', { status: 503, statusText: 'Service Unavailable' });
      }

      throw new Error(`Unexpected fetch URL in test: ${url}`);
    }) as typeof fetch;

    const { buildDsCatalog } = await import('./figma-rest-consumer-service');
    const catalog = await buildDsCatalog('ds-file-key', 'figd_test_token');

    assert.equal(catalog.components.size, 1);
    assert.equal(catalog.variables.size, 1);
    assert.ok(catalog.variables.has('color.primary'));

    const mcpAttemptIndex = requestLog.findIndex((url) => url.endsWith('/api/figma-mcp-variables'));
    const restVariablesIndex = requestLog.findIndex((url) => url.includes('/v1/files/ds-file-key/variables/local'));
    assert.ok(mcpAttemptIndex >= 0, 'Expected MCP variables attempt');
    assert.ok(restVariablesIndex >= 0, 'Expected REST variables fallback');
    assert.ok(mcpAttemptIndex < restVariablesIndex, 'Expected MCP attempt before REST fallback');
  });

  test('scanConsumerFile resolves DS component instances by DS component ID when consumer components map is empty', async () => {
    process.env.DS_DASHBOARD_INTERNAL_URL = 'http://127.0.0.1:8787';

    (globalThis as { fetch: typeof fetch }).fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.endsWith('/api/figma-mcp-variables')) {
        return new Response('mcp unavailable', { status: 503, statusText: 'Service Unavailable' });
      }

      if (url.includes('/v1/files/consumer-file-key/variables/local')) {
        return new Response(
          JSON.stringify({
            meta: {
              variableCollections: {},
              variables: {},
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }

      if (url.includes('/v1/files/consumer-file-key')) {
        return new Response(
          JSON.stringify({
            name: 'Consumer File',
            lastModified: '2026-03-24T00:00:00Z',
            document: {
              id: '0:0',
              name: 'Document',
              type: 'DOCUMENT',
              children: [
                {
                  id: '1:0',
                  name: 'Page 1',
                  type: 'CANVAS',
                  children: [
                    {
                      id: '2:10',
                      name: 'Button Instance',
                      type: 'INSTANCE',
                      componentId: '1:1',
                    },
                  ],
                },
              ],
            },
            // Intentionally empty: consumer may only use external library components.
            components: {},
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }

      throw new Error(`Unexpected fetch URL in test: ${url}`);
    }) as typeof fetch;

    const { scanConsumerFile } = await import('./figma-rest-consumer-service');
    const dsCatalog: DsCatalog = {
      components: new Map([
        ['comp.button.primary', { key: 'comp.button.primary', name: 'Button/Primary', id: '1:1' }],
      ]),
      variables: new Map(),
      variableIdToKey: new Map(),
    };

    const result = await scanConsumerFile('consumer-file-key', 'figd_test_token', dsCatalog);
    assert.equal(result.componentInstances.length, 1);
    assert.equal(result.componentInstances[0]?.componentKey, 'comp.button.primary');
    assert.deepEqual(result.componentInstances[0]?.nodeIds, ['2:10']);
  });

  test('scanConsumerFile does not emit unmatched-component warning below threshold', async () => {
    process.env.DS_DASHBOARD_INTERNAL_URL = 'http://127.0.0.1:8787';

    (globalThis as { fetch: typeof fetch }).fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.endsWith('/api/figma-mcp-variables')) {
        return new Response('mcp unavailable', { status: 503, statusText: 'Service Unavailable' });
      }

      if (url.includes('/v1/files/consumer-file-key/variables/local')) {
        return new Response(
          JSON.stringify({
            meta: {
              variableCollections: {},
              variables: {},
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }

      if (url.includes('/v1/files/consumer-file-key')) {
        return new Response(
          JSON.stringify({
            name: 'Consumer File',
            lastModified: '2026-03-24T00:00:00Z',
            document: {
              id: '0:0',
              name: 'Document',
              type: 'DOCUMENT',
              children: [
                {
                  id: '1:0',
                  name: 'Page 1',
                  type: 'CANVAS',
                  children: [
                    {
                      id: '2:10',
                      name: 'Button Instance',
                      type: 'INSTANCE',
                      componentId: '1:1',
                    },
                    {
                      id: '2:11',
                      name: 'Unknown Instance',
                      type: 'INSTANCE',
                      componentId: '9:9',
                    },
                  ],
                },
              ],
            },
            components: {},
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }

      throw new Error(`Unexpected fetch URL in test: ${url}`);
    }) as typeof fetch;

    const { scanConsumerFile } = await import('./figma-rest-consumer-service');
    const dsCatalog: DsCatalog = {
      components: new Map([
        ['comp.button.primary', { key: 'comp.button.primary', name: 'Button/Primary', id: '1:1' }],
      ]),
      variables: new Map(),
      variableIdToKey: new Map(),
    };

    const result = await scanConsumerFile('consumer-file-key', 'figd_test_token', dsCatalog);
    assert.equal(result.componentInstances.length, 1);
    assert.equal(
      result.warnings.some((warning) => warning.code === 'deps.consumer.unmatched_component_ids'),
      false,
    );
  });
});
