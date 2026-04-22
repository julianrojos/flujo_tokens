/**
 * Components Handlers Tests
 */

import { afterEach, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../protocol';
import {
  handleGetLocalComponents,
  handleGetComponent,
  handleInstantiateComponent,
  handleSetNodeDescription,
  handleAddComponentProperty,
  handleEditComponentProperty,
  handleDeleteComponentProperty,
  handleSetInstanceProperties,
  handleSearchComponents,
  handleGetComponentSpec,
  handleGetComponentImage,
  handleAuditTokenCoverage,
  handleApplyTokens,
} from '../handlers/components';
import { handleBindVariable, handleUnbindVariable } from '../handlers/variables';

function setMockFigma(figma: unknown): void {
  (globalThis as unknown as { figma?: unknown }).figma = figma;
}

function clearMockFigma(): void {
  delete (globalThis as unknown as { figma?: unknown }).figma;
}

afterEach(() => {
  clearMockFigma();
});

describe('components handlers', () => {
  it('handleGetLocalComponents returns standalone components and component sets', async () => {
    const standaloneComponent = {
      id: '10:1',
      key: 'standalone-key',
      name: 'Button',
      type: 'COMPONENT',
      description: 'Standalone button',
      width: 120,
      height: 40,
      componentPropertyDefinitions: {
        Label: { type: 'TEXT', defaultValue: 'Button' },
      },
      parent: null,
    };

    const variantA = {
      id: '20:1',
      key: 'variant-a',
      name: 'Size=md, State=default',
      type: 'COMPONENT',
      description: 'Default variant',
      width: 120,
      height: 40,
      parent: null as unknown,
    };

    const variantB = {
      id: '20:2',
      key: 'variant-b',
      name: 'Size=md, State=hover',
      type: 'COMPONENT',
      description: 'Hover variant',
      width: 120,
      height: 40,
      parent: null as unknown,
    };

    const componentSet = {
      id: '20:0',
      key: 'component-set-key',
      name: 'Button / Variants',
      type: 'COMPONENT_SET',
      description: 'Button variants',
      componentPropertyDefinitions: {
        Size: { type: 'VARIANT', defaultValue: 'md' },
      },
      children: [variantA, variantB],
    };

    variantA.parent = componentSet;
    variantB.parent = componentSet;
    standaloneComponent.parent = {
      id: '1:1',
      type: 'PAGE',
      name: 'Page 1',
      children: [standaloneComponent, componentSet],
    };

    setMockFigma({
      root: {
        name: 'Test File',
        children: [standaloneComponent.parent],
      },
      fileKey: 'file-key',
      loadAllPagesAsync: async () => undefined,
    });

    const result = await handleGetLocalComponents({});
    const typed = result as {
      success: boolean;
      data: {
        totalComponents: number;
        totalComponentSets: number;
        components: Array<{ name: string }>;
        componentSets: Array<{ name: string; variants: unknown[] }>;
      };
    };

    expect(typed.success).toBe(true);
    expect(typed.data.totalComponents).toBe(1);
    expect(typed.data.totalComponentSets).toBe(1);
    expect(typed.data.components[0]?.name).toBe('Button');
    expect(typed.data.componentSets[0]?.name).toBe('Button / Variants');
    expect(typed.data.componentSets[0]?.variants).toHaveLength(2);
  });

  it('handleGetComponent returns component metadata', async () => {
    setMockFigma({
      getNodeByIdAsync: async (id: string) =>
        id === '10:1'
          ? {
            id: '10:1',
            name: 'Button',
            type: 'COMPONENT',
            description: 'Component',
            descriptionMarkdown: null,
            visible: true,
            locked: false,
            annotations: [],
            componentPropertyDefinitions: {},
            children: [],
            parent: { type: 'PAGE' },
          }
          : null,
    });

    const result = await handleGetComponent({ nodeId: '10:1' });
    const typed = result as {
      success: boolean;
      component: { id: string; type: string; isVariant: boolean };
    };

    expect(typed.success).toBe(true);
    expect(typed.component.id).toBe('10:1');
    expect(typed.component.type).toBe('COMPONENT');
    expect(typed.component.isVariant).toBe(false);
  });

  it('handleGetComponent returns FIGMA_API_ERROR when node is missing', async () => {
    setMockFigma({
      getNodeByIdAsync: async () => null,
    });

    await expect(handleGetComponent({ nodeId: 'missing' })).rejects.toMatchObject({
      code: ERROR_CODES.FIGMA_API_ERROR,
    });
  });

  it('handleInstantiateComponent creates and positions an instance from local component', async () => {
    const appendedIds: string[] = [];

    const instance = {
      id: 'instance-1',
      name: 'Button Instance',
      x: 0,
      y: 0,
      width: 120,
      height: 40,
      setProperties: (_props: Record<string, unknown>) => undefined,
      resize: function resize(width: number, height: number) {
        this.width = width;
        this.height = height;
      },
    };

    const componentNode = {
      id: 'component-1',
      type: 'COMPONENT',
      createInstance: () => instance,
    };

    const parentFrame = {
      id: 'frame-1',
      type: 'FRAME',
      appendChild: (node: { id: string }) => {
        appendedIds.push(node.id);
      },
    };

    setMockFigma({
      importComponentByKeyAsync: async () => {
        throw new Error('not published');
      },
      getNodeByIdAsync: async (id: string) => {
        if (id === 'component-1') return componentNode;
        if (id === 'frame-1') return parentFrame;
        return null;
      },
    });

    const result = await handleInstantiateComponent({
      nodeId: 'component-1',
      parentId: 'frame-1',
      position: { x: 24, y: 32 },
      size: { width: 140, height: 48 },
      overrides: { Label: 'Save' },
    });

    const typed = result as {
      success: boolean;
      instance: { id: string; x: number; y: number; width: number; height: number };
    };

    expect(typed.success).toBe(true);
    expect(typed.instance.id).toBe('instance-1');
    expect(typed.instance.x).toBe(24);
    expect(typed.instance.y).toBe(32);
    expect(typed.instance.width).toBe(140);
    expect(typed.instance.height).toBe(48);
    expect(appendedIds).toEqual(['instance-1']);
  });

  it('handleSetNodeDescription sets description on supported nodes', async () => {
    const node = {
      id: 'node-1',
      type: 'COMPONENT',
      name: 'Button',
      description: '',
      descriptionMarkdown: '',
    };

    setMockFigma({
      getNodeByIdAsync: async () => node,
    });

    const result = await handleSetNodeDescription({
      nodeId: 'node-1',
      description: 'Primary action button',
      descriptionMarkdown: '**Primary** action button',
    });

    const typed = result as {
      success: boolean;
      node: { description: string };
    };

    expect(typed.success).toBe(true);
    expect(typed.node.description).toBe('Primary action button');
  });

  it('handleAddComponentProperty adds a property on a component', async () => {
    const node = {
      id: 'component-1',
      type: 'COMPONENT',
      parent: { type: 'PAGE' },
      addComponentProperty: () => 'Show Icon#12:4',
    };

    setMockFigma({
      getNodeByIdAsync: async () => node,
    });

    const result = await handleAddComponentProperty({
      nodeId: 'component-1',
      propertyName: 'Show Icon',
      propertyType: 'BOOLEAN',
      defaultValue: false,
    });

    expect(result).toMatchObject({
      success: true,
      propertyName: 'Show Icon#12:4',
    });
  });

  it('handleEditComponentProperty edits default value', async () => {
    const node = {
      id: 'component-1',
      type: 'COMPONENT',
      editComponentProperty: () => 'Label#12:6',
    };

    setMockFigma({
      getNodeByIdAsync: async () => node,
    });

    const result = await handleEditComponentProperty({
      nodeId: 'component-1',
      propertyName: 'Label#12:6',
      newValue: 'Save',
    });

    expect(result).toMatchObject({
      success: true,
      propertyName: 'Label#12:6',
    });
  });

  it('handleDeleteComponentProperty deletes a property', async () => {
    let deletedProp: string | null = null;
    const node = {
      id: 'component-1',
      type: 'COMPONENT',
      deleteComponentProperty: (name: string) => {
        deletedProp = name;
      },
    };

    setMockFigma({
      getNodeByIdAsync: async () => node,
    });

    const result = await handleDeleteComponentProperty({
      nodeId: 'component-1',
      propertyName: 'Show Icon#12:4',
    });

    expect(result).toMatchObject({ success: true });
    expect(deletedProp).toBe('Show Icon#12:4');
  });

  it('handleSetInstanceProperties maps shorthand property names to suffixed names', async () => {
    let setProps: Record<string, unknown> = {};

    const instanceNode = {
      id: 'instance-1',
      name: 'Button Instance',
      type: 'INSTANCE',
      getMainComponentAsync: async () => ({ id: 'component-main' }),
      componentProperties: {
        'Label#12:6': { type: 'TEXT', value: 'Old label' },
        Enabled: { type: 'BOOLEAN', value: true },
      },
      setProperties: (props: Record<string, unknown>) => {
        setProps = props;
      },
    };

    setMockFigma({
      getNodeByIdAsync: async () => instanceNode,
    });

    const result = await handleSetInstanceProperties({
      nodeId: 'instance-1',
      properties: {
        Label: 'New label',
        Enabled: false,
      },
    });

    const typed = result as {
      success: boolean;
      instance: { propertiesSet: string[] };
    };

    expect(typed.success).toBe(true);
    expect(setProps).toEqual({
      'Label#12:6': 'New label',
      Enabled: false,
    });
    expect(typed.instance.propertiesSet).toContain('Label#12:6');
    expect(typed.instance.propertiesSet).toContain('Enabled');
  });

  it('handleSetInstanceProperties returns FIGMA_API_ERROR when node is not an instance', async () => {
    setMockFigma({
      getNodeByIdAsync: async () => ({ id: 'node-1', type: 'FRAME' }),
    });

    await expect(
      handleSetInstanceProperties({ nodeId: 'node-1', properties: {} })
    ).rejects.toMatchObject({
      code: ERROR_CODES.FIGMA_API_ERROR,
    });
  });

  it('handleGetLocalComponents processes pages in batches without blocking UI', async () => {
    // Create 10 pages with components
    const pages = Array.from({ length: 10 }, (_, i) => ({
      id: `page-${i}`,
      name: `Page ${i}`,
      type: 'PAGE' as const,
      children: [
        {
          id: `comp-${i}`,
          key: `key-${i}`,
          name: `Component ${i}`,
          type: 'COMPONENT' as const,
          description: `Component ${i} description`,
          width: 100,
          height: 100,
          componentPropertyDefinitions: {},
          parent: null as unknown,
        },
      ],
    }));

    setMockFigma({
      root: {
        name: 'Test File',
        children: pages,
      },
      fileKey: 'file-key',
      loadAllPagesAsync: async () => undefined,
    });

    const result = await handleGetLocalComponents({});
    const typed = result as {
      success: boolean;
      data: {
        totalComponents: number;
        totalComponentSets: number;
        components: Array<{ name: string }>;
        componentSets: Array<{ name: string }>;
      };
    };

    expect(typed.success).toBe(true);
    expect(typed.data.totalComponents).toBe(10);
    expect(typed.data.totalComponentSets).toBe(0);
    expect(typed.data.components).toHaveLength(10);
  });

  describe('handleSearchComponents (P2)', () => {
    it('searches components with limit and returns hasMore/nextOffset for pagination', async () => {
      const page1 = {
        id: 'page-1',
        name: 'Page 1',
        type: 'PAGE' as const,
        children: [
          { id: 'comp-1', key: 'k1', name: 'Button', type: 'COMPONENT' as const, description: '', width: 100, height: 40, componentPropertyDefinitions: {}, parent: null as unknown },
          { id: 'comp-2', key: 'k2', name: 'Input', type: 'COMPONENT' as const, description: '', width: 100, height: 40, componentPropertyDefinitions: {}, parent: null as unknown },
        ],
      };

      const page2 = {
        id: 'page-2',
        name: 'Page 2',
        type: 'PAGE' as const,
        children: [
          { id: 'comp-3', key: 'k3', name: 'Card', type: 'COMPONENT' as const, description: '', width: 200, height: 150, componentPropertyDefinitions: {}, parent: null as unknown },
        ],
      };

      setMockFigma({
        root: { name: 'Test', children: [page1, page2] },
        fileKey: 'file-key',
        loadAllPagesAsync: async () => undefined,
      });

      const result = await handleSearchComponents({ limit: 2 });
      const typed = result as {
        success: boolean;
        components: unknown[];
        count: number;
        truncated: boolean;
        hasMore: boolean;
        nextOffset: number | null;
        total: number;
      };

      expect(typed.success).toBe(true);
      expect(typed.count).toBe(2);
      // truncated is now only true when guardrail hits, not pagination
      expect(typed.truncated).toBe(false);
      expect(typed.hasMore).toBe(true);
      expect(typed.nextOffset).toBe(2);
      expect(typed.total).toBe(3);
      expect((typed.components[0] as { name: string }).name).toBe('Button');
      expect((typed.components[1] as { name: string }).name).toBe('Input');
    });

    it('filters by nameContains', async () => {
      const page = {
        id: 'page-1',
        name: 'Page 1',
        type: 'PAGE' as const,
        children: [
          { id: 'comp-1', key: 'k1', name: 'Button/Primary', type: 'COMPONENT' as const, description: '', width: 100, height: 40, componentPropertyDefinitions: {}, parent: null as unknown },
          { id: 'comp-2', key: 'k2', name: 'Button/Secondary', type: 'COMPONENT' as const, description: '', width: 100, height: 40, componentPropertyDefinitions: {}, parent: null as unknown },
          { id: 'comp-3', key: 'k3', name: 'Input/Text', type: 'COMPONENT' as const, description: '', width: 100, height: 40, componentPropertyDefinitions: {}, parent: null as unknown },
        ],
      };

      setMockFigma({
        root: { name: 'Test', children: [page] },
        fileKey: 'file-key',
        loadAllPagesAsync: async () => undefined,
      });

      const result = await handleSearchComponents({ nameContains: 'button' });
      const typed = result as { success: boolean; components: unknown[]; count: number };

      expect(typed.success).toBe(true);
      expect(typed.count).toBe(2);
      expect(typed.components.every((c) => (c as { name: string }).name.toLowerCase().includes('button'))).toBe(true);
    });

    it('filters by nameContains with diacritics (diacritic-insensitive)', async () => {
      const page = {
        id: 'page-1',
        name: 'Page 1',
        type: 'PAGE' as const,
        children: [
          { id: 'comp-1', key: 'k1', name: 'Botón/Primario', type: 'COMPONENT' as const, description: '', width: 100, height: 40, componentPropertyDefinitions: {}, parent: null as unknown },
          { id: 'comp-2', key: 'k2', name: 'Botón/Secundario', type: 'COMPONENT' as const, description: '', width: 100, height: 40, componentPropertyDefinitions: {}, parent: null as unknown },
          { id: 'comp-3', key: 'k3', name: 'Boton/Terciario', type: 'COMPONENT' as const, description: '', width: 100, height: 40, componentPropertyDefinitions: {}, parent: null as unknown },
        ],
      };

      setMockFigma({
        root: { name: 'Test', children: [page] },
        fileKey: 'file-key',
        loadAllPagesAsync: async () => undefined,
      });

      const asciiQueryResult = await handleSearchComponents({ nameContains: 'boton' });
      const asciiTyped = asciiQueryResult as { success: boolean; components: Array<{ name: string }>; count: number };
      expect(asciiTyped.success).toBe(true);
      expect(asciiTyped.count).toBe(3);
      expect(asciiTyped.components.map((c) => c.name)).toEqual([
        'Botón/Primario',
        'Botón/Secundario',
        'Boton/Terciario',
      ]);

      const accentQueryResult = await handleSearchComponents({ nameContains: 'botón' });
      const accentTyped = accentQueryResult as { success: boolean; components: Array<{ name: string }>; count: number };
      expect(accentTyped.success).toBe(true);
      expect(accentTyped.count).toBe(3);
      expect(accentTyped.components.map((c) => c.name)).toEqual([
        'Botón/Primario',
        'Botón/Secundario',
        'Boton/Terciario',
      ]);
    });

    it('includes pageName in search results (SC-03)', async () => {
      const page1 = {
        id: 'page-1',
        name: 'Components',
        type: 'PAGE' as const,
        children: [
          { id: 'comp-1', key: 'k1', name: 'Button', type: 'COMPONENT' as const, description: '', width: 100, height: 40, componentPropertyDefinitions: {}, parent: null as unknown },
        ],
      };

      const page2 = {
        id: 'page-2',
        name: 'Patterns',
        type: 'PAGE' as const,
        children: [
          { id: 'comp-2', key: 'k2', name: 'Card', type: 'COMPONENT' as const, description: '', width: 200, height: 150, componentPropertyDefinitions: {}, parent: null as unknown },
        ],
      };

      setMockFigma({
        root: { name: 'Test', children: [page1, page2] },
        fileKey: 'file-key',
        loadAllPagesAsync: async () => undefined,
      });

      const result = await handleSearchComponents({});
      const typed = result as { success: boolean; components: Array<{ name: string; pageName: string }>; count: number };

      expect(typed.success).toBe(true);
      expect(typed.count).toBe(2);
      expect(typed.components[0]?.pageName).toBe('Components');
      expect(typed.components[1]?.pageName).toBe('Patterns');
    });

    it('includes variants when includeVariants=true', async () => {
      const variant1 = {
        id: 'var-1',
        key: 'v1',
        name: 'Size=md, State=default',
        type: 'COMPONENT' as const,
        description: '',
        width: 100,
        height: 40,
        componentPropertyDefinitions: {},
        parent: null as unknown,
      };

      const variant2 = {
        id: 'var-2',
        key: 'v2',
        name: 'Size=md, State=hover',
        type: 'COMPONENT' as const,
        description: '',
        width: 100,
        height: 40,
        componentPropertyDefinitions: {},
        parent: null as unknown,
      };

      const componentSet = {
        id: 'set-1',
        key: 'set-key',
        name: 'Button',
        type: 'COMPONENT_SET' as const,
        description: '',
        children: [variant1, variant2],
      };

      variant1.parent = componentSet;
      variant2.parent = componentSet;

      const page = {
        id: 'page-1',
        name: 'Page 1',
        type: 'PAGE' as const,
        children: [componentSet],
      };

      setMockFigma({
        root: { name: 'Test', children: [page] },
        fileKey: 'file-key',
        loadAllPagesAsync: async () => undefined,
      });

      // Without includeVariants - only returns component set
      const resultWithout = await handleSearchComponents({ includeVariants: false });
      const typedWithout = resultWithout as { success: boolean; components: unknown[]; count: number };
      expect(typedWithout.count).toBe(1);
      expect(typedWithout.components[0]?.type).toBe('COMPONENT_SET');

      // With includeVariants - returns component set + variants
      const resultWith = await handleSearchComponents({ includeVariants: true });
      const typedWith = resultWith as { success: boolean; components: unknown[]; count: number };
      expect(typedWith.count).toBe(3); // 1 set + 2 variants
    });

    it('returns page 1 with hasMore=true and nextOffset when total > limit', async () => {
      const components = Array.from({ length: 8 }, (_, i) => ({
        id: `comp-${i}`,
        key: `k${i}`,
        name: `Component ${i}`,
        type: 'COMPONENT' as const,
        description: '',
        width: 100,
        height: 40,
        componentPropertyDefinitions: {},
        parent: null as unknown,
      }));

      const page = {
        id: 'page-1',
        name: 'Components',
        type: 'PAGE' as const,
        children: components,
      };

      setMockFigma({
        root: { name: 'Test', children: [page] },
        fileKey: 'file-key',
        loadAllPagesAsync: async () => undefined,
      });

      const result = await handleSearchComponents({ limit: 3, offset: 0 });
      const typed = result as {
        success: boolean;
        components: Array<{ nodeId: string; name: string }>;
        count: number;
        total: number;
        hasMore: boolean;
        nextOffset: number | null;
        limit: number;
      };

      expect(typed.success).toBe(true);
      expect(typed.count).toBe(3);
      expect(typed.components.map((c) => c.name)).toEqual(['Component 0', 'Component 1', 'Component 2']);
      expect(typed.total).toBe(8);
      expect(typed.hasMore).toBe(true);
      expect(typed.nextOffset).toBe(3);
      expect(typed.limit).toBe(3);
    });

    it('returns page 2 with non-overlapping components from page 1', async () => {
      const components = Array.from({ length: 8 }, (_, i) => ({
        id: `comp-${i}`,
        key: `k${i}`,
        name: `Component ${i}`,
        type: 'COMPONENT' as const,
        description: '',
        width: 100,
        height: 40,
        componentPropertyDefinitions: {},
        parent: null as unknown,
      }));

      const page = {
        id: 'page-1',
        name: 'Components',
        type: 'PAGE' as const,
        children: components,
      };

      setMockFigma({
        root: { name: 'Test', children: [page] },
        fileKey: 'file-key',
        loadAllPagesAsync: async () => undefined,
      });

      const page1 = await handleSearchComponents({ limit: 3, offset: 0 });
      const page2 = await handleSearchComponents({ limit: 3, offset: 3 });

      const typed1 = page1 as { success: boolean; components: Array<{ nodeId: string }> };
      const typed2 = page2 as {
        success: boolean;
        components: Array<{ nodeId: string }>;
        hasMore: boolean;
        nextOffset: number | null;
      };

      // Pages should not overlap
      const ids1 = new Set(typed1.components.map((c) => c.nodeId));
      const ids2 = new Set(typed2.components.map((c) => c.nodeId));
      expect([...ids1].filter((id) => ids2.has(id))).toHaveLength(0);

      expect(typed2.components).toHaveLength(3);
      expect(typed2.hasMore).toBe(true);
      expect(typed2.nextOffset).toBe(6);
    });

    it('returns hasMore=false and nextOffset=null on last page', async () => {
      const components = Array.from({ length: 5 }, (_, i) => ({
        id: `comp-${i}`,
        key: `k${i}`,
        name: `Component ${i}`,
        type: 'COMPONENT' as const,
        description: '',
        width: 100,
        height: 40,
        componentPropertyDefinitions: {},
        parent: null as unknown,
      }));

      const page = {
        id: 'page-1',
        name: 'Components',
        type: 'PAGE' as const,
        children: components,
      };

      setMockFigma({
        root: { name: 'Test', children: [page] },
        fileKey: 'file-key',
        loadAllPagesAsync: async () => undefined,
      });

      const result = await handleSearchComponents({ limit: 3, offset: 3 });
      const typed = result as {
        success: boolean;
        components: Array<{ nodeId: string }>;
        count: number;
        hasMore: boolean;
        nextOffset: number | null;
      };

      expect(typed.success).toBe(true);
      expect(typed.count).toBe(2);
      expect(typed.hasMore).toBe(false);
      expect(typed.nextOffset).toBe(null);
    });

    it('returns empty components and hasMore=false when offset exceeds total', async () => {
      const page = {
        id: 'page-1',
        name: 'Components',
        type: 'PAGE' as const,
        children: [
          { id: 'comp-1', key: 'k1', name: 'Button', type: 'COMPONENT' as const, description: '', width: 100, height: 40, componentPropertyDefinitions: {}, parent: null as unknown },
          { id: 'comp-2', key: 'k2', name: 'Input', type: 'COMPONENT' as const, description: '', width: 100, height: 40, componentPropertyDefinitions: {}, parent: null as unknown },
        ],
      };

      setMockFigma({
        root: { name: 'Test', children: [page] },
        fileKey: 'file-key',
        loadAllPagesAsync: async () => undefined,
      });

      const result = await handleSearchComponents({ limit: 10, offset: 100 });
      const typed = result as {
        success: boolean;
        components: Array<{ nodeId: string }>;
        count: number;
        hasMore: boolean;
        nextOffset: number | null;
      };

      expect(typed.success).toBe(true);
      expect(typed.count).toBe(0);
      expect(typed.total).toBe(2);
      expect(typed.hasMore).toBe(false);
      expect(typed.nextOffset).toBe(null);
    });

    it('normalizes invalid offset and limit without crashing', async () => {
      const page = {
        id: 'page-1',
        name: 'Components',
        type: 'PAGE' as const,
        children: [
          { id: 'comp-1', key: 'k1', name: 'Button', type: 'COMPONENT' as const, description: '', width: 100, height: 40, componentPropertyDefinitions: {}, parent: null as unknown },
          { id: 'comp-2', key: 'k2', name: 'Input', type: 'COMPONENT' as const, description: '', width: 100, height: 40, componentPropertyDefinitions: {}, parent: null as unknown },
          { id: 'comp-3', key: 'k3', name: 'Card', type: 'COMPONENT' as const, description: '', width: 100, height: 40, componentPropertyDefinitions: {}, parent: null as unknown },
        ],
      };

      setMockFigma({
        root: { name: 'Test', children: [page] },
        fileKey: 'file-key',
        loadAllPagesAsync: async () => undefined,
      });

      // Negative offset → clamped to 0
      const negOffset = await handleSearchComponents({ offset: -5 });
      expect((negOffset as { count: number }).count).toBe(3);

      // Zero limit → clamped to 1
      const zeroLimit = await handleSearchComponents({ limit: 0 });
      expect((zeroLimit as { count: number }).count).toBe(1);

      // Limit > 1000 → clamped to 1000
      const overLimit = await handleSearchComponents({ limit: 9999 });
      expect((overLimit as { limit: number }).limit).toBe(1000);

      // Non-numeric offset/limit → fallback to defaults
      const invalidNumbers = await handleSearchComponents({ offset: 'abc' as unknown as number, limit: 'abc' as unknown as number });
      expect((invalidNumbers as { count: number; limit: number }).count).toBe(3);
      expect((invalidNumbers as { count: number; limit: number }).limit).toBe(50);
    });

    it('maintains stable order across identical calls', async () => {
      const components = Array.from({ length: 5 }, (_, i) => ({
        id: `comp-${i}`,
        key: `k${i}`,
        name: `Component ${i}`,
        type: 'COMPONENT' as const,
        description: '',
        width: 100,
        height: 40,
        componentPropertyDefinitions: {},
        parent: null as unknown,
      }));

      const page = {
        id: 'page-1',
        name: 'Components',
        type: 'PAGE' as const,
        children: components,
      };

      setMockFigma({
        root: { name: 'Test', children: [page] },
        fileKey: 'file-key',
        loadAllPagesAsync: async () => undefined,
      });

      const result1 = await handleSearchComponents({ limit: 10 });
      const result2 = await handleSearchComponents({ limit: 10 });

      const typed1 = result1 as { components: Array<{ nodeId: string }> };
      const typed2 = result2 as { components: Array<{ nodeId: string }> };

      expect(typed1.components.map((c) => c.nodeId)).toEqual(typed2.components.map((c) => c.nodeId));
    });

    it('reuses cached scan snapshot for paginated requests with same filters', async () => {
      const components = Array.from({ length: 8 }, (_, i) => ({
        id: `comp-${i}`,
        key: `k${i}`,
        name: `Component ${i}`,
        type: 'COMPONENT' as const,
        description: '',
        width: 100,
        height: 40,
        componentPropertyDefinitions: {},
        parent: null as unknown,
      }));

      const page = {
        id: 'page-1',
        name: 'Components',
        type: 'PAGE' as const,
        children: components,
      };

      let loadAllPagesCalls = 0;
      setMockFigma({
        root: { name: 'Test', children: [page] },
        fileKey: 'file-key',
        loadAllPagesAsync: async () => {
          loadAllPagesCalls += 1;
        },
      });

      await handleSearchComponents({ limit: 3, offset: 0, scanSessionId: 'scan-1' });
      await handleSearchComponents({ limit: 3, offset: 3, scanSessionId: 'scan-1' });

      expect(loadAllPagesCalls).toBe(1);
    });

    it('does not reuse cached snapshot across different scan sessions', async () => {
      const components = Array.from({ length: 2 }, (_, i) => ({
        id: `comp-${i}`,
        key: `k${i}`,
        name: `Component ${i}`,
        type: 'COMPONENT' as const,
        description: '',
        width: 100,
        height: 40,
        componentPropertyDefinitions: {},
        parent: null as unknown,
      }));

      const page = {
        id: 'page-1',
        name: 'Components',
        type: 'PAGE' as const,
        children: components,
      };

      let loadAllPagesCalls = 0;
      setMockFigma({
        root: { name: 'Test', children: [page] },
        fileKey: 'file-key',
        loadAllPagesAsync: async () => {
          loadAllPagesCalls += 1;
        },
      });

      const firstSession = await handleSearchComponents({ limit: 10, scanSessionId: 'scan-a' });
      expect((firstSession as { total: number }).total).toBe(2);

      page.children.push({
        id: 'comp-2',
        key: 'k2',
        name: 'Component 2',
        type: 'COMPONENT' as const,
        description: '',
        width: 100,
        height: 40,
        componentPropertyDefinitions: {},
        parent: null as unknown,
      });

      const secondSession = await handleSearchComponents({ limit: 10, scanSessionId: 'scan-b' });
      expect((secondSession as { total: number }).total).toBe(3);
      expect(loadAllPagesCalls).toBe(2);
    });

    it('avoids hasMore=true when total is estimated but current page is not full', async () => {
      const manyFrames = Array.from({ length: 20_050 }, (_, i) => ({
        id: `frame-${i}`,
        name: `Frame ${i}`,
        type: 'FRAME' as const,
        children: [],
      }));

      const page = {
        id: 'page-1',
        name: 'Page 1',
        type: 'PAGE' as const,
        children: manyFrames,
      };

      setMockFigma({
        root: { name: 'Test', children: [page] },
        fileKey: 'file-key',
        loadAllPagesAsync: async () => undefined,
      });

      const result = await handleSearchComponents({ limit: 50, offset: 0, scanSessionId: 'scan-estimated' });
      const typed = result as {
        totalIsEstimated: boolean;
        hasMore: boolean;
        count: number;
        nextOffset: number | null;
      };

      expect(typed.totalIsEstimated).toBe(true);
      expect(typed.count).toBe(0);
      expect(typed.hasMore).toBe(false);
      expect(typed.nextOffset).toBe(null);
    });
  });

  describe('handleGetComponentSpec (P2)', () => {
    it('returns component spec with anatomy and token bindings', async () => {
      const componentNode = {
        id: 'comp-1',
        name: 'Button',
        type: 'COMPONENT' as const,
        description: 'A button component',
        boundVariables: {
          fills: [{ id: 'var-1' }],
        },
        componentPropertyDefinitions: {
          Label: { type: 'TEXT', defaultValue: 'Button' },
        },
        children: [],
        parent: { type: 'PAGE' },
      };

      setMockFigma({
        getNodeByIdAsync: async (id: string) => id === 'comp-1' ? componentNode : null,
      });

      const result = await handleGetComponentSpec({ nodeId: 'comp-1' });
      const typed = result as {
        success: boolean;
        nodeId: string;
        name: string;
        type: string;
        description: string | null;
        anatomy: { id: string; boundVariables?: Record<string, unknown>; children?: unknown[] };
        props: unknown[];
        tokenBindings: unknown[];
      };

      expect(typed.success).toBe(true);
      expect(typed.nodeId).toBe('comp-1');
      expect(typed.name).toBe('Button');
      expect(typed.type).toBe('COMPONENT');
      expect(typed.description).toBe('A button component');
      expect(typed.anatomy.id).toBe('comp-1');
      expect(typed.anatomy.boundVariables).toBeDefined();
      expect(typed.props).toHaveLength(1);
      expect(typed.tokenBindings).toHaveLength(1);
    });

    it('returns COMPONENT_SET spec with variants and states', async () => {
      const variant1 = {
        id: 'var-1',
        key: 'v1',
        name: 'State=default, Size=md',
        type: 'COMPONENT' as const,
        description: '',
        boundVariables: {},
        children: [],
      };

      const variant2 = {
        id: 'var-2',
        key: 'v2',
        name: 'State=hover, Size=md',
        type: 'COMPONENT' as const,
        description: '',
        boundVariables: {},
        children: [],
      };

      const componentSet = {
        id: 'set-1',
        name: 'Button',
        type: 'COMPONENT_SET' as const,
        description: 'Button variants',
        boundVariables: {},
        componentPropertyDefinitions: {},
        children: [variant1, variant2],
      };

      setMockFigma({
        getNodeByIdAsync: async (id: string) => id === 'set-1' ? componentSet : null,
      });

      const result = await handleGetComponentSpec({ nodeId: 'set-1' });
      const typed = result as {
        success: boolean;
        type: string;
        variants?: unknown[];
        variantAxes?: unknown[];
        states: string[];
      };

      expect(typed.success).toBe(true);
      expect(typed.type).toBe('COMPONENT_SET');
      expect(typed.variants).toHaveLength(2);
      expect(typed.variantAxes).toBeDefined();
      expect(typed.states).toContain('default');
      expect(typed.states).toContain('hover');
    });

    it('marks instance dependencies resolved when componentId is available even if mainComponent is unavailable', async () => {
      const instanceNode = {
        id: 'inst-1',
        name: 'Calendar Button Instance',
        type: 'INSTANCE' as const,
        componentId: '4333:9286',
        mainComponent: null,
        children: [],
      };

      const componentNode = {
        id: 'comp-1',
        name: 'Calendar',
        type: 'COMPONENT' as const,
        description: 'Calendar component',
        boundVariables: {},
        componentPropertyDefinitions: {},
        children: [instanceNode],
        parent: { type: 'PAGE' },
      };

      setMockFigma({
        getNodeByIdAsync: async (id: string) => (id === 'comp-1' ? componentNode : null),
      });

      const result = await handleGetComponentSpec({ nodeId: 'comp-1' });
      const typed = result as {
        success: boolean;
        instanceDependencies?: Array<{
          instanceNodeId: string;
          usedComponentNodeId: string;
          status?: 'resolved' | 'unresolved';
        }>;
      };

      expect(typed.success).toBe(true);
      expect(typed.instanceDependencies).toHaveLength(1);
      expect(typed.instanceDependencies?.[0]?.usedComponentNodeId).toBe('4333:9286');
      expect(typed.instanceDependencies?.[0]?.status).toBe('resolved');
    });

    it('falls back to the mainComponent name when componentId is unavailable', async () => {
      const instanceNode = {
        id: 'inst-2',
        name: 'Calendar Button Instance',
        type: 'INSTANCE' as const,
        componentId: undefined,
        mainComponent: { id: '4333:9286', name: 'Calendar Button', key: 'button-key' },
        children: [],
      };

      const componentNode = {
        id: 'comp-2',
        name: 'Calendar',
        type: 'COMPONENT' as const,
        description: 'Calendar component',
        boundVariables: {},
        componentPropertyDefinitions: {},
        children: [instanceNode],
        parent: { type: 'PAGE' },
      };

      setMockFigma({
        getNodeByIdAsync: async (id: string) => (id === 'comp-2' ? componentNode : null),
      });

      const result = await handleGetComponentSpec({ nodeId: 'comp-2' });
      const typed = result as {
        success: boolean;
        instanceDependencies?: Array<{
          instanceNodeId: string;
          usedComponentNodeId: string;
          usedComponentName: string;
          status?: 'resolved' | 'unresolved';
        }>;
      };

      expect(typed.success).toBe(true);
      expect(typed.instanceDependencies).toHaveLength(1);
      expect(typed.instanceDependencies?.[0]?.usedComponentNodeId).toBe('4333:9286');
      expect(typed.instanceDependencies?.[0]?.usedComponentName).toBe('Calendar Button');
      expect(typed.instanceDependencies?.[0]?.status).toBe('resolved');
    });

    it('respects depth=0 by not including children in anatomy', async () => {
      const childNode = {
        id: 'child-1',
        name: 'Icon',
        type: 'FRAME' as const,
        boundVariables: {},
        children: [],
      };

      const componentNode = {
        id: 'comp-1',
        name: 'Button',
        type: 'COMPONENT' as const,
        description: 'A button component',
        boundVariables: {},
        componentPropertyDefinitions: {},
        children: [childNode],
        parent: { type: 'PAGE' },
      };

      setMockFigma({
        getNodeByIdAsync: async (id: string) => {
          if (id === 'comp-1') return componentNode;
          if (id === 'child-1') return childNode;
          return null;
        },
      });

      // With depth=0, anatomy should have no children (only root node)
      const resultDepth0 = await handleGetComponentSpec({ nodeId: 'comp-1', depth: 0 });
      const typedDepth0 = resultDepth0 as { anatomy: { id: string; children?: unknown[] } };

      expect(typedDepth0.anatomy.id).toBe('comp-1');
      expect(typedDepth0.anatomy.children).toBeUndefined();

      // With depth=-1 (unlimited), anatomy should include children
      const resultDepthUnlimited = await handleGetComponentSpec({ nodeId: 'comp-1', depth: -1 });
      const typedDepthUnlimited = resultDepthUnlimited as { anatomy: { id: string; children: unknown[] } };

      expect(typedDepthUnlimited.anatomy.children).toHaveLength(1);
    });

    it('extracts layout metadata from anatomy (SC-05)', async () => {
      const component = {
        id: 'comp-1',
        name: 'Button',
        type: 'COMPONENT' as const,
        description: 'Test button',
        boundVariables: {},
        componentPropertyDefinitions: {},
        children: [],
        // Auto-layout properties
        layoutMode: 'HORIZONTAL' as const,
        itemSpacing: 8,
        paddingTop: 4,
        paddingRight: 12,
        paddingBottom: 4,
        paddingLeft: 12,
        primaryAxisAlignItems: 'center' as const,
        counterAxisAlignItems: 'center' as const,
        primaryAxisSizingMode: 'fixed' as const,
        counterAxisSizingMode: 'auto' as const,
      };

      setMockFigma({
        getNodeByIdAsync: async (id: string) => (id === 'comp-1' ? component : null),
      });

      const result = await handleGetComponentSpec({ nodeId: 'comp-1', depth: 0 });
      const typed = result as {
        anatomy: {
          id: string;
          layout?: {
            mode?: string;
            spacing?: number;
            padding?: { top: number; right: number; bottom: number; left: number };
            alignment?: { horizontal: string; vertical: string };
            sizing?: { horizontal: string; vertical: string };
          };
        };
      };

      expect(typed.anatomy.id).toBe('comp-1');
      expect(typed.anatomy.layout?.mode).toBe('horizontal');
      expect(typed.anatomy.layout?.spacing).toBe(8);
      expect(typed.anatomy.layout?.padding).toEqual({ top: 4, right: 12, bottom: 4, left: 12 });
      expect(typed.anatomy.layout?.alignment).toEqual({ horizontal: 'center', vertical: 'center' });
      expect(typed.anatomy.layout?.sizing).toEqual({ horizontal: 'fixed', vertical: 'auto' });
    });
  });

  describe('handleGetComponentImage (P2)', () => {
    it('exports images with partial success', async () => {
      const node1 = {
        id: 'node-1',
        name: 'Button',
        type: 'COMPONENT' as const,
        exportAsync: async () => new Uint8Array([1, 2, 3]),
      };

      setMockFigma({
        getNodeByIdAsync: async (id: string) => {
          if (id === 'node-1') return node1;
          return null;
        },
        base64Encode: () => 'base64-data',
      });

      const result = await handleGetComponentImage({ nodeIds: ['node-1', 'missing-node'] });
      const typed = result as { success: boolean; images: unknown[]; count: number; errors: number };

      expect(typed.success).toBe(true);
      expect(typed.count).toBe(2);
      expect(typed.errors).toBe(1);
      expect((typed.images[0] as { base64?: string }).base64).toBe('base64-data');
      expect((typed.images[1] as { error?: string }).error).toBeDefined();
    });

    it('rejects more than 20 nodeIds', async () => {
      setMockFigma({});

      const nodeIds = Array.from({ length: 21 }, (_, i) => `node-${i}`);
      await expect(handleGetComponentImage({ nodeIds })).rejects.toMatchObject({
        code: ERROR_CODES.INVALID_PARAMETER,
        message: expect.stringContaining('Max 20'),
      });
    });
  });

  describe('handleAuditTokenCoverage (P2)', () => {
    it('calculates coverage percent correctly', async () => {
      const nodeWithBinding = {
        id: 'node-1',
        name: 'Button',
        type: 'COMPONENT' as const,
        boundVariables: { fills: [{ id: 'var-1' }] },
        fills: [{ type: 'SOLID' as const }],
        children: [],
      };

      const nodeWithoutBinding = {
        id: 'node-2',
        name: 'Input',
        type: 'COMPONENT' as const,
        boundVariables: {},
        fills: [{ type: 'SOLID' as const }],
        children: [],
      };

      const component = {
        id: 'comp-1',
        name: 'Test Component',
        type: 'COMPONENT' as const,
        boundVariables: {},
        fills: [],
        children: [nodeWithBinding, nodeWithoutBinding],
      };

      setMockFigma({
        getNodeByIdAsync: async (id: string) => {
          if (id === 'comp-1') return component;
          if (id === 'node-1') return nodeWithBinding;
          if (id === 'node-2') return nodeWithoutBinding;
          return null;
        },
      });

      const result = await handleAuditTokenCoverage({ nodeId: 'comp-1' });
      const typed = result as {
        success: boolean;
        totalNodes: number;
        nodesWithBindings: number;
        coveragePercent: number;
        unboundNodes: unknown[];
      };

      expect(typed.success).toBe(true);
      expect(typed.totalNodes).toBe(3);
      expect(typed.nodesWithBindings).toBe(1);
      expect(typed.coveragePercent).toBe(33);
      expect(typed.unboundNodes).toHaveLength(1);
    });
  });

  describe('handleApplyTokens (P2)', () => {
    it('dryRun validates without mutations', async () => {
      const node = {
        id: 'node-1',
        name: 'Button',
        type: 'COMPONENT' as const,
        fills: [{ type: 'SOLID' as const }],
      };

      const variable = {
        id: 'var-1',
        name: 'color/primary',
      };

      setMockFigma({
        getNodeByIdAsync: async (id: string) => id === 'node-1' ? node : null,
        variables: {
          getVariableByIdAsync: async (id: string) => id === 'var-1' ? variable : null,
        },
      });

      const result = await handleApplyTokens({
        items: [{ nodeId: 'node-1', variableId: 'var-1', field: 'fills' }],
        dryRun: true,
      });

      const typed = result as {
        success: boolean;
        dryRun: boolean;
        items: Array<{ status: string }>;
        appliedCount: number;
      };

      expect(typed.success).toBe(true);
      expect(typed.dryRun).toBe(true);
      expect(typed.items).toHaveLength(1);
      expect(typed.items[0]?.status).toBe('applied');
      expect(typed.appliedCount).toBe(1);
    });

    it('real apply calls setBoundVariableForPaint for fills', async () => {
      let setBoundVariableForPaintCalled = false;
      let setBoundVariableCalled = false;

      const node = {
        id: 'node-1',
        name: 'Button',
        type: 'COMPONENT' as const,
        fills: [{ type: 'SOLID' as const, color: { r: 1, g: 0, b: 0, a: 1 } }],
        setBoundVariable: () => { setBoundVariableCalled = true; },
      };

      const variable = { id: 'var-1', name: 'color/primary' };

      setMockFigma({
        getNodeByIdAsync: async (id: string) => id === 'node-1' ? node : null,
        variables: {
          getVariableByIdAsync: async (id: string) => id === 'var-1' ? variable : null,
          setBoundVariableForPaint: (paint: Paint) => {
            setBoundVariableForPaintCalled = true;
            return paint;
          },
        },
      });

      const result = await handleApplyTokens({
        items: [{ nodeId: 'node-1', variableId: 'var-1', field: 'fills', paintIndex: 0 }],
        dryRun: false,
      });

      const typed = result as { success: boolean; appliedCount: number };

      expect(typed.success).toBe(true);
      expect(typed.appliedCount).toBe(1);
      expect(setBoundVariableForPaintCalled).toBe(true);
      expect(setBoundVariableCalled).toBe(false);
    });

    it('handles partial failure with 50 items and 3 invalid nodeIds', async () => {
      const validNodes = Array.from({ length: 47 }, (_, i) => ({
        id: `node-${i}`,
        name: `Button ${i}`,
        type: 'COMPONENT' as const,
        fills: [{ type: 'SOLID' as const, color: { r: 1, g: 0, b: 0, a: 1 } }],
        setBoundVariable: () => { },
      }));

      const variable = { id: 'var-1', name: 'color/primary' };

      setMockFigma({
        getNodeByIdAsync: async (id: string) => {
          if (id.startsWith('invalid')) return null;
          const node = validNodes.find(n => n.id === id);
          return node || null;
        },
        variables: {
          getVariableByIdAsync: async () => variable,
          setBoundVariableForPaint: (paint: Paint) => paint,
        },
      });

      // Create 50 items: 47 valid + 3 invalid
      const items = [
        ...validNodes.map(n => ({ nodeId: n.id, variableId: 'var-1', field: 'fills', paintIndex: 0 })),
        { nodeId: 'invalid-1', variableId: 'var-1', field: 'fills', paintIndex: 0 },
        { nodeId: 'invalid-2', variableId: 'var-1', field: 'fills', paintIndex: 0 },
        { nodeId: 'invalid-3', variableId: 'var-1', field: 'fills', paintIndex: 0 },
      ];

      const result = await handleApplyTokens({
        items,
        dryRun: false,
      });

      const typed = result as {
        success: boolean;
        dryRun: boolean;
        items: Array<{ status: string; reason?: string }>;
        appliedCount: number;
        errorCount: number;
      };

      expect(typed.success).toBe(true);
      expect(typed.dryRun).toBe(false);
      expect(typed.items).toHaveLength(50);
      expect(typed.appliedCount).toBe(47);
      expect(typed.errorCount).toBe(3);

      // Verify error items have reason
      const errorItems = typed.items.filter(i => i.status === 'error');
      expect(errorItems).toHaveLength(3);
      errorItems.forEach(item => {
        expect(item.reason).toBe('Node not found');
      });
    });
  });

  describe('handleBindVariable (P2)', () => {
    it('binds variable to fills using setBoundVariableForPaint', async () => {
      let setBoundVariableForPaintCalled = false;
      let setBoundVariableCalled = false;

      const node = {
        id: 'node-1',
        name: 'Button',
        type: 'COMPONENT' as const,
        fills: [{ type: 'SOLID' as const, color: { r: 1, g: 0, b: 0, a: 1 } }],
        setBoundVariable: () => { setBoundVariableCalled = true; },
      };

      const variable = { id: 'var-1', name: 'color/primary' };

      setMockFigma({
        getNodeByIdAsync: async (id: string) => id === 'node-1' ? node : null,
        variables: {
          getVariableByIdAsync: async (id: string) => id === 'var-1' ? variable : null,
          setBoundVariableForPaint: (paint: Paint) => {
            setBoundVariableForPaintCalled = true;
            return paint;
          },
        },
      });

      const result = await handleBindVariable({
        nodeId: 'node-1',
        variableId: 'var-1',
        field: 'fills',
        paintIndex: 0,
        paintField: 'color',
      });

      const typed = result as { success: boolean; nodeId: string; field: string; variableId: string };

      expect(typed.success).toBe(true);
      expect(typed.nodeId).toBe('node-1');
      expect(typed.field).toBe('fills');
      expect(typed.variableId).toBe('var-1');
      expect(setBoundVariableForPaintCalled).toBe(true);
      expect(setBoundVariableCalled).toBe(false);
    });

    it('binds variable to opacity using setBoundVariable', async () => {
      let setBoundVariableCalled = false;

      const node = {
        id: 'node-1',
        name: 'Button',
        type: 'COMPONENT' as const,
        opacity: 0.5,
        setBoundVariable: () => { setBoundVariableCalled = true; },
      };

      const variable = { id: 'var-1', name: 'opacity/50' };

      setMockFigma({
        getNodeByIdAsync: async (id: string) => id === 'node-1' ? node : null,
        variables: {
          getVariableByIdAsync: async (id: string) => id === 'var-1' ? variable : null,
        },
      });

      const result = await handleBindVariable({
        nodeId: 'node-1',
        variableId: 'var-1',
        field: 'opacity',
      });

      const typed = result as { success: boolean; nodeId: string; field: string; variableId: string };

      expect(typed.success).toBe(true);
      expect(typed.nodeId).toBe('node-1');
      expect(typed.field).toBe('opacity');
      expect(typed.variableId).toBe('var-1');
      expect(setBoundVariableCalled).toBe(true);
    });

    it('returns NODE_NOT_FOUND when node does not exist', async () => {
      setMockFigma({
        getNodeByIdAsync: async () => null,
      });

      await expect(handleBindVariable({
        nodeId: 'missing',
        variableId: 'var-1',
        field: 'fills',
      })).rejects.toMatchObject({
        code: ERROR_CODES.NODE_NOT_FOUND,
        message: expect.stringContaining('Node not found'),
      });
    });

    it('returns VARIABLE_NOT_FOUND when variable does not exist', async () => {
      const node = {
        id: 'node-1',
        name: 'Button',
        type: 'COMPONENT' as const,
        fills: [{ type: 'SOLID' as const }],
        setBoundVariable: () => { },
      };

      setMockFigma({
        getNodeByIdAsync: async () => node,
        variables: {
          getVariableByIdAsync: async () => null,
        },
      });

      await expect(handleBindVariable({
        nodeId: 'node-1',
        variableId: 'missing-var',
        field: 'fills',
      })).rejects.toMatchObject({
        code: ERROR_CODES.VARIABLE_NOT_FOUND,
        message: expect.stringContaining('Variable not found'),
      });
    });

    it('returns INVALID_PARAMETER when paintIndex is out of range', async () => {
      const node = {
        id: 'node-1',
        name: 'Button',
        type: 'COMPONENT' as const,
        fills: [{ type: 'SOLID' as const }], // Only 1 paint at index 0
        setBoundVariable: () => { },
      };

      const variable = { id: 'var-1', name: 'color/primary' };

      setMockFigma({
        getNodeByIdAsync: async () => node,
        variables: {
          getVariableByIdAsync: async () => variable,
        },
      });

      await expect(handleBindVariable({
        nodeId: 'node-1',
        variableId: 'var-1',
        field: 'fills',
        paintIndex: 5, // Out of range
      })).rejects.toMatchObject({
        code: ERROR_CODES.INVALID_PARAMETER,
        message: expect.stringContaining('out of range'),
      });
    });

    it('returns INVALID_PARAMETER when node does not support fills', async () => {
      const node = {
        id: 'group-1',
        name: 'Group',
        type: 'GROUP' as const,
        // GROUP nodes don't have fills
      };

      const variable = { id: 'var-1', name: 'color/primary' };

      setMockFigma({
        getNodeByIdAsync: async () => node,
        variables: {
          getVariableByIdAsync: async () => variable,
        },
      });

      await expect(handleBindVariable({
        nodeId: 'group-1',
        variableId: 'var-1',
        field: 'fills',
      })).rejects.toMatchObject({
        code: ERROR_CODES.INVALID_PARAMETER,
        message: expect.stringContaining('does not support'),
      });
    });

    it('returns INVALID_PARAMETER when fills array is empty and paintIndex=0', async () => {
      const node = {
        id: 'node-1',
        name: 'Button',
        type: 'COMPONENT' as const,
        fills: [], // Empty fills array
        setBoundVariable: () => { },
      };

      const variable = { id: 'var-1', name: 'color/primary' };

      setMockFigma({
        getNodeByIdAsync: async () => node,
        variables: {
          getVariableByIdAsync: async () => variable,
        },
      });

      await expect(handleBindVariable({
        nodeId: 'node-1',
        variableId: 'var-1',
        field: 'fills',
        paintIndex: 0,
      })).rejects.toMatchObject({
        code: ERROR_CODES.INVALID_PARAMETER,
        message: expect.stringContaining('out of range'),
      });
    });
  });

  describe('handleUnbindVariable (P2)', () => {
    it('unbinds variable from fills using setBoundVariableForPaint with null', async () => {
      let setBoundVariableForPaintCalled = false;
      let setBoundVariableCalled = false;

      const node = {
        id: 'node-1',
        name: 'Button',
        type: 'COMPONENT' as const,
        fills: [{ type: 'SOLID' as const, color: { r: 1, g: 0, b: 0, a: 1 } }],
        setBoundVariable: () => { setBoundVariableCalled = true; },
      };

      setMockFigma({
        getNodeByIdAsync: async (id: string) => id === 'node-1' ? node : null,
        variables: {
          setBoundVariableForPaint: (paint: Paint) => {
            setBoundVariableForPaintCalled = true;
            return paint;
          },
        },
      });

      const result = await handleUnbindVariable({
        nodeId: 'node-1',
        field: 'fills',
        paintIndex: 0,
        paintField: 'color',
      });

      const typed = result as { success: boolean; nodeId: string; field: string };

      expect(typed.success).toBe(true);
      expect(typed.nodeId).toBe('node-1');
      expect(typed.field).toBe('fills');
      expect(setBoundVariableForPaintCalled).toBe(true);
      expect(setBoundVariableCalled).toBe(false);
    });

    it('unbinds variable from opacity using setBoundVariable with null', async () => {
      let setBoundVariableCalled = false;

      const node = {
        id: 'node-1',
        name: 'Button',
        type: 'COMPONENT' as const,
        opacity: 0.5,
        setBoundVariable: () => { setBoundVariableCalled = true; },
      };

      setMockFigma({
        getNodeByIdAsync: async (id: string) => id === 'node-1' ? node : null,
      });

      const result = await handleUnbindVariable({
        nodeId: 'node-1',
        field: 'opacity',
      });

      const typed = result as { success: boolean; nodeId: string; field: string };

      expect(typed.success).toBe(true);
      expect(typed.nodeId).toBe('node-1');
      expect(typed.field).toBe('opacity');
      expect(setBoundVariableCalled).toBe(true);
    });

    it('returns NODE_NOT_FOUND when node does not exist', async () => {
      setMockFigma({
        getNodeByIdAsync: async () => null,
      });

      await expect(handleUnbindVariable({
        nodeId: 'missing',
        field: 'fills',
      })).rejects.toMatchObject({
        code: ERROR_CODES.NODE_NOT_FOUND,
        message: expect.stringContaining('Node not found'),
      });
    });

    it('returns INVALID_PARAMETER when paintIndex is out of range', async () => {
      const node = {
        id: 'node-1',
        name: 'Button',
        type: 'COMPONENT' as const,
        fills: [{ type: 'SOLID' as const }], // Only 1 paint at index 0
        setBoundVariable: () => { },
      };

      setMockFigma({
        getNodeByIdAsync: async () => node,
      });

      await expect(handleUnbindVariable({
        nodeId: 'node-1',
        field: 'fills',
        paintIndex: 5, // Out of range
      })).rejects.toMatchObject({
        code: ERROR_CODES.INVALID_PARAMETER,
        message: expect.stringContaining('out of range'),
      });
    });
  });
});
