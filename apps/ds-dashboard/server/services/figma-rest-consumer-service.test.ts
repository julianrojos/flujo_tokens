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

describe('scanConsumerFile local-count derivation', { concurrency: false }, () => {
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

  test('derives parentDerivedComponentCount from local components using DS instances and localComponentUsedCount from unmatched instances', { concurrency: false }, async () => {
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
                  id: '10:0',
                  name: 'Local shell',
                  type: 'COMPONENT',
                  children: [
                    {
                      id: '11:0',
                      name: 'Local card instance',
                      type: 'INSTANCE',
                      componentId: '10:1',
                    },
                  ],
                },
                {
                  id: '10:1',
                  name: 'Local card',
                  type: 'COMPONENT',
                  children: [
                    {
                      id: '10:2',
                      name: 'DS instance',
                      type: 'INSTANCE',
                      componentId: '1:1',
                      componentProperties: {
                        size: 'md',
                        disabled: false,
                        content: 'Primary',
                      },
                      boundVariables: {
                        fills: {
                          id: 'VariableID:1:1',
                          type: 'VARIABLE_ALIAS',
                        },
                      },
                      children: [
                        {
                          id: '2:9',
                          name: 'Text child',
                          type: 'TEXT',
                        },
                      ],
                    },
                  ],
                },
                {
                  id: '10:2',
                  name: 'Local empty state',
                  type: 'COMPONENT',
                  children: [
                    {
                      id: '2:3',
                      name: 'Decoration',
                      type: 'RECTANGLE',
                    },
                  ],
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
              '10:0': { key: 'local.shell', name: 'Local/Shell' },
              '10:1': { key: 'local.card', name: 'Local/Card' },
              '10:2': { key: 'local.two', name: 'Local/Two' },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      throw new Error(`Unexpected URL: ${url}`);
    }) as typeof fetch;

    const result = await scanConsumerFile('consumer-components', 'figd_test_token', dsCatalog);
    assert.equal(result.parentDerivedComponentCount, 1);
    assert.equal(result.localComponentUsedCount, 1);
    assert.equal(result.usageDetails.parentComponentUsages.length, 1);
    assert.deepEqual(result.usageDetails.parentComponentUsages[0], {
      localComponentKey: 'local.card',
      localComponentName: 'Local/Card',
      parentComponentKey: 'comp.button.primary',
      parentComponentName: 'Button/Primary',
      usageScope: 'local-component',
      usageCount: 1,
      sampleNodeIds: ['10:2'],
    });
    assert.equal(result.usageDetails.localComponentGraph.length, 1);
    assert.deepEqual(result.usageDetails.localComponentGraph[0], {
      parentComponentKey: 'local.shell',
      parentComponentName: 'Local/Shell',
      childComponentKey: 'local.card',
      childComponentName: 'Local/Card',
      usageCount: 1,
      sampleNodeIds: ['11:0'],
    });
    assert.equal(result.usageDetails.componentPropertyUsages.length, 1);
    assert.equal(result.usageDetails.componentPropertyUsages[0].properties.length, 3);
    assert.deepEqual(result.usageDetails.componentPropertyUsages[0].properties.map((item) => item.name), [
      'size',
      'disabled',
      'content',
    ]);
    assert.equal(result.usageDetails.tokenBindingDetails.length, 1);
    assert.equal(result.usageDetails.tokenBindingDetails[0].bindings.length, 1);
    assert.equal(result.usageDetails.tokenBindingDetails[0].bindings[0].variableKey, 'color.primary');
    assert.equal(result.usageDetails.usageShape.components.localComponent, 2);
    assert.equal(result.usageDetails.usageShape.tokens.localComponent, 1);
  });

  test('does not count a component node as parent-derived when it is directly the DS instance itself', { concurrency: false }, async () => {
    const dsCatalog = makeDsCatalog({ componentId: '1:1' });
    (globalThis as { fetch: typeof fetch }).fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/figma-mcp-variables')) {
        return new Response('mcp unavailable', { status: 503 });
      }
      if (url.includes('/v1/files/consumer-self-instance/variables/local')) {
        return new Response(
          JSON.stringify({ meta: { variableCollections: {}, variables: {} } }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url.includes('/v1/files/consumer-self-instance')) {
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
                  id: '10:9',
                  name: 'Local direct instance',
                  type: 'COMPONENT',
                  componentId: '1:1',
                },
              ],
            },
            components: {
              '10:9': { key: 'local.self', name: 'Local/Self' },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      throw new Error(`Unexpected URL: ${url}`);
    }) as typeof fetch;

    const result = await scanConsumerFile('consumer-self-instance', 'figd_test_token', dsCatalog);
    assert.equal(result.parentDerivedComponentCount, 0);
    assert.equal(result.localComponentUsedCount, 0);
    assert.deepEqual(result.usageDetails.usageShape.components, {
      page: 0,
      localComponent: 1,
      nestedLocalComponent: 0,
    });
  });

  test('sets localVariableDefinedCount to null when consumer variables fetch fails', { concurrency: false }, async () => {
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

  test('derives localVariableUsedCount from total bound variables minus resolved DS bindings', { concurrency: false }, async () => {
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

  test('derives localVariableDefinedCount from consumer variable payload size', { concurrency: false }, async () => {
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

  test('prefixes DS component set name when component names are variant-only', { concurrency: false }, async () => {
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

describe('buildDsCatalog', { concurrency: false }, () => {
  test('resolves setName via containing_frame.containingComponentSet in /components response', { concurrency: false }, async () => {
    // Simulates the real Figma API behaviour:
    // - /v1/files/:key/components  → includes containing_frame.containingComponentSet (real API response)
    // - /v1/files/:key?depth=1     → components and componentSets maps are EMPTY (depth truncates them)
    (globalThis as { fetch: typeof fetch }).fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/figma-mcp-variables')) {
        return new Response('mcp unavailable', { status: 503 });
      }
      if (url.includes('/v1/files/ds-xref/variables/local')) {
        return new Response(
          JSON.stringify({ meta: { variableCollections: {}, variables: {} } }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url.includes('/v1/files/ds-xref/components')) {
        // Real Figma API response: contains containing_frame with containingComponentSet
        return new Response(
          JSON.stringify({
            status: 200,
            error: false,
            meta: {
              components: [
                {
                  key: 'comp-key-accent',
                  name: 'Variant=Accent',
                  node_id: '1:10',
                  description: '',
                  containing_frame: {
                    name: 'Button',
                    nodeId: '2:100',
                    pageId: '0:1',
                    pageName: 'Page 1',
                    containingComponentSet: { name: 'Button', nodeId: '2:100' },
                  },
                },
                {
                  key: 'comp-key-default',
                  name: 'Variant=Default',
                  node_id: '1:11',
                  description: '',
                  containing_frame: {
                    name: 'Button',
                    nodeId: '2:100',
                    pageId: '0:1',
                    pageName: 'Page 1',
                    containingComponentSet: { name: 'Button', nodeId: '2:100' },
                  },
                },
              ],
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url.includes('/v1/files/ds-xref')) {
        // file?depth=1 — components and componentSets are empty (Figma omits them with depth param)
        return new Response(
          JSON.stringify({
            name: 'DS File',
            lastModified: '2026-03-26T00:00:00Z',
            document: { id: '0:0', name: 'Document', type: 'DOCUMENT', children: [] },
            componentSets: {},
            components: {},
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      throw new Error(`Unexpected URL: ${url}`);
    }) as typeof fetch;

    const { buildDsCatalog } = await import('./figma-rest-consumer-service.js');
    const catalog = await buildDsCatalog('ds-xref', 'figd_test_token');

    const accent = catalog.components.get('comp-key-accent');
    const def = catalog.components.get('comp-key-default');

    assert.ok(accent, 'accent component should be in catalog');
    assert.equal(accent!.setName, 'Button', 'setName should come from containing_frame.containingComponentSet');
    assert.equal(accent!.name, 'Variant=Accent');

    assert.ok(def, 'default component should be in catalog');
    assert.equal(def!.setName, 'Button');
  });

  test('falls back to componentSetId and file componentSets when containingComponentSet is absent', { concurrency: false }, async () => {
    (globalThis as { fetch: typeof fetch }).fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/figma-mcp-variables')) {
        return new Response('mcp unavailable', { status: 503 });
      }
      if (url.includes('/v1/files/ds-xref-2/variables/local')) {
        return new Response(
          JSON.stringify({ meta: { variableCollections: {}, variables: {} } }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url.includes('/v1/files/ds-xref-2/components')) {
        return new Response(
          JSON.stringify({
            status: 200,
            error: false,
            meta: {
              components: [
                {
                  key: 'comp-key-plain',
                  name: 'Variant=Default',
                  node_id: '1:20',
                  componentSetId: '2:200',
                },
              ],
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url.includes('/v1/files/ds-xref-2')) {
        return new Response(
          JSON.stringify({
            name: 'DS File',
            lastModified: '2026-03-26T00:00:00Z',
            document: { id: '0:0', name: 'Document', type: 'DOCUMENT', children: [] },
            componentSets: {
              '2:200': { name: 'Button' },
            },
            components: {},
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      throw new Error(`Unexpected URL: ${url}`);
    }) as typeof fetch;

    const { buildDsCatalog } = await import('./figma-rest-consumer-service.js');
    const catalog = await buildDsCatalog('ds-xref-2', 'figd_test_token');

    const comp = catalog.components.get('comp-key-plain');
    assert.ok(comp);
    assert.equal(comp!.setId, '2:200');
    assert.equal(comp!.setName, 'Button');
  });

  test('prefers containingComponentSet name when both sources exist and conflict', { concurrency: false }, async () => {
    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map((part) => String(part)).join(' '));
    };

    try {
      (globalThis as { fetch: typeof fetch }).fetch = (async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/api/figma-mcp-variables')) {
          return new Response('mcp unavailable', { status: 503 });
        }
        if (url.includes('/v1/files/ds-xref-3/variables/local')) {
          return new Response(
            JSON.stringify({ meta: { variableCollections: {}, variables: {} } }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }
        if (url.includes('/v1/files/ds-xref-3/components')) {
          return new Response(
            JSON.stringify({
              status: 200,
              error: false,
              meta: {
                components: [
                  {
                    key: 'comp-key-conflict',
                    name: 'Variant=Ghost',
                    node_id: '1:30',
                    componentSetId: '2:300',
                    containing_frame: {
                      containingComponentSet: { name: 'Button', nodeId: '2:301' },
                    },
                  },
                ],
              },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }
        if (url.includes('/v1/files/ds-xref-3')) {
          return new Response(
            JSON.stringify({
              name: 'DS File',
              lastModified: '2026-03-26T00:00:00Z',
              document: { id: '0:0', name: 'Document', type: 'DOCUMENT', children: [] },
              componentSets: {
                '2:300': { name: 'Button Legacy' },
                '2:301': { name: 'Button' },
              },
              components: {},
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }
        throw new Error(`Unexpected URL: ${url}`);
      }) as typeof fetch;

      const { buildDsCatalog } = await import('./figma-rest-consumer-service.js');
      const catalog = await buildDsCatalog('ds-xref-3', 'figd_test_token');

      const comp = catalog.components.get('comp-key-conflict');
      assert.ok(comp);
      assert.equal(comp!.setId, '2:301');
      assert.equal(comp!.setName, 'Button');
      assert.ok(
        warnings.some((entry) => entry.includes('Conflicting component set IDs')),
        'should warn when setId sources conflict',
      );
    } finally {
      console.warn = originalWarn;
    }
  });
});
