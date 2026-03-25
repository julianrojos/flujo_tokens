import { afterEach, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { scanConsumerFile, type DsCatalog } from './figma-rest-consumer-service.js';

const originalFetch = globalThis.fetch;
const originalDashboardInternalUrl = process.env.DS_DASHBOARD_INTERNAL_URL;

function makeDsCatalog(args?: {
  componentId?: string;
  componentKey?: string;
  variableId?: string;
  variableKey?: string;
}): DsCatalog {
  const componentId = args?.componentId ?? '1:1';
  const componentKey = args?.componentKey ?? 'comp.button.primary';
  const variableId = args?.variableId ?? 'VariableID:1:1';
  const variableKey = args?.variableKey ?? 'color.primary';

  return {
    components: new Map([[componentKey, { key: componentKey, name: 'Button/Primary', id: componentId }]]),
    variables: new Map([
      [
        variableKey,
        {
          key: variableKey,
          id: variableId,
          name: 'Primary',
          type: 'COLOR',
          collectionId: 'VariableCollectionId:1:1',
        },
      ],
    ]),
    variableIdToKey: new Map([[variableId, variableKey]]),
  };
}

describe('scanConsumerFile local-count derivation', () => {
  beforeEach(() => {
    (globalThis as { fetch: typeof fetch }).fetch = originalFetch;
    process.env.DS_DASHBOARD_INTERNAL_URL = 'http://127.0.0.1:8787';
  });

  afterEach(() => {
    (globalThis as { fetch: typeof fetch }).fetch = originalFetch;
    if (originalDashboardInternalUrl === undefined) {
      delete process.env.DS_DASHBOARD_INTERNAL_URL;
    } else {
      process.env.DS_DASHBOARD_INTERNAL_URL = originalDashboardInternalUrl;
    }
  });

  test('derives localComponentDefinedCount from fileResponse.components and localComponentUsedCount from unmatched instances', async () => {
    const dsCatalog = makeDsCatalog({ componentId: '1:1' });
    (globalThis as { fetch: typeof fetch }).fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/figma-mcp-variables')) {
        return new Response('mcp unavailable', { status: 503 });
      }
      if (url.includes('/v1/files/consumer-components/variables/local')) {
        return new Response(
          JSON.stringify({ meta: { variableCollections: {}, variables: {} } }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url.includes('/v1/files/consumer-components')) {
        return new Response(
          JSON.stringify({
            name: 'Consumer',
            lastModified: '2026-03-25T00:00:00Z',
            document: {
              id: '0:0',
              name: 'Document',
              type: 'DOCUMENT',
              children: [
                {
                  id: '2:1',
                  name: 'DS instance',
                  type: 'INSTANCE',
                  componentId: '1:1',
                },
                {
                  id: '2:2',
                  name: 'Non-DS instance',
                  type: 'INSTANCE',
                  componentId: '9:9',
                },
              ],
            },
            components: {
              '10:1': { key: 'local.one', name: 'Local/One' },
              '10:2': { key: 'local.two', name: 'Local/Two' },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      throw new Error(`Unexpected URL: ${url}`);
    }) as typeof fetch;

    const result = await scanConsumerFile('consumer-components', 'figd_test_token', dsCatalog);
    assert.equal(result.localComponentDefinedCount, 2);
    assert.equal(result.localComponentUsedCount, 1);
  });

  test('sets localVariableDefinedCount to null when consumer variables fetch fails', async () => {
    const dsCatalog = makeDsCatalog({ variableId: 'VariableID:1:1', variableKey: 'color.primary' });
    (globalThis as { fetch: typeof fetch }).fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/figma-mcp-variables')) {
        return new Response('mcp unavailable', { status: 503 });
      }
      if (url.includes('/v1/files/consumer-var-fail/variables/local')) {
        return new Response('forbidden', { status: 403, statusText: 'Forbidden' });
      }
      if (url.includes('/v1/files/consumer-var-fail')) {
        return new Response(
          JSON.stringify({
            name: 'Consumer',
            lastModified: '2026-03-25T00:00:00Z',
            document: {
              id: '0:0',
              name: 'Document',
              type: 'DOCUMENT',
              boundVariables: {
                fills: { id: 'VariableID:1:1', type: 'VARIABLE_ALIAS' },
              },
            },
            components: {},
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      throw new Error(`Unexpected URL: ${url}`);
    }) as typeof fetch;

    const result = await scanConsumerFile('consumer-var-fail', 'figd_test_token', dsCatalog);
    assert.equal(result.localVariableDefinedCount, null);
  });

  test('derives localVariableUsedCount from total bound variables minus resolved DS bindings', async () => {
    const dsCatalog = makeDsCatalog({ variableId: 'VariableID:1:1', variableKey: 'color.primary' });
    (globalThis as { fetch: typeof fetch }).fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/figma-mcp-variables')) {
        return new Response('mcp unavailable', { status: 503 });
      }
      if (url.includes('/v1/files/consumer-var-used/variables/local')) {
        return new Response(
          JSON.stringify({
            meta: {
              variableCollections: {
                'VariableCollectionId:1:1': { id: 'VariableCollectionId:1:1', name: 'Local' },
              },
              variables: {
                'VariableID:1:1': {
                  id: 'VariableID:1:1',
                  key: 'color.primary',
                  name: 'Primary',
                  resolvedType: 'COLOR',
                  variableCollectionId: 'VariableCollectionId:1:1',
                },
                'VariableID:9:9': {
                  id: 'VariableID:9:9',
                  key: 'color.local',
                  name: 'Local Color',
                  resolvedType: 'COLOR',
                  variableCollectionId: 'VariableCollectionId:1:1',
                },
              },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url.includes('/v1/files/consumer-var-used')) {
        return new Response(
          JSON.stringify({
            name: 'Consumer',
            lastModified: '2026-03-25T00:00:00Z',
            document: {
              id: '0:0',
              name: 'Document',
              type: 'DOCUMENT',
              children: [
                {
                  id: 'n1',
                  name: 'Node 1',
                  type: 'RECTANGLE',
                  boundVariables: {
                    fills: { id: 'VariableID:1:1', type: 'VARIABLE_ALIAS' },
                  },
                },
                {
                  id: 'n2',
                  name: 'Node 2',
                  type: 'RECTANGLE',
                  boundVariables: {
                    fills: { id: 'VariableID:1:1', type: 'VARIABLE_ALIAS' },
                  },
                },
                {
                  id: 'n3',
                  name: 'Node 3',
                  type: 'RECTANGLE',
                  boundVariables: {
                    fills: { id: 'VariableID:9:9', type: 'VARIABLE_ALIAS' },
                  },
                },
              ],
            },
            components: {},
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      throw new Error(`Unexpected URL: ${url}`);
    }) as typeof fetch;

    const result = await scanConsumerFile('consumer-var-used', 'figd_test_token', dsCatalog);
    assert.equal(result.localVariableUsedCount, 1);
  });

  test('derives localVariableDefinedCount from consumer variable payload size', async () => {
    const dsCatalog = makeDsCatalog();
    (globalThis as { fetch: typeof fetch }).fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/figma-mcp-variables')) {
        return new Response('mcp unavailable', { status: 503 });
      }
      if (url.includes('/v1/files/consumer-var-defined/variables/local')) {
        return new Response(
          JSON.stringify({
            meta: {
              variableCollections: {
                'VariableCollectionId:1:1': { id: 'VariableCollectionId:1:1', name: 'Local' },
              },
              variables: {
                'VariableID:1': { id: 'VariableID:1', key: 'k1', name: 'v1', resolvedType: 'COLOR', variableCollectionId: 'VariableCollectionId:1:1' },
                'VariableID:2': { id: 'VariableID:2', key: 'k2', name: 'v2', resolvedType: 'COLOR', variableCollectionId: 'VariableCollectionId:1:1' },
                'VariableID:3': { id: 'VariableID:3', key: 'k3', name: 'v3', resolvedType: 'COLOR', variableCollectionId: 'VariableCollectionId:1:1' },
                'VariableID:4': { id: 'VariableID:4', key: 'k4', name: 'v4', resolvedType: 'COLOR', variableCollectionId: 'VariableCollectionId:1:1' },
                'VariableID:5': { id: 'VariableID:5', key: 'k5', name: 'v5', resolvedType: 'COLOR', variableCollectionId: 'VariableCollectionId:1:1' },
              },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url.includes('/v1/files/consumer-var-defined')) {
        return new Response(
          JSON.stringify({
            name: 'Consumer',
            lastModified: '2026-03-25T00:00:00Z',
            document: { id: '0:0', name: 'Document', type: 'DOCUMENT' },
            components: {},
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      throw new Error(`Unexpected URL: ${url}`);
    }) as typeof fetch;

    const result = await scanConsumerFile('consumer-var-defined', 'figd_test_token', dsCatalog);
    assert.equal(result.localVariableDefinedCount, 5);
  });

  test('prefixes DS component set name when component names are variant-only', async () => {
    const componentKey = 'comp.button.variant.accent';
    const dsCatalog: DsCatalog = {
      components: new Map([
        [
          componentKey,
          {
            key: componentKey,
            id: '1:123',
            name: 'Variant-Accent',
            setId: '2:200',
            setName: 'Button',
          },
        ],
      ]),
      variables: new Map(),
      variableIdToKey: new Map(),
    };

    (globalThis as { fetch: typeof fetch }).fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/figma-mcp-variables')) {
        return new Response('mcp unavailable', { status: 503 });
      }
      if (url.includes('/v1/files/consumer-variant-names/variables/local')) {
        return new Response(
          JSON.stringify({ meta: { variableCollections: {}, variables: {} } }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url.includes('/v1/files/consumer-variant-names')) {
        return new Response(
          JSON.stringify({
            name: 'Consumer',
            lastModified: '2026-03-25T00:00:00Z',
            document: {
              id: '0:0',
              name: 'Document',
              type: 'DOCUMENT',
              children: [
                {
                  id: '2:1',
                  name: 'Accent button instance',
                  type: 'INSTANCE',
                  componentId: '1:123',
                },
              ],
            },
            components: {},
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      throw new Error(`Unexpected URL: ${url}`);
    }) as typeof fetch;

    const result = await scanConsumerFile('consumer-variant-names', 'figd_test_token', dsCatalog);
    assert.equal(result.componentInstances.length, 1);
    assert.equal(result.componentInstances[0].componentName, 'Button/Variant-Accent');
  });
});
